import type { AppDatabase } from '#server/lib/db';
import type { Context } from '#server/lib/itty';
import type { AnySQLiteColumn, AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Mock } from 'vitest';
import { nanoid } from 'nanoid';
import { CookieHeaders } from '../lib/CookieHeaders';
import type { ProtectedContext } from '#server/lib/trpc';

type CreateMockDatabaseOption = {
  dbMode?: 'throwError' | 'mock';
};

function createMockDatabase({ dbMode = 'throwError' }: CreateMockDatabaseOption) {
  let mockResults: any[] = [];
  let nextResultIdx = 0;
  const dynamicSpies: Record<string, Mock> = {};

  const db = new Proxy(
    {},
    {
      get(_, prop: string) {
        return (...args: any[]) => {
          if (dbMode === 'throwError')
            throw Error('Database methods are not expected to be called, are you missing a mock?');
          if (prop === 'then') return Promise.resolve(mockResults[nextResultIdx++]).then(args[0]);
          if (!dynamicSpies[prop]) dynamicSpies[prop] = vi.fn();
          dynamicSpies[prop](...args);
          return db;
        };
      },
    },
  ) as AppDatabase;

  const dbSpies: Record<string, Mock> = new Proxy(
    {},
    {
      get(_, prop: string) {
        if (!dynamicSpies[prop]) dynamicSpies[prop] = vi.fn();
        return dynamicSpies[prop];
      },
    },
  );

  return {
    db,
    dbSpies,
    addDbResult: (...results: any[]) => mockResults.push(...results),
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
export async function mockDrizzleOrm(importOriginal: () => Promise<DrizzleOrmModule>): Promise<DrizzleOrmModule> {
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

type SchemaModule = typeof import('#schema');
export async function mockSchemaModule(importOriginal: () => Promise<SchemaModule>): Promise<SchemaModule> {
  return new Proxy(await importOriginal(), {
    get(module, p: string) {
      if (p.endsWith('Table')) {
        //@ts-expect-error
        const table = module[p] as AnySQLiteTable;
        //@ts-expect-error
        const tableName: string = table[Symbol.for('drizzle:Name')]; //Copied from drizzle source code
        return new Proxy(
          { tableName },
          {
            get(table, p) {
              if (p === 'tableName') return tableName;
              //@ts-expect-error
              const column = table[p] as AnySQLiteColumn;
              if (!column) return column;
              const columnName = column.name;
              return { tableName, columnName };
            },
          },
        );
      }
      // @ts-ignore
      return module[p];
    },
  });
}

type CreateMockContextOption = CreateMockDatabaseOption & {
  url?: string;
  deviceId?: string;
  resHeaders?: CookieHeaders;
  reqCookie?: Record<string, string>;
};

const MockRequest = Request<unknown, IncomingRequestCfProperties>;

export function createMockContext(options: CreateMockContextOption = {}) {
  const mockDb = createMockDatabase(options);
  const {
    url = 'http://localhost/unmocked',
    deviceId = nanoid(),
    resHeaders = new CookieHeaders(),
    reqCookie = {},
  } = options;
  return {
    ...mockDb,
    req: new MockRequest(url),
    url: new URL(url),
    env: {} as unknown as Env,
    wctx: {} as unknown as ExecutionContext,
    isAuthenticated: false as const,
    resHeaders,
    reqCookie,
    deviceId,
    authFailureReason: '',
    isCsrfValid: undefined,
    session: undefined,
    user: undefined,
    userId: undefined,
    isAllowElevated: undefined,
  } satisfies Context & Record<string, any>;
}

type CreateMockProtectedContextOption = CreateMockContextOption & {
  userId?: string;
  userName?: string;
  isCsrfValid?: boolean;
  isAllowElevated?: boolean;
};

export function createMockProtectedContext(options: CreateMockProtectedContextOption) {
  const mockContext = createMockContext();
  const { userId = nanoid(), userName = 'unmocked', isCsrfValid = true, isAllowElevated = false } = options;
  const user = { id: userId, name: userName };
  return {
    ...mockContext,
    authFailureReason: undefined,
    isAuthenticated: true,
    isCsrfValid,
    isAllowElevated,
    userId,
    user,
    session: {} as unknown as ProtectedContext['session'],
  } satisfies ProtectedContext & Record<string, any>;
}
