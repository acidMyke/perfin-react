import type z from 'zod';
import { createDatabase, type AppDatabase } from './db';

type AgentToolCallContext = { env: Env; db: AppDatabase; agentRequestId: string; userId: string };

function defineTool<TSchema extends z.ZodTypeAny, TContext, TResult>(config: {
  name: string;
  description: string;
  schema: TSchema;
  disableUpfrontValidation: boolean;
  execute(args: z.infer<TSchema>, ctx: TContext): Promise<TResult>;
}) {
  return config;
}

const tools: ReturnType<typeof defineTool>[] = [];
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
