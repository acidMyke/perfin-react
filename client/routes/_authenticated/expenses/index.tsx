import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { queryClient, trpc, type RouterInputs, type RouterOutputs } from '../../../trpc';
import { Fragment } from 'react/jsx-runtime';
import { useSuspenseQuery } from '@tanstack/react-query';
import { format, isBefore, isSameMonth, startOfMonth, subMonths } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { abbreviatedMonthValues } from '../../../constants';
import { PageHeader } from '../../../components/PageHeader';
import { currencyNumberFormat } from '../../../utils';
import { useMemo } from 'react';
import { formOptions } from '@tanstack/react-form';
import { useAppForm } from '../../../components/Form';

export const Route = createFileRoute('/_authenticated/expenses/')({
  pendingComponent: RoutePendingComponent,
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
    if (search) {
      if (typeof search['month'] === 'number' && typeof search['year'] === 'number') {
        deps.month = search['month'] as number;
        deps.year = search['year'] as number;
      }
    }

    return deps;
  },
  loader: async ({ deps }) => {
    await Promise.all([
      queryClient.ensureQueryData(trpc.expense.loadOptions.queryOptions()),
      queryClient.ensureQueryData(trpc.expense.list.queryOptions(deps)),
    ]);
  },
});

function MonthSelector() {
  const router = useRouter();
  const navigate = useNavigate({ from: '/expenses' });
  const loaderDeps = Route.useLoaderDeps();
  const selectedDate = new Date(loaderDeps.year, loaderDeps.month);

  return (
    <div className='flex flex-row gap-4'>
      <details className='dropdown'>
        {isBefore(selectedDate, startOfMonth(subMonths(new Date(), 3))) ? (
          <summary className='btn btn-primary btn-sm'>{format(selectedDate, 'MMM yy')} </summary>
        ) : (
          <summary className='btn btn-sm'>Other</summary>
        )}
        <form
          className='dropdown-content bg-base-200 rounded-b-box z-1 flex flex-row flex-nowrap gap-2 p-2 shadow-lg'
          onChange={e => {
            const formValues = new FormData(e.currentTarget);
            const month = formValues.get('month')?.toString();
            const year = formValues.get('year')?.toString();
            if (month && year) {
              router.preloadRoute({ to: '/expenses', search: { month: parseInt(month), year: parseInt(year) } });
            }
          }}
          onSubmit={e => {
            e.preventDefault();
            const formValues = new FormData(e.currentTarget);
            const month = formValues.get('month')?.toString();
            const year = formValues.get('year')?.toString();
            if (month && year) {
              navigate({ to: '/expenses', search: { month: parseInt(month), year: parseInt(year) } });
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
            search={{ month: date.getMonth(), year: date.getFullYear() }}
            className={`btn btn-sm ${isSelected ? 'btn-primary' : ''}`}
          >
            {format(date, 'MMM yy')}
          </Link>
        );
      })}
    </div>
  );
}

function RoutePendingComponent() {
  return (
    <div className='mx-auto max-w-lg px-2'>
      <PageHeader title='Expenses' />
      <MonthSelector />
      <span className='loading loading-spinner loading-xl'></span>
    </div>
  );
}

const expenseListOptions = formOptions({
  defaultValues: {
    showDeleted: false,
    hideNonDeleted: false,
    accountIds: undefined as (string | null)[] | undefined,
    categoryIds: undefined as (string | null)[] | undefined,
    groupBy: 'day' as 'day' | 'account' | 'category',
  },
});

type ExpenseListOptions = (typeof expenseListOptions)['defaultValues'];

function FilterAndGroupExpenses(expenses: RouterOutputs['expense']['list']['expenses'], options: ExpenseListOptions) {
  const { showDeleted } = options;
  const dateFormat = new Intl.DateTimeFormat('en-SG', {
    hour12: false,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Singapore',
  });

  type GroupedExpense = {
    key: string;
    sum: number;
    expenses: typeof expenses;
  };
  const expensesGroup = new Map<string, GroupedExpense>();
  let monthTotal = 0;
  for (const expense of expenses) {
    if (!showDeleted && expense.isDeleted) {
      continue;
    }

    if (!expense.isDeleted) {
      monthTotal += expense.amount;
    }
    const key = dateFormat.format(new Date(expense.billedAt));
    const value = expensesGroup.get(key) ?? { key, sum: 0, expenses: [] };
    if (!expense.isDeleted) {
      value.sum += expense.amount;
    }
    value.expenses.push(expense);
    expensesGroup.set(key, value);
  }

  return {
    expensesGroup: Array.from(expensesGroup.values()),
    monthTotal,
  };
}

function RouteComponent() {
  const form = useAppForm({ ...expenseListOptions });

  return (
    <div className='mx-auto max-w-lg px-2'>
      <PageHeader title='Expenses' />
      <form.AppForm>
        <div className='flex justify-between'>
          <MonthSelector />

          <form.AppField name='showDeleted'>
            {field => (
              <label className='label ml-auto'>
                <input
                  type='checkbox'
                  checked={field.state.value}
                  className='toggle checked:toggle-primary'
                  onChange={e => field.handleChange(e.currentTarget.checked)}
                />
                Deleted
              </label>
            )}
          </form.AppField>
        </div>

        <form.Subscribe selector={state => [state.values]}>
          {([listOptions]) => <ExpensesList listOptions={listOptions} />}
        </form.Subscribe>
      </form.AppForm>
    </div>
  );
}

function ExpensesList({ listOptions }: { listOptions: ExpenseListOptions }) {
  const loaderDeps = Route.useLoaderDeps();
  const {
    data: { expenses },
  } = useSuspenseQuery(trpc.expense.list.queryOptions(loaderDeps));
  const { expensesGroup, monthTotal } = useMemo(
    () => FilterAndGroupExpenses(expenses, listOptions),
    [expenses, listOptions],
  );

  return (
    <div className='mt-2 flex w-full flex-col gap-1 pb-20'>
      <h3 className='text-center text-2xl font-bold'>Month Total: {currencyNumberFormat.format(monthTotal)}</h3>
      {expensesGroup.map(({ key, sum, expenses }) => {
        return (
          <Fragment key={key}>
            <div className='flex' key={key + '--'}>
              <div className='divider divider-start grow'>{key}</div>
              <span className='ml-3 text-2xl font-bold'>{currencyNumberFormat.format(sum)}</span>
            </div>

            {expenses.map(expense => (
              <Link
                key={expense.id}
                to='/expenses/$expenseId/view'
                params={{ expenseId: expense.id }}
                className='bg-base-200/25 border-b-base-300 grid auto-cols-auto grid-flow-row auto-rows-auto data-[deleted=true]:line-through'
                data-deleted={expense.isDeleted}
              >
                <p className='col-span-2 overflow-visible text-2xl'>{expense.description}</p>
                <p className='text-base-content/80 col-span-2 row-start-2 text-sm'>
                  At: {expense.shopDetail ?? 'Unspecified'}
                </p>

                <p className='text-base-content/80 col-span-2 row-start-3 text-sm'>
                  Account: {expense.account?.name ?? 'Unspecified'}
                </p>
                <p className='text-base-content/80 col-span-2 row-start-4 text-sm'>
                  Category: {expense.category?.name ?? 'Unspecified'}
                </p>
                <ChevronRight className='col-start-3 row-span-2 row-start-1 self-start justify-self-end' size={40} />
                <p className='col-span-1 col-start-3 row-span-2 row-start-3 self-end pr-2 pb-2 text-right text-xl'>
                  ${expense.amount.toFixed(2)}
                </p>
              </Link>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}
