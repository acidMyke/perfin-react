import { createFileRoute, redirect } from '@tanstack/react-router';
import { Link, linkOptions, Outlet } from '@tanstack/react-router';
import { ChartLine, Plus, ScrollText } from 'lucide-react';
import { queryClient } from '../trpc';
import { whoamiQueryOptions } from '../queryOptions';

export const Route = createFileRoute('/_authenticated')({
  component: RouteComponent,
  async beforeLoad({ location }) {
    const { isAuthenticated } = await queryClient.ensureQueryData(whoamiQueryOptions);
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
    to: '/expenses',
    label: 'Expenses',
    Icon: ScrollText,
    activeOptions: {},
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

function FloatingButton() {
  return (
    <Link
      to='/expenses/create'
      className='btn btn-circle btn-xl btn-primary pointer-events-auto fixed right-8 bottom-24'
      activeProps={{ className: 'hidden' }}
    >
      <Plus size='1.6em' />
    </Link>
  );
}

function RouteComponent() {
  return (
    <>
      <Outlet />
      <FloatingButton />
      <NavDock />
    </>
  );
}
