const GRID_SIZE = 0.002; // 222 meters
const NEARBY_THRESHOLD = 0.0005; // 77.7 meters
const SG_BOUNDING_BOX = Object.freeze({
  MIN_LAT: 1.13, // SOUTH
  MAX_LAT: 1.493, // NORTH
  MIN_LON: 103.557, // WEST
  MAX_LON: 104.131, // EAST

  LON_CELL_COUNT: 288, // ceil(floor(104.131/0.002)  - floor(103.557/0.002))
  LAT_CELL_COUNT: 182, // ceil(floor(1.493/0.002)  - floor(1.13/0.002))
});

const NON_SPATIAL_GEO_CELL_ID = -1;
export type GeoCellParam = { isOnline?: false; latitude: number; longitude: number } | { isOnline: true };

function geoCellParamToGeoIdx(param: GeoCellParam) {
  if (param.isOnline) return { latIndex: 0, lonIndex: NON_SPATIAL_GEO_CELL_ID };

  const { latitude, longitude } = param;
  const latIndex = Math.floor((latitude - SG_BOUNDING_BOX.MIN_LAT) / GRID_SIZE);
  const lonIndex = Math.floor((longitude - SG_BOUNDING_BOX.MIN_LON) / GRID_SIZE);
  return { latIndex, lonIndex };
}

type GeoIdx = ReturnType<typeof geoCellParamToGeoIdx>;

const geoIdxToGeoCellId = ({ latIndex, lonIndex }: GeoIdx) => latIndex * SG_BOUNDING_BOX.LON_CELL_COUNT + lonIndex;

function geoIndicesBounds({ latIndex, lonIndex }: GeoIdx) {
  const minLat = latIndex * GRID_SIZE + SG_BOUNDING_BOX.MIN_LAT;
  const minLng = lonIndex * GRID_SIZE + SG_BOUNDING_BOX.MIN_LON;

  return { minLat, minLng, maxLat: minLat + GRID_SIZE, maxLng: minLng + GRID_SIZE };
}

export function getGeoCell(param: GeoCellParam) {
  const geoIndex = geoCellParamToGeoIdx(param);
  const id = geoIdxToGeoCellId(geoIndex);
  return { id, ...geoIndex };
}

function getNearbyGeoIndices(param: GeoCellParam) {
  const { latIndex, lonIndex } = geoCellParamToGeoIdx(param);
  if (param.isOnline) return [{ latIndex, lonIndex }];

  const { latitude, longitude } = param;
  const cellMinLat = SG_BOUNDING_BOX.MIN_LAT + latIndex * GRID_SIZE;
  const cellMinLng = SG_BOUNDING_BOX.MIN_LON + lonIndex * GRID_SIZE;
  const latInGrid = latitude - cellMinLat;
  const lngInGrid = longitude - cellMinLng;
  const latOffsets = [0];
  const lonOffsets = [0];

  if (latInGrid < NEARBY_THRESHOLD) latOffsets.push(-1);
  else if (latInGrid > GRID_SIZE - NEARBY_THRESHOLD) latOffsets.push(1);

  if (lngInGrid < NEARBY_THRESHOLD) lonOffsets.push(-1);
  else if (lngInGrid > GRID_SIZE - NEARBY_THRESHOLD) lonOffsets.push(1);
  return latOffsets.flatMap(oLat => lonOffsets.map(oLon => ({ latIndex: latIndex + oLat, lonIndex: lonIndex + oLon })));
}

export function getNearbyGeoCellIds(param: GeoCellParam) {
  const nearbyGeoIndices = getNearbyGeoIndices(param);
  if (param.isOnline) return [NON_SPATIAL_GEO_CELL_ID];

  return nearbyGeoIndices.map(geoIdxToGeoCellId);
}

