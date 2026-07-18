import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { PageHeader } from '#components/PageHeader';
import { useAppForm } from '#components/Form';
import { queryClient, trpc, throwIfNotFound, handleFormMutateAsync } from '#client/trpc';
import { useSuspenseQuery, useQuery, useMutation } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import {
  SET_VAL_ONLY,
  createEditExpenseFormOptions,
  invalidateAndRedirectBackToList,
  mapExpenseDetailToForm,
  useAdjustmentCallbacks,
  pushHistory,
  type ExpenseFormData,
  type ExpenseFormApi,
  type HistoryEntry,
  type TrackableFieldName,
} from './-common';
import type { DeepKeys } from '@tanstack/react-form';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { ShopDetailPicker, useShopDetailPickerRef } from './-common/ShopDetailPicker';
import { DirtyFormBlockModel } from './-common/DirtyFormBlockModel';
import { Redo, Undo } from 'lucide-react';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId')({
  component: RouteComponent,
  notFoundComponent: ExpenseNotFoundComponent,
  validateSearch: search => {
    if (!('copyId' in search)) return undefined;
    return {
      copyId: search['copyId'] as string | undefined,
    };
  },
  loaderDeps: ({ search }) => {
    if (search) {
      if (typeof search['copyId'] === 'string')
        return {
          copyId: search['copyId'],
          isCopy: true,
        };
    }
    return { isCopy: false };
  },
  loader: ({ params, deps }) => {
    const isCreate = params.expenseId === 'create';
    const promises: Promise<any>[] = [queryClient.ensureQueryData(trpc.expense.loadOptions.queryOptions())];
    if (!isCreate || deps.isCopy) {
      promises.push(
        queryClient
          .ensureQueryData(trpc.expense.loadDetail.queryOptions({ expenseId: deps.copyId ?? params.expenseId }))
          .catch(error => throwIfNotFound(error)),
      );
    }
    return Promise.all(promises);
  },
  preload: false,
});

