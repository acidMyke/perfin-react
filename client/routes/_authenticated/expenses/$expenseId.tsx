import { createFileRoute } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc } from '../../../trpc';
import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { FieldError } from '../../../components/FieldError';
import { DollarSign } from 'lucide-react';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { PageHeader } from '../../../components/PageHeader';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId')({
  component: RouteComponent,
  loader: ({ params }) => {
    const isCreate = params.expenseId === 'create';
    return Promise.all([
      queryClient.ensureQueryData(trpc.expense.loadCreate.queryOptions()),
      // load existing detail if not create
    ]);
  },
});

function RouteComponent() {
  const { expenseId } = Route.useParams();
  const isCreate = expenseId === 'create';
  const {
    data: { accountOptions, categoryOptions },
  } = useSuspenseQuery(trpc.expense.loadCreate.queryOptions());
  const createExpenseMutation = useMutation(
    trpc.expense.create.mutationOptions({ onSuccess: () => void form.reset() }),
  );
  const form = useForm({
    defaultValues: {
      description: undefined as string | undefined,
      amountCents: 0.0,
      billedAt: new Date(),
      accountId: undefined as string | undefined,
      categoryId: undefined as string | undefined,
    },
    validators: {
      onSubmitAsync: async ({ value, signal }) => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.session.signIn.mutationKey() });
        return handleFormMutateAsync(
          createExpenseMutation.mutateAsync({ ...value, billedAt: value.billedAt.toISOString() }),
        );
      },
    },
  });

  return (
    <form
      className='mx-auto max-w-md'
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <PageHeader title={(isCreate ? 'Create' : 'Edit') + ' expense'} showBackButton />
      <form.Field name='amountCents'>
        {field => (
          <label htmlFor={field.name} className='floating-label mt-8'>
            <span>Amount</span>
            <label className='input input-primary input-lg w-full'>
              <DollarSign size='1em' />
              <input
                autoFocus
                type='number'
                id={field.name}
                name={field.name}
                placeholder='Amount'
                value={(field.state.value / 100).toFixed(2).padStart(5, '0')}
                onChange={e =>
                  !isNaN(e.target.valueAsNumber) &&
                  field.handleChange(Math.floor(e.target.valueAsNumber * 1000) % 1000_000_000_00)
                }
                onKeyDown={e => {
                  if (e.key === 'Backspace') field.handleChange(v => v / 10);
                  else if (e.key === '.') field.handleChange(v => v * 100);
                  else return;
                  e.preventDefault();
                }}
              />
            </label>
            <FieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Field name='description'>
        {field => (
          <label htmlFor={field.name} className='floating-label mt-4'>
            <span>Description</span>
            <input
              type='text'
              id={field.name}
              name={field.name}
              placeholder='Description'
              className='input input-primary input-lg w-full'
              value={field.state.value ?? ''}
              onChange={e =>
                field.state.value === '' ? field.handleChange(undefined) : field.handleChange(e.target.value)
              }
            />
            <FieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Field name='billedAt'>
        {field => (
          <label htmlFor={field.name} className='floating-label mt-4'>
            <span>Date</span>
            <input
              type='datetime-local'
              id={field.name}
              name={field.name}
              placeholder='Date'
              className='input input-primary input-lg w-full'
              value={format(field.state.value, "yyyy-MM-dd'T'HH:mm")}
              onChange={e => {
                if (e.target.value === '') {
                  field.handleChange(new Date());
                } else {
                  const parsedDate = parse(e.target.value, "yyyy-MM-dd'T'HH:mm", new Date());
                  if (!isNaN(parsedDate.getTime())) {
                    field.handleChange(parsedDate);
                  }
                }
              }}
            />
            <FieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Field name='categoryId'>
        {field => (
          <label htmlFor={field.name} className='floating-label mt-4'>
            <span>Category</span>
            <select
              name={field.name}
              value={field.state.value}
              className='select select-lg select-primary w-full'
              onSelect={e =>
                e.currentTarget.value ? field.handleChange(e.currentTarget.value) : field.handleChange(undefined)
              }
            >
              <option value=''>None</option>
              {categoryOptions.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <FieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Field name='accountId'>
        {field => (
          <label htmlFor={field.name} className='floating-label mt-4'>
            <span>Account</span>
            <select
              name={field.name}
              value={field.state.value}
              className='select select-lg select-primary w-full'
              onSelect={e =>
                e.currentTarget.value ? field.handleChange(e.currentTarget.value) : field.handleChange(undefined)
              }
            >
              <option value=''>None</option>
              {accountOptions.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <FieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={state => [state.isPristine, state.canSubmit, state.isSubmitting]}>
        {([isPristine, canSubmit, isSubmitting]) => (
          <button
            type='button'
            className='btn btn-primary btn-lg btn-block mt-8'
            disabled={isPristine || !canSubmit || isSubmitting}
            onClick={() => form.handleSubmit()}
          >
            {isSubmitting && <span className='loading loading-dots loading-md'></span>}
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
