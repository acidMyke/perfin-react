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

const MAX_TURN = 4;
const extractionSystemContent = `### Role
You are an expert document extraction assistant for a Singapore expense tracking application.

Your sole responsibility is to extract every piece of information from the supplied document as accurately and completely as possible.
Do not perform duplicate detection, account matching, category selection, merchant normalization, or any other business logic.

This is the first stage of a multi-stage pipeline. Your output will be consumed by another AI assistant for reconciliation, validation, enrichment and draft creation.

---

### Input

Each document is provided in this order:

1. Optional user metadata (JSON)
2. EXIF metadata
3. Image

User metadata (\`kind\`, \`description\`) and EXIF are supplemental context only. If they conflict with the document, always trust the document.

Priority:
1. Document
2. User metadata
3. EXIF


---

### Extraction

Maximize recall over interpretation.

Extract every visible document element, preserving the original wording, spelling, capitalization, punctuation, numbers, dates and formatting whenever possible.

Capture all document details, including document information, merchant or institution, references, addresses, account/payment information, transactions, line items, taxes, fees, discounts, totals, balances and notes.

Preserve reading order and table structure.

Do not summarize, normalize, infer or omit information.

If text is partially unreadable, extract the visible portion and indicate uncertainty instead of inventing missing characters.
Ignore only non-document background elements such as shadows, fingers, desks or surrounding objects.

Preserve the original merchant and item names exactly as printed.

If a reliable English translation is obvious, you may provide it as an additional normalized name, but never replace the original extracted text.

---

### Multiple Images

Process every image.

Merge images belonging to the same document, avoid duplicate extraction, preserve document order, and continue tables across pages.

If unrelated documents are detected, extract each separately.

---

### Singapore Context

The application supports Singapore financial documents only.
If the document explicitly uses a currency other than SGD, reject it.
If no currency is shown, assume SGD.

Never convert currencies.

---

### Output

Produce a structured Markdown document. Use clear section headings.

Do not output JSON. Do not include explanations, reasoning, confidence scores, or commentary unless explicitly requested.

Your output will be consumed by another AI assistant. It MUST be complete, deterministic and optimized for completeness, consistency, and readability rather than brevity.

Include sections when applicable but not limited to:

## Document Type
## Merchant / Account
## Document Information
## Transactions or Line Items
## Adjustments
## Totals / Balances
## EXIF Observations
## Raw OCR
`;

