import { createFileRoute, redirect } from '@tanstack/react-router';
import { whoamiQueryOptions } from '#client/queryOptions';
import { queryClient } from '#client/trpc';

export const Route = createFileRoute('/')({
  async beforeLoad() {
    const { isAuthenticated } = await queryClient.ensureQueryData(whoamiQueryOptions);
    if (isAuthenticated) {
      throw redirect({
        to: '/dashboard',
      });
    } else {
      throw redirect({
        to: '/signin',
        search: {
          redirect: undefined,
        },
      });
    }
  },
});
