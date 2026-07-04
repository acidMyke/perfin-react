import {
  accountsTable,
  agentAnchorLookupsTable,
  agentImagesTable,
  agentRequestsTable,
  categoriesTable,
  generateId,
} from '#schema';
import { agentToolDefinitions, executeChatToolCalls } from '#server/lib/agent-tools';
import { createDatabase, jsonGroupArray } from '#server/lib/db';
import { WorkflowEntrypoint, type WorkflowStep, type WorkflowEvent } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { and, eq, inArray } from 'drizzle-orm';
import z from 'zod';

const expenseAgentWorkflowParamSchema = z.object({
  agentRequestId: z.string(),
  userId: z.string(),
});

type ExpenseAgentWorkflowParam = z.infer<typeof expenseAgentWorkflowParamSchema>;

const MAX_TURN = 10;

export class ExpenseAgentWorkflow extends WorkflowEntrypoint<Env, ExpenseAgentWorkflowParam> {
  async run(event: WorkflowEvent<ExpenseAgentWorkflowParam>, step: WorkflowStep) {
    const db = createDatabase(this.env);
    const { agentRequestId, userId } = expenseAgentWorkflowParamSchema.parse(event.payload);

    const preparationResult = await step.do('prepare', async () => {
      const [[agentRequest], agentRequestImages, accounts, categories, subjectsAnchors] = await db.batch([
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
            value: agentAnchorLookupsTable.value,
            anchors: jsonGroupArray(agentAnchorLookupsTable.anchor, { distinct: true }),
          })
          .from(agentAnchorLookupsTable)
          .where(
            and(
              eq(agentAnchorLookupsTable.userId, userId),
              inArray(agentAnchorLookupsTable.targetField, ['accountId', 'categoryId']),
            ),
          )
          .groupBy(agentAnchorLookupsTable.targetField, agentAnchorLookupsTable.value),
      ]);

      if (!agentRequest) {
        throw new NonRetryableError('Request not found');
      }

      const anchorsMap = new Map<string, string[]>();
      for (const { anchors, value } of subjectsAnchors) {
        anchorsMap.set(value, anchors);
      }

      let eligibleAccounts = accounts.map(a => ({ ...a, anchors: anchorsMap.get(a.id) }));
      if (agentRequest.accountIds && agentRequest.accountIds.length > 0) {
        eligibleAccounts = eligibleAccounts.filter(({ id }) => agentRequest.accountIds!.includes(id));
      }
      const textAccounts = '```json\n' + JSON.stringify(eligibleAccounts) + '\n```';

      let eligibleCategories = categories.map(c => ({ ...c, anchors: anchorsMap.get(c.id) }));
      if (agentRequest.categoryIds && agentRequest.categoryIds.length > 0) {
        eligibleCategories = eligibleCategories.filter(({ id }) => agentRequest.categoryIds!.includes(id));
      }
      const textCategories = '```json\n' + JSON.stringify(eligibleCategories) + '\n```';

      let systemContent = `### Role
You are an expert expense-tracking assistant. Your job is to extract financial data from documents then either create new drafts or edit existing records using the \`save_expense_draft\` tool.

### Document Processing & Image Retrieval
* One-Pass Extraction: Extract all necessary data completely during the first pass. 
* Fallback Retrieval: If you encounter a complex error and absolutely MUST see the image again, use the \`request_source_images\` tool with the array of image paths. Strictly for last resort.

### Creation vs. Editing Logic
Always use \`query_existing_records\` to find existing record first before creating or when processing statements.
* If NO matching record exists: Set the root \`id\` of expense draft to \`null\`.
* If a matching record EXISTS: 
1. Set root \`id\` to the existing ID. Update incorrect values. 
2. Preserve existing valid IDs for items and adjustments. 
3. If an item/adjustment was removed, set \`isDeleted: true\`. 
4. Add new items with a temporary ID

### Structural Rules
* Naming: You MUST use english names, make the best guess for names not in english or heavily abbriviated
* Internal Names: You MUST use \`_gst\` for GST and \`_service\` for service charges.
* Currency & Math: Convert all monetary values to cents (multiply by 100) and percentage to basis-points (1 basis point = 0.01%). Discounts are negative in \`amountCents\` or \`rateBps\`.
* If document is not a statement, every expense can have child items (individual products / services) and adjustments (GST, service charges, vouchers, discounts). Make sure to separate these out.
* If document is a statement, audit existing expense records for the earliest - latest records of the statement, specify \`netAmountCents\` and empty array for items & adjustments 
* Ajustment:
  * set \`rateBps\` to \`null\` if the adjustment are flat adjustment
  * for rate adjustment, set \`expenseItemId\` to the item if an adjustment only applies for 1 item
  * if \`rateBps\` is not null, calculation system will ignore \`amountCents\`

### Anchors Feedback Loop
* Extraction: Populate \`anchors\` arrays with the exact, literal text found on the documents that led to your match. Multiple anchors are allowed. Non-english anchors are allowed 
* You may use the \`lookup_anchors\` tool to find anchors that has been previously found for all name fields.

### Accounts & Categories
* Try to match existing accounts & categories, if found set the \`value\` as \`id\`, \`label\` will be ignored, If not found, suggest new ones by setting \`value\` to \`null\`.
* If there is only 1 provided value in existing, you must assume as that option and populate anchors.
* Existing accounts
${textAccounts}
* Existing categories
${textCategories}

### Tool & Error Guidelines
* Batching: All your tools accept arrays. Batch your requests.
* Self-Correction: Fix data structures and retry if any tools returns validation errors.
`;

      type ImageInfo = { id: string; kind?: string; description?: string };
      const aiImageInfos: ImageInfo[] = [];
      const imageIdToPathMap: Record<string, string> = {};
      const imagePaths: string[] = [];

      for (const { r2Path, kind, description } of agentRequestImages) {
        const id = generateId();
        const info: ImageInfo = { id };
        if (kind) info.kind = kind;
        if (description) info.description = description;
        aiImageInfos.push(info);
        imageIdToPathMap[id] = r2Path;
        imagePaths.push(r2Path);
      }

      const textImageInfo = '```json\n' + JSON.stringify(aiImageInfos) + '\n```';
      let userContent0Text = `Please process the following documents:\n${textImageInfo}\n`;

      return {
        imagePaths,
        systemContent,
        userContent0Text,
        imageIdToPathMap,
        customInstruction: agentRequest.customInstruction,
        agentRequestImages: agentRequestImages.map(i => ({ ...i, id: generateId() })),
      };
    });

    let turn = 0;
    const conversationMessages: ChatCompletionMessageParam[] = [];

    while (turn < MAX_TURN) {
      const llmRunOutput = await step.do(`llm-run-turn-${turn}`, async () => {
        const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: preparationResult.systemContent }];
        const userContent: UserMessageContentPart[] = [{ type: 'text', text: preparationResult.userContent0Text }];

        if (turn === 0) {
          userContent.push({
            type: 'text',
            text: 'The images are available this time, analyzed it. You MUST extract all visible text verbatim, ignore all background noise',
          });

          const imagesAsContent = await Promise.all(
            preparationResult.imagePaths.map(path =>
              this.getAgentImageAsBase64(path).then(
                url => ({ type: 'image_url', image_url: { url } }) satisfies UserMessageContentPart,
              ),
            ),
          );

          userContent.push(...imagesAsContent);
        }

        messages.push({ role: 'user', content: userContent }, ...conversationMessages);

        return await this.env.ai.run('@cf/moonshotai/kimi-k2.6', {
          messages,
          temperature: 0.1,
          reasoning_effort: 'medium',
          parallel_tool_calls: true,
          user: userId,
          tool_choice: turn < 2 ? 'required' : 'auto',
          tools: agentToolDefinitions,
          n: 1,
        });
      });

      // tools executions
      const outproResult = await step.do(`turn-${turn}-outpro`, async () => {
        const messagesToAppend: ChatCompletionMessageParam[] = [];
        const { message } = llmRunOutput.choices[0];
        if (message.tool_calls?.length) {
          const toolMessages = await executeChatToolCalls(message.tool_calls, {
            env: this.env,
            agentRequestId,
            userId,
          });
          messagesToAppend.push({ ...message, function_call: undefined }, ...toolMessages);
          return { breakLoop: false, messagesToAppend };
        }

        return { breakLoop: true };
      });

      if (outproResult.breakLoop) {
        break;
      }

      turn++;
    }
  }

  async getAgentImageAsBase64(r2Path: string) {
    const object = await this.env.bk.get(r2Path);

    if (!object) {
      throw new NonRetryableError(`failed to retrieve image for ${r2Path}`);
    }
    const contentType = object.httpMetadata?.contentType || 'image/jpeg';

    const arrayBuffer = await object.arrayBuffer();
    const base64String = new Uint8Array(arrayBuffer).toBase64();
    return `data:${contentType};base64,${base64String}`;
  }
}
