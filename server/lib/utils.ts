export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getTrigrams = (input: string) =>
  input
    .trim()
    .split(/\s+/)
    .flatMap(phrase =>
      phrase.length < 3
        ? phrase.toLowerCase()
        : Array.from({ length: Math.min(phrase.length, 10) }).map((_, i) =>
            phrase.slice(Math.max(i - 2, 0), i + 1).toLowerCase(),
          ),
    );

// Distance in deg for singapore
export const GRID_SIZE = 0.002; // 222 meters
export const BOUNDARY_THRESHOLD = 0.001; // 111 meters
export const MAX_LON = 100_000;

export function getLocationBoxId({ latitude, longitude }: { latitude: number; longitude: number }, withNearby = false) {
  const latIndex = Math.floor(latitude / GRID_SIZE);
  const lonIndex = Math.floor(longitude / GRID_SIZE);

  const latOffsets = [0];
  const lonOffsets = [0];

  if (withNearby) {
    const latInBox = latitude % GRID_SIZE;
    const longInBox = longitude % GRID_SIZE;

    if (latInBox < BOUNDARY_THRESHOLD) latOffsets.push(-1);
    else if (latInBox > GRID_SIZE - BOUNDARY_THRESHOLD) latOffsets.push(1);

    if (longInBox < BOUNDARY_THRESHOLD) lonOffsets.push(-1);
    else if (longInBox > GRID_SIZE - BOUNDARY_THRESHOLD) lonOffsets.push(1);
  }

  return latOffsets.flatMap(oLat => lonOffsets.map(oLon => (latIndex + oLat) * MAX_LON + (lonIndex + oLon)));
}

const hashTextInternal = async (userId: string, text: string, encoder: TextEncoder) => {
  const data = encoder.encode(userId + text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuffer);

  let n = 0;
  for (let i = 0; i < 6; i++) n = n * 256 + bytes[i];
  n = n * 32 + (bytes[6] >> 3);
  return n;
};

export const getTextsHashes = async (userId: string, texts: IteratorObject<string> | string[]) => {
  const encoder = new TextEncoder();
  const resultMap = new Map<string, number>();
  await Promise.all(
    texts.map(async text => {
      const hash = await hashTextInternal(userId, text, encoder);
      resultMap.set(text, hash);
    }),
  );
  return resultMap;
};

export const splitArray = <T>(items: T[], maxSize: number): T[][] => {
  if (maxSize <= 0) return [];

  const result: T[][] = [];
  const len = items.length;

  let i = 0;
  while (i < len) {
    const end = Math.min(i + maxSize, len);
    const chunk: T[] = new Array(end - i);
    for (let j = 0; j < end - i; j++) {
      chunk[j] = items[i + j];
    }
    result.push(chunk);
    i = end;
  }

  return result;
};
