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
import { useAppForm } from '../../../components/Form';

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
  const form = useAppForm({
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
      <form.AppForm>
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
        <form.AppField name='description'>
          {({ TextInput }) => <TextInput type='text' label='Description' containerCn='mt-4' inputCn='input-lg' />}
        </form.AppField>
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
        <form.AppField name='category'>
          {({ ComboBox }) => <ComboBox label='Category' options={categoryOptions} />}
        </form.AppField>
        <form.AppField name='account'>
          {({ ComboBox }) => <ComboBox label='Account' options={accountOptions} containerCn='mt-4' />}
        </form.AppField>
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
      </form.AppForm>
    </form>
  );
}
