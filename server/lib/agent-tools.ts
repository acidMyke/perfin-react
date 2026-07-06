import z, { ZodError } from 'zod';
import { createDatabase, jsonGroupArray, omitColumns, type AppDatabase } from './db';
import { and, avg, eq, getColumns, gte, inArray, isNotNull, lte, or } from 'drizzle-orm';
import {
  agentAnchorLookupsTable,
  agentExpenseDraftsTable,
  expenseAdjustmentsTable,
  expenseItemsTable,
  expensesTable,
  generateId,
} from '#schema';
import { endOfDay, parseISO, startOfDay } from 'date-fns';
import { getLocationBoxId, getTextsHashes } from './utils';
import { getSuggestionInputSchema, getSuggestions } from '#server/features/expenses/indexing';
import type { BatchItem } from 'drizzle-orm/batch';

export type AgentToolCallContext = { env: Env; db: AppDatabase; agentRequestId: string; userId: string };

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
  description: `Retrieve multiple existing expenses`,
  schema: z.array(
    z.union([
      z
        .strictObject({ fromDate: z.iso.date().describe('Start date.'), toDate: z.iso.date().describe('End date.') })
        .describe('both inclusive, in YYYY-MM-DD'),
      z.strictObject({ expenseIds: z.array(z.string()).min(1).describe('Expense IDs.') }),
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

const lookupAnchorsTool = defineTool({
  name: 'lookup_anchors',
  description: 'Find actual value using historical anchor',
  schema: z.array(
    z.strictObject({
      anchors: z.array(z.string()).describe('value to look up'),
      targetField: z
        .enum(['accountId', 'categoryId', 'shopName', 'shopMall', 'itemName', 'adjustmentName'])
        .describe('Specifies which field the anchors should be resolved into'),
    }),
  ),
  async execute(args, ctx) {
    const { db, userId } = ctx;
    const anyOf = args.map(({ anchors, targetField }) =>
      and(inArray(agentAnchorLookupsTable.anchor, anchors), eq(agentAnchorLookupsTable.targetField, targetField)),
    );

    return await db
      .select(omitColumns(getColumns(agentAnchorLookupsTable), 'id', 'userId'))
      .from(agentAnchorLookupsTable)
      .where(and(eq(agentAnchorLookupsTable.userId, userId), or(...anyOf)));
  },
});

const fnltSchemaElement = getSuggestionInputSchema.omit({ context: true });

const fuzzyNamesLookupTool = defineTool({
  name: 'fuzzy_names_lookup',
  description: 'Get autocomplete suggestions for a field from historical values',
  schema: z.array(fnltSchemaElement),
  disableUpfrontValidation: true,
  execute(args, ctx): Promise<any> {
    if (!Array.isArray(args)) {
      return Promise.resolve({ issues: ['not an array'] });
    }
    if (args.length === 0) {
      return Promise.resolve({ issues: ['should not be empty'] });
    }

    return Promise.all(
      args.map(arg => {
        const parsed = fnltSchemaElement.safeParse(arg);
        if (parsed.success) return getSuggestions(ctx, parsed.data);
        return parsed.error;
      }),
    );
  },
});

const lltElementSchema = z.object({ latitude: z.number(), longitude: z.number() }).describe('in degrees');

const locationLookupTool = defineTool({
  name: 'location_lookup',
  description: 'Get information about current location from historical values',
  schema: z.array(lltElementSchema),
  disableUpfrontValidation: true,
  async execute(args, ctx): Promise<any> {
    if (!Array.isArray(args)) {
      return Promise.resolve({ issues: ['not an array'] });
    }
    if (args.length === 0) {
      return Promise.resolve({ issues: ['should not be empty'] });
    }
    const { db, userId } = ctx;
    const getNerbyShops = (arg: z.infer<typeof lltElementSchema>) =>
      db
        .select({
          shopName: expensesTable.shopName,
          shopMall: expensesTable.shopMall,
          latitude: avg(expensesTable.latitude).mapWith(Number),
          longitude: avg(expensesTable.longitude).mapWith(Number),
        })
        .from(expensesTable)
        .where(
          and(
            eq(expensesTable.userId, userId),
            isNotNull(expensesTable.shopName),
            inArray(expensesTable.boxId, getLocationBoxId(arg)),
          ),
        )
        .groupBy(expensesTable.shopMall, expensesTable.shopName);

    type Query = ReturnType<typeof getNerbyShops>;
    type QueryReturn = Awaited<Query>;
    const argsWithError: { index: number; error: ZodError }[] = [];
    const queries: Query[] = [];

    for (let argIndex = 0; argIndex < args.length; argIndex++) {
      const arg = args[argIndex];
      const parsed = lltElementSchema.safeParse(arg);
      if (!parsed.success) argsWithError.push({ index: argIndex, error: parsed.error });
      else queries.push(getNerbyShops(arg));
    }

    if (queries.length === 0) {
      return { argsWithError };
    }

    // @ts-ignore
    const batchMatches: QueryReturn[] = await db.batch(queries);
    const flattenMatches: QueryReturn = [];
    const nameSet = new Set<string>();
    for (const matches of batchMatches) {
      for (const match of matches) {
        flattenMatches.push(match);
        const { shopName, shopMall } = match;
        if (shopName) nameSet.add(shopName);
        if (shopMall) nameSet.add(shopMall);
      }
    }
    const hashes = (await getTextsHashes(userId, nameSet.values())).values().toArray();
    const anchors = await db
      .select({
        value: agentAnchorLookupsTable.value,
        targetField: agentAnchorLookupsTable.targetField,
        anchors: jsonGroupArray(agentAnchorLookupsTable.anchor, { distinct: true }),
      })
      .from(agentAnchorLookupsTable)
      .where(
        and(
          inArray(agentAnchorLookupsTable.textHash, hashes),
          inArray(agentAnchorLookupsTable.targetField, ['shopName', 'shopMall']),
        ),
      )
      .groupBy(agentAnchorLookupsTable.targetField, agentAnchorLookupsTable.value);

    return {
      argsWithError,
      matches: flattenMatches,
      anchors,
    };
  },
});

const expenseDraftsElementSchema = z.object({
  id: z.string().nullable().describe('Existing expense ID, else null'),
  billedAt: z.iso
    .datetime()
    .transform(val => parseISO(val))
    .describe('Receipt date/time in ISO-8601'),
  account: z
    .object({
      value: z.string().nullable().describe('Account ID'),
      label: z.string().trim().nullable().describe('Account name'),
    })
    .nullable()
    .describe('Payment method/account, else null'),

  category: z
    .object({
      value: z.string().nullable().describe('Category ID'),
      label: z.string().trim().nullable().describe('Category name'),
    })
    .nullable()
    .describe('Expense category, else null'),

  latitude: z.number().nullable().describe('Shop latitude, else null'),
  longitude: z.number().nullable().describe('Shop longitude, else null'),
  shopName: z.string().trim().nullable().describe('Merchant name'),
  shopNameAnchors: z.array(z.string()).describe('Merchant aliases/keywords'),
  shopMall: z.string().trim().nullable().describe('Mall or venue name'),
  shopMallAnchors: z.array(z.string()).describe('Mall aliases/keywords'),
  type: z.enum(['online', 'physical']).describe('Purchase type'),
  netAmountCents: z.int().min(0).nullable().describe('Final paid amount in cents'),
  items: z
    .array(
      z.object({
        id: z.string().nullable().describe('Existing item ID, else null'),
        name: z.string().trim().describe('Item name'),
        priceCents: z.int().min(0).describe('Line total in cents'),
        quantity: z.int().min(0).describe('Item quantity'),
        nameAnchors: z.array(z.string()).describe('Item aliases/keywords'),
      }),
    )
    .describe('Purchased line items'),
  adjustments: z
    .array(
      z.object({
        id: z.string().nullable().describe('Existing adjustment ID, else null'),
        name: z.string().trim().describe('Adjustment name'),
        amountCents: z.int().default(0).describe('Amount in cents (+/-)'),
        rateBps: z.int().nullable().describe('Rate in basis points, else null'),
        expenseItemId: z.string().trim().nullable().describe('Related item ID, else null'),
        nameAnchors: z.array(z.string()).describe('Adjustment aliases/keywords'),
      }),
    )
    .describe('Taxes, discounts, fees, etc'),
  confidenceScore: z.number().min(0).max(1).describe('Extraction confidence (0-1).'),
});

const saveExpenseDraftsTool = defineTool({
  name: 'save_expense_drafts',
  description: 'Save drafts of expenses',
  schema: z.array(expenseDraftsElementSchema),
  disableUpfrontValidation: true,
  async execute(args, ctx) {
    if (!Array.isArray(args)) {
      return Promise.resolve({ issues: ['not an array'] });
    }
    if (args.length === 0) {
      return Promise.resolve({ issues: ['should not be empty'] });
    }
    const { db, userId, agentRequestId } = ctx;
    const argsWithError: { index: number; error: ZodError }[] = [];
    const successDraftIds: { index: number; draftId: string }[] = [];
    const valuesToInsert: (typeof agentExpenseDraftsTable.$inferInsert)[] = [];

    for (let argIndex = 0; argIndex < args.length; argIndex++) {
      const arg = args[argIndex];
      const parsed = lltElementSchema.safeParse(arg);
      if (!parsed.success) argsWithError.push({ index: argIndex, error: parsed.error });
      else {
        const draftId = generateId();
        successDraftIds.push({ index: argIndex, draftId });
        valuesToInsert.push({
          userId,
          agentRequestId,
          data: arg,
          confidenceScore: arg.confidenceScore,
        });
      }
    }

    if (valuesToInsert.length == 0) {
      return { argsWithError };
    }

    await db.insert(agentExpenseDraftsTable).values(valuesToInsert);

    return {
      argsWithError,
      successDraftIds,
    };
  },
});

const tools: ReturnType<typeof defineTool>[] = [
  queryExistingExpenseRecordTool,
  lookupAnchorsTool,
  fuzzyNamesLookupTool,
  locationLookupTool,
  saveExpenseDraftsTool,
];
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
