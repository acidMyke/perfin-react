import { getColumns, SQL, sql, Table, type AnyColumn, type SQLWrapper } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { defineRelations } from 'drizzle-orm';
import * as schema from '../../db/schema';

export const sankeCaseFromCamelCase = (camelCase: string) =>
  camelCase.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

export function excluded<T extends AnyColumn>(column: T) {
  return sql`excluded.${sql.raw(sankeCaseFromCamelCase(column.name))}`;
}

export function excludedAll<T extends Table>(
  table: T,
  omits: (keyof T['_']['columns'])[] = [],
): Record<keyof T['_']['columns'], SQL<unknown>> {
  const columns = getColumns(table);
  // @ts-expect-error
  const excludedColumns: Record<keyof T['_']['columns'], SQL<unknown>> = {};

  for (const key in columns) {
    if (omits.includes(key)) continue;
    excludedColumns[key] = excluded(columns[key]);
  }

  return excludedColumns;
}

type ChunkValue<TReturn> =
  | TReturn
  | SQL<TReturn>
  | SQL.Aliased<TReturn>
  | SQLWrapper<TReturn>
  | AnyColumn<{ data: TReturn }>;

class CaseBuilder<TReturn> implements SQLWrapper<TReturn | null> {
  private chunks: SQL[] = [];

  constructor(initialCondition: SQL, initialResult: ChunkValue<TReturn>) {
    this.whenThen(initialCondition, initialResult);
  }

  whenThen<TMoreReturn = TReturn>(condition: SQL | undefined, result: ChunkValue<TMoreReturn>) {
    if (!condition) return this;
    this.chunks.push(sql`WHEN ${condition} THEN ${result}`);
    return this as CaseBuilder<TReturn | TMoreReturn>;
  }

  else<TMoreReturn = TReturn>(value: ChunkValue<TMoreReturn>) {
    return sql<TReturn | TMoreReturn>`CASE ${sql.join(this.chunks, sql` `)} ELSE ${value} END`;
  }

  elseNull(): SQL<TReturn | null> {
    return sql<TReturn>`CASE ${sql.join(this.chunks, sql` `)} ELSE NULL END`;
  }

  getSQL() {
    return this.elseNull();
  }
}

export function caseWhen<TReturn>(condition: SQL, then: ChunkValue<TReturn>) {
  return new CaseBuilder(condition, then);
}

type ConcatValue = string | number | SQL | SQLWrapper;
export function concat(...chunks: ConcatValue[]): SQL<string> {
  return sql<string>`(${sql.join(chunks, sql` || `)})`;
}

type ExtractableData = AnyColumn | SQL | SQL.Aliased | SQLWrapper;

type ExtractType<T> = T extends AnyColumn
  ? T['_']['notNull'] extends true
    ? T['_']['data']
    : T['_']['data'] | null
  : T extends SQL.Aliased<infer U> | SQL<infer U> | SQLWrapper<infer U>
    ? U
    : unknown;

export function coalesce<TValue extends ExtractableData, TFallback extends ExtractableData = SQL<string>>(
  value: TValue,
  fallback?: TFallback,
) {
  fallback ??= sql`''` as TFallback;
  return sql<Exclude<ExtractType<TValue>, null> | ExtractType<TFallback>>`coalesce(${value}, ${fallback})`;
}

export function jsonGroupArray<T extends ExtractableData>(
  data: T,
  options: { distinct?: boolean; filterNull?: boolean } = {},
) {
  const { distinct } = options;
  const jsonGroupedArray = distinct ? sql`json_group_array(distinct ${data})` : sql`json_group_array(${data})`;
  return sql`coalesce(${jsonGroupedArray}, '[]')`.mapWith({
    mapFromDriverValue: v => {
      const vJson = (typeof v === 'string' ? JSON.parse(v) : []) as ExtractType<T>[];
      if (options.filterNull) return vJson.filter(v => v != null);
      return vJson;
    },
  });
}

