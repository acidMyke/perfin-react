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

export function jsonGroupArray<T extends ExtractableData>(data: T, options: { distinct?: boolean } = {}) {
  const { distinct } = options;
  const jsonGroupedArray = distinct ? sql`json_group_array(distinct ${data})` : sql`json_group_array(${data})`;
  return sql`coalesce(${jsonGroupedArray}, '[]')`.mapWith({
    mapFromDriverValue: v => (typeof v === 'string' ? JSON.parse(v) : []) as ExtractType<T>[],
  });
}

export function max<T extends ExtractableData>(data: T) {
  return sql<ExtractType<T>>`max(${data})`;
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
