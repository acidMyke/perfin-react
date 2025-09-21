import { createFileRoute, redirect, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { Link, linkOptions, Outlet } from '@tanstack/react-router';
import { ChartLine, Plus, ScrollText } from 'lucide-react';
import { queryClient } from '../trpc';
import { whoamiQueryOptions } from '../queryOptions';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';

export const Route = createFileRoute('/_authenticated')({
  component: RouteComponent,
  errorComponent: ErrorComponent,
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
      to='/expenses/$expenseId'
      params={{ expenseId: 'create' }}
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
      <div className='h-8'></div>
      <Outlet />
      <FloatingButton />
      <NavDock />
    </>
  );
}

function ErrorComponent({ error }: ErrorComponentProps) {
  const router = useRouter();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();

  useEffect(() => {
    // Reset the query error boundary
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);

  return (
    <div className='mx-auto max-w-md'>
      <div className='h-8'></div>
      <PageHeader title='Oops...' />
      {error.message}
      <button
        className='btn btn-primary btn-lg btn-block mt-8'
        onClick={() => {
          // Invalidate the route to reload the loader, and reset any router error boundaries
          router.invalidate();
        }}
      >
        Retry
      </button>
      <NavDock />
    </div>
  );
}
