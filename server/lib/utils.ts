export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
