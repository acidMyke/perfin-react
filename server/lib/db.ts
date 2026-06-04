import { getColumns, SQL, sql, Table, type AnyColumn, type SQLWrapper } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { defineRelations } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { BatchItem } from 'drizzle-orm/batch';

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

export function jsonGroupArray<T extends ExtractableData>(data: T, options: { distinct?: boolean } = {}) {
  const { distinct } = options;
  const jsonGroupedArray = distinct ? sql`json_group_array(distinct ${data})` : sql`json_group_array(${data})`;
  return sql`coalesce(${jsonGroupedArray}, '[]')`.mapWith({
    mapFromDriverValue: v => (typeof v === 'string' ? JSON.parse(v) : []) as ExtractType<T>[],
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

export function createDatabase(env: Env) {
  return drizzle(env.db, {
    logger: import.meta.env.DEV,
    casing: 'snake_case',
    relations: defineRelations(schema),
  });
}

export type AppSchema = typeof schema;
export type AppDatabase = ReturnType<typeof createDatabase>;

export class BatchCollector {
  private queue: { query: any; name: string }[] = [];

  private inferQueryName(query: any): string | undefined {
    if (!query || typeof query.toSQL !== 'function') {
      return undefined;
    }

    try {
      const { sql } = query.toSQL();
      const normalizedSql = sql.trim().replace(/\s+/g, ' ') as string;

      const insertMatch = normalizedSql.match(/^insert into ["`]?([^"` ]+)["`]?/i);
      if (insertMatch) return `INSERT_${insertMatch[1]}`;

      const updateMatch = normalizedSql.match(/^update ["`]?([^"` ]+)["`]?/i);
      if (updateMatch) return `UPDATE_${updateMatch[1]}`;

      const deleteMatch = normalizedSql.match(/^delete from ["`]?([^"` ]+)["`]?/i);
      if (deleteMatch) return `DELETE_${deleteMatch[1]}`;

      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  /**
   * Pushes a Drizzle query into the batch queue.
   */
  push(query: BatchItem<'sqlite'>, name?: string) {
    const fallbackName = this.inferQueryName(query) ?? `Index_${this.queue.length}`;
    this.queue.push({
      query,
      name: name ?? fallbackName,
    });
  }

  pushAll(...queries: BatchItem<'sqlite'>[]) {
    queries.forEach(query => this.push(query));
  }

  get hasPending(): boolean {
    return this.queue.length > 0;
  }

  /**
   * Executes the batch and maps the results back to their identifying names.
   * @param db The Drizzle database instance
   * @param enableLogging If true, prints a mapped breakdown of the successful batch
   */
  async executeBatch(db: AppDatabase, enableLogging: boolean = false) {
    if (!this.hasPending) {
      return [];
    }

    const queries = this.queue.map(item => item.query);

    try {
      //@ts-ignore
      const rawResults = await db.batch(queries);
      const mappedResults = rawResults.map((result, index) => ({ name: this.queue[index].name, result: result }));

      if (enableLogging) {
        console.log(`\n=== D1 Batch Execution: ${mappedResults.length} Queries ===`);
        mappedResults.forEach(item => {
          console.log(`✅ [${item.name}]:`, item.result);
        });
        console.log(`====\n`);
      }

      this.queue = [];
      return mappedResults;
    } catch (error: any) {
      const batchContextMap = this.queue.map((item, index) => `  [${index}] ${item.name}`).join('\n');
      const errorMessage =
        `D1 Batch Execution Failed.\n` +
        `Queries in this batch:\n${batchContextMap}\n` +
        `Original Error: ${error.message}`;
      console.error(errorMessage);
      throw error;
    }
  }
}

export function maybeBatch<Q extends BatchItem<'sqlite'>>(
  collector: BatchCollector | undefined,
  query: Q,
  name?: string,
) {
  if (!collector) return query;
  collector.push(query, name);
  return Promise.resolve();
}
