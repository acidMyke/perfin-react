import { createFileRoute, Link } from '@tanstack/react-router';
import { handleFormMutateAsync, queryClient, throwIfNotFound, trpc, type RouterOutputs } from '../../../trpc';
import { useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { FieldError } from '../../../components/FieldError';
import { Cross, ExternalLink, Plus, X } from 'lucide-react';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { PageHeader } from '../../../components/PageHeader';
import { useEffect } from 'react';
import { useAppForm, withFieldGroup, withForm } from '../../../components/Form';
import { formOptions, useStore } from '@tanstack/react-form';

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

function mapExpenseDetailToForm(
  detail?: RouterOutputs['expense']['loadDetail'],
  options?: RouterOutputs['expense']['loadOptions'],
) {
  if (detail && options) {
    const { accountOptions, categoryOptions } = options;
    const { billedAt, accountId, categoryId, latitude, longitude, geoAccuracy, ...rest } = detail;
    const account = accountId ? accountOptions.find(({ value }) => value === accountId) : undefined;
    const category = categoryId ? categoryOptions.find(({ value }) => value === categoryId) : undefined;
    return {
      billedAt: new Date(billedAt),
      account,
      category,
      geolocation:
        latitude !== null && longitude !== null && geoAccuracy !== null
          ? { latitude, longitude, accuracy: geoAccuracy }
          : undefined,
      ...rest,
    };
  } else {
    return {
      description: undefined,
      amountCents: 0,
      billedAt: new Date(),
      account: undefined,
      category: undefined,
      geolocation: undefined,
      shopName: undefined,
      shopMall: undefined,
      items: [] as Exclude<typeof detail, undefined>['items'],
    };
  }
}

const createEditExpenseFormOptions = formOptions({ defaultValues: mapExpenseDetailToForm() });
const currencyNumberFormat = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' });

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
        const { billedAt, geolocation, ...otherValues } = value;
        const formError = await handleFormMutateAsync(
          createExpenseMutation.mutateAsync({
            expenseId,
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
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        const fieldInfo = fieldApi.getInfo();
        if (fieldInfo?.instance?.name.startsWith('items')) {
          const isBillAmountDirty = formApi.state.fieldMeta.amountCents.isDirty;
          if (!isBillAmountDirty) {
            const items = formApi.getFieldValue('items');
            const totalCents = items.reduce((acc, { priceCents, quantity }) => acc + priceCents * quantity, 0);
            formApi.setFieldValue('amountCents', totalCents, { dontUpdateMeta: false });
          }
        }
      },
    },
  });

  useEffect(() => {
    if (existingExpenseQuery.isSuccess && existingExpenseQuery.data) {
      form.reset(mapExpenseDetailToForm(existingExpenseQuery.data, optionsData), { keepDefaultValues: true });
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
    <div className='mx-auto max-w-md'>
      <form.AppForm>
        <PageHeader title={(isCreate ? 'Create' : 'Edit') + ' expense'} showBackButton />
        <div className='h-4'></div>
        {/* @ts-expect-errors */}
        <ShopDetailSubForm form={form} />
        <form.Field name='items' mode='array'>
          {field => (
            <ul className='mt-8 flex max-h-96 flex-col gap-y-2 overflow-y-scroll py-1 pr-2 pl-4'>
              {field.state.value.map(({ id }, itemIndex) => (
                <ItemDetailFieldGroup
                  key={id + itemIndex}
                  form={form}
                  fields={`items[${itemIndex}]`}
                  onLocalRemove={() => field.removeValue(itemIndex)}
                />
              ))}
              <li key='Create'>
                <button
                  className='btn-soft btn-primary btn w-2/3 justify-start'
                  onClick={() =>
                    field.pushValue({ id: 'create', name: '', priceCents: 0, quantity: 1, isDeleted: false })
                  }
                >
                  <Plus />
                  Add item
                </button>
              </li>
            </ul>
          )}
        </form.Field>
        <form.AppField name='amountCents'>
          {({ NumericInput }) => (
            <NumericInput
              min={0}
              max={1000}
              label='Amount'
              containerCn='mt-4'
              inputCn='input-lg'
              transforms={['amountInCents']}
              numberFormat={currencyNumberFormat}
            />
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
    </div>
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
            onChangeAsync: ({ value, signal }) => {
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              if (value !== null && value.length > 1) {
                shopNameSuggestionMutation.mutateAsync({
                  type: 'shopName',
                  search: value,
                });
              }
            },
          }}
        >
          {field => (
            <field.ComboBox
              suggestionMode
              placeholder=''
              label='Shop name'
              containerCn='flex-grow-1'
              options={shopNameSuggestionMutation.data?.suggestions ?? []}
            />
          )}
        </form.AppField>
        <form.AppField
          name='shopMall'
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value, signal }) => {
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              if (value !== null && value.length > 1) {
                shopMallSuggestionMutation.mutateAsync({
                  type: 'shopMall',
                  search: value,
                });
              }
            },
          }}
        >
          {field => (
            <field.ComboBox
              suggestionMode
              placeholder=''
              label='Mall'
              containerCn='flex-grow-1'
              options={shopMallSuggestionMutation.data?.suggestions ?? []}
            />
          )}
        </form.AppField>
      </div>
    );
  },
});

