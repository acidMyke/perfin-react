import z from 'zod';
import { createDatabase, omitColumns, type AppDatabase } from './db';
import { and, eq, getColumns, gte, inArray, lte, or } from 'drizzle-orm';
import { expenseAdjustmentsTable, expenseItemsTable, expensesTable } from '#schema';
import { endOfDay, startOfDay } from 'date-fns';
import { getLocationBoxId } from './utils';

type AgentToolCallContext = { env: Env; db: AppDatabase; agentRequestId: string; userId: string };

function defineTool<TSchema extends z.ZodTypeAny, TResult>(config: {
  name: string;
  description: string;
  schema: TSchema;
  disableUpfrontValidation?: boolean;
  execute(args: z.infer<TSchema>, ctx: AgentToolCallContext): Promise<TResult>;
}) {
  return config;
}

const queryExistingExpenseRecordTool = defineTool({
  name: 'query_existing_records',
  description: `Retrieve existing expenses using exactly one mutually exclusive filter:

- \`{ fromDate, toDate }\`
- \`{ expenseIds }\`
- \`{ latitude, longitude }\` (≈222m radius)`,
  schema: z.array(
    z.union([
      z
        .strictObject({ fromDate: z.iso.date().describe('Start date.'), toDate: z.iso.date().describe('End date.') })
        .describe('both inclusive, in YYYY-MM-DD'),
      z.strictObject({ expenseIds: z.array(z.string()).min(1).describe('Expense IDs.') }),
      z
        .strictObject({ latitude: z.number().describe('Latitude'), longitude: z.number().describe('Longitude.') })
        .describe('in degrees'),
    ]),
  ),
  async execute(args, ctx) {
    const { db, userId } = ctx;
    const anyOf = args.map(criteria => {
      if ('fromDate' in criteria) {
        return and(
          gte(expensesTable.billedAt, startOfDay(criteria.fromDate)),
          lte(expensesTable.billedAt, endOfDay(criteria.toDate)),
        );
      } else if ('expenseIds' in criteria) {
        return inArray(expensesTable.id, criteria.expenseIds);
      } else if ('latitude' in criteria) {
        const queryBoxIds = getLocationBoxId(criteria);
        return inArray(expensesTable.boxId, queryBoxIds);
      }
    });

    const rawExpenses = await db
      .select(
        omitColumns(
          getColumns(expensesTable),
          'userId',
          'version',
          'updatedAt',
          'updatedBy',
          'boxId',
          'additionalServiceChargePercent',
          'isGstExcluded',
          'amountCents',
        ),
      )
      .from(expensesTable)
      .where(and(eq(expensesTable.userId, userId), or(...anyOf)));

    const expenseIds = rawExpenses.map(({ id }) => id);
    const [allItems, allAdjustments] = await db.batch([
      db
        .select(
          omitColumns(
            getColumns(expenseItemsTable),
            'version',
            'createdAt',
            'updatedAt',
            'categoryId',
            'expenseRefundId',
            'isDeleted',
          ),
        )
        .from(expenseItemsTable)
        .where(and(inArray(expenseItemsTable.expenseId, expenseIds), eq(expenseItemsTable.isDeleted, false))),
      db
        .select(
          omitColumns(
            getColumns(expenseAdjustmentsTable),
            'version',
            'createdAt',
            'updatedAt',
            'isDeleted',
            'isInferable',
          ),
        )
        .from(expenseAdjustmentsTable)
        .where(
          and(inArray(expenseAdjustmentsTable.expenseId, expenseIds), eq(expenseAdjustmentsTable.isDeleted, false)),
        ),
    ]);

    const groupedItems = allItems.reduce(
      (acc, obj) => ((acc[obj.expenseId] = acc[obj.expenseId] || []).push(obj), acc),
      {} as Record<string, typeof allItems>,
    );
    const groupedAdjustments = allAdjustments.reduce(
      (acc, obj) => ((acc[obj.expenseId] = acc[obj.expenseId] || []).push(obj), acc),
      {} as Record<string, typeof allAdjustments>,
    );

    return rawExpenses.map(expense => ({
      ...expense,
      items: groupedItems[expense.id],
      adjustments: groupedAdjustments[expense.id],
    }));
  },
});

const tools: ReturnType<typeof defineTool>[] = [queryExistingExpenseRecordTool];
const toolMap = Object.fromEntries(tools.map(tool => [tool.name, tool]));

export const agentToolDefinitions: ChatCompletionTool[] = tools.map(tool => ({
  type: 'function',
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.schema.toJSONSchema(),
    strict: true,
  },
}));

async function executeFunctionToolCall(
  call: ChatCompletionMessageFunctionToolCall,
  ctx: AgentToolCallContext,
): Promise<ToolMessage> {
  const tool = toolMap[call.function.name];
  if (!tool) {
    console.error(`Unknown tool: ${call.function.name}`);
    return {
      role: 'tool',
      tool_call_id: call.id,
      content: `Unknown tool: ${call.function.name}`,
    };
  }
  const { schema, disableUpfrontValidation } = tool;
  let args = JSON.parse(call.function.arguments);
  if (!disableUpfrontValidation) {
    const parsed = schema.safeParse(args);

    if (!parsed.success) {
      return {
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({ error: 'Invalid arguments', issues: parsed.error.issues }),
      };
    }

    args = parsed.data;
  }

  const result = await tool.execute(args, ctx);

  return {
    role: 'tool',
    tool_call_id: call.id,
    content: JSON.stringify(result),
  };
}

async function executeCustomToolCall(call: ChatCompletionMessageCustomToolCall): Promise<ToolMessage> {
  return {
    role: 'tool',
    tool_call_id: call.id,
    content: `Unsupported tool: ${call.custom.name}`,
  };
}

export async function executeChatToolCalls(
  toolCalls: ChatCompletionMessageToolCall[],
  ctx: (Omit<AgentToolCallContext, 'db'> & Partial<Pick<AgentToolCallContext, 'db'>>) | AgentToolCallContext,
) {
  const fullCtx: AgentToolCallContext = { ...ctx, db: ctx.db ?? createDatabase(ctx.env) };
  return Promise.all(
    toolCalls.map(call =>
      call.type === 'function' ? executeFunctionToolCall(call, fullCtx) : executeCustomToolCall(call),
    ),
  );
}
