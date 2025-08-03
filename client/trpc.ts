import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';

export const queryClient = new QueryClient();
const trpcClient = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: '/trpc' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

// Exposing trpc client to be used in console
type WindowWithTrpcClient = typeof window & {
  trpcClient: typeof trpcClient;
};

if (import.meta.env.DEV) {
  if (window) {
    (window as WindowWithTrpcClient).trpcClient = trpcClient;
  }
}
