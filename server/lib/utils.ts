import { type AnyColumn, sql } from 'drizzle-orm';

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function excluded<T extends AnyColumn>(column: T) {
  return sql`excluded.${sql.identifier(column.name)}`.mapWith(column.mapFromDriverValue);
}
