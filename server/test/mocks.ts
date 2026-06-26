import type { AppDatabase } from '#server/lib/db';
import type { Context } from '#server/lib/itty';
import type { ProtectedContext } from '#server/lib/trpc';
import type { Mock } from 'vitest';

type CreateMockContextOption = {
  dbMode: 'throwError' | 'mock';
};

function createMockDatabase({ dbMode = 'throwError' }: CreateMockContextOption) {
  let mockResults: any[] = [];
  let nextResultIdx = 0;
  const dynamicSpies: Record<string, Mock> = {};

  const chain = new Proxy(
    {},
    {
      get(_, prop: string) {
        return (...args: any[]) => {
          if (dbMode === 'throwError')
            throw Error('Database methods are not expected to be called, are you missing a mock?');
          if (prop === 'then') return Promise.resolve(mockResults[nextResultIdx++]).then(args[0]);
          if (!dynamicSpies[prop]) dynamicSpies[prop] = vi.fn();
          dynamicSpies[prop](...args);
          return chain;
        };
      },
    },
  );

  const spies = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (!dynamicSpies[prop]) dynamicSpies[prop] = vi.fn();
        return dynamicSpies[prop];
      },
    },
  );

  return {
    chain,
    spies,
    addResult: (...results: any[]) => mockResults.push(...results),
  };
}

const opList: Set<string> = new Set([
  'sql',
  'eq',
  'ne',
  'and',
  'or',
  'not',
  'gt',
  'gte',
  'lt',
  'lte',
  'inArray',
  'notInArray',
  'isNull',
  'exists',
  'notExists',
  'between',
  'notBetween',
  'like',
  'notLike',
  'arrayContains',
  'arrayContained',
  'arrayOverlaps',
  'asc',
  'desc',
]);

type DrizzleOrmModule = typeof import('drizzle-orm');
export async function mockSchemaModule(importOriginal: () => Promise<DrizzleOrmModule>): Promise<DrizzleOrmModule> {
  return new Proxy(await importOriginal(), {
    get(target, prop: string) {
      if (opList.has(prop))
        return vi.fn((...args: any[]) => ({
          operator: prop,
          args: args,
        }));
      // @ts-ignore
      return target[prop];
    },
  });
}

export function createMockContext(options: CreateMockContextOption): Context {
  const mock = createMockDatabase(options);
  return {
    db: mock.chain as AppDatabase,
  };
}

export function createMockProtectedContext(options: CreateMockContextOption): ProtectedContext {}
