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

export type ExpenseOptions = RouterOutputs['expense']['loadOptions'];
export type LoadExpenseDetailResponse = RouterOutputs['expense']['loadDetail'];
export type SaveExpenseDetailPayload = RouterInputs['expense']['save'];
export type ExpenseItem = LoadExpenseDetailResponse['items'][number];
export type ExpenseAdjustment = LoadExpenseDetailResponse['adjustments'][number];
export type InputSource = null | 'user' | 'autocomplete';

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

function processApiResponse(detail: LoadExpenseDetailResponse, options: ExpenseOptions, param?: { isCopy: boolean }) {
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
    ui: {
      isCreate: false,
      isCurrentLocationError: false,
      shouldInferShopDetail: false,
      shopDetailSource: 'user' as InputSource,
      calculateResult: calculateExpense(detail),
    },
    billedAt: param?.isCopy ? new Date() : new Date(billedAt),
    account,
    category,
    geolocation: latitude !== null && longitude !== null ? { latitude, longitude, accuracy: geoAccuracy } : undefined,
    ...rest,
  };
}

export function mapExpenseDetailToForm(
  detail?: LoadExpenseDetailResponse,
  options?: ExpenseOptions,
  param?: { isCopy: boolean },
) {
  if (detail && options) {
    return processApiResponse(detail, options, param);
  } else {
    return {
      ui: {
        isCreate: true,
        isCurrentLocationError: false,
        shouldInferShopDetail: true,
        shopDetailSource: null,
        calculateResult: calculateExpense({ specifiedAmountCents: 0, items: [], adjustments: [] }),
      },
      version: 0,
      amountCents: 0,
      billedAt: new Date(),
      account: undefined,
      category: undefined,
      type: undefined as 'online' | 'physical' | undefined,
      geolocation: undefined,
      shopName: null,
      shopMall: null,
      isDeleted: false,
      specifiedAmountCents: 0,
      items: [] as ExpenseItem[],
      adjustments: [] as ExpenseAdjustment[],
    } satisfies ReturnType<typeof processApiResponse> | { type: undefined };
  }
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
  // TODO: update logic here to V2 logic

  // for (let i = 0; i < items.length; i++) {
  //   const item = items[i];
  //   if (!item.expenseRefund) continue;
  //   const { grossAmountCents } = calculateExpenseItem(item, { additionalServiceChargePercent, isGstExcluded });
  //   form.setFieldValue(`items[${i}].expenseRefund.expectedAmountCents`, grossAmountCents);
  // }
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

export async function setCurrentLocation(form: ExpenseFormApi) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const { latitude, longitude, accuracy } = coords;
        form.setFieldValue('geolocation', { latitude, longitude, accuracy });
        form.setFieldValue('ui.isCurrentLocationError', false);
      },
      () => {
        form.setFieldMeta('geolocation', meta => ({ ...meta, isTouched: true, isDirty: true }));
        form.setFieldValue('ui.isCurrentLocationError', true);
      },
    );
  }
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
    | { special: typeof GST_NAME }
    | { special: typeof SERVICE_CHARGE_NAME; rateBps?: number }
    | { expenseItemId: string }
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
      toggleAdjustmentType: (adjustmentIndex: number) => {
        const [, amountCents, rateBps] = form.getFieldValue(`ui.calculateResult.adjustmentCents[${adjustmentIndex}]`);
        const fieldPrefix = `adjustments[${adjustmentIndex}]` as const;
        const adjustment = form.getFieldValue(fieldPrefix);
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
