import { createFileRoute } from '@tanstack/react-router';
import { queryClient, trpc } from '../../../trpc';
import { Fragment } from 'react/jsx-runtime';
import { useSuspenseQuery } from '@tanstack/react-query';
import { format, isSameDay } from 'date-fns';
import { ChevronRight } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/expenses/')({
  component: RouteComponent,
  validateSearch: search => {
    if ('month' in search && 'year' in search) {
      return {
        month: search['month'] as number | undefined,
        year: search['year'] as number | undefined,
      };
    }
    const now = new Date();
    return {
      month: now.getMonth() as number | undefined,
      year: now.getFullYear() as number | undefined,
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    await queryClient.ensureQueryData(trpc.expense.list.queryOptions(deps));
  },
});

function RouteComponent() {
  const search = Route.useSearch();
  const {
    data: { expenses },
  } = useSuspenseQuery(trpc.expense.list.queryOptions(search));
  return (
    <div className='mx-auto max-w-lg px-2'>
      <h1 className='text-center text-3xl font-black'>Expenses</h1>
      <div className='flex w-full flex-col'>
        {expenses.map((expense, idx) => {
          const prev = idx != 0 ? expenses[idx - 1] : undefined;
          const showDate = !prev || !isSameDay(prev.billedAt, expense.billedAt);

          return (
            <Fragment key={expense.id}>
              {showDate && <div className='divider divider-start'>{format(expense.billedAt, 'dd MMM yyyy')}</div>}
              <div className='bg-base-200/25 border-b-base-300 grid auto-cols-auto grid-flow-row auto-rows-auto border-b'>
                <p className='col-span-2 overflow-visible text-3xl'>{expense.description}</p>
                <p className='text-base-content/80 col-span-2 row-start-2 text-sm'>
                  Account: {expense.account?.name ?? 'Unspecified'}
                </p>
                <p className='text-base-content/80 col-span-2 row-start-3 text-sm'>
                  Category: {expense.category?.name ?? 'Unspecified'}
                </p>
                <ChevronRight className='col-start-3 row-start-1 self-center justify-self-end' />
                <p className='col-span-1 col-start-3 row-span-2 row-start-2 text-right text-3xl'>
                  ${expense.amount.toFixed(2)}
                </p>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
