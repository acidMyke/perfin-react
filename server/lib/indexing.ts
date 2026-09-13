const GRID_SIZE = 0.002; // 222 meters
const SG_BOUNDING_BOX = Object.freeze({
  MIN_LAT: 1.13,
  MAX_LAT: 1.493,
  MIN_LON: 103.557,
  MAX_LON: 104.131,

  MAX_LON_INDEX: 288, // ceil(floor(104.131/0.002)  - floor(103.557/0.002))
  MAX_LAT_INDEX: 182, // ceil(floor(1.493/0.002)  - floor(1.13/0.002))
});

export type Coordinate = { latitude: number; longitude: number };
export function getGeoCell({ latitude, longitude }: Coordinate) {
  const latIndex = Math.floor((latitude - SG_BOUNDING_BOX.MIN_LAT) / GRID_SIZE);
  const lonIndex = Math.floor((longitude - SG_BOUNDING_BOX.MIN_LON) / GRID_SIZE);
  const id = latIndex * SG_BOUNDING_BOX.MAX_LON_INDEX + lonIndex;

  return { id, latIndex, lonIndex };
}

export function getGeoCellBounds(coord: Coordinate) {
  const geoCell = getGeoCell(coord);
  const { latIndex, lonIndex } = geoCell;

  return {
    ...geoCell,
    minLat: latIndex * GRID_SIZE,
    maxLat: (latIndex + 1) * GRID_SIZE,
    minLng: lonIndex * GRID_SIZE,
    maxLng: (lonIndex + 1) * GRID_SIZE,
  };
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

export async function getSingleTextId(param: TextIdParamter, encoder?: TextEncoder) {
  encoder ??= new TextEncoder();
  const key = getTextParamKey(param);
  const valueBuff = encoder.encode(key);
  const digestBuffer = await crypto.subtle.digest('SHA-256', valueBuff);
  return digestBuffer.slice(0, 16);
}

export async function createGetTextId(...params: TextIdParamter[]) {
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

export function generateSearchChunks(text: string, { unlimited = false } = {}) {
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