function RouteComponent() {
  const navigate = Route.useNavigate();
  const { expenseId } = Route.useParams();
  const { isCopy, copyId } = Route.useLoaderDeps();
  const isCreate = expenseId === 'create';
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const existingExpenseQuery = useQuery(
    trpc.expense.loadDetail.queryOptions(
      { expenseId: copyId ?? expenseId },
      { enabled: !isCreate || isCopy, refetchOnMount: false, refetchOnReconnect: false, refetchOnWindowFocus: false },
    ),
  );
  const createExpenseMutation = useMutation(trpc.expense.save.mutationOptions({ onSuccess: () => void form.reset() }));

  const form = useAppForm({
    ...createEditExpenseFormOptions,
    listeners: {
      onChangeDebounceMs: 700,
      onChange: ({ fieldApi }) => {
        if (fieldApi.name.startsWith('history')) return;
        if (fieldApi.name.startsWith('ui')) return;
        pushHistory(form, [fieldApi.name as TrackableFieldName]);
      },
      onBlurDebounceMs: 200,
      onBlur: ({ fieldApi }) => {
        const fieldName = fieldApi.name as DeepKeys<ExpenseFormData>;
        if (fieldName === 'shopName') triggerFetchShopDetail(fieldApi.state.value);
      },
    },
    validators: {
      onSubmitAsync: async ({ value, signal }): Promise<any> => {
        signal.onabort = () => queryClient.cancelQueries({ queryKey: trpc.expense.save.mutationKey() });
        const { billedAt, geolocation, ui, history, ...otherValues } = value;
        const formError = await handleFormMutateAsync(
          createExpenseMutation.mutateAsync({
            expenseId: isCreate ? null : expenseId,
            ...otherValues,
            latitude: geolocation?.latitude ?? null,
            longitude: geolocation?.longitude ?? null,
            geoAccuracy: geolocation?.accuracy ?? null,
            billedAt: billedAt.toISOString(),
          }),
        );
        if (formError) return formError;
        await invalidateAndRedirectBackToList({
          expenseId,
          navigate,
          optionsCreated: [value.account?.value, value.category?.value].includes(null),
          billedAt,
        });
      },
    },
  });
  const { createAdjustment } = useAdjustmentCallbacks(form);

  const shopDetailPickerRef = useShopDetailPickerRef();
  const triggerFetchShopDetail = useCallback(
    (shopName?: string | null) => {
      const source = form.getFieldValue('ui.shopDetailSource');
      if (source !== 'user') {
        shopName ??= form.getFieldValue('shopName');
        if (shopName) shopDetailPickerRef.current?.fetchShopDetail({ shopName });
      }
    },
    [form, shopDetailPickerRef],
  );

  useEffect(() => {
    if (existingExpenseQuery.isSuccess && existingExpenseQuery.data) {
      const formData = mapExpenseDetailToForm(existingExpenseQuery.data, optionsData, { isCopy });
      form.reset(formData, { keepDefaultValues: isCopy });
    }
  }, [existingExpenseQuery.isSuccess, existingExpenseQuery.isError, isCopy]);

  return (
    <div className='mx-auto max-w-md'>
      <div className='col-span-full'>
        <PageHeader title={(isCreate ? 'Create' : 'Edit') + ' expense'}>
          <UndoRedoButtons form={form} />
        </PageHeader>
      </div>
      <div className='h-4'></div>
      <form.AppForm>
        <Outlet />
        <ShopDetailPicker
          ref={shopDetailPickerRef}
          optionsData={optionsData}
          onFinalized={data => {
            const { accountOptions, categoryOptions } = optionsData;
            const { accountId, categoryId, isGstExcluded, serviceChargeBps } = data;
            if (accountId) {
              form.setFieldValue(
                'account',
                accountOptions.find(({ value }) => value === accountId),
                { dontUpdateMeta: true },
              );
            }
            if (categoryId) {
              form.setFieldValue(
                'category',
                categoryOptions.find(({ value }) => value === categoryId),
                { dontUpdateMeta: true },
              );
            }
            if (serviceChargeBps) {
              createAdjustment({ special: SERVICE_CHARGE_NAME, rateBps: serviceChargeBps, dontUpdateMeta: true });
            }
            if (isGstExcluded) {
              createAdjustment({ special: GST_NAME, dontUpdateMeta: true });
            }
            form.setFieldValue('ui.shopDetailSource', 'autocomplete');
            pushHistory(form, ['account', 'category', 'adjustments']);
          }}
        />
        <DirtyFormBlockModel mainRouteId={Route.id} />
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

const applyHistory = (form: ExpenseFormApi, sourceKey: 'past' | 'future') => {
  const { history, ui, ...currentValues } = form.state.values;
  const targetKey: 'past' | 'future' = sourceKey === 'future' ? 'past' : 'future';
  const source = [...history[sourceKey]];
  const target = [...history[targetKey]];

  if (source.length === 0) return;

  const actions = source.pop();
  if (!actions) return;

  const inverseActions: HistoryEntry[] = [];

  for (const action of actions) {
    const fieldName = action.name as DeepKeys<ExpenseFormData>;
    const currentValue = form.getFieldValue(fieldName);

    inverseActions.push({ name: fieldName, value: currentValue });
    form.setFieldValue(fieldName, action.value, SET_VAL_ONLY);
  }

  form.setFieldValue(
    'history',
    {
      past: sourceKey === 'past' ? source : [...target, inverseActions],
      future: sourceKey === 'future' ? source : [...target, inverseActions],
      lastValues: currentValues,
    },
    SET_VAL_ONLY,
  );
};

function UndoRedoButtons({ form }: { form: ExpenseFormApi }) {
  const handleUndo = useCallback(() => applyHistory(form, 'past'), [form]);
  const handleRedo = useCallback(() => applyHistory(form, 'future'), [form]);

  return (
    <PageHeader.RightSection>
      <form.Subscribe
        selector={state => [state.values.history.past.length === 0, state.values.history.future.length === 0]}
      >
        {([cantUndo, cantRedo]) => (
          <div className='flex flex-row gap-2'>
            <button className='btn btn-square btn-sm btn-ghost' disabled={cantUndo} onClick={handleUndo}>
              <Undo />
            </button>
            <button className='btn btn-square btn-sm btn-ghost' disabled={cantRedo} onClick={handleRedo}>
              <Redo />
            </button>
          </div>
        )}
      </form.Subscribe>
    </PageHeader.RightSection>
  );
}
