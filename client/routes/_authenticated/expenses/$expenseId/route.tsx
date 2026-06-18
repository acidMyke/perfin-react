import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { PageHeader } from '#components/PageHeader';
import { useAppForm } from '#components/Form';
import { queryClient, trpc, throwIfNotFound, handleFormMutateAsync } from '#client/trpc';
import { useSuspenseQuery, useQuery, useMutation } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import {
  createEditExpenseFormOptions,
  invalidateAndRedirectBackToList,
  mapExpenseDetailToForm,
  type ExpenseFormData,
  useAdjustmentCallbacks,
  type ExpenseFormApi,
} from './-common';
import type { DeepKeys, UpdateMetaOptions } from '@tanstack/react-form';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { ShopDetailPicker, useShopDetailPickerRef } from './-common/ShopDetailPicker';
import { ShopNameMallPicker, useShopNameMallPickerRef } from './-common/ShopPicker';
import { DirtyFormBlockModel } from './-common/DirtyFormBlockModel';
import { Redo, Undo } from 'lucide-react';

const SET_VAL_ONLY: UpdateMetaOptions = { dontValidate: true, dontRunListeners: true, dontUpdateMeta: true };

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
      onChange: ({ fieldApi, formApi }) => {
        const fieldName = fieldApi.name as DeepKeys<ExpenseFormData>;
        if (fieldName.startsWith('history')) return;
        if (fieldName.startsWith('ui')) return;
        if (/(geolocation.*)/.test(fieldName)) triggerFetchShopSuggestion();

        // History updating
        let { lastFieldName, past } = formApi.getFieldValue('history');
        const { history, ui, ...currentValues } = formApi.state.values;

        if (lastFieldName !== fieldName) {
          // @ts-ignore
          const prevValue = formApi.getFieldValue(`history.lastValues.${fieldName}`);
          past = [...past, { name: fieldName, value: prevValue }];
        }

        formApi.setFieldValue(
          'history',
          { past, future: [], lastValues: currentValues, lastFieldName: fieldName },
          SET_VAL_ONLY,
        );
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
            expenseId,
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
          optionsCreated: [value.account?.value, value.category?.value].includes('create'),
          billedAt,
        });
      },
    },
  });
  const { createAdjustment } = useAdjustmentCallbacks(form);
  const shopNameMallPickerRef = useShopNameMallPickerRef();
  const triggerFetchShopSuggestion = useCallback(
    (param?: { latitude: number; longitude: number }) => {
      if (form.getFieldValue('ui.shouldFetchShopSuggestion')) {
        if (!param) {
          const { latitude, longitude } = form.getFieldValue('geolocation');
          if (latitude && longitude) {
            shopNameMallPickerRef.current?.fetchShopSuggestions({ latitude, longitude });
          }
        } else {
          shopNameMallPickerRef.current?.fetchShopSuggestions(param);
        }
      }
    },
    [form, shopNameMallPickerRef],
  );

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

  useEffect(() => {
    if (isCreate) {
      form.setFieldValue('billedAt', new Date(), { dontUpdateMeta: true });
    }
  }, [isCreate, form]);

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
        <ShopNameMallPicker
          ref={shopNameMallPickerRef}
          onTryAgainClick={() => form.setFieldValue('ui.shouldFetchShopSuggestion', true)}
          onFinalized={data => {
            const { shopMall, shopName } = data;
            if (shopMall) {
              form.setFieldValue('shopMall', shopMall, { dontValidate: true });
            }
            if (shopName) {
              form.setFieldValue('shopName', shopName, { dontValidate: true });
              triggerFetchShopDetail(shopName);
            }
          }}
        />
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

function UndoRedoButtons({ form }: { form: ExpenseFormApi }) {
  const handleUndo = useCallback(() => {
    const { past, future } = form.getFieldValue('history');
    if (past.length === 0) return;
    const lastAction = past.pop();
    if (!lastAction) return;
    const fieldName = lastAction.name as DeepKeys<ExpenseFormData>;
    const { history, ui, ...currentValues } = form.state.values;
    const fieldValue = form.getFieldValue(fieldName);
    form.setFieldValue(
      'history',
      {
        past: [...past],
        future: [...future, { name: fieldName, value: fieldValue }],
        lastValues: currentValues,
        lastFieldName: past.at(-1)?.name ?? null,
      },
      SET_VAL_ONLY,
    );
    // @ts-ignore
    form.setFieldValue(fieldName, lastAction.value, SET_VAL_ONLY);
  }, [form]);

  const handleRedo = useCallback(() => {
    const { past, future } = form.getFieldValue('history');
    if (future.length === 0) return;
    const nextAction = future.pop();
    if (!nextAction) return;
    const fieldName = nextAction.name as DeepKeys<ExpenseFormData>;
    const { history, ui, ...currentValues } = form.state.values;
    const fieldValue = form.getFieldValue(fieldName);
    form.setFieldValue(
      'history',
      {
        past: [...past, { name: fieldName, value: fieldValue }],
        future: [...future],
        lastValues: currentValues,
        lastFieldName: fieldName,
      },
      SET_VAL_ONLY,
    );
    // @ts-ignore
    form.setFieldValue(fieldName, nextAction.value, SET_VAL_ONLY);
  }, [form]);

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
