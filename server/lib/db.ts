import { getTableColumns, SQL, sql, Table, type AnyColumn, type SQLWrapper } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
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
  const columns = getTableColumns(table);
  // @ts-expect-error
  const excludedColumns: Record<keyof T['_']['columns'], SQL<unknown>> = {};

  for (const key in columns) {
    if (omits.includes(key)) continue;
    excludedColumns[key] = excluded(columns[key]);
  }

  return excludedColumns;
}

type ChunkValue<TReturn> = TReturn | SQL<TReturn> | SQL.Aliased<TReturn> | SQLWrapper;

class CaseBuilder<TReturn> implements SQLWrapper {
  private chunks: SQL[] = [];

  constructor(initialCondition: SQL, initialResult: ChunkValue<TReturn>) {
    this.whenThen(initialCondition, initialResult);
  }

  /**
   * Adds a WHEN condition THEN result clause.
   */
  whenThen(condition: SQL | undefined, result: ChunkValue<TReturn>): this {
    if (!condition) return this;
    this.chunks.push(sql`WHEN ${condition} THEN ${result}`);
    return this;
  }

  /**
   * Adds the ELSE clause.
   */
  else(value: ChunkValue<TReturn>): SQL<TReturn> {
    return sql<TReturn>`CASE ${sql.join(this.chunks, sql` `)} ELSE ${value} END`;
  }

  /**
   * Drizzle calls this automatically when you pass the object to a query.
   */
  elseNull(): SQL<TReturn> {
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

export function coalesce<TValue, TFallback = ''>(
  value: ChunkValue<TValue>,
  fallback?: ChunkValue<TFallback>,
): SQL<TValue | TFallback> {
  return fallback ? sql`COALESCE(${value}, ${fallback})` : sql`COALESCE(${value},'')`;
}

export function createDatabase(env: Env) {
  return drizzle(env.db, {
    logger: import.meta.env.DEV,
    casing: 'snake_case',
    schema,
  });
}

export type AppDatabase = ReturnType<typeof createDatabase>;
