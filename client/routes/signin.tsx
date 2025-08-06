import { createFileRoute, redirect } from '@tanstack/react-router';
import { whoamiQueryOptions } from '../queryOptions';
import { queryClient } from '../trpc';

export const Route = createFileRoute('/signin')({
  component: RouteComponent,
  validateSearch(search) {
    return {
      redirect: search.redirect,
    };
  },
  async beforeLoad({ search }) {
    const { isAuthenticated } = await queryClient.ensureQueryData(whoamiQueryOptions);
    if (!isAuthenticated) {
      return;
    }
    if (search.redirect)
      throw redirect({
        to: '/dashboard',
      });
  },
});

function RouteComponent() {
  return <div>Hello "/signin"!</div>;
}
