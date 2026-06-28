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

const MOCK_DB_NAME = '_MockDb';

export const expectMockDatabase = () => expect.objectContaining({ _name: MOCK_DB_NAME });

export function createMockDatabase({ dbMode = 'throwError' }: CreateMockDatabaseOption = {}) {
  let mockResults: any[] = [];
  let nextResultIdx = 0;
  const dynamicSpies: Record<string, Mock> = {};

  const db = new Proxy(
    { _name: MOCK_DB_NAME },
    {
      get(_, prop: string) {
        if (prop === '_name') {
          return MOCK_DB_NAME;
        }
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
  ) as unknown as AppDatabase;

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

export type MockDatabase = ReturnType<typeof createMockDatabase>;

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

function createForbiddenStub<T>(value?: Partial<T>) {
  return new Proxy(
    {},
    {
      get(_, p) {
        if (value && p in value) {
          // @ts-ignore
          return value[p];
        }
        throw new Error('Should not be used');
      },
    },
  ) as T;
}

export function createDynamicMock<T extends Record<string, Parameters<typeof vi.fn>[0]>>(
  name: string,
  impls?: Partial<T>,
) {
  const dynamicMocks: Record<string | symbol, Mock> = {};
  return new Proxy(
    { _dynamicMockName: name },
    {
      get(_, p) {
        if (p === '_dynamicMockName') return name;

        if (!dynamicMocks[p])
          // @ts-ignore
          dynamicMocks[p] = impls && p in impls ? vi.fn(impls[p]) : vi.fn();
        return dynamicMocks[p];
      },
    },
  ) as unknown as { [K in keyof T]: Mock<Exclude<T[K], undefined>> };
}

export const expectDynamicMock = (name: string) => expect.objectContaining({ _dynamicMockName: name });

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
    env: createForbiddenStub<Env>(),
    wctx: createForbiddenStub<ExecutionContext>(),
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

export type MockContext = ReturnType<typeof createMockContext>;

type CreateMockProtectedContextOption = CreateMockContextOption & {
  userId?: string;
  userName?: string;
  isCsrfValid?: boolean;
  isAllowElevated?: boolean;
};

export function createMockProtectedContext(options: CreateMockProtectedContextOption = {}) {
  const mockContext = createMockContext(options);
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
    session: createForbiddenStub<ProtectedContext['session']>({ user }),
  } satisfies ProtectedContext & Record<string, any>;
}

export type MockProtectedContext = ReturnType<typeof createMockProtectedContext>;
