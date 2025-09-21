import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, isTRPCClientError, loggerLink, type TRPCLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/router';
import { observable, type Unsubscribable } from '@trpc/server/observable';
import type { AppErrorShapeData } from '../server/trpc';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { notFound } from '@tanstack/react-router';

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export const queryClient = new QueryClient();

const errorHandlingLink: TRPCLink<AppRouter> = () => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ next, op }) => {
    // this is when passing the result to the next link
    // each link needs to return an observable which propagates results
    return observable(observer => {
      let next$: Unsubscribable;

      function attempt(attemptCount: number) {
        next$ = next(op).subscribe({
          async error(err) {
            // Determine if it should retry
            let shouldRetry = false;
            if (err.data) {
              const { code } = err.data;
              if (code === 'UNAUTHORIZED') {
                const whoamiData = queryClient.getQueryData(trpc.whoami.queryKey());
                if (whoamiData?.isAuthenticated) {
                  await queryClient.invalidateQueries(trpc.whoami.pathFilter());
                  await queryClient.refetchQueries(trpc.whoami.pathFilter());
                  const whoamiAfterInvalidation = queryClient.getQueryData(trpc.whoami.queryKey());
                  if (whoamiAfterInvalidation?.isAuthenticated) {
                    shouldRetry = true;
                  }
                }
              } else if (code === 'INTERNAL_SERVER_ERROR') {
                // TODO: add some logging
                shouldRetry = true;
              }
            }

            shouldRetry &&= attemptCount < 3;

            if (!shouldRetry) {
              observer.error(err);
              return;
            }

            attempt(attemptCount + 1);
          },
          next(value) {
            observer.next(value);
          },
          complete() {
            observer.complete();
          },
        });
        return () => {
          next$.unsubscribe();
        };
      }

      attempt(1);

      return () => {
        next$.unsubscribe();
      };
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

export async function handleFormMutateAsync(mutatePromise: Promise<unknown>) {
  try {
    await mutatePromise;
  } catch (error: unknown) {
    if (isTRPCClientError(error)) {
      if ('data' in error.shape) {
        const shapeData = error.shape.data as AppErrorShapeData;
        if (shapeData.fieldErrors || shapeData.formErrors) {
          return {
            form: shapeData.formErrors,
            fields: shapeData.fieldErrors,
          };
        }
      }
    }
    console.log('Unknown Error', typeof error === 'object' ? { ...error } : error);
    throw error;
  }
}

export function throwIfNotFound(error: unknown) {
  if (isTRPCClientError(error)) {
    if ('data' in error.shape) {
      const shapeData = error.shape.data as AppErrorShapeData;
      if (shapeData.code === 'NOT_FOUND') {
        throw notFound();
      }
    }
  }
}
