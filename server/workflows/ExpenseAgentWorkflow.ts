import {
  accountsTable,
  agentImagesTable,
  agentKeywordLookupsTable,
  agentRequestsTable,
  categoriesTable,
} from '#schema';
import { createDatabase, jsonGroupArray } from '#server/lib/db';
import { WorkflowEntrypoint, type WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import { and, eq, inArray } from 'drizzle-orm';
import z from 'zod';

const expenseAgentWorkflowParamSchema = z.object({
  agentRequestId: z.string(),
  userId: z.string(),
});

type ExpenseAgentWorkflowParam = z.infer<typeof expenseAgentWorkflowParamSchema>;

export class ExpenseAgentWorkflow extends WorkflowEntrypoint<Env, ExpenseAgentWorkflowParam> {
  async run(event: WorkflowEvent<ExpenseAgentWorkflowParam>, step: WorkflowStep) {
    const agentRequestInfo = await step.do('prepare', async () => {
      const db = createDatabase(this.env);
      const { agentRequestId, userId } = expenseAgentWorkflowParamSchema.parse(event.payload);

      const [[agentRequest], agentRequestImages, categories, accounts, keywords] = await db.batch([
        db
          .select({
            accountIds: agentRequestsTable.accountIds,
            categoryIds: agentRequestsTable.categoryIds,
            customInstruction: agentRequestsTable.customInstruction,
          })
          .from(agentRequestsTable)
          .where(and(eq(agentRequestsTable.id, agentRequestId), eq(agentRequestsTable.userId, userId)))
          .limit(1),
        db
          .select({
            r2Path: agentImagesTable.r2Path,
            kind: agentImagesTable.kind,
            description: agentImagesTable.description,
          })
          .from(agentImagesTable)
          .where(eq(agentImagesTable.agentRequestId, agentRequestId)),
        db
          .select({ id: accountsTable.id, name: accountsTable.name })
          .from(accountsTable)
          .where(and(eq(accountsTable.userId, userId), eq(accountsTable.isDeleted, false))),
        db
          .select({ id: categoriesTable.id, name: categoriesTable.name })
          .from(categoriesTable)
          .where(and(eq(categoriesTable.userId, userId), eq(categoriesTable.isDeleted, false))),
        db
          .select({
            value: agentKeywordLookupsTable.value,
            targetField: agentKeywordLookupsTable.targetField,
            keyword: jsonGroupArray(agentKeywordLookupsTable.keyword, { distinct: true }),
          })
          .from(agentKeywordLookupsTable)
          .where(
            and(
              eq(agentKeywordLookupsTable.userId, userId),
              inArray(agentKeywordLookupsTable.targetField, ['accountId', 'categoryId']),
            ),
          )
          .groupBy(agentKeywordLookupsTable.targetField, agentKeywordLookupsTable.value),
      ]);
    });
  }
}
