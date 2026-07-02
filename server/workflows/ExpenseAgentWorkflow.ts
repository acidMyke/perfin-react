import { WorkflowEntrypoint, type WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import z from 'zod';

const expenseAgentWorkflowParamSchema = z.object({
  agentRequestId: z.string(),
  userId: z.string(),
});

type ExpenseAgentWorkflowParam = z.infer<typeof expenseAgentWorkflowParamSchema>;

export class ExpenseAgentWorkflow extends WorkflowEntrypoint<Env, ExpenseAgentWorkflowParam> {
  async run(event: WorkflowEvent<ExpenseAgentWorkflowParam>, step: WorkflowStep) {}
}
