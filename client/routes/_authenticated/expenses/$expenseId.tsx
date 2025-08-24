import { createFileRoute } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, trpc, type RouterInputs } from '../../../trpc';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { FieldError } from '../../../components/FieldError';
import { DollarSign } from 'lucide-react';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { PageHeader } from '../../../components/PageHeader';
import { useEffect } from 'react';
import CreatableSelect from 'react-select/creatable';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId')({
  component: RouteComponent,
  loader: ({ params }) => {
    const isCreate = params.expenseId === 'create';
    return Promise.all([
      isCreate
        ? undefined
        : queryClient.ensureQueryData(trpc.expense.loadDetail.queryOptions({ expenseId: params.expenseId })),
      queryClient.ensureQueryData(trpc.expense.loadOptions.queryOptions()),
      // load existing detail if not create
    ]);
  },
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { expenseId } = Route.useParams();
  const isCreate = expenseId === 'create';
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = optionsData;
  const { data, isSuccess } = useQuery(trpc.expense.loadDetail.queryOptions({ expenseId }, { enabled: !isCreate }));
  const createExpenseMutation = useMutation(trpc.expense.save.mutationOptions({ onSuccess: () => void form.reset() }));
  const form = useForm({
    defaultValues: {
      description: undefined as undefined | null | string,
      amountCents: 0.0,
      billedAt: new Date(),
      account: undefined as undefined | (typeof accountOptions)[number],
      category: undefined as undefined | (typeof categoryOptions)[number],
    },
    validators: {
      onSubmitAsync: async ({ value, signal }) => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.session.signIn.mutationKey() });
        const { billedAt, ...otherValues } = value;
        const formError = await handleFormMutateAsync(
          createExpenseMutation.mutateAsync({
            expenseId,
            ...otherValues,
            billedAt: billedAt.toISOString(),
          }),
        );
        if (formError) return formError;
        queryClient.invalidateQueries(trpc.expense.list.queryFilter());
        queryClient.invalidateQueries(trpc.expense.loadDetail.queryFilter({ expenseId }));
        if ([value.account?.value, value.category?.value].includes('create')) {
          queryClient.invalidateQueries(trpc.expense.loadOptions.queryFilter());
        }
        navigate({ to: '/expenses' });
      },
    },
  });

  useEffect(() => {
    if (isSuccess && data) {
      const { billedAt, accountId, categoryId, ...rest } = data;
      const account = accountId ? accountOptions.find(({ value }) => value === accountId) : undefined;
      const category = categoryId ? categoryOptions.find(({ value }) => value === categoryId) : undefined;
      form.reset(
        {
          billedAt: new Date(billedAt),
          account,
          category,
          ...rest,
        },
        { keepDefaultValues: true },
      );
    }
  }, [isSuccess]);

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
                value={(field.state.value / 100).toFixed(2)}
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
          <label htmlFor={field.name} className='floating-label mt-2'>
            <span>Description</span>
            <input
              type='text'
              id={field.name}
              name={field.name}
              placeholder='Description'
              className='input input-primary input-lg w-full'
              value={field.state.value ?? ''}
              onChange={e =>
                e.target.value === '' ? field.handleChange(undefined) : field.handleChange(e.target.value.toUpperCase())
              }
            />
            <FieldError field={field} />
          </label>
        )}
      </form.Field>
      <form.Field name='billedAt'>
        {field => (
          <label htmlFor={field.name} className='floating-label mt-2'>
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
      <form.Field name='category'>
        {field => (
          <label htmlFor={field.name} className='floating-label'>
            <span className='text-lg'>Category</span>
            <CreatableSelect
              options={categoryOptions}
              placeholder='Unspecified'
              classNamePrefix='react-select-lg'
              unstyled
              maxMenuHeight={124}
              isClearable
              isSearchable
              value={field.state.value}
              getNewOptionData={label => ({ label, value: 'create' })}
              createOptionPosition='first'
              formatCreateLabel={label => 'Create: ' + label}
              onChange={(v, meta) => {
                if (v === null) {
                  field.handleChange(undefined);
                  return;
                }
                if (meta.action === 'create-option') {
                  const createIndex = categoryOptions.findIndex(({ value }) => value === 'create');
                  const newCategoryOptions = [...categoryOptions];
                  if (createIndex > -1) newCategoryOptions[createIndex] = v;
                  else newCategoryOptions.push(v);
                  queryClient.setQueryData(trpc.expense.loadOptions.queryKey(), {
                    categoryOptions: newCategoryOptions,
                    accountOptions,
                  });
                }
                field.handleChange(v);
              }}
            />
          </label>
        )}
      </form.Field>
      <form.Field name='account'>
        {field => (
          <label htmlFor={field.name} className='floating-label mt-4'>
            <span className='text-lg'>Account</span>
            <CreatableSelect
              options={accountOptions}
              placeholder='Unspecified'
              classNamePrefix='react-select-lg'
              unstyled
              maxMenuHeight={124}
              isClearable
              isSearchable
              value={field.state.value}
              getNewOptionData={label => ({ label, value: 'create' })}
              createOptionPosition='first'
              formatCreateLabel={label => 'Create: ' + label}
              onChange={(v, meta) => {
                if (v === null) {
                  return;
                }
                if (meta.action === 'create-option') {
                  const createIndex = accountOptions.findIndex(({ value }) => value === 'create');
                  const newAccountOptions = [...accountOptions];
                  if (createIndex > -1) newAccountOptions[createIndex] = v;
                  else newAccountOptions.push(v);
                  queryClient.setQueryData(trpc.expense.loadOptions.queryKey(), {
                    accountOptions: newAccountOptions,
                    categoryOptions,
                  });
                }
                field.handleChange(v);
              }}
            />
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
