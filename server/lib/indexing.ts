const GRID_SIZE = 0.002; // 222 meters
const MAX_LON = 100_000;

export type Coordinate = { latitude: number; longitude: number };
export function getGeoCellId({ latitude, longitude }: Coordinate) {
  const latCell = Math.floor(latitude / GRID_SIZE);
  const lonCell = Math.floor(longitude / GRID_SIZE);

  return latCell * MAX_LON + lonCell;
}

export const SHOP_NAME_TEXT_KIND = 'shopName' as const;
export const MALL_NAME_TEXT_KIND = 'mallName' as const;
export const ITEM_NAME_TEXT_KIND = 'itemName' as const;
export const ADJ_NAME_TEXT_KIND = 'adjName' as const;
export const TEXT_KIND = {
  SHOP_NAME: SHOP_NAME_TEXT_KIND,
  MALL_NAME: MALL_NAME_TEXT_KIND,
  ITEM_NAME: ITEM_NAME_TEXT_KIND,
  ADJ_NAME: ADJ_NAME_TEXT_KIND,
};
export type TextKind =
  typeof SHOP_NAME_TEXT_KIND | typeof MALL_NAME_TEXT_KIND | typeof ITEM_NAME_TEXT_KIND | typeof ADJ_NAME_TEXT_KIND;

export type TextIdParamter = {
  userId: string;
  kind: TextKind;
  text: string;
};

const getTextParamKey = ({ userId, kind, text }: TextIdParamter) => [userId, kind, text].join(':');

export async function createTextIdLookup(...params: TextIdParamter[]) {
  const encoder = new TextEncoder();
  const promises: Promise<any>[] = [];
  const textIdMap = new Map<string, ArrayBuffer>();
  const existing = new Set<string>();

  for (const param of params) {
    const key = getTextParamKey(param);
    if (existing.has(key)) continue;
    existing.add(key);
    const valueBuff = encoder.encode(key);
    const digestPromise = crypto.subtle.digest('SHA-256', valueBuff);
    promises.push(digestPromise.then(digestBuffer => textIdMap.set(key, digestBuffer.slice(0, 16))));
  }

  await Promise.all(promises);
  return (param: TextIdParamter) => textIdMap.get(getTextParamKey(param));
}

export function generateSearchChunks(text: string, { unlimited = false }) {
  const phrases = text
    .trim()
    .toLowerCase()
    .split(/[^a-zA-Z0-9'-]+/);

  const chunks: string[] = [];
  for (const phrase of phrases) {
    if (!phrase) continue;
    const numChunk = unlimited ? phrase.length : Math.min(phrase.length, 10);
    let idx = 0;
    for (; idx < numChunk; idx++) {
      chunks.push(phrase.slice(Math.max(idx - 2, 0), idx + 1));
    }
  }

  return chunks;
}
