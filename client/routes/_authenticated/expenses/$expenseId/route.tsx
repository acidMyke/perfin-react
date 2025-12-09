import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { PageHeader } from '../../../../components/PageHeader';
import { queryClient, trpc, throwIfNotFound, handleFormMutateAsync } from '../../../../trpc';
import { useSuspenseQuery, useQuery, useMutation } from '@tanstack/react-query';
import { useAppForm } from '../../../../components/Form';
import { useEffect, useRef, type ReactElement } from 'react';
import {
  createEditExpenseFormOptions,
  mapExpenseDetailToForm,
  percentageNumberFormat,
  type ExpenseFormData,
} from './-expense.common';
import type { DeepKeys } from '@tanstack/react-form';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId')({
  component: RouteComponent,
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

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { expenseId } = Route.useParams();
  const isCreate = expenseId === 'create';
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const existingExpenseQuery = useQuery(
    trpc.expense.loadDetail.queryOptions(
      { expenseId },
      { enabled: !isCreate, refetchOnMount: false, refetchOnReconnect: false, refetchOnWindowFocus: false },
    ),
  );
  const createExpenseMutation = useMutation(trpc.expense.save.mutationOptions({ onSuccess: () => void form.reset() }));
  const autocompleteSelectionDialogRef = useRef<HTMLDialogElement>(null);
  const inferShopDetailMutation = useMutation(
    trpc.expense.inferShopDetail.mutationOptions({
      onSuccess: inferredResults => inferredResults?.length && autocompleteSelectionDialogRef.current?.showModal(),
    }),
  );
  const form = useAppForm({
    ...createEditExpenseFormOptions,
    listeners: {
      onChangeDebounceMs: 500,
      onChange: async ({ formApi, fieldApi }) => {
        const fieldName = fieldApi.name as DeepKeys<ExpenseFormData>;
        // Shop detail inference
        if (/(geolocation.*)|(shopName)|(items[\d+].name)/.test(fieldName)) {
          if (formApi.getFieldValue('ui.shouldInferShopDetail')) {
            const formValues = formApi.state.values;
            const { additionalServiceChargePercent, isGstExcluded, category, account } = formValues;
            if (
              additionalServiceChargePercent === null &&
              isGstExcluded === null &&
              category === undefined &&
              account === undefined
            ) {
              const { geolocation, shopName, items } = formValues;
              const { latitude, longitude } = geolocation ?? {};
              formApi.setFieldValue('ui.shouldInferShopDetail', false);
              inferShopDetailMutation.mutate({
                latitude,
                longitude,
                shopName,
                itemNames: items.map(({ name }) => name),
              });
            }
          }
        }
      },
    },
    validators: {
      onSubmitAsync: async ({ value, signal }): Promise<any> => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.save.mutationKey() });
        const { billedAt, geolocation, ui, ...otherValues } = value;
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
        navigate({ to: '/expenses', search: { month: billedAt.getMonth(), year: billedAt.getFullYear() } });
      },
    },
  });

  useEffect(() => {
    if (existingExpenseQuery.isSuccess && existingExpenseQuery.data) {
      form.reset(mapExpenseDetailToForm(existingExpenseQuery.data, optionsData), { keepDefaultValues: true });
      const { amountCents, items } = existingExpenseQuery.data;
      const totalCents = items.reduce((acc, { priceCents, quantity }) => acc + priceCents * quantity, 0);
      form.setFieldMeta('amountCents', meta => ({ ...meta, isDirty: totalCents !== amountCents }));
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
      <div className='col-span-full'>
        <PageHeader title={(isCreate ? 'Create' : 'Edit') + ' expense'} showBackButton />
      </div>
      <div className='h-4'></div>
      <form.AppForm>
        <Outlet />
        {/* Open the modal using document.getElementById('ID').showModal() method */}
        <dialog className='modal' ref={autocompleteSelectionDialogRef}>
          <div className='modal-box'>
            <h3 className='text-lg font-bold'>You seem to have came here before!!</h3>
            <p className='indent-2 italic'>Select an option below to autocomplete the form</p>
            {inferShopDetailMutation.data?.length && (
              <div className='mt-2 flex flex-col gap-y-4'>
                {inferShopDetailMutation.data.map((shopDetail, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if ('shopMall' in shopDetail) {
                        form.setFieldValue('shopMall', shopDetail.shopMall);
                        form.setFieldValue('shopName', shopDetail.shopName);
                      }
                      form.setFieldValue('additionalServiceChargePercent', shopDetail.additionalServiceChargePercent);
                      form.setFieldValue('isGstExcluded', shopDetail.isGstExcluded);
                      autocompleteSelectionDialogRef.current?.close();
                    }}
                    className='btn btn-soft odd:btn-primary even:btn-secondary grid h-auto w-full auto-cols-auto grid-flow-row justify-start gap-x-2 p-2 *:text-left'
                  >
                    {'shopMall' in shopDetail ? (
                      <>
                        <h4 className='col-span-2 text-xl font-bold'>{shopDetail.shopName}</h4>
                        <p className='col-start-1'>Mall:</p>
                        <p className='col-start-2'>{shopDetail.shopMall}</p>
                      </>
                    ) : (
                      <h4 className='col-span-2 text-xl font-bold'>{form.getFieldValue('shopName') ?? 'Unknown'}</h4>
                    )}
                    <p className='col-start-1'>Service charge:</p>
                    <p className='col-start-2'>
                      {shopDetail.additionalServiceChargePercent
                        ? percentageNumberFormat.format(shopDetail.additionalServiceChargePercent / 100)
                        : 'N/A'}
                    </p>
                    <p className='col-start-1'>GST:</p>
                    <div className='col-start-2'>{shopDetail.isGstExcluded ? 'Excluded' : 'Included'}</div>
                  </button>
                ))}
                {
                  inferShopDetailMutation.data.reduce(
                    (acc, shopDetail, idx) =>
                      'shopMall' in shopDetail && shopDetail.shopMall && !acc.malls.includes(shopDetail.shopMall)
                        ? {
                            malls: [...acc.malls, shopDetail.shopMall],
                            buttons: [
                              ...acc.buttons,
                              <button
                                key={`mallonly${idx}`}
                                className='btn btn-soft odd:btn-primary even:btn-secondary w-full'
                                onClick={() => {
                                  form.setFieldValue('shopMall', shopDetail.shopMall);
                                  autocompleteSelectionDialogRef.current?.close();
                                }}
                              >
                                Just the mall: {shopDetail.shopMall}
                              </button>,
                            ],
                          }
                        : acc,
                    { malls: [], buttons: [] } as { malls: string[]; buttons: ReactElement[] },
                  ).buttons
                }
                <button
                  key='no0'
                  className='btn btn-soft btn-warning w-full'
                  onClick={() => {
                    form.setFieldValue('ui.shouldInferShopDetail', true);
                    autocompleteSelectionDialogRef.current?.close();
                  }}
                >
                  No, try again later
                </button>
                <button
                  key='no1'
                  className='btn btn-soft btn-error w-full'
                  onClick={() => autocompleteSelectionDialogRef.current?.close()}
                >
                  No, I have never been here, STOP ASKING
                </button>
              </div>
            )}
          </div>
        </dialog>
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
