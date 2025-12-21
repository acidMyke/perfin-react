import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '../../../components/PageHeader';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, trpc } from '../../../trpc';

export const Route = createFileRoute('/_authenticated/settings/')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const signOutMutation = useMutation(
    trpc.session.signOut.mutationOptions({
      async onSuccess() {
        await queryClient.refetchQueries(trpc.whoami.pathFilter());
        await navigate({ to: '/' });
      },
    }),
  );
  return (
    <div className='mx-auto flex max-w-md flex-col gap-4'>
      <PageHeader title='Settings' />
      <Link
        to='/settings/manage-subjects'
        search={{ type: 'account' }}
        className='btn btn-block btn-xl btn-ghost bg-base-200/25'
      >
        <h3 className='inline-block text-2xl'>Manage accounts</h3>
        <ChevronRight className='ml-auto inline-block' />
      </Link>
      <Link
        to='/settings/manage-subjects'
        search={{ type: 'category' }}
        className='btn btn-block btn-xl btn-ghost bg-base-200/25'
      >
        <h3 className='inline-block text-2xl'>Manage categories</h3>
        <ChevronRight className='ml-auto inline-block' />
      </Link>
      <Link to='/settings/passkey' className='btn btn-block btn-xl btn-ghost bg-base-200/25'>
        <h3 className='inline-block text-2xl'>Manage passkey</h3>
        <ChevronRight className='ml-auto inline-block' />
      </Link>
      <button
        className='btn btn-error btn-lg btn-block'
        onClick={() => {
          signOutMutation.mutate();
        }}
      >
        {signOutMutation.isPending ? 'Signing out...' : 'Sign Out'}
      </button>
    </div>
  );
}
