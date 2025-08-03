import { createFileRoute, redirect } from '@tanstack/react-router';
import { Link, linkOptions, Outlet } from '@tanstack/react-router';
import { ChartLine, ScrollText } from 'lucide-react';
import { queryClient } from '../trpc';
import { whoamiQueryOptions } from '../queryOptions';

export const Route = createFileRoute('/_authenticated')({
  component: RouteComponent,
  async beforeLoad({ location }) {
    const { isAuthenticated } = await queryClient.fetchQuery(whoamiQueryOptions);
    if (!isAuthenticated) {
      throw redirect({
        to: '/signin',
        search: { redirect: location.href },
      });
    }
  },
});

const options = linkOptions([
  {
    to: '/dashboard',
    label: 'Dashboard',
    Icon: ChartLine,
  },
  {
    to: '/expenses/list',
    label: 'Expenses',
    Icon: ScrollText,
  },
]);

function NavDock() {
  return (
    <div className='dock dock-lg'>
      {options.map(({ Icon, ...options }) => {
        return (
          <Link key={options.to} activeProps={{ className: 'dock-active' }} {...options}>
            <Icon size='1.2em' />
            <span className='dock-label'>{options.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function RouteComponent() {
  return (
    <>
      <Outlet />
      <NavDock />
    </>
  );
}