export function jsonGroupObjectArray<T extends Record<string, ExtractableData>>(
  shape: T,
  options: { distinct?: boolean } = {},
) {
  const { distinct } = options;

  const jsonObjectChunks = Object.entries(shape).flatMap(([key, value]) => [sql`${key}`, value]);
  const jsonObject = sql`json_object(${sql.join(jsonObjectChunks, sql`, `)})`;
  const jsonGroupedArray = distinct
    ? sql`json_group_array(distinct ${jsonObject})`
    : sql`json_group_array(${jsonObject})`;

  return sql`coalesce(${jsonGroupedArray}, '[]')`.mapWith({
    mapFromDriverValue: v => {
      if (typeof v !== 'string') return [] as { [K in keyof T]: ExtractType<T[K]> }[];
      try {
        return JSON.parse(v) as { [K in keyof T]: ExtractType<T[K]> }[];
      } catch {
        return [] as { [K in keyof T]: ExtractType<T[K]> }[];
      }
    },
  });
}

export function max<T extends ExtractableData>(data: T) {
  return sql<ExtractType<T>>`max(${data})`;
}

export function sumAsNumber<T extends ExtractableData>(data: T) {
  return sql<ExtractType<T>>`sum(${data})`.mapWith(Number);
}

export function extractQueryKeyInfo(sql: string) {
  try {
    const normalizedSql = sql
      .replace(/--.*?(?:\r?\n|$)/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const operation = normalizedSql.match(/^(select|insert|update|delete)\b/i)?.[1];

    if (!operation) return undefined;

    const cteNames = new Set<string>();

    const withMatch = normalizedSql.match(
      /^with\s+(?:recursive\s+)?([\s\S]*?)(?=\b(?:select|insert|update|delete)\b)/i,
    );

    if (withMatch) {
      const cteRegex = /(?:^|,)\s*(["`]?[\w$]+["`]?)\s+as\s*\(/gi;

      for (const match of withMatch[1].matchAll(cteRegex)) {
        cteNames.add(unquote(match[1]).toLowerCase());
      }
    }

    const tables = new Set<string>();

    const tableRegex =
      /\b(?:from|join|update|into)\s+(?:"([^"]+)"|`([^`]+)`|([a-zA-Z_][\w$]*(?:\.[a-zA-Z_][\w$]*)?))/gi;

    for (const match of normalizedSql.matchAll(tableRegex)) {
      const table = (match[1] ?? match[2] ?? match[3]).trim();

      const name = table.split('.').at(-1)!;

      if (!cteNames.has(name.toLowerCase())) {
        tables.add(name);
      }
    }

    if (tables.size === 0) return undefined;

    return `${operation.toUpperCase()}-${[...tables].join('+')}`;
  } catch {
    return undefined;
  }
}

function unquote(value: string) {
  return value.replace(/^["`]|["`]$/g, '');
}

function createLoggedD1(baseDb: D1Database): D1Database {
  return new Proxy(baseDb, {
    get(target, prop, receiver) {
      if (prop === 'batch') {
        return async function (statements: D1PreparedStatement[]) {
          const results = await target.batch(statements);

          let totalRead = 0;
          let totalWrite = 0;

          results.forEach(({ meta }, idx) => {
            totalRead += meta?.rows_read || 0;
            totalWrite += meta?.rows_written || 0;
            const query = (statements[idx] as any)['__prepare_query'];
            console.log(`d1,${meta?.rows_read},${meta?.rows_written},${extractQueryKeyInfo(query)}`);
          });

          console.log(`d1,${totalRead},${totalWrite},batch-${statements.length}-end`);
          return results;
        };
      }

      if (prop === 'prepare') {
        return function (query: string) {
          const stmt = target.prepare(query);
          return new Proxy(stmt, {
            get(stmtTarget, stmtProp) {
              const original = Reflect.get(stmtTarget, stmtProp);
              if (stmtProp !== 'bind') return original;
              return function bind(...args: any[]) {
                const bindStmt = stmtTarget.bind(...args);
                (bindStmt as any)['__prepare_query'] = query;
                return bindStmt;
              };
            },
          });
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}

export function createDatabase(env: Env) {
  const d1Db = import.meta.env.DEV && env.DB_PROXY_LOGGING ? createLoggedD1(env.db) : env.db;
  return drizzle(d1Db, {
    logger: import.meta.env.DEV,
    casing: 'snake_case',
    relations: defineRelations(schema),
  });
}

export type AppSchema = typeof schema;
export type AppDatabase = ReturnType<typeof createDatabase>;
