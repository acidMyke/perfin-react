import { useSuspenseQuery } from '@tanstack/react-query';
import { trpc } from './trpc';
import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';

export function useWhoamiQuery() {
  const { data, ...rest } = useSuspenseQuery(
    trpc.whoami.queryOptions(undefined, {
      gcTime: minutesToMilliseconds(20),
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      retry: false,
    }),
  );

  return {
    ...data,
    ...rest,
  };
}
