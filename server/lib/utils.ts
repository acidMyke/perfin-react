import { type AnyColumn, sql, Table, getTableColumns, SQL } from 'drizzle-orm';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function excluded<T extends AnyColumn>(column: T) {
  return sql`excluded.${sql.identifier(column.name)}`.mapWith(column.mapFromDriverValue);
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
