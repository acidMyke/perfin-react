import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { queryClient, trpc, type RouterInputs } from '../../../trpc';
import { Fragment } from 'react/jsx-runtime';
import { useSuspenseQuery } from '@tanstack/react-query';
import { format, isBefore, isSameDay, isSameMonth, startOfMonth, subMonths } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { abbreviatedMonthValues } from '../../../constants';

export const Route = createFileRoute('/_authenticated/expenses/')({
  component: RouteComponent,
  validateSearch: search => {
    return {
      month: search['month'] as number | undefined,
      year: search['year'] as number | undefined,
    } as Partial<RouterInputs['expense']['list']> | undefined;
  },
  loaderDeps: ({ search }) => {
    const now = new Date();
    const deps: RouterInputs['expense']['list'] = {
      month: now.getMonth(),
      year: now.getFullYear(),
    };
    if (search && typeof search['month'] === 'number' && typeof search['year'] === 'number') {
      deps.month = search['month'] as number;
      deps.year = search['year'] as number;
    }
    return deps;
  },
  loader: async ({ deps }) => {
    await queryClient.ensureQueryData(trpc.expense.list.queryOptions(deps));
  },
});

function RouteComponent() {
  const navigate = useNavigate({ from: '/expenses' });
  const loaderDeps = Route.useLoaderDeps();
  const {
    data: { expenses },
  } = useSuspenseQuery(trpc.expense.list.queryOptions(loaderDeps));
  const selectedDate = new Date(loaderDeps.year, loaderDeps.month);

  return (
    <div className='mx-auto max-w-lg px-2'>
      <h1 className='mb-2 text-center text-3xl font-black'>Expenses</h1>
      <div className='flex flex-row gap-4'>
        <details className='dropdown'>
          {isBefore(selectedDate, startOfMonth(subMonths(new Date(), 3))) ? (
            <summary className='btn btn-primary btn-sm'>{format(selectedDate, 'MMM yy')} </summary>
          ) : (
            <summary className='btn btn-sm'>Other</summary>
          )}
          <form
            className='dropdown-content bg-base-200 rounded-b-box z-1 flex flex-row flex-nowrap gap-2 p-2 shadow-lg'
            onSubmit={e => {
              e.preventDefault();
              const formValues = new FormData(e.currentTarget);
              const month = formValues.get('month')?.toString();
              const year = formValues.get('year')?.toString();
              if (month && year) {
                navigate({
                  to: '/expenses',
                  search: { month: parseInt(month), year: parseInt(year) },
                });
                e.currentTarget.parentElement?.removeAttribute('open');
              }
            }}
          >
            <label className='floating-label w-20'>
              <span>Month</span>
              <select name='month' className='select' defaultValue={loaderDeps.month}>
                {abbreviatedMonthValues.map((s, i) => (
                  <option key={i} value={i}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className='floating-label w-16'>
              <span>Year</span>
              <input type='text' name='year' className='input' defaultValue={loaderDeps.year} />
            </label>
            <button type='submit' className='btn btn-primary'>
              Go
            </button>
          </form>
        </details>
        {Array.from({ length: 3 }).map((_, i) => {
          const date = subMonths(new Date(), 2 - i);
          const isSelected = isSameMonth(selectedDate, date);
          return (
            <Link
              key={i}
              to='/expenses'
              search={{
                month: date.getMonth(),
                year: date.getFullYear(),
              }}
              className={`btn btn-sm ${isSelected ? 'btn-primary' : ''}`}
            >
              {format(date, 'MMM yy')}
            </Link>
          );
        })}
      </div>
      <div className='flex w-full flex-col'>
        {expenses.map((expense, idx) => {
          const prev = idx != 0 ? expenses[idx - 1] : undefined;
          const showDate = !prev || !isSameDay(prev.billedAt, expense.billedAt);

          return (
            <Fragment key={expense.id}>
              {showDate && <div className='divider divider-start'>{format(expense.billedAt, 'dd MMM yyyy')}</div>}
              <div className='bg-base-200/25 border-b-base-300 grid auto-cols-auto grid-flow-row auto-rows-auto border-b'>
                <p className='col-span-2 overflow-visible text-2xl'>{expense.description}</p>
                <p className='text-base-content/80 col-span-2 row-start-2 text-sm'>
                  Account: {expense.account?.name ?? 'Unspecified'}
                </p>
                <p className='text-base-content/80 col-span-2 row-start-3 text-sm'>
                  Category: {expense.category?.name ?? 'Unspecified'}
                </p>
                <ChevronRight className='col-start-3 row-start-1 self-center justify-self-end' />
                <p className='col-span-1 col-start-3 row-span-2 row-start-2 text-right text-2xl'>
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
