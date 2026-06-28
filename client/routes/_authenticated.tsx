import { createFileRoute, redirect, useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { Link, linkOptions, Outlet } from '@tanstack/react-router';
import { Bot, ChartLine, PencilLine, Plus, ScrollText, Settings, Undo2 } from 'lucide-react';
import { queryClient } from '#client/trpc';
import { whoamiQueryOptions } from '#client/queryOptions';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { PageHeader } from '#components/PageHeader';

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
    preload: false,
  },
  {
    to: '/expenses',
    label: 'Expenses',
    Icon: ScrollText,
  },
  {
    to: '/settings',
    label: 'Settings',
    Icon: Settings,
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

export default function FloatingActionButton() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className='fixed right-2 bottom-24 z-50 -translate-x-1/2'>
      <div className='flex flex-col items-center gap-3'>
        {/* Expanded buttons */}
        <div
          className={`flex flex-col items-center gap-3 transition-all duration-300 ${
            expanded ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
          }`}
        >
          <button
            onClick={() => setExpanded(false)}
            className='btn btn-lg btn-circle btn-secondary shadow-lg'
            title='Undo'
          >
            <Undo2 size={22} />
          </button>

          <Link
            to='/expenses/$expenseId'
            params={{ expenseId: 'create' }}
            className='btn btn-lg btn-circle btn-accent shadow-lg'
            title='Manual Create'
          >
            <PencilLine size={22} />
          </Link>
        </div>

        {expanded ? (
          <Link
            to='/expenses/agent/create'
            className='btn btn-lg btn-circle btn-primary shadow-xl'
            title='Agent Create'
          >
            <Bot size={24} />
          </Link>
        ) : (
          <button
            onClick={() => setExpanded(true)}
            className='btn btn-lg btn-circle btn-primary shadow-xl'
            title='Create'
          >
            <Plus size={26} />
          </button>
        )}
      </div>
    </div>
  );
}

function RouteComponent() {
  return (
    <>
      <div className='h-8'></div>
      <Outlet />
      <FloatingActionButton />
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
