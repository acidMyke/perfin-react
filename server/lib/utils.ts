export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getTrigrams = (input: string) =>
  input
    .trim()
    .split(/\s+/)
    .flatMap(phrase =>
      phrase.length < 3
        ? phrase
        : Array.from({ length: Math.min(phrase.length, 10) - 2 }).map((_, i) => phrase.slice(i, i + 3)),
    );