export function getNearbyGeoCellIdsAndBounds(param: GeoCellParam) {
  if (param.isOnline) {
    return {
      geoCellIds: [NON_SPATIAL_GEO_CELL_ID],
      bounds: { wasOnline: true, minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 },
    };
  }

  const nearbyGeoIndices = getNearbyGeoIndices(param);
  const geoCellIds: number[] = [];
  let accBounds: (ReturnType<typeof geoIndicesBounds> & { wasOnline: boolean }) | undefined = undefined;

  for (const indices of nearbyGeoIndices) {
    geoCellIds.push(geoIdxToGeoCellId(indices));
    const bound = geoIndicesBounds(indices);
    if (accBounds) {
      accBounds.minLat = Math.min(accBounds.minLat, bound.minLat);
      accBounds.minLng = Math.min(accBounds.minLng, bound.minLng);
      accBounds.maxLat = Math.max(accBounds.maxLat, bound.maxLat);
      accBounds.maxLng = Math.max(accBounds.maxLng, bound.maxLng);
    } else {
      accBounds = { wasOnline: false, ...bound };
    }
  }
  return { geoCellIds, bounds: accBounds };
}

export function getGeoCellBounds(param: GeoCellParam) {
  const indices = geoCellParamToGeoIdx(param);
  return { wasOnline: param.isOnline ?? false, ...geoIndicesBounds(indices) };
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

const WORD_REGEX = /[^a-zA-Z0-9'-]+/;

export function generateSearchChunks(text: string, { unlimited = false, skipShortChunks = false } = {}) {
  const phrases = text.trim().toLowerCase().split(WORD_REGEX);

  const chunks = new Set<string>();
  for (const phrase of phrases) {
    if (!phrase) continue;
    const numChunk = unlimited ? phrase.length : Math.min(phrase.length, 10);
    let idx = skipShortChunks ? Math.min(phrase.length - 1, 2) : 0;
    for (; idx < numChunk; idx++) {
      chunks.add(phrase.slice(Math.max(idx - 2, 0), idx + 1));
    }
  }

  return [...chunks];
}

type HighlightInterval = { start: number; end: number };
const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createHighlightMap(texts: string[], chunks: string[]): Map<string, HighlightInterval[]> {
  const highlightMap = new Map<string, HighlightInterval[]>();

  if (!chunks || chunks.length === 0) return highlightMap;

  // 1. Clean, deduplicate, and sort chunks by length descending
  // Sorting longest-to-shortest ensures the regex prefers matching "meat" over "mea" if both exist
  const validChunks = Array.from(new Set(chunks.filter(Boolean)));
  if (validChunks.length === 0) return highlightMap;

  validChunks.sort((a, b) => b.length - a.length);

  // 2. Build a single lookahead regex: /(?=(mea|eat|veg|2|1))/gi
  // The lookahead (?=...) is the magic trick that allows overlapping matches
  const pattern = validChunks.map(escapeRegExp).join('|');
  const regex = new RegExp(`(?=(${pattern}))`, 'gi');

  for (const text of texts) {
    if (!text || highlightMap.has(text)) continue;

    const intervals: HighlightInterval[] = [];
    regex.lastIndex = 0; // Reset regex state for the new string
    let match;

    // 3. Single pass over the text
    while ((match = regex.exec(text)) !== null) {
      const matchedChunk = match[1]; // The actual text that matched

      intervals.push({
        start: match.index,
        end: match.index + matchedChunk.length,
      });

      // Advance by exactly 1 character to catch overlaps (e.g., catching "eat" right after "mea")
      regex.lastIndex = match.index + 1;
    }

    if (intervals.length === 0) {
      highlightMap.set(text, []);
      continue;
    }

    // 4. Merge intervals (No sorting needed! Regex naturally outputs them left-to-right)
    const merged: HighlightInterval[] = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
      const current = intervals[i];
      const last = merged[merged.length - 1];

      if (current.start <= last.end) {
        last.end = Math.max(last.end, current.end); // Merge overlap
      } else {
        merged.push(current);
      }
    }

    highlightMap.set(text, merged);
  }

  return highlightMap;
}
