// Entry point of cloudflare workers
// From here call trpc when request hit /trpc
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';

export default {
  fetch: req => fetchRequestHandler({ endpoint: '/trpc', req, router: appRouter }),
} satisfies ExportedHandler<Env>;
