// Entry point of cloudflare workers
// From here call trpc when request hit /trpc
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';
import { createContextFactory } from './lib/trpc';
import { CookieHeaders } from './lib/CookieHeaders';
import { createIttyAppRouter } from './lib/itty';
import { adminApiRouter } from './features/admin';
import { error } from 'itty-router';
export { VersionTwoDataMigrator } from './workflows/VersionTwoDataMigrator';

const router = createIttyAppRouter();
router
  .all('/trpc/*', async (req, env, ctx) => {
    const resHeaders = new CookieHeaders();
    const response = await fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: appRouter,
      createContext: createContextFactory(env, ctx, resHeaders),
    });
    resHeaders.forEach((value, key) => response.headers.append(key, value));
    return response;
  })
  .all('/admin/*', adminApiRouter.fetch)
  .all('*', () => error(404));

export default { ...router } satisfies ExportedHandler<Env>;
