import { caseWhen, jsonGroupArray, sumAsNumber, max } from '#server/lib/db';
import { and, eq, desc, inArray, sql, countDistinct, gte, isNull, or, isNotNull, SQL, notExists } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import {
  textsTable,
  textChunksTable,
  geoTextsTable,
  ctxTextsTable,
  expenseTextsTable,
  expenseAccountAllocationsTable,
  expenseAdjustmentsTable,
  expenseCategoryAllocationsTable,
  expenseItemsTable,
} from '../../../db/schema';
import z from 'zod';
import type { ProtectedContext } from '#server/lib/trpc';
import {
  createGetTextId,
  generateSearchChunks,
  getGeoCell,
  getNearbyGeoCellIds,
  getSingleTextId,
  TEXT_KIND,
  type TextIdParamter,
} from '#server/lib/indexing';
import { subDays } from 'date-fns';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';

export const getSuggestionInputSchema = z.object({
  kind: z.enum([TEXT_KIND.SHOP_NAME, TEXT_KIND.MALL_NAME, TEXT_KIND.ITEM_NAME, TEXT_KIND.ADJ_NAME]),
  search: z.string().optional(),
  context: z.object({ kind: z.enum([TEXT_KIND.SHOP_NAME, TEXT_KIND.MALL_NAME]), text: z.string() }).optional(),
  coordinate: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  isOnline: z.boolean().default(false),
});

type GetSuggestionInput = z.infer<typeof getSuggestionInputSchema>;

export async function getSuggestions(ctx: ProtectedContext, input: GetSuggestionInput) {
  const { db, userId } = ctx;
  const { kind, context, coordinate, isOnline } = input;
  const search = input.search?.trim();
  const contextText = context?.text?.trim();

  if (!search && !contextText && !coordinate) {
    return { suggestions: [] };
  }

  const textIdCol = 'text_id' as const;
  const chunkCountScoreCol = 'chunk_score' as const;
  const frequencyScoreCol = 'frequency_score' as const;
  const recencyScoreCol = 'recency_score' as const;
  const contextScoreCol = 'context_score' as const;
  const spatialScoreCol = 'spatial_score' as const;

  let searchQuery = db
    .select({
      textId: sql<null | Buffer<ArrayBufferLike>>`NULL`.as(textIdCol),
      chunkCountScore: sql<number>`0`.as(chunkCountScoreCol),
      contextScore: sql<number>`0`.as(contextScoreCol),
      spatialScore: sql<number>`0`.as(spatialScoreCol),
    })
    .from(textChunksTable)
    .where(sql`false`)
    .$dynamic();

  if (search) {
    const searchChunks = generateSearchChunks(search);
    searchQuery = searchQuery.unionAll(
      db
        .select({
          textId: textChunksTable.textId.as(textIdCol),
          chunkCountScore: countDistinct(textChunksTable.chunk).as(chunkCountScoreCol),
          contextScore: sql<number>`0`.as(contextScoreCol),
          spatialScore: sql<number>`0`.as(spatialScoreCol),
        })
        .from(textChunksTable)
        .where(
          and(
            eq(textChunksTable.userId, userId),
            eq(textChunksTable.kind, kind),
            inArray(textChunksTable.chunk, searchChunks),
          ),
        )
        .groupBy(textChunksTable.textId),
    );
  }

  if (context) {
    const ctxTextId = await getSingleTextId({ userId, ...context });
    searchQuery = searchQuery.unionAll(
      db
        .select({
          textId: ctxTextsTable.textId.as(textIdCol),
          chunkCountScore: sql<number>`0`.as(chunkCountScoreCol),
          contextScore: sql<number>`2`.as(contextScoreCol),
          spatialScore: sql<number>`0`.as(spatialScoreCol),
        })
        .from(ctxTextsTable)
        .where(eq(ctxTextsTable.ctxTextId, Buffer.from(ctxTextId))),
    );
  }

  if (coordinate ?? isOnline) {
    const geoCell = getGeoCell(coordinate ?? { isOnline: true });
    searchQuery = searchQuery.unionAll(
      db
        .selectDistinct({
          textId: geoTextsTable.textId.as(textIdCol),
          chunkCountScore: sql<0>`0`.as(chunkCountScoreCol),
          contextScore: sql<0>`0`.as(contextScoreCol),
          spatialScore: sql<2>`2`.as(spatialScoreCol),
        })
        .from(geoTextsTable)
        .where(
          and(eq(geoTextsTable.userId, userId), eq(geoTextsTable.kind, kind), eq(geoTextsTable.geoCellId, geoCell.id)),
        ),
    );
  }

  const searchSubquery = searchQuery.as('search_sq');

  const aggregatedSubquery = db
    .select({
      textId: searchSubquery.textId,
      chunkCountScore: sumAsNumber(searchSubquery.chunkCountScore).as(chunkCountScoreCol),
      contextScore: sumAsNumber(searchSubquery.contextScore).as(contextScoreCol),
      spatialScore: sumAsNumber(searchSubquery.spatialScore).as(spatialScoreCol),
    })
    .from(searchSubquery)
    .groupBy(sql.raw(textIdCol))
    .as('input_scoring_sq');

  const result = await db
    .select({
      text: textsTable.text,
      chunkCountScore: aggregatedSubquery.chunkCountScore,
      contextScore: aggregatedSubquery.contextScore,
      spatialScore: aggregatedSubquery.spatialScore,
      frequencyScore: caseWhen(gte(textsTable.usageCount, 20), 2)
        .whenThen(gte(textsTable.usageCount, 5), 1)
        .else(0)
        .as(frequencyScoreCol),
      recencyScore: caseWhen(gte(textsTable.lastUsedAt, subDays(Date.now(), 4)), -1)
        .whenThen(gte(textsTable.lastUsedAt, subDays(Date.now(), 28)), 2)
        .whenThen(gte(textsTable.lastUsedAt, subDays(Date.now(), 63)), 1)
        .else(0)
        .as(recencyScoreCol),
    })
    .from(aggregatedSubquery)
    .innerJoin(
      textsTable,
      and(eq(aggregatedSubquery.textId, textsTable.id), eq(textsTable.userId, userId), eq(textsTable.kind, kind)),
    )
    .orderBy(
      desc(
        sql.raw(
          `${chunkCountScoreCol} + ${frequencyScoreCol} + ${recencyScoreCol} + ${contextScoreCol} + ${spatialScoreCol}`,
        ),
      ),
    );

  return { suggestions: result };
}

