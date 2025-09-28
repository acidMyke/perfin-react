import { createFileRoute, Link } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, throwIfNotFound, trpc } from '../../../trpc';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { FieldError } from '../../../components/FieldError';
import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { PageHeader } from '../../../components/PageHeader';
import { useEffect } from 'react';
import { useAppForm, withForm, type Option } from '../../../components/Form';
import { formOptions } from '@tanstack/react-form';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId')({
  component: CreateEditExpensePageComponent,
  notFoundComponent: ExpenseNotFoundComponent,
  loader: ({ params }) => {
    const isCreate = params.expenseId === 'create';
    return Promise.all([
      isCreate
        ? undefined
        : queryClient
            .ensureQueryData(trpc.expense.loadDetail.queryOptions({ expenseId: params.expenseId }))
            .catch(error => throwIfNotFound(error)),
      queryClient.ensureQueryData(trpc.expense.loadOptions.queryOptions()),
      // load existing detail if not create
    ]);
  },
});

const createEditExpenseFormOptions = formOptions({
  defaultValues: {
    description: undefined as undefined | null | string,
    amountCents: 0.0,
    billedAt: new Date(),
    account: undefined as undefined | Option,
    category: undefined as undefined | Option,
    geolocation: undefined as undefined | { latitude: number; longitude: number; accuracy: number },
    shopName: undefined as undefined | Option,
    shopMall: undefined as undefined | Option,
  },
});

function CreateEditExpensePageComponent() {
  const navigate = Route.useNavigate();
  const { expenseId } = Route.useParams();
  const isCreate = expenseId === 'create';
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const { accountOptions, categoryOptions } = optionsData;
  const existingExpenseQuery = useQuery(trpc.expense.loadDetail.queryOptions({ expenseId }, { enabled: !isCreate }));
  const createExpenseMutation = useMutation(trpc.expense.save.mutationOptions({ onSuccess: () => void form.reset() }));
  const form = useAppForm({
    ...createEditExpenseFormOptions,
    validators: {
      onSubmitAsync: async ({ value, signal }): Promise<any> => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.save.mutationKey() });
        const { billedAt, geolocation, shopName, shopMall, ...otherValues } = value;
        const formError = await handleFormMutateAsync(
          createExpenseMutation.mutateAsync({
            expenseId,
            shopName: shopName?.value ?? null,
            shopMall: shopMall?.value ?? null,
            ...otherValues,
            latitude: geolocation?.latitude ?? null,
            longitude: geolocation?.longitude ?? null,
            geoAccuracy: geolocation?.accuracy ?? null,
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
    if (existingExpenseQuery.isSuccess && existingExpenseQuery.data) {
      const { billedAt, accountId, categoryId, latitude, longitude, geoAccuracy, shopName, shopMall, ...rest } =
        existingExpenseQuery.data;
      const account = accountId ? accountOptions.find(({ value }) => value === accountId) : undefined;
      const category = categoryId ? categoryOptions.find(({ value }) => value === categoryId) : undefined;
      const formData: typeof form.state.values = {
        billedAt: new Date(billedAt),
        account,
        category,
        geolocation: undefined,
        shopName: shopName !== undefined && shopName !== null ? { label: shopName, value: shopName } : undefined,
        shopMall: shopMall !== undefined && shopMall !== null ? { label: shopMall, value: shopMall } : undefined,
        ...rest,
      };

      if (latitude !== null && longitude !== null && geoAccuracy !== null) {
        formData.geolocation = {
          latitude,
          longitude,
          accuracy: geoAccuracy,
        };
      }
      form.reset(formData, { keepDefaultValues: true });
    }
  }, [existingExpenseQuery.isSuccess, existingExpenseQuery.isError]);

  useEffect(() => {
    if (isCreate && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const { latitude, longitude, accuracy } = coords;
          form.setFieldValue('geolocation', { latitude, longitude, accuracy });
        },
        () => {
          form.setFieldMeta('geolocation', meta => ({ ...meta, isTouched: true, isDirty: true }));
        },
      );
    }
  }, []);

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
        <form.AppField name='amountCents'>
          {({ NumericInput }) => (
            <NumericInput
              min={0}
              max={1000}
              label='Amount'
              containerCn='mt-4'
              inputCn='input-lg'
              transforms={['amountInCents']}
              numberFormat={new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' })}
            />
          )}
        </form.AppField>
        {/* @ts-expect-errors */}
        <ShopDetailSubForm form={form} />
        <form.AppField name='description'>
          {({ TextInput }) => (
            <TextInput type='text' label='Description' containerCn='mt-6' inputCn='input-lg' transform='uppercase' />
          )}
        </form.AppField>
        <form.Subscribe selector={state => [state.values.geolocation]}>
          {([geolocation]) =>
            geolocation ? (
              <p>
                Location: {geolocation.latitude.toPrecision(8)}, {geolocation.longitude.toPrecision(8)} (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${geolocation.latitude}%2C${geolocation.longitude}`}
                  target='_blank'
                  className='link'
                >
                  Open in maps
                  <ExternalLink className='ml-2 inline-block' size='1em' />
                </a>
                )
              </p>
            ) : (
              <p>Location: {isCreate ? 'Unable to retrieve your location' : 'Unsepcified'}</p>
            )
          }
        </form.Subscribe>
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
        <form.AppField name='category'>
          {({ ComboBox }) => <ComboBox label='Category' options={categoryOptions} containerCn='mt-4' />}
        </form.AppField>
        <form.AppField name='account'>
          {({ ComboBox }) => <ComboBox label='Account' options={accountOptions} containerCn='mt-8' />}
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

function ExpenseNotFoundComponent() {
  return (
    <div
      className='mx-auto max-w-md'
      onSubmit={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <PageHeader title='Expense not found' showBackButton />
      <p className='mt-8'>Unable to find selected expenses</p>
      <Link to='..' className='btn btn-primary btn-lg btn-block mt-8'>
        Back
      </Link>
    </div>
  );
}

const ShopDetailSubForm = withForm({
  ...createEditExpenseFormOptions,
  render({ form }) {
    const shopNameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const shopMallSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());

    return (
      <div className='mt-4 flex flex-row justify-between gap-2'>
        <form.AppField
          name='shopName'
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value: option, signal }) => {
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              if (option?.value && option.value.length > 1) {
                shopNameSuggestionMutation.mutateAsync({
                  type: 'shopName',
                  search: option.value,
                });
              }
            },
          }}
        >
          {field => (
            <field.ComboBox
              placeholder=''
              label='Shop name'
              containerCn='flex-grow-1'
              options={shopNameSuggestionMutation.data?.suggestions ?? []}
              getNewOptionData={value => {
                value = value.toUpperCase();
                const option = { label: value, value };
                field.handleChange(option);
                return option;
              }}
            />
          )}
        </form.AppField>
        <form.AppField
          name='shopMall'
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value: option, signal }) => {
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              if (option?.value && option.value.length > 1) {
                shopMallSuggestionMutation.mutateAsync({
                  type: 'shopMall',
                  search: option.value,
                });
              }
            },
          }}
        >
          {field => (
            <field.ComboBox
              placeholder=''
              label='Mall'
              containerCn='flex-grow-1'
              options={shopMallSuggestionMutation.data?.suggestions ?? []}
              getNewOptionData={value => {
                value = value.toUpperCase();
                const option = { label: value, value };
                field.handleChange(option);
                return option;
              }}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});
