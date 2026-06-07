import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '#components/PageHeader';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { queryClient, trpc } from '#client/trpc';
import { useRef } from 'react';

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
  const reindexModelRef = useRef<HTMLDialogElement>(null);
  const reindexExpenseMutation = useMutation(trpc.expense.reindex.mutationOptions());
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
        className='btn btn-block btn-xl btn-ghost bg-base-200/25'
        onClick={() => reindexModelRef.current?.showModal()}
      >
        Reindex expense
      </button>

      <button
        className='btn btn-error btn-lg btn-block'
        onClick={() => {
          signOutMutation.mutate();
        }}
      >
        {signOutMutation.isPending ? 'Signing out...' : 'Sign Out'}
      </button>

      <dialog className='modal' ref={reindexModelRef}>
        <div className='modal-box'>
          <h3 className='text-lg font-bold'>Reindex expenses</h3>
          <p>Heads up, reindexing is an expensive operation that may take multiple days to complete.</p>
          <p>Only use this if the search/autocompletion isn't working as expected</p>
          {reindexExpenseMutation.isPending && <p className='skeleton-text'>Triggering...</p>}
          {reindexExpenseMutation.isError && (
            <div role='alert' className='alert alert-error'>
              {reindexExpenseMutation.error.message}
            </div>
          )}
          {reindexExpenseMutation.isSuccess && (
            <div role='alert' className='alert alert-success'>
              Reindexing triggered successfully
            </div>
          )}
          <div className='modal-action'>
            <button
              className='btn btn-ghost'
              disabled={reindexExpenseMutation.isPending || reindexExpenseMutation.isSuccess}
              onClick={() => reindexModelRef.current?.close()}
            >
              Cancel
            </button>
            <button
              className='btn btn-primary'
              disabled={reindexExpenseMutation.isPending || reindexExpenseMutation.isSuccess}
              onClick={() =>
                reindexExpenseMutation
                  .mutateAsync()
                  .then(() => setTimeout(() => reindexModelRef.current?.close(), 5000))
              }
            >
              Start
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
