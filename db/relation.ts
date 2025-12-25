import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

export type AppSchema = typeof schema;
export const relations = defineRelations(schema, r => ({
  loginAttemptsTable: {
    attemptedFor: r.one.usersTable({
      from: r.loginAttemptsTable.attemptedForId,
      to: r.usersTable.id,
    }),
    session: r.many.sessionsTable({
      from: r.loginAttemptsTable.id,
      to: r.sessionsTable.loginAttemptId,
    }),
  },
  usersTable: {
    sessions: r.many.sessionsTable({
      from: r.usersTable.id,
      to: r.sessionsTable.userId,
    }),
    passkeys: r.many.passkeysTable({
      from: r.usersTable.id,
      to: r.passkeysTable.userId,
    }),
  },
  passkeysTable: {
    user: r.one.usersTable({
      from: r.passkeysTable.userId,
      to: r.usersTable.id,
    }),
  },
  sessionsTable: {
    user: r.one.usersTable({
      from: r.sessionsTable.userId,
      to: r.usersTable.id,
      optional: false,
    }),
    loginAttempt: r.one.loginAttemptsTable({
      from: r.sessionsTable.loginAttemptId,
      to: r.loginAttemptsTable.id,
      optional: false,
    }),
  },
  expensesTable: {
    belongsTo: r.one.usersTable({
      from: r.expensesTable.userId,
      to: r.usersTable.id,
    }),
    account: r.one.accountsTable({
      from: r.expensesTable.accountId,
      to: r.accountsTable.id,
    }),
    category: r.one.categoriesTable({
      from: r.expensesTable.categoryId,
      to: r.categoriesTable.id,
    }),
    items: r.many.expenseItemsTable({
      from: r.expensesTable.id,
      to: r.expenseItemsTable.expenseId,
    }),
    refunds: r.many.expenseRefundsTable({
      from: r.expensesTable.id,
      to: r.expenseRefundsTable.expenseId,
    }),
  },
  expenseItemsTable: {
    expense: r.one.expensesTable({
      from: r.expenseItemsTable.expenseId,
      to: r.expensesTable.id,
    }),
    category: r.one.categoriesTable({
      from: r.expenseItemsTable.categoryId,
      to: r.categoriesTable.id,
    }),
    expenseRefund: r.one.expenseRefundsTable({
      from: r.expenseItemsTable.expenseRefundId,
      to: r.expenseRefundsTable.id,
    }),
  },
  expenseRefundsTable: {
    expense: r.one.expensesTable({
      from: r.expenseRefundsTable.expenseId,
      to: r.expensesTable.id,
    }),
    expenseItem: r.one.expenseItemsTable({
      from: r.expenseRefundsTable.expenseItemId,
      to: r.expenseItemsTable.id,
    }),
  },
}));

export default relations;
