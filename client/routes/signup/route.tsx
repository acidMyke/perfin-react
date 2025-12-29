import { createFileRoute, Outlet } from '@tanstack/react-router';
import { queryClient, trpc } from '../../trpc';
import { useSuspenseQuery } from '@tanstack/react-query';
import { PageHeader } from '../../components/PageHeader';

export const Route = createFileRoute('/signup')({
  component: RouteComponent,
  beforeLoad: () => queryClient.ensureQueryData(trpc.session.canSignUp.queryOptions()),
});

function RouteComponent() {
  const { data: canSignUp } = useSuspenseQuery(trpc.session.canSignUp.queryOptions());
  if (!canSignUp) {
    return (
      <div className='mx-auto mt-20 max-w-md'>
        <PageHeader title='Sign Up' />
        <p className='mt-4 mb-8 text-center text-lg text-gray-500'>Sorry, We aren't accepting new users!</p>
      </div>
    );
  }

  return <Outlet />;
}