const searchShopByLocationInputSchema = z.union([
  z.object({ isOnline: z.literal(true), isExpanded: z.literal(false).optional() }),
  z.object({
    isOnline: z.literal(false).optional(),
    latitude: z.number(),
    longitude: z.number(),
    isExpanded: z.boolean().default(false),
  }),
]);

type SearchShopByLocationInput = z.infer<typeof searchShopByLocationInputSchema>;
export async function searchShopByLocation(ctx: ProtectedContext, input: SearchShopByLocationInput) {
  const { db, userId } = ctx;

  const geoCellIds: number[] = getNearbyGeoCellIds(input, { expanded: input.isExpanded });

  const shopGeoTexts = alias(geoTextsTable, 'shop_geo_texts');
  const mallGeoTexts = alias(geoTextsTable, 'mall_geo_texts');
  const shopTexts = alias(textsTable, 'shop_texts');
  const mallTexts = alias(textsTable, 'mall_texts');

  const result = await db
    .select({
      shopName: shopTexts.text,
      mallName: mallTexts.text,
      latitude: shopGeoTexts.latitude,
      longitude: shopGeoTexts.longitude,
    })
    .from(shopGeoTexts)
    .leftJoin(shopTexts, eq(shopGeoTexts.textId, shopTexts.id))
    .leftJoin(ctxTextsTable, eq(shopGeoTexts.textId, ctxTextsTable.textId))
    .leftJoin(
      mallGeoTexts,
      and(
        eq(ctxTextsTable.ctxTextId, mallGeoTexts.textId),
        eq(mallGeoTexts.userId, userId),
        eq(mallGeoTexts.kind, TEXT_KIND.MALL_NAME),
        eq(shopGeoTexts.geoCellId, mallGeoTexts.geoCellId),
      ),
    )
    .leftJoin(mallTexts, and(eq(ctxTextsTable.ctxTextId, mallTexts.id)))
    .where(
      and(
        eq(shopGeoTexts.userId, userId),
        eq(shopGeoTexts.kind, TEXT_KIND.SHOP_NAME),
        inArray(shopGeoTexts.geoCellId, geoCellIds),
        or(isNull(ctxTextsTable.ctxTextId), isNotNull(mallGeoTexts.textId)),
      ),
    );

  return { result };
}

export const getShopDetailInputSchema = z.object({ shopName: z.string() });
type GetShopDetailInput = z.infer<typeof getShopDetailInputSchema>;

