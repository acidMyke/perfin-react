import { PageHeader } from '#client/components/PageHeader';
import { queryClient, trpc } from '#client/trpc';
import { dateFormat } from '#client/utils';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { SearchX } from 'lucide-react';
import { useRef, type RefObject } from 'react';

export const Route = createFileRoute('/_authenticated/settings/reindex')({
  component: RouteComponent,
  loader: () => queryClient.ensureQueryData(trpc.expense.reindexList.queryOptions()),
});

function RouteComponent() {
  const reindexModelRef = useRef<HTMLDialogElement>(null);
  const { data } = useSuspenseQuery(trpc.expense.reindexList.queryOptions());
  if (!data || data.length === 0) {
    return (
      <div className='mx-auto flex max-w-md flex-col gap-4'>
        <div className='flex flex-col items-center justify-center py-16 text-center text-gray-500'>
          <SearchX className='mb-4 h-10 w-10 text-gray-400' />
          <p className='text-xl font-medium'>No records found</p>
        </div>
        <button
          className='btn btn-block btn-xl btn-ghost bg-base-200/25'
          onClick={() => reindexModelRef.current?.showModal()}
        >
          Reindex expense now
        </button>
        <ReindexDialog reindexModelRef={reindexModelRef} />
      </div>
    );
  }
  return (
    <div className='mx-auto flex max-w-md flex-col gap-4'>
      <PageHeader title='Expense reindex'>
        <PageHeader.LeftLink to='/settings' />
      </PageHeader>
      <button className='btn btn-block btn-xl btn-primary' onClick={() => reindexModelRef.current?.showModal()}>
        Reindex expenses now
      </button>
      <h3 className='mt-2 font-semibold'>Past reindexing</h3>
      {data.map(item => (
        <div key={item.version} className='card bg-base-100 border-base-200 border shadow-md'>
          <div className='card-body p-4'>
            <div className='flex items-center justify-between'>
              <h2 className='text-base font-semibold'>Version #{item.version}</h2>
              {item.completedAt ? (
                <span className='badge badge-success badge-sm'>Completed</span>
              ) : (
                <span className='badge badge-warning badge-sm'>Processing</span>
              )}
            </div>

            <div className='mt-2 space-y-1 text-xs opacity-70'>
              <div>
                <span className='font-medium'>Started:</span> {dateFormat.format(new Date(item.createdAt))}
              </div>
              {item.completedAt && (
                <div>
                  <span className='font-medium'>Ended:</span> {dateFormat.format(new Date(item.completedAt))}
                </div>
              )}
            </div>

            <div className='mt-3 grid grid-cols-3 gap-2 text-sm'>
              <div className='bg-base-200 rounded-lg p-2 text-center'>
                <div className='font-semibold'>{item.recordsProcessed}</div>
                <div className='text-xs opacity-60'>Processed</div>
              </div>

              <div className='bg-base-200 rounded-lg p-2 text-center'>
                <div className='font-semibold'>{item.totalDeletedCount}</div>
                <div className='text-xs opacity-60'>Deleted</div>
              </div>

              <div className='bg-base-200 rounded-lg p-2 text-center'>
                <div className='font-semibold'>{item.deletedExpenseTextsCount}</div>
                <div className='text-xs opacity-60'>Expense Txt</div>
              </div>
            </div>
          </div>
        </div>
      ))}

      <ReindexDialog reindexModelRef={reindexModelRef} />
    </div>
  );
}

function ReindexDialog({ reindexModelRef }: { reindexModelRef: RefObject<HTMLDialogElement | null> }) {
  const reindexExpenseMutation = useMutation(
    trpc.expense.reindex.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.expense.reindexList.queryOptions()),
    }),
  );
  return (
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
            disabled={
              reindexExpenseMutation.isPending || reindexExpenseMutation.isSuccess || reindexExpenseMutation.isError
            }
            onClick={() =>
              reindexExpenseMutation
                .mutateAsync()
                .then(() => setTimeout(() => (reindexModelRef.current?.close(), reindexExpenseMutation.reset()), 5000))
            }
          >
            Start
          </button>
        </div>
      </div>
    </dialog>
  );
}
