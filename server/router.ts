import { router } from './lib/trpc';
import { whoamiProcedure, sessionProcedures } from './features/users';
import { expenseProcedures } from './features/expenses';
import { subjectProcedures } from './features/subjects';
import { dashboardProcedure } from './features/dashboard';

export const appRouter = router({
  whoami: whoamiProcedure,
  session: sessionProcedures,
  dashboard: dashboardProcedure,
  expense: expenseProcedures,
  subject: subjectProcedures,
});

// For client to import just the types
export type AppRouter = typeof appRouter;