export async function getShopDetail(ctx: ProtectedContext, input: GetShopDetailInput) {
  const { shopName } = input;
  const { db, userId } = ctx;
  const shopNameTextId = await getSingleTextId({ userId, kind: TEXT_KIND.SHOP_NAME, text: shopName });

  const expensesCte = db.$with('expense_id_cte').as(
    db
      .selectDistinct({ expenseId: expenseTextsTable.expenseId.as('expense_id') })
      .from(expenseTextsTable)
      .where(eq(expenseTextsTable.textId, Buffer.from(shopNameTextId)))
      .orderBy(desc(expenseTextsTable.expenseBilledAt))
      .limit(1),
  );

  const adjustmentsCte = db.$with('adjustments_cte').as(
    db
      .select({
        isGstExcluded: max(
          caseWhen(eq(expenseAdjustmentsTable.name, GST_NAME), sql<number>`1`).else(sql<number>`0`),
        ).as('is_gst'),
        serviceChargeBps: max(
          caseWhen<number>(eq(expenseAdjustmentsTable.name, SERVICE_CHARGE_NAME), expenseAdjustmentsTable.rateBps),
        ).as('service_charge'),
      })
      .from(expensesCte)
      .leftJoin(
        expenseAdjustmentsTable,
        and(
          eq(expenseAdjustmentsTable.isInferable, true),
          eq(expensesCte.expenseId, expenseAdjustmentsTable.expenseId),
        ),
      )
      .groupBy(expenseAdjustmentsTable.expenseId),
  );

  const accountsCte = db.$with('accounts_cte').as(
    db
      .select({ accountIds: jsonGroupArray(expenseAccountAllocationsTable.accountId).as('accountIds') })
      .from(expensesCte)
      .leftJoin(expenseAccountAllocationsTable, eq(expensesCte.expenseId, expenseAccountAllocationsTable.expenseId))
      .groupBy(expenseAccountAllocationsTable.expenseId),
  );

  const categoriesCte = db.$with('categories_cte').as(
    db
      .select({ categoryIds: jsonGroupArray(expenseCategoryAllocationsTable.categoryId).as('categoryIds') })
      .from(expensesCte)
      .leftJoin(expenseCategoryAllocationsTable, eq(expensesCte.expenseId, expenseCategoryAllocationsTable.expenseId))
      .groupBy(expenseCategoryAllocationsTable.expenseId),
  );

  const data = await db
    .with(expensesCte, adjustmentsCte, accountsCte, categoriesCte)
    .select({
      accountIds: accountsCte.accountIds,
      categoryIds: categoriesCte.categoryIds,
      isGstExcluded: adjustmentsCte.isGstExcluded,
      serviceChargeBps: adjustmentsCte.serviceChargeBps,
    })
    .from(adjustmentsCte)
    .crossJoin(accountsCte)
    .crossJoin(categoriesCte);

  return data;
}

export const getItemDetailInputSchema = z.object({
  itemName: z.string(),
  shopName: z.string().nullish(),
  mallName: z.string().nullish(),
});
type GetItemDetailInput = z.infer<typeof getItemDetailInputSchema>;

export async function getItemDetail(ctx: ProtectedContext, input: GetItemDetailInput) {
  const { db, userId } = ctx;
  const { itemName, shopName, mallName } = input;

  const itemTextIdParam = { userId, kind: TEXT_KIND.ITEM_NAME, text: itemName };
  const shopTextIdParam = shopName ? { userId, kind: TEXT_KIND.SHOP_NAME, text: shopName } : undefined;
  const mallTextIdParam = mallName ? { userId, kind: TEXT_KIND.MALL_NAME, text: mallName } : undefined;

  const textIdParams: TextIdParamter[] = [itemTextIdParam];

  if (shopTextIdParam) {
    textIdParams.push(shopTextIdParam);
    if (mallTextIdParam) {
      textIdParams.push(mallTextIdParam);
    }
  }

  const getTextId = await createGetTextId(...textIdParams);
  const itemTextId = getTextId(itemTextIdParam)!;
  const shopTextId = shopTextIdParam && getTextId(shopTextIdParam);
  const mallTextId = mallTextIdParam && getTextId(mallTextIdParam);

  const itemExpense = alias(expenseTextsTable, 'item_expense');
  const itemShopCtx = alias(ctxTextsTable, 'item_shop_ctx');
  const shopExpense = alias(expenseTextsTable, 'shop_expense');
  const shopMallCtx = alias(ctxTextsTable, 'shop_mall_ctx');
  const mallExpense = alias(expenseTextsTable, 'mall_expense');

  let query = db
    .select({ priceCents: expenseItemsTable.priceCents, categoryId: expenseItemsTable.categoryId })
    .from(itemExpense)
    .innerJoin(expenseItemsTable, eq(expenseItemsTable.id, itemExpense.sourceId))
    .where(eq(expenseTextsTable.textId, Buffer.from(itemTextId)))
    .$dynamic();

  const orderByConds: SQL[] = [];

  if (shopTextId) {
    query = query
      .innerJoin(
        itemShopCtx,
        and(eq(itemShopCtx.textId, itemExpense.textId), eq(itemShopCtx.ctxTextId, Buffer.from(shopTextId))),
      )
      .innerJoin(
        shopExpense,
        and(eq(shopExpense.expenseId, itemExpense.expenseId), eq(shopExpense.textId, itemShopCtx.ctxTextId)),
      );

    if (mallTextId) {
      query = query
        .leftJoin(
          shopMallCtx,
          and(eq(shopMallCtx.textId, itemShopCtx.ctxTextId), eq(shopMallCtx.ctxTextId, Buffer.from(mallTextId))),
        )
        .leftJoin(
          mallExpense,
          and(eq(mallExpense.expenseId, itemExpense.expenseId), eq(mallExpense.textId, shopMallCtx.ctxTextId)),
        );
      orderByConds.push(desc(caseWhen(isNotNull(shopMallCtx.ctxTextId), sql`1`).else(sql`0`)));
    }
  } else {
    const itemShopCtxSq = db
      .select()
      .from(itemShopCtx)
      .where(eq(itemShopCtx.textId, Buffer.from(itemTextId)));
    query = query.where(notExists(itemShopCtxSq));
  }

  const result = await query
    .where(eq(itemExpense.textId, Buffer.from(itemTextId)))
    .orderBy(...orderByConds)
    .limit(1);

  return { result };
}
