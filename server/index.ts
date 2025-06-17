// Entry point of cloudflare workers
// From here call trpc when request hit /trpc
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';
import { createContextFactory } from './trpc';

export default {
  fetch(req, env, ctx) {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: appRouter,
      createContext: createContextFactory(env, ctx),
    });
  },
} satisfies ExportedHandler<Env>;
