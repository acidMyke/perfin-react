// Entry point of cloudflare workers
// From here call trpc when request hit /trpc
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';
import { createContextFactory } from './lib/trpc';
import { CookieHeaders } from './lib/CookieHeaders';

export default {
  async fetch(req, env, ctx) {
    const resHeaders = new CookieHeaders();
    const response = await fetchRequestHandler({
      endpoint: '/trpc',
      req,
      router: appRouter,
      createContext: createContextFactory(env, ctx, resHeaders),
    });

    resHeaders.forEach((value, key) => response.headers.append(key, value));
    return response;
  },
} satisfies ExportedHandler<Env>;
