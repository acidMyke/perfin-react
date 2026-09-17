import { caseWhen, sumAsNumber } from '#server/lib/db';
import { and, eq, desc, inArray, sql, countDistinct, gte, isNull, or, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { textsTable, textChunksTable, geoTextsTable, ctxTextsTable } from '../../../db/schema';
import z from 'zod';
import type { ProtectedContext } from '#server/lib/trpc';
import { generateSearchChunks, getGeoCell, getSingleTextId, TEXT_KIND } from '#server/lib/indexing';
import { subDays } from 'date-fns';

export const getSuggestionInputSchema = z.object({
  kind: z.enum([TEXT_KIND.SHOP_NAME, TEXT_KIND.MALL_NAME, TEXT_KIND.ITEM_NAME, TEXT_KIND.ADJ_NAME]),
  search: z.string().optional(),
  context: z.object({ kind: z.enum([TEXT_KIND.SHOP_NAME, TEXT_KIND.MALL_NAME]), text: z.string() }).optional(),
  coordinate: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
});

type GetSuggestionInput = z.infer<typeof getSuggestionInputSchema>;

export async function getSuggestions(ctx: ProtectedContext, input: GetSuggestionInput) {
  const { db, userId } = ctx;
  const { kind, context, coordinate } = input;
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

  if (coordinate) {
    const geoCell = getGeoCell(coordinate);
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

  console.log('Suggestion:', { input, result });
  return { suggestions: result };
}

const searchShopByLocationInputSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  range: z.number().optional(),
});
type SearchShopByLocationInput = z.infer<typeof searchShopByLocationInputSchema>;
export async function searchShopByLocation(ctx: ProtectedContext, input: SearchShopByLocationInput) {
  const { db, userId } = ctx;

  const geoCellIds: number[] = [getGeoCell(input).id];

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
        inArray(mallGeoTexts.geoCellId, geoCellIds),
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
