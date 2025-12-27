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

  return latOffsets.flatMap(oLat =>
    lonOffsets.map(oLon => {
      // Bit-Shift: Move Latitude 16 bits left, place Longitude in the lower 16 bits
      return ((latIndex + oLat) << 16) | (lonIndex + oLon);
    }),
  );
}
