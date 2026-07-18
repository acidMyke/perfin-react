import {
  formOptions,
  type AppFieldExtendedReactFormApi,
  type DeepKeys,
  type DeepValue,
  type FormOptions,
  type UpdateMetaOptions,
} from '@tanstack/react-form';
import { queryClient, trpc, type RouterInputs, type RouterOutputs } from '#client/trpc';
import { useAppForm, useFormContext } from '#components/Form';
import { calculateExpense, GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import type { UseNavigateResult } from '@tanstack/react-router';
import { generateId } from '#client/utils';
import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';

export type ExpenseOptions = RouterOutputs['expense']['loadOptions'];
export type LoadExpenseDetailResponse = RouterOutputs['expense']['loadDetail'];
export type SaveExpenseDetailPayload = RouterInputs['expense']['save'];
export type ExpenseItem = LoadExpenseDetailResponse['items'][number];
export type ExpenseAdjustment = LoadExpenseDetailResponse['adjustments'][number];
export type InputSource = null | 'user' | 'autocomplete';

type NullableValueExpenseOptions = {
  [Key in keyof ExpenseOptions]: {
    [InnerKey in keyof ExpenseOptions[Key][number]]: InnerKey extends 'value'
      ? ExpenseOptions[Key][number][InnerKey] | null
      : ExpenseOptions[Key][number][InnerKey];
  }[];
};

export function defaultExpenseItem(priceCents?: number): ExpenseItem {
  return {
    id: generateId(),
    name: '',
    isDeleted: false,
    priceCents: priceCents ?? 0,
    quantity: 1,
  };
}

export function defaultExpenseAdjustment(): ExpenseAdjustment {
  return {
    id: generateId(),
    name: '',
    isDeleted: false,
    amountCents: 0,
    rateBps: null,
    expenseItemId: null,
  };
}

export const MAX_ITEMS_IN_MAIN = 2;

function processApiResponse(
  detail: LoadExpenseDetailResponse,
  options: NullableValueExpenseOptions,
  param?: { isCopy: boolean },
) {
  const { accountOptions, categoryOptions } = options;
  const { billedAt, accountId, categoryId, latitude, longitude, geoAccuracy, ...rest } = detail;
  const account = accountId ? accountOptions.find(({ value }) => value === accountId) : undefined;
  const category = categoryId ? categoryOptions.find(({ value }) => value === categoryId) : undefined;

  if (param?.isCopy) {
    const remappedItemId = new Map<string, string>();
    rest.items = rest.items.map(item => {
      const id = generateId();
      remappedItemId.set(item.id, id);
      return { ...item, id };
    });
    rest.adjustments = rest.adjustments.map(adjustment => ({
      ...adjustment,
      id: generateId(),
      expenseItemId: adjustment.expenseItemId && remappedItemId.get(adjustment.expenseItemId)!,
    }));
  }

  return {
    billedAt: param?.isCopy ? new Date() : new Date(billedAt),
    account,
    category,
    geolocation: { latitude, longitude, accuracy: geoAccuracy, isError: false },
    ...rest,
  };
}

function createNewExpenseForm() {
  return {
    version: 0,
    amountCents: 0,
    billedAt: new Date(),
    account: undefined,
    category: undefined,
    type: 'online' as 'online' | 'physical',
    geolocation: { latitude: null, longitude: null, accuracy: null, isError: false },
    shopName: null,
    shopMall: null,
    isDeleted: false,
    specifiedAmountCents: 0,
    items: [] as ExpenseItem[],
    adjustments: [] as ExpenseAdjustment[],
  } satisfies ReturnType<typeof processApiResponse> | { type: undefined };
}

export interface HistoryEntry {
  name: string;
  value: any;
}

export type CurrentCoordResult =
  | { isSuccess: true; latitude: number; longitude: number; accuracy: number }
  | { isSuccess: false; code: number; message: string };

export function mapExpenseDetailToForm(
  detail?: LoadExpenseDetailResponse,
  options?: ExpenseOptions,
  param?: { isCopy: boolean },
) {
  const isEmptyCreate = !detail || !options;
  const formValues = isEmptyCreate ? createNewExpenseForm() : processApiResponse(detail, options, param);

  return {
    ...formValues,
    ui: {
      // copying is also creating
      isCreate: isEmptyCreate || param?.isCopy,
      shouldInferShopDetail: isEmptyCreate,
      shouldFetchShopSuggestion: isEmptyCreate,
      shopDetailSource: isEmptyCreate ? null : ('user' as InputSource),
      calculateResult: calculateExpense(formValues),
      currentCoordResult: undefined as CurrentCoordResult | undefined,
    },
    history: {
      past: [] as HistoryEntry[][],
      future: [] as HistoryEntry[][],
      lastValues: formValues,
    },
  };
}

export type ExpenseFormData = ReturnType<typeof mapExpenseDetailToForm>;
export const createEditExpenseFormOptions = formOptions({ defaultValues: mapExpenseDetailToForm() });

export type ExpenseFormApi =
  typeof createEditExpenseFormOptions extends FormOptions<
    infer TFormData,
    infer TOnMount,
    infer TOnChange,
    infer TOnChangeAsync,
    infer TOnBlur,
    infer TOnBlurAsync,
    infer TOnSubmit,
    infer TOnSubmitAsync,
    infer TOnDynamic,
    infer TOnDynamicAsync,
    infer TOnServer,
    infer TSubmitMeta
  >
    ? ReturnType<
        typeof useAppForm<
          TFormData,
          TOnMount,
          TOnChange,
          TOnChangeAsync,
          TOnBlur,
          TOnBlurAsync,
          TOnSubmit,
          TOnSubmitAsync,
          TOnDynamic,
          TOnDynamicAsync,
          TOnServer,
          TSubmitMeta
        >
      > extends AppFieldExtendedReactFormApi<
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        any,
        infer TComponents,
        infer TFormComponents
      >
      ? AppFieldExtendedReactFormApi<
          TFormData,
          TOnMount,
          TOnChange,
          TOnChangeAsync,
          TOnBlur,
          TOnBlurAsync,
          TOnSubmit,
          TOnSubmitAsync,
          TOnDynamic,
          TOnDynamicAsync,
          TOnServer,
          TSubmitMeta,
          TComponents,
          TFormComponents
        >
      : never
    : never;

export type TGetExpenseFormField = <TField extends DeepKeys<ExpenseFormData>>(
  field: TField,
) => DeepValue<ExpenseFormData, TField>;

export function useExpenseForm() {
  const form = useFormContext();
  return form as unknown as ExpenseFormApi;
}

export function calculateExpenseForm(form: ExpenseFormApi) {
  const specifiedAmountCents = form.getFieldValue('specifiedAmountCents');
  const items = form.getFieldValue('items');
  const adjustments = form.getFieldValue('adjustments');

  const result = calculateExpense({ specifiedAmountCents, items, adjustments });
  form.setFieldValue('ui.calculateResult', result);
}

type InvalidateAndRedirectBackToListOptions = {
  navigate: UseNavigateResult<any>;
  billedAt: Date;
  optionsCreated: boolean;
  expenseId: string;
};

export async function invalidateAndRedirectBackToList(opts: InvalidateAndRedirectBackToListOptions) {
  const { navigate, billedAt, optionsCreated, expenseId } = opts;

  const monthYear = { month: billedAt.getMonth(), year: billedAt.getFullYear() };
  const promises = [queryClient.refetchQueries(trpc.expense.list.queryFilter(monthYear))];
  if (expenseId !== 'create') {
    promises.push(queryClient.invalidateQueries(trpc.expense.loadDetail.queryFilter({ expenseId })));
  }
  if (optionsCreated) {
    promises.push(queryClient.invalidateQueries(trpc.expense.loadOptions.queryFilter()));
  }
  await Promise.all(promises);
  return navigate({ to: '/expenses', search: monthYear });
}

export function setCurrentLocation(form?: ExpenseFormApi): Promise<CurrentCoordResult> {
  if (!navigator.geolocation) {
    const result = { isSuccess: false, code: 0, message: 'Geolocation is not supported by this browser.' } as const;
    form?.setFieldValue('ui.currentCoordResult', result);
    return Promise.resolve(result);
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude, accuracy } = coords;
        form?.setFieldValue('ui.currentCoordResult', { isSuccess: true, latitude, longitude, accuracy });
        resolve({ isSuccess: true, latitude, longitude, accuracy });
      },
      e => {
        const { code, message } = e;
        form?.setFieldValue('ui.currentCoordResult', { isSuccess: false, code, message });
        resolve({ isSuccess: false, code, message });
      },
      {},
    );
  });
}

