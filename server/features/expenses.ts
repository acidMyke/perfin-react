import { protectedProcedure } from '../lib/trpc';
import {
  accountsTable,
  categoriesTable,
  expenseAdjustmentsTable,
  expenseItemsTable,
  expensesTable,
  generateId,
  expenseTextsTable,
  textChunksTable,
  textsContextsTable,
  textsTable,
} from '../../db/schema';
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  sql,
  SQL,
} from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import z from 'zod';
import { endOfMonth, parseISO } from 'date-fns';
import { blacklistSearchableText, calculateExpense, GST_NAME, SERVICE_CHARGE_NAME } from '../lib/expenseHelper';
import { caseWhen, coalesce, concat, excludedAll } from '../lib/db';
import { getLocationBoxId, getTextHash, getTextsHashes, getTrigrams, splitArray } from '../lib/utils';
import type { BatchItem } from 'drizzle-orm/batch';

const loadExpenseOptionsProcedure = protectedProcedure.query(async ({ ctx: { db, user } }) => {
  const [accountOptions, categoryOptions] = await db.batch([
    db
      .select({ value: accountsTable.id, label: accountsTable.name })
      .from(accountsTable)
      .where(and(eq(accountsTable.userId, user.id), eq(accountsTable.isDeleted, false)))
      .orderBy(asc(accountsTable.sequence), asc(accountsTable.createdAt)),
    db
      .select({ value: categoriesTable.id, label: categoriesTable.name })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.userId, user.id), eq(categoriesTable.isDeleted, false)))
      .orderBy(asc(categoriesTable.sequence), asc(categoriesTable.createdAt)),
  ]);

  return {
    accountOptions,
    categoryOptions,
  };
});

const loadExpenseDetailProcedure = protectedProcedure
  .input(z.object({ expenseId: z.string() }))
  .query(async ({ input, ctx }) => {
    const { user, db } = ctx;
    const userId = user.id;

    const [[expense], items, adjustments] = await db.batch([
      db
        .select({
          amountCents: expensesTable.amountCents,
          billedAt: expensesTable.billedAt,
          accountId: expensesTable.accountId,
          categoryId: expensesTable.categoryId,
          type: expensesTable.type,
          latitude: expensesTable.latitude,
          longitude: expensesTable.longitude,
          geoAccuracy: expensesTable.geoAccuracy,
          shopName: expensesTable.shopName,
          shopMall: expensesTable.shopMall,
          version: expensesTable.version,
          isDeleted: expensesTable.isDeleted,
          specifiedAmountCents: expensesTable.specifiedAmountCents,
        })
        .from(expensesTable)
        .where(and(eq(expensesTable.userId, userId), eq(expensesTable.id, input.expenseId)))
        .limit(1),
      db
        .select({
          id: expenseItemsTable.id,
          name: expenseItemsTable.name,
          quantity: expenseItemsTable.quantity,
          priceCents: expenseItemsTable.priceCents,
          isDeleted: expenseItemsTable.isDeleted,
        })
        .from(expenseItemsTable)
        .where(and(eq(expenseItemsTable.expenseId, input.expenseId), eq(expenseItemsTable.isDeleted, false))),
      db
        .select({
          id: expenseAdjustmentsTable.id,
          name: expenseAdjustmentsTable.name,
          amountCents: expenseAdjustmentsTable.amountCents,
          rateBps: expenseAdjustmentsTable.rateBps,
          expenseItemId: expenseAdjustmentsTable.expenseItemId,
          isDeleted: expenseAdjustmentsTable.isDeleted,
        })
        .from(expenseAdjustmentsTable)
        .where(
          and(eq(expenseAdjustmentsTable.expenseId, input.expenseId), eq(expenseAdjustmentsTable.isDeleted, false)),
        ),
    ]);

    if (!expense) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    return { ...expense, items, adjustments };
  });

