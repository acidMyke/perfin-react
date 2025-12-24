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
