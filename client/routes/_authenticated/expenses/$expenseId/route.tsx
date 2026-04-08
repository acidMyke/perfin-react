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
  setCurrentLocation,
} from './-common';
import type { DeepKeys } from '@tanstack/react-form';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import { ShopDetailPicker, useShopDetailPickerRef } from './-common/ShopDetailPicker';
import { ShopNameMallPicker, useShopNameMallPickerRef } from './-common/ShopPicker';

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
        const fieldName = fieldApi.name as DeepKeys<ExpenseFormData>;
        if (/(geolocation.*)/.test(fieldName)) triggerFetchShopSuggestion();
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
        const { billedAt, geolocation, ui, type, ...otherValues } = value;
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
      form.setFieldValue('billedAt', new Date());
      setCurrentLocation(form);
    }
  }, [isCreate, form]);

  return (
    <div className='mx-auto max-w-md'>
      <div className='col-span-full'>
        <PageHeader title={(isCreate ? 'Create' : 'Edit') + ' expense'} />
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
              form.setFieldValue('shopMall', shopMall);
            }
            if (shopName) {
              form.setFieldValue('shopName', shopName);
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
