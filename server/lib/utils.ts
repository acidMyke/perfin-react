import { type AnyColumn, sql, Table, getTableColumns, SQL } from 'drizzle-orm';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
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