export const useItemCallbacks = (form: ExpenseFormApi, expenseId: string, navigate: UseNavigateResult<string>) =>
  useMemo(
    () => ({
      createItem: (length: number, isSubpage?: true) => {
        const specifiedAmountCents = form.getFieldValue('specifiedAmountCents');
        const calculatedTotal = form.getFieldValue('ui.calculateResult.grossTotalCents');
        const nextItemPrice = Math.max(0, length === 0 ? specifiedAmountCents : specifiedAmountCents - calculatedTotal);
        form.pushFieldValue('items', defaultExpenseItem(nextItemPrice));
        if (length >= MAX_ITEMS_IN_MAIN) {
          navigate({
            to: '/expenses/$expenseId/items/$indexStr',
            params: { expenseId, indexStr: length.toString() },
            replace: isSubpage,
          });
        }
        calculateExpenseForm(form);
      },
      removeItem: (itemIndex: number, length: number, isSubpage?: true) => {
        if (isSubpage) {
          if (length <= MAX_ITEMS_IN_MAIN + 1) {
            navigate({
              to: '/expenses/$expenseId',
              params: { expenseId },
              replace: true,
            });
          } else {
            navigate({
              to: '/expenses/$expenseId/items/$indexStr',
              params: { expenseId, indexStr: (itemIndex - 1).toString() },
              replace: true,
            });
          }
        }
        form.removeFieldValue('items', itemIndex);
        calculateExpenseForm(form);
      },
    }),
    [form, expenseId, navigate],
  );