const enrichmentSystemContent = `### Role

You are an expense reconciliation assistant for a Singapore expense tracking application.

A previous stage has already extracted the document. The extracted document is the primary source of truth.

When reconciling or resolving ambiguity, use submission context, historical anchors and existing records as supporting evidence.

Do not modify extracted document values unless there is strong evidence that they are incorrect.

Your job is to validate, enrich, reconcile, and produce a draft ready for human review.

You will receive:

- pre-extracted detail
- submission context
- existing accounts
- existing categories
- user custom instruction

Submission context is supplemental information that may help reconciliation, matching and validation.

Respect the remaining iteration budget provided by the user. As the budget approaches zero, prioritize completing reconciliation and producing the best available draft over additional exploratory tool calls.

---

### Responsibilities

- validate extracted data
- reconcile existing expenses
- detect duplicates
- resolve merchants, accounts, categories and anchors
- validate totals and calculations
- prepare the final draft

Iterate and use tools until no further improvements can be made.

---

### Tool Usage

Use tools proactively. Verify assumptions instead of relying solely on extracted data.

Batch requests whenever possible. If a tool returns validation errors, correct the request and retry.

#### query_existing_records

Retrieve existing expenses using exactly one mutually exclusive filter:

- \`{ fromDate, toDate }\`
- \`{ expenseIds }\`

For statements, retrieve expenses covering the statement period with a reasonable grace period, then reconcile every statement transaction against existing records.

Identify:
- matching expenses
- missing expenses
- duplicates
- incorrect dates or amounts
- records requiring updates

Treat statements as audits of the expense ledger, not ordinary expenses.

#### lookup_anchors

Use when resolving merchants, accounts or categories. Reuse historical anchors whenever possible.

#### fuzzy_names_lookup

Use when the text is unclear or name suggestions for a field from historical values

### location_lookup

Use when resolving location from historical values

---

### Matching

Match using all available evidence, including:

- extracted document
- submission context
- historical anchors
- existing records

If a matching expense exists:

- preserve IDs
- update incorrect values
- keep unchanged data
- mark removed children as deleted
- assign temporary IDs only to new children

Otherwise create a new draft.

Never create duplicates when sufficient evidence indicates an existing record.

---

### Resolution

Prefer existing accounts and categories.

If confidence is high, use the existing ID.

Otherwise leave the ID null, provide a suggested label, and include supporting anchors.

Anchors must be literal text found on the document. Never invent them.

---

### Singapore Rules

Only SGD documents are supported. Reject documents explicitly using another currency.

Never convert currencies.

Use \`_gst\` for GST and \`_service\` for service charges.

---

### Validation

Before saving, ensure:

- totals reconcile
- taxes and discounts reconcile
- statement balances are consistent
- duplicate detection completed
- merchant, account and category resolution attempted

Only call \`save_expense_drafts\` once validation is complete and no further tool calls are likely to improve the draft.
`;

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
            submittedAt: agentRequestsTable.createdAt,
            latitude: agentRequestsTable.latitude,
            longitude: agentRequestsTable.longitude,
          })
          .from(agentRequestsTable)
          .where(and(eq(agentRequestsTable.id, agentRequestId), eq(agentRequestsTable.userId, userId)))
          .limit(1),
        db
          .select({
            r2Path: agentImagesTable.r2Path,
            kind: agentImagesTable.kind,
            description: agentImagesTable.description,
            metadata: agentImagesTable.metadata,
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

      const { accountIds, categoryIds, customInstruction, ...submissionContext } = agentRequest;

      const anchorsMap = new Map<string, string[]>();
      for (const { anchors, value } of subjectsAnchors) {
        anchorsMap.set(value, anchors);
      }

      let eligibleAccounts = accounts.map(a => ({ ...a, anchors: anchorsMap.get(a.id) }));
      if (accountIds && accountIds.length > 0) {
        eligibleAccounts = eligibleAccounts.filter(({ id }) => accountIds!.includes(id));
      }

      let eligibleCategories = categories.map(c => ({ ...c, anchors: anchorsMap.get(c.id) }));
      if (categoryIds && categoryIds.length > 0) {
        eligibleCategories = eligibleCategories.filter(({ id }) => categoryIds!.includes(id));
      }

      return {
        eligibleAccounts,
        eligibleCategories,
        customInstruction,
        agentRequestImages,
        submissionContext,
      };
    });

    const extractionResult = await step.do('extract', async () => {
      const { agentRequestImages } = preparationResult;
      const userContentParts = await Promise.all(
        agentRequestImages.flatMap(
          ({ kind, description, metadata, r2Path }, index) =>
            [
              {
                type: 'text',
                text: `# Submission Document ${index}
Metadata
${kind || description ? JSON.stringify({ kind, description }) : 'Not provided'}

EXIF
${metadata ?? 'Not provided'} 
`,
              },
              this.getAgentImageAsBase64(r2Path).then(url => ({
                type: 'image_url',
                image_url: { url },
              })),
            ] satisfies (Promise<UserMessageContentPart> | UserMessageContentPart)[],
        ),
      );

      const response = await this.env.ai.run('@cf/moonshotai/kimi-k2.6', {
        messages: [
          { role: 'system', content: extractionSystemContent },
          { role: 'user', content: userContentParts },
        ],
        n: 1,
        temperature: 0.05,
        top_p: 1,
        reasoning_effort: 'medium',
        user: userId,
        tool_choice: 'none',
        presence_penalty: 0,
        frequency_penalty: 0,
        logprobs: false,
        parallel_tool_calls: false,
        stream: false,
      });

      return {
        resMsg: response.choices[0].message,
      };
    });

    const conversationMessages: ChatCompletionMessageParam[] = [];
    for (let turn = 1; turn <= MAX_TURN; turn++) {
      const enrichmentTurnResult = await step.do(`enrich-turn-${turn}`, async () => {
        const { eligibleAccounts, eligibleCategories, customInstruction, submissionContext } = preparationResult;
        const { resMsg } = extractionResult;
        const userContext = `### Extracted Data

${resMsg.content}

---

### Submission Context
\`\`\`json
${JSON.stringify(submissionContext)}
\`\`\`

---

### Existing accounts
\`\`\`json
${JSON.stringify(eligibleAccounts)}
\`\`\`

---

### Existing categories
\`\`\`json
${JSON.stringify(eligibleCategories)}
\`\`\`

---

### User custom instruction

${customInstruction}
`;

        const messages: ChatCompletionMessageParam[] = [
          { role: 'system', content: enrichmentSystemContent },
          { role: 'user', content: userContext },
          ...conversationMessages,
        ];

        const remainingIterations = MAX_TURN - turn + 1;
        if (remainingIterations === 1) {
          messages.push({
            role: 'user',
            content: `## Runtime\n\nRemaining iterations: 1\nThis is the final iteration.\nFinalize the draft.\nAvoid optional tool calls.\nSave if ready`,
          });
        } else {
          messages.push({
            role: 'user',
            content: `## Runtime\n\nCurrent iteration: ${turn}, Remaining iterations: ${MAX_TURN - turn}`,
          });
        }
        const response = await this.env.ai.run(
          '@cf/moonshotai/kimi-k2.6',
          {
            messages,
            n: 1,
            temperature: 0.1,
            top_p: 1,
            reasoning_effort: 'medium',
            user: userId,
            tools: agentToolDefinitions,
            parallel_tool_calls: true,
            tool_choice: 'auto',
            presence_penalty: 0,
            frequency_penalty: 0,
            logprobs: false,
            stream: false,
          },
          {
            extraHeaders: { 'x-session-affinity': agentRequestId },
          },
        );

        return {
          assistantMessage: response.choices[0].message,
        };
      });

      const turnOutproResult = await step.do(`turn-${turn}-outpro`, async () => {
        const messagesToAppend: ChatCompletionMessageParam[] = [];
        const { role, content, tool_calls } = enrichmentTurnResult.assistantMessage;

        messagesToAppend.push({ role, content });

        if (tool_calls?.length) {
          const toolMessages = await executeChatToolCalls(tool_calls, {
            env: this.env,
            agentRequestId,
            userId,
          });
          messagesToAppend.push(...toolMessages);
          return { breakLoop: false, messagesToAppend };
        }

        if (!content) {
          return { breakLoop: false, messagesToAppend };
        }

        return { breakLoop: true };
      });

      if (turnOutproResult.breakLoop) {
        break;
      }

      if (turnOutproResult.messagesToAppend.length) {
        conversationMessages.push(...turnOutproResult.messagesToAppend);
      }
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