const ItemDetailFieldGroup = withFieldGroup({
  defaultValues: {
    id: '',
    name: '',
    quantity: 1,
    priceCents: 0.0,
    isDeleted: false,
  },
  props: {
    onLocalRemove: () => {},
  },
  render({ group, onLocalRemove }) {
    const itenNameSuggestionMutation = useMutation(trpc.expense.getSuggestions.mutationOptions());
    const id = useStore(group.store, state => state.values.id);
    const isDeleted = useStore(group.store, state => state.values.isDeleted);

    return (
      <li
        className='grid auto-cols-auto grid-flow-col place-items-center gap-4 shadow-lg data-[deleted=true]:*:line-through'
        data-deleted={isDeleted}
      >
        <group.AppField
          name='name'
          validators={{
            onChangeAsyncDebounceMs: 500,
            onChangeAsync: ({ value, signal }) => {
              signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.getSuggestions.mutationKey() });
              if (value && value.length > 1) {
                itenNameSuggestionMutation.mutateAsync({
                  type: 'itemName',
                  search: value,
                });
              }
            },
          }}
        >
          {field => (
            <field.ComboBox
              suggestionMode
              placeholder=''
              label='Name'
              containerCn='col-span-4 w-full'
              options={itenNameSuggestionMutation.data?.suggestions ?? []}
              readOnly={isDeleted}
            />
          )}
        </group.AppField>
        <group.AppField name='priceCents'>
          {({ NumericInput }) => (
            <NumericInput
              label='Price'
              transforms={['amountInCents']}
              numberFormat={currencyNumberFormat}
              inputCn='input-lg'
              innerInputCn='read-only:line-through'
              containerCn='mt-0 col-span-2 w-56 '
              readOnly={isDeleted}
            />
          )}
        </group.AppField>
        <group.AppField name='quantity'>
          {({ NumericInput }) => (
            <NumericInput
              label='Quantity'
              inputCn='input-lg'
              innerInputCn='read-only:line-through'
              containerCn='mt-0 w-full'
              readOnly={isDeleted}
            />
          )}
        </group.AppField>
        {isDeleted ? (
          <button
            className='btn-ghost btn col-start-4 row-start-2 mb-[1em] w-16'
            onClick={() => group.setFieldValue('isDeleted', false)}
          >
            Undo remove
          </button>
        ) : (
          <button
            className='btn-ghost btn col-start-4 row-start-2 mb-[1em] w-16'
            onClick={() => {
              if (id === 'create') onLocalRemove();
              else group.setFieldValue('isDeleted', true);
            }}
          >
            Remove
          </button>
        )}
      </li>
    );
  },
});
