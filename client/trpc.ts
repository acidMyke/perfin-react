import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, loggerLink, type TRPCLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';
import { observable } from '@trpc/server/observable';

export const queryClient = new QueryClient();

const errorHandlingLink: TRPCLink<AppRouter> = () => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ next, op }) => {
    // this is when passing the result to the next link
    // each link needs to return an observable which propagates results
    return observable(observer => {
      const unsubscribe = next(op).subscribe({
        error(err) {
          observer.error(err);
          if (err.data) {
            const { code } = err.data;
            if (code === 'UNAUTHORIZED') {
              const whoamiData = queryClient.getQueryData(trpc.whoami.queryKey());
              if (whoamiData?.isAuthenticated) {
                queryClient.invalidateQueries({
                  queryKey: trpc.whoami.queryKey(),
                });
              }
            }
          }
        },
        next(value) {
          observer.next(value);
        },
        complete() {
          observer.complete();
        },
      });
      return unsubscribe;
    });
  };
};

const trpcClient = createTRPCClient<AppRouter>({
  links: [loggerLink({ enabled: () => import.meta.env.DEV }), errorHandlingLink, httpBatchLink({ url: '/trpc' })],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

// Exposing trpc client to be used in console
if (import.meta.env.DEV) {
  if (window) {
    Object.assign(window, { trpc, trpcClient });
  }
}
