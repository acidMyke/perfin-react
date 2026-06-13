import { router } from './lib/trpc';
import { whoamiProcedure, sessionProcedures } from './features/users';
import { expenseProcedures } from './features/expenses';
import { subjectProcedures } from './features/subjects';
import { dashboardProcedure } from './features/dashboard';
import passkeyProcedures from './features/passkeys';
import webpushProcedures from './features/webpush';

export const appRouter = router({
  whoami: whoamiProcedure,
  session: sessionProcedures,
  dashboard: dashboardProcedure,
  expense: expenseProcedures,
  subject: subjectProcedures,
  passkey: passkeyProcedures,
  webpush: webpushProcedures,
});

// For client to import just the types
export type AppRouter = typeof appRouter;
