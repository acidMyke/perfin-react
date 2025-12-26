import { createFileRoute, redirect } from '@tanstack/react-router';
import { Outlet } from '@tanstack/react-router';
import { queryClient } from '../../../trpc';
import { whoamiQueryOptions } from '../../../queryOptions';

export const Route = createFileRoute('/_authenticated/settings/_elevated')({
  component: Outlet,
  async beforeLoad({ location }) {
    const { isAllowElevated } = await queryClient.ensureQueryData(whoamiQueryOptions);
    if (!isAllowElevated) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href, elevation: true },
      });
    }
  },
});
