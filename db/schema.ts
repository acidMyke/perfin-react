import { sql } from 'drizzle-orm';
import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

const generateId = () => nanoid(8);
const idCol = () =>
  text({ length: 8 })
    .notNull()
    .$defaultFn(() => generateId());

export const usersTable = sqliteTable('users', {
  id: idCol().primaryKey(),
  name: text(),
  passSalt: blob({ mode: 'buffer' }),
  passKey: blob({ mode: 'buffer' }),
  requireNewPassword: integer({ mode: 'boolean' }).default(true),
  createdAt: integer({ mode: 'timestamp' }).default(sql`(current_timestamp)`),
  updateAt: integer({ mode: 'timestamp' })
    .default(sql`(current_timestamp)`)
    .$onUpdate(() => new Date()),
  version: integer()
    .default(1)
    .$onUpdateFn(() => sql`version + 1`),
});
