import { minutesToMilliseconds } from 'date-fns/minutesToMilliseconds';
import { trpc } from './trpc';

export const whoamiQueryOptions = trpc.whoami.queryOptions(undefined, {
  gcTime: minutesToMilliseconds(20),
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  retry: false,
});
