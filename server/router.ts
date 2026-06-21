import { createTrpcContextFactory, createTrpcRouter } from './lib/trpc';
import { whoamiProcedure, sessionProcedures } from './features/users';
import { expenseProcedures } from './features/expenses';
import { subjectProcedures } from './features/subjects';
import { dashboardProcedure } from './features/dashboard';
import passkeyProcedures from './features/passkeys';
import webpushProcedures from './features/webpush';
import { createIttyAppRouter } from './lib/itty';
import { CookieHeaders } from './lib/CookieHeaders';
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
  .all('/trpc/*', async (req, env, ctx) => {
    const resHeaders = new CookieHeaders();
    const response = await fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: trpcRouter,
      createContext: createTrpcContextFactory(env, ctx, resHeaders),
    });
    resHeaders.forEach((value, key) => response.headers.append(key, value));
    return response;
  })
  .all('/admin/*', adminApiRouter.fetch)
  .all('*', () => error(404));

export default router;
