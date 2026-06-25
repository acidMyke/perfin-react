import { createTrpcRouter } from './lib/trpc';
import { whoamiProcedure, sessionProcedures } from './features/users';
import { expenseProcedures } from './features/expenses';
import { subjectProcedures } from './features/subjects';
import { dashboardProcedure } from './features/dashboard';
import passkeyProcedures from './features/passkeys';
import webpushProcedures from './features/webpush';
import { createIttyAppRouter, withContext } from './lib/itty';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { adminApiRouter } from './features/admin';
import { error } from 'itty-router';

export const trpcRouter = createTrpcRouter({
  whoami: whoamiProcedure,
  session: sessionProcedures,
  dashboard: dashboardProcedure,
  expense: expenseProcedures,
  subject: subjectProcedures,
  passkey: passkeyProcedures,
  webpush: webpushProcedures,
});

// For client to import just the types
export type AppRouter = typeof trpcRouter;

export const router = createIttyAppRouter()
  .all('*', withContext)
  .all('/trpc/*', async req => {
    const response = await fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: trpcRouter,
      createContext: () => req.context,
    });
    req.context.resHeaders.forEach((value, key) => response.headers.append(key, value));
    return response;
  })
  .all('/admin/*', adminApiRouter.fetch)
  .all('*', () => error(404));

export default router;