export type CreateAdjustmentOption = UpdateMetaOptions &
  (
    { special: typeof GST_NAME } | { special: typeof SERVICE_CHARGE_NAME; rateBps?: number } | { expenseItemId: string }
  );

export const useAdjustmentCallbacks = (form: ExpenseFormApi) =>
  useMemo(
    () => ({
      createAdjustment: (option?: CreateAdjustmentOption) => {
        const adjustment = defaultExpenseAdjustment();
        if (option) {
          if ('special' in option) {
            adjustment.name = option.special;
            adjustment.rateBps = option.special === GST_NAME ? 9_00 : (option.rateBps ?? 10_00);
          }
          if ('expenseItemId' in option) {
            adjustment.expenseItemId = option.expenseItemId;
            adjustment.rateBps = -100_00;
          }
        }
        form.pushFieldValue('adjustments', adjustment, option);
        calculateExpenseForm(form);
      },
      removeAdjustment: (adjustmentIndex: number) => {
        form.removeFieldValue('adjustments', adjustmentIndex);
        calculateExpenseForm(form);
      },
      toggleAdjustmentType: (adjustmentIndex: number, expenseItemId?: string | null) => {
        const formFieldKey = `ui.calculateResult.adjustmentResults[${adjustmentIndex}]` as const;
        const [, totalResult, itemizedResult] = form.getFieldValue(formFieldKey);
        const fieldPrefix = `adjustments[${adjustmentIndex}]` as const;
        const adjustment = form.getFieldValue(fieldPrefix);
        const { amountCents, rateBps } = (expenseItemId ? itemizedResult[expenseItemId] : null) ?? totalResult;
        if (adjustment.rateBps != null) {
          form.setFieldValue(`${fieldPrefix}.rateBps`, null);
          form.setFieldValue(`${fieldPrefix}.amountCents`, amountCents);
        } else {
          form.setFieldValue(`${fieldPrefix}.rateBps`, isNaN(rateBps) ? 0 : rateBps);
        }
        calculateExpenseForm(form);
      },
    }),
    [form],
  );

export const SET_VAL_ONLY: UpdateMetaOptions = { dontValidate: true, dontRunListeners: true, dontUpdateMeta: true };
export type TrackableFieldName = Exclude<
  DeepKeys<ExpenseFormData>,
  'ui' | 'history' | `ui${string}` | `history${string}`
>;
export function pushHistory(form: ExpenseFormApi, fieldNames: TrackableFieldName[]) {
  const { history, ui, ...currentValues } = form.state.values;
  let { past } = history;
  const lastPastEntry = history.past.at(-1);
  const lastFieldName = lastPastEntry?.length === 1 ? lastPastEntry[0].name : null;

  const actions: HistoryEntry[] = [];
  for (const fieldName of fieldNames) {
    if (fieldNames.length != 1 || lastFieldName !== fieldName) {
      const prevValue = form.getFieldValue(`history.lastValues.${fieldName}`);
      actions.push({ name: fieldName, value: prevValue });
    }
  }

  if (actions.length > 0) {
    form.setFieldValue('history', { past: [...past, actions], future: [], lastValues: currentValues }, SET_VAL_ONLY);
  }
}

export function useCompleteShopDetailMutation(form: ExpenseFormApi, optionsData: ExpenseOptions) {
  const { createAdjustment } = useAdjustmentCallbacks(form);
  const shopDetailMutation = useMutation(
    trpc.expense.getShopDetail.mutationOptions({
      onSuccess([shopDetail]) {
        if (!shopDetail) return;
        const { accountOptions, categoryOptions } = optionsData;
        const { accountId, categoryId, isGstExcluded, serviceChargeBps } = shopDetail;
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
      },
    }),
  );

  return {
    async mutateAsync(args?: { shopName: string }) {
      const shopName = args?.shopName ?? form.getFieldValue('shopName');
      if (!shopName) return;
      await shopDetailMutation.mutateAsync({ shopName });
    },
  };
}
