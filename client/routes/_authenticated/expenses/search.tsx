import { useAppForm } from '#client/components/Form';
import { PageHeader } from '#client/components/PageHeader';
import { queryClient, trpc, type RouterOutputs } from '#client/trpc';
import { dateFormat, formatCents } from '#client/utils';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight, Search } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { z } from 'zod/v4';

export const Route = createFileRoute('/_authenticated/expenses/search')({
  component: RouteComponent,
  pendingComponent: RouteLayoutComponent,
  validateSearch: search => {
    return { query: search['query'] as string | undefined } as { query?: string | undefined } | undefined;
  },
  loaderDeps: ({ search }) => {
    const { query = '' } = search ?? {};
    return { query };
  },
  loader: async ({ deps: { query } }) => {
    if (query.length >= 3) queryClient.fetchQuery(trpc.expense.search.queryOptions({ query }));
  },
});

function RouteComponent() {
  return (
    <RouteLayoutComponent>
      <ExpenseSearchResults />
    </RouteLayoutComponent>
  );
}

type RouteLayoutComponentProps = {
  children?: ReactNode;
};

function RouteLayoutComponent({ children }: RouteLayoutComponentProps) {
  const navigate = Route.useNavigate();
  const { query = '' } = Route.useSearch() ?? {};
  const form = useAppForm({ defaultValues: { query } });

  return (
    <div className='mx-auto max-w-lg px-2'>
      <PageHeader title='Expenses search'>
        <PageHeader.LeftLink to='/expenses' />
      </PageHeader>
      <form.AppForm>
        <div className='flex gap-2'>
          <form.AppField
            name='query'
            validators={{
              onChange: z.string().trim().min(3, { error: 'at least 3 characters' }),
              onChangeAsyncDebounceMs: 800,
              onChangeAsync: () => navigate({ search: form.state.values }),
            }}
          >
            {({ TextInput }) => <TextInput type='search' containerCn='mt-0 grow' autoFocus />}
          </form.AppField>
          <button className='btn btn-ghost mb-2' onClick={() => navigate({ search: form.state.values })}>
            <Search />
          </button>
        </div>
      </form.AppForm>
      {children ??
        Array.from({ length: 6 }).map((_, i) => (
          <div className='bg-base-100 mx-auto flex w-full max-w-lg flex-col' key={i}>
            <ExpenseSkeleton />
          </div>
        ))}
    </div>
  );
}

export interface ExpenseSearchResultsProps {
  data?: RouterOutputs['expense']['search'];
  query?: string;
}

interface HighlightTextProps {
  text?: string | null;
  query?: string;
}

function HighlightText({ text, query }: HighlightTextProps) {
  if (!query || !text) return <>{text}</>;

  const lettersToHighlight = new Set(query.toLowerCase().replace(/\s/g, ''));

  return (
    <>
      {text.split('').map((char, index) => {
        if (lettersToHighlight.has(char.toLowerCase())) {
          return (
            <span key={index} className='text-primary font-bold'>
              {char}
            </span>
          );
        }

        return <Fragment key={index}>{char}</Fragment>;
      })}
    </>
  );
}

function ExpenseSearchResults() {
  const { query } = Route.useLoaderDeps();
  const { data } = useSuspenseQuery(trpc.expense.search.queryOptions({ query }));

  if (!data || !data.searchResult || data.searchResult.length === 0) {
    return <div className='text-base-content/60 p-4 text-center text-sm'>No results found.</div>;
  }

  return (
    <div className='bg-base-100 mx-auto flex w-full max-w-lg flex-col pb-20'>
      {data.searchResult.map(expense => {
        const { expenseId, shopName, shopMall, sourceMatches, amountCents, billedAt } = expense;

        return (
          <Link
            key={expenseId}
            to='/expenses/$expenseId/view'
            params={{ expenseId }}
            className='border-base-200 active:bg-base-200/60 flex flex-col border-b px-4 py-4 no-underline transition-colors'
          >
            <div className='mb-3 flex items-start justify-between'>
              <div>
                <span className='text-base-content text-xs'>{dateFormat.format(new Date(billedAt))}</span>
                <div className='mb-2 flex flex-row gap-2'>
                  {shopName && (
                    <span className='text-base-content text-base leading-tight font-semibold'>
                      <HighlightText text={shopName} query={query} />
                    </span>
                  )}
                  {shopMall && (
                    <span className='text-base-content/60 mt-0.5 text-xs'>
                      <HighlightText text={shopMall} query={query} />
                    </span>
                  )}
                </div>

                <div className='mt-1 flex flex-col gap-0.5'>
                  {sourceMatches.map((match, index: number) => {
                    const itemName = match.matchItemName || match.matchAdjustmentName;
                    if (!itemName) return null;

                    return (
                      <div key={index} className='flex items-start justify-between text-sm'>
                        <span className='text-base-content/80 flex-1 truncate pr-3'>
                          <HighlightText text={itemName} query={query} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className='flex flex-col items-end gap-0.5'>
                <ChevronRight />
                <span className='text-base-content text-2xl font-bold'>{formatCents(amountCents)}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ExpenseSkeleton() {
  return (
    <div className='border-base-200 flex flex-col border-b px-4 py-4'>
      <div className='mb-3 flex items-start justify-between'>
        <div className='flex flex-col'>
          <div className='skeleton mb-1 h-3 w-16'></div>

          <div className='mb-2 flex flex-row items-end gap-2'>
            <div className='skeleton h-5 w-32'></div>
            <div className='skeleton mb-0.5 h-3 w-24'></div>
          </div>

          <div className='mt-1 flex flex-col gap-2'>
            <div className='skeleton h-4 w-48'></div>
            <div className='skeleton h-4 w-36'></div>
          </div>
        </div>

        <div className='flex flex-col items-end gap-1'>
          <div className='skeleton h-5 w-5 rounded-md'></div>
          <div className='skeleton mt-1 h-8 w-20'></div>
        </div>
      </div>
    </div>
  );
}