const saveExpenseProcedure = protectedProcedure
  .input(
    z.object({
      expenseId: z.string(),
      version: z.int().optional().default(0),
      billedAt: z.iso.datetime({ error: 'Invalid date time' }).transform(val => parseISO(val)),
      account: z
        .object({ value: z.string(), label: z.string().trim() })
        .nullish()
        .transform(v => v ?? null),
      category: z
        .object({ value: z.string(), label: z.string().trim() })
        .nullish()
        .transform(v => v ?? null),
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
      geoAccuracy: z.number().nullish(),
      shopName: z.string().trim().nullish(),
      shopMall: z.string().trim().nullish(),
      type: z.enum(['online', 'physical']).default('physical'),
      specifiedAmountCents: z.int().min(0, { error: 'Must be non-negative value' }),
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string().trim(),
          priceCents: z.int().min(0, { error: 'Must be non-negative value' }),
          quantity: z.int().min(0, { error: 'Must be non-negative value' }),
          isDeleted: z.boolean().optional().default(false),
        }),
      ),
      adjustments: z.array(
        z.object({
          id: z.string(),
          name: z.string().trim(),
          amountCents: z.int().default(0),
          rateBps: z
            .int()
            .nullish()
            .transform(v => v ?? undefined),
          expenseItemId: z
            .string()
            .nullish()
            .transform(v => v ?? undefined),
          isDeleted: z.boolean().optional().default(false),
        }),
      ),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const existingSearchableSet = new Set<string>();
    const existingItemIds = new Set<string>();
    const existingAdjustmentIds = new Set<string>();
    if (input.expenseId !== 'create') {
      const existing = await db.query.expensesTable.findFirst({
        where: { id: input.expenseId, userId },
        columns: { userId: true, isDeleted: true, version: true, shopName: true, shopMall: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      if (existing.version > input.version) {
        throw new TRPCError({ code: 'CONFLICT' });
      }

      if (existing.shopMall) {
        existingSearchableSet.add(existing.shopMall);
      }

      if (existing.shopName) {
        existingSearchableSet.add(existing.shopName);
      }

      const [items, adjustments] = await db.batch([
        db
          .select({
            text: expenseItemsTable.name,
            sourceId: expenseItemsTable.id,
          })
          .from(expenseItemsTable)
          .where(and(eq(expenseItemsTable.expenseId, input.expenseId), eq(expenseItemsTable.isDeleted, false))),
        db
          .select({
            text: expenseAdjustmentsTable.name,
            sourceId: expenseAdjustmentsTable.id,
          })
          .from(expenseAdjustmentsTable)
          .where(
            and(eq(expenseAdjustmentsTable.expenseId, input.expenseId), eq(expenseAdjustmentsTable.isDeleted, false)),
          ),
      ]);

      for (const { text, sourceId } of items) {
        existingSearchableSet.add(text);
        existingItemIds.add(sourceId);
      }

      for (const { text, sourceId } of adjustments) {
        existingSearchableSet.add(text);
        existingAdjustmentIds.add(sourceId);
      }
    } else {
      input.expenseId = generateId();
    }

    const inputSearchables = new Set<string>();
    const newSearchables: { text: string; context?: string | null; sourceId: string }[] = [];
    let shopNameSearchable: (typeof newSearchables)[number] | undefined = undefined;

    if (input.shopName) {
      inputSearchables.add(input.shopName);
      shopNameSearchable = {
        text: input.shopName,
        context: input.shopMall,
        sourceId: input.expenseId,
      };
      if (!existingSearchableSet.has(input.shopName)) {
        newSearchables.push(shopNameSearchable);
        existingSearchableSet.add(input.shopName);
      }
    }

    if (input.shopMall) {
      inputSearchables.add(input.shopMall);
      if (!existingSearchableSet.has(input.shopMall)) {
        shopNameSearchable && newSearchables.push(shopNameSearchable);
        newSearchables.push({ text: input.shopMall, sourceId: input.expenseId });
        existingSearchableSet.add(input.shopMall);
      }
    }

    const itemsRecords: (typeof expenseItemsTable.$inferInsert)[] = [];
    const removedItemIds = new Set(existingItemIds);
    for (const item of input.items) {
      if (item.isDeleted) continue;
      if (item.id === 'create') item.id = generateId();
      removedItemIds.delete(item.id);
      inputSearchables.add(item.name);
      if (!existingSearchableSet.has(item.name)) {
        newSearchables.push({ text: item.name, context: input.shopName, sourceId: item.id });
        existingSearchableSet.add(item.name);
      }

      itemsRecords.push({
        ...item,
        expenseId: input.expenseId,
        sequence: itemsRecords.length,
      });
    }

    const adjustmentsRecords: (typeof expenseAdjustmentsTable.$inferInsert)[] = [];
    const removedAdjustmentIds = new Set(existingAdjustmentIds);
    for (const adj of input.adjustments) {
      if (adj.isDeleted) continue;
      if (adj.id === 'create') adj.id = generateId();
      removedAdjustmentIds.delete(adj.id);
      inputSearchables.add(adj.name);
      if (!existingSearchableSet.has(adj.name)) {
        newSearchables.push({ text: adj.name, context: input.shopName, sourceId: adj.id });
        existingSearchableSet.add(adj.name);
      }

      adjustmentsRecords.push({
        ...adj,
        expenseId: input.expenseId,
        sequence: adjustmentsRecords.length,
      });
    }

    const batchItems: BatchItem<'sqlite'>[] = [];

    if (input.account?.value === 'create') {
      input.account.value = generateId();
      batchItems.push(
        db.insert(accountsTable).values({ id: input.account.value, name: input.account.label, userId: userId }),
      );
    }

    if (input.category?.value === 'create') {
      input.category.value = generateId();
      batchItems.push(
        db.insert(categoriesTable).values({ id: input.category.value, name: input.category.label, userId: userId }),
      );
    }

    const accountId = input.account?.value ?? null;
    const categoryId = input.category?.value ?? null;

    const { netTotalCents } = calculateExpense(input);
    const [boxId] =
      input.latitude && input.longitude
        ? getLocationBoxId({ latitude: input.latitude, longitude: input.longitude })
        : [null];

    batchItems.push(
      db
        .insert(expensesTable)
        .values({
          id: input.expenseId,
          amountCents: netTotalCents,
          billedAt: input.billedAt,
          userId: userId,
          accountId: accountId,
          categoryId: categoryId,
          type: input.type,
          updatedBy: userId,
          latitude: input.latitude,
          longitude: input.longitude,
          geoAccuracy: input.geoAccuracy,
          boxId,
          shopName: input.shopName,
          shopMall: input.shopMall,
          specifiedAmountCents: input.specifiedAmountCents,
        })
        .onConflictDoUpdate({
          target: expensesTable.id,
          set: excludedAll(expensesTable, ['userId']),
        }),
    );

    if (itemsRecords.length > 0) {
      batchItems.push(
        db
          .insert(expenseItemsTable)
          .values(itemsRecords)
          .onConflictDoUpdate({
            target: expenseItemsTable.id,
            set: excludedAll(expenseItemsTable),
          }),
      );
    }

    if (removedItemIds.size > 0) {
      batchItems.push(
        db
          .update(expenseItemsTable)
          .set({ isDeleted: true })
          .where(
            and(
              eq(expenseItemsTable.expenseId, input.expenseId),
              inArray(expenseItemsTable.id, Array.from(removedItemIds)),
            ),
          ),
      );
    }

    if (adjustmentsRecords.length > 0) {
      batchItems.push(
        db
          .insert(expenseAdjustmentsTable)
          .values(adjustmentsRecords)
          .onConflictDoUpdate({
            target: expenseAdjustmentsTable.id,
            set: excludedAll(expenseAdjustmentsTable),
          }),
      );
    }

    if (removedAdjustmentIds.size > 0) {
      batchItems.push(
        db
          .update(expenseAdjustmentsTable)
          .set({ isDeleted: true })
          .where(
            and(
              eq(expenseAdjustmentsTable.expenseId, input.expenseId),
              inArray(expenseAdjustmentsTable.id, Array.from(removedAdjustmentIds)),
            ),
          ),
      );
    }

    const searchableHashes = await getTextsHashes(userId, existingSearchableSet.keys());
    const removedSearchables = existingSearchableSet.difference(inputSearchables);
    if (removedSearchables.size > 0) {
      const removedHashes = removedSearchables
        .values()
        .map(text => searchableHashes.get(text)!)
        .toArray();

      batchItems.push(
        db
          .delete(expenseTextsTable)
          .where(
            and(inArray(expenseTextsTable.textHash, removedHashes), eq(expenseTextsTable.expenseId, input.expenseId)),
          ),
      );
    }

    if (newSearchables.some(({ text }) => !blacklistSearchableText.has(text))) {
      const textHashesValues = sql.join(
        newSearchables.map(({ text }, i) =>
          i === 0
            ? sql`SELECT ${searchableHashes.get(text)!} AS hash`
            : sql`UNION ALL SELECT ${searchableHashes.get(text)!}`,
        ),
        sql` `,
      );

      const missingRecords = await db.all<{ hash: number }>(
        sql`SELECT q.hash FROM (${textHashesValues}) AS q
          LEFT JOIN ${textsTable} ON ${textsTable.textHash} = q.hash
          WHERE ${textsTable.textHash} IS NULL`,
      );
      const missingTextHashSet = new Set(missingRecords.map(({ hash }) => hash));

      const texts: (typeof textsTable.$inferInsert)[] = [];
      const textChunks: (typeof textChunksTable.$inferInsert)[] = [];
      const expenseTexts: (typeof expenseTextsTable.$inferInsert)[] = [];
      const textsContexts: (typeof textsContextsTable.$inferInsert)[] = [];

      for (const { text, sourceId, context } of newSearchables) {
        if (!blacklistSearchableText.has(text)) continue;
        const textHash = searchableHashes.get(text)!;
        if (missingTextHashSet.has(textHash)) {
          texts.push({ textHash, userId, text });
          textChunks.push(...getTrigrams(text).map(chunk => ({ userId, chunk, textHash })));
        }
        if (context) {
          const ctxTextHash = searchableHashes.get(context);
          if (ctxTextHash) {
            textsContexts.push({ textHash, ctxTextHash });
          }
        }
        expenseTexts.push({ textHash, sourceId, expenseId: input.expenseId });
      }

      batchItems.push(
        ...splitArray(texts, 30).map(values => db.insert(textsTable).values(values).onConflictDoNothing()),
        ...splitArray(textChunks, 30).map(values => db.insert(textChunksTable).values(values).onConflictDoNothing()),
        ...splitArray(textsContexts, 30).map(values =>
          db.insert(textsContextsTable).values(values).onConflictDoNothing(),
        ),
        ...splitArray(expenseTexts, 30).map(values =>
          db.insert(expenseTextsTable).values(values).onConflictDoNothing(),
        ),
      );
    }

    // @ts-ignore
    await db.batch(batchItems);
  });

const listExpenseProcedure = protectedProcedure
  .input(z.object({ month: z.number().min(0).max(11), year: z.number().min(2020) }))
  .query(async ({ input, ctx }) => {
    const { db } = ctx;
    const userId = ctx.user.id;
    const { year, month } = input;
    const filterStart = new Date(year, month, 1, 0, 0, 0);
    const filterEnd = endOfMonth(filterStart);

    const filterList: (SQL | undefined)[] = [
      eq(expensesTable.userId, userId),
      gte(expensesTable.billedAt, filterStart),
      lt(expensesTable.billedAt, filterEnd),
    ];

    const itemCount = count(expenseItemsTable.id);
    const itemOne = max(caseWhen(eq(expenseItemsTable.sequence, sql.raw('0')), expenseItemsTable.name));
    const itemTwo = max(caseWhen(eq(expenseItemsTable.sequence, sql.raw('1')), expenseItemsTable.name));

    const expenses = await db
      .select({
        id: expensesTable.id,
        itemCount,
        description: caseWhen(eq(itemCount, sql.raw('1')), itemOne)
          .whenThen(eq(itemCount, sql.raw('2')), concat(itemOne, sql.raw("' and '"), itemTwo))
          .else(concat(itemOne, sql.raw("' and '"), sql`(${itemCount} - 1)`, sql.raw("' items'"))),
        shopDetail: concat(expensesTable.shopName, coalesce(concat(sql.raw("' @ '"), expensesTable.shopMall))),
        amount: sql<number>`ROUND(${expensesTable.amountCents} / CAST(100 AS REAL), 2)`,
        billedAt: expensesTable.billedAt,
        account: {
          id: accountsTable.id,
          name: accountsTable.name,
          isDeleted: accountsTable.isDeleted,
        },
        category: {
          id: categoriesTable.id,
          name: categoriesTable.name,
          isDeleted: categoriesTable.isDeleted,
        },
        createdAt: expensesTable.createdAt,
        isDeleted: expensesTable.isDeleted,
      })
      .from(expensesTable)
      .leftJoin(accountsTable, eq(expensesTable.accountId, accountsTable.id))
      .leftJoin(categoriesTable, eq(expensesTable.categoryId, categoriesTable.id))
      .leftJoin(
        expenseItemsTable,
        and(eq(expensesTable.id, expenseItemsTable.expenseId), eq(expenseItemsTable.isDeleted, false)),
      )
      .where(and(...filterList))
      .groupBy(expensesTable.id)
      .orderBy(desc(expensesTable.billedAt));

    return { expenses };
  });

const getSuggestionsProcedure = protectedProcedure
  .input(
    z.object({
      scope: z.enum(['shopName', 'shopMall', 'itemName', 'adjName']),
      search: z.string(),
      context: z.string().optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const search = input.search.trim();
    const context = input.context?.trim();

    if (!search && !context) {
      return { suggestions: [] as string[] };
    }

    const { textColumn, sourceTable } = {
      shopName: { textColumn: expensesTable.shopName, sourceTable: expensesTable },
      shopMall: { textColumn: expensesTable.shopMall, sourceTable: expensesTable },
      itemName: { textColumn: expenseItemsTable.name, sourceTable: expenseItemsTable },
      adjName: { textColumn: expenseAdjustmentsTable.name, sourceTable: expenseAdjustmentsTable },
    }[input.scope];

    const where: SQL[] = [];
    let having: SQL | undefined;

    const orderBy: SQL[] = [desc(countDistinct(expenseTextsTable.sourceId))]; // By frequency

    let baseQuery = db
      .select({ text: max(textColumn) })
      .from(sourceTable)
      .innerJoin(expenseTextsTable, eq(sourceTable.id, expenseTextsTable.sourceId));

    if (search) {
      // search by chunks
      const trigrams = getTrigrams(search);
      baseQuery = baseQuery.innerJoin(textChunksTable, eq(expenseTextsTable.textHash, textChunksTable.textHash));
      where.push(eq(textChunksTable.userId, userId), inArray(textChunksTable.chunk, trigrams));

      if (trigrams.length > 5) {
        // If there is more than 5 chunks for searching, remove those with less matches
        having = gte(countDistinct(textChunksTable.chunk), trigrams.length - 5);
      }

      if (!context) {
        orderBy.unshift(desc(countDistinct(textChunksTable.chunk)));
      }
    }

    if (context) {
      const contextHash = await getTextHash(userId, context);
      baseQuery = baseQuery.leftJoin(textsContextsTable, eq(expenseTextsTable.textHash, textsContextsTable.textHash));
      if (search) {
        // contextual sort, since it will be filtered by chunks
        const hasMatchingContext = caseWhen(eq(textsContextsTable.ctxTextHash, contextHash), sql`5`).else(sql`0`);
        const relevance = sql`${max(hasMatchingContext)} + ${countDistinct(textChunksTable.chunk)}`;
        orderBy.unshift(desc(relevance));
      } else {
        // contextual search, filtering by context
        where.push(eq(textsContextsTable.ctxTextHash, contextHash));
      }
    }

    const orderedQuery = baseQuery
      .where(and(...where, isNotNull(textColumn)))
      .groupBy(expenseTextsTable.textHash)
      .orderBy(...orderBy);
    const finalQuery = having ? orderedQuery.having(having) : orderedQuery;
    const result = await finalQuery;

    return { suggestions: result.map(({ text }) => text!) };
  });

const inferShopDetailsProcedure = protectedProcedure
  .input(
    z.object({
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),

      shopName: z.string().nullish(),

      itemNames: z.array(z.string()).optional(),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const itemNames =
      input.itemNames?.reduce((acc, name) => {
        const trimmed = name.trim();
        if (trimmed.length) acc.push(trimmed.toUpperCase());
        return acc;
      }, [] as string[]) ?? [];

    // Infer shop / mall and shopdetails by coordinate
    if (!input.shopName && input.latitude && input.longitude) {
      const boxIds = getLocationBoxId({ latitude: input.latitude, longitude: input.longitude }, true);

      const nearbyShopsColumns = {
        shopName: expensesTable.shopName,
        shopMall: expensesTable.shopMall,
        additionalServiceChargePercent: expensesTable.additionalServiceChargePercent,
        isGstExcluded: expensesTable.isGstExcluded,
        categoryId: expensesTable.categoryId,
        accountId: expensesTable.accountId,
      } as const;
      const nearbyShopsCondition = and(eq(expensesTable.userId, userId), inArray(expensesTable.boxId, boxIds));

      const distance = sql<number>`min((${expensesTable.latitude} - ${input.latitude}) * (${expensesTable.latitude} - ${input.latitude})
                    + (${expensesTable.longitude} - ${input.longitude}) * (${expensesTable.longitude} - ${input.longitude}))`;

      const groupByColumns = [
        nearbyShopsColumns.shopName,
        nearbyShopsColumns.categoryId,
        nearbyShopsColumns.accountId,
      ] as const;

      if (itemNames.length === 0) {
        return await db
          .select(nearbyShopsColumns)
          .from(expensesTable)
          .where(nearbyShopsCondition)
          .groupBy(...groupByColumns)
          .orderBy(distance, desc(max(expensesTable.billedAt)))
          .limit(5);
      } else {
        const hasMatchingItems = sql<number>`MIN(CASE WHEN ${inArray(expenseItemsTable.name, itemNames)} THEN 0 ELSE 1 END)`;
        return await db
          .select(nearbyShopsColumns)
          .from(expensesTable)
          .leftJoin(expenseItemsTable, eq(expensesTable.id, expenseItemsTable.expenseId))
          .where(nearbyShopsCondition)
          .groupBy(...groupByColumns)
          .orderBy(hasMatchingItems, distance, desc(max(expensesTable.billedAt)))
          .limit(5);
      }
    } else if (input.shopName) {
      // Infer shop detail by shop name
      return await db
        .selectDistinct({
          additionalServiceChargePercent: expensesTable.additionalServiceChargePercent,
          isGstExcluded: expensesTable.isGstExcluded,
          categoryId: expensesTable.categoryId,
          accountId: expensesTable.accountId,
        })
        .from(expensesTable)
        .where(and(eq(expensesTable.userId, userId), eq(expensesTable.shopName, input.shopName.trim().toUpperCase())))
        .orderBy(desc(expensesTable.billedAt))
        .limit(5);
    }
    throw new TRPCError({ code: 'BAD_REQUEST' });
  });

const inferItemPricesProcedure = protectedProcedure
  .input(z.object({ itemName: z.string(), shopName: z.string().nullish() }))
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;

    const texts = [input.itemName];
    if (input.shopName) {
      texts.push(input.shopName);
    }

    const hashes = await getTextsHashes(userId, texts);
    const where: SQL[] = [eq(expenseTextsTable.textHash, hashes.get(input.itemName)!)];
    if (input.shopName) {
      where.push(eq(textsContextsTable.ctxTextHash, hashes.get(input.shopName)!));
    } else {
      where.push(isNull(textsContextsTable.ctxTextHash));
    }
    return db
      .select({ priceCents: expenseItemsTable.priceCents, billedAt: max(expensesTable.billedAt), count: count() })
      .from(expenseTextsTable)
      .innerJoin(expenseItemsTable, eq(expenseTextsTable.sourceId, expenseItemsTable.id))
      .innerJoin(expensesTable, eq(expenseItemsTable.expenseId, expensesTable.id))
      .leftJoin(textsContextsTable, eq(expenseTextsTable.textHash, textsContextsTable.textHash))
      .where(and(...where))
      .groupBy(expenseItemsTable.priceCents)
      .orderBy(desc(max(expensesTable.billedAt)), desc(count()))
      .limit(1);
  });

const setIsDeletedExpenseProcedure = protectedProcedure
  .input(z.object({ expenseId: z.string(), isDeleted: z.boolean(), version: z.number() }))
  .mutation(async ({ input, ctx }) => {
    const { db, userId } = ctx;
    const { expenseId, isDeleted, version } = input;

    // Validation
    const existing = await db.query.expensesTable.findFirst({
      where: { id: expenseId, userId },
      columns: { version: true },
    });

    if (!existing) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    if (existing.version > version) {
      throw new TRPCError({ code: 'CONFLICT' });
    }

    await db
      .update(expensesTable)
      .set({ isDeleted })
      .where(and(eq(expensesTable.id, expenseId), eq(expensesTable.userId, userId)));

    return { success: true };
  });

export const expenseProcedures = {
  loadOptions: loadExpenseOptionsProcedure,
  loadDetail: loadExpenseDetailProcedure,
  save: saveExpenseProcedure,
  list: listExpenseProcedure,
  getSuggestions: getSuggestionsProcedure,
  inferShopDetail: inferShopDetailsProcedure,
  inferItemPrice: inferItemPricesProcedure,
  setDelete: setIsDeletedExpenseProcedure,
};
