import {
  formOptions,
  type AppFieldExtendedReactFormApi,
  type FormOptions,
  type ReactFormApi,
} from '@tanstack/react-form';
import type { RouterOutputs } from '../../../../trpc';
import { generateId } from '../../../../utils';
import { useAppForm, useFormContext } from '../../../../components/Form';

export type ExpenseOptions = RouterOutputs['expense']['loadOptions'];
export type ExpenseDetail = RouterOutputs['expense']['loadDetail'];
export type ExpenseItem = ExpenseDetail['items'][number];
export type ExpenseRefund = ExpenseDetail['refunds'][number];

export function defaultExpenseItem(): ExpenseItem {
  return {
    id: generateId(),
    name: '',
    isDeleted: false,
    priceCents: 0,
    quantity: 1,
    expenseRefundId: null,
  };
}

export function defaultExpenseRefund(): ExpenseRefund {
  return {
    id: generateId(),
    source: '',
    expectedAmountCents: 0,
    isDeleted: false,
    note: null,
    actualAmountCents: 0,
    confirmedAt: null,
    expenseItemId: null,
  };
}

export function mapExpenseDetailToForm(detail?: ExpenseDetail, options?: ExpenseOptions) {
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
      items: [defaultExpenseItem()],
    };
  }
}

export const createEditExpenseFormOptions = formOptions({ defaultValues: mapExpenseDetailToForm() });
export const currencyNumberFormat = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' });

type TUseAppForm = ReturnType<typeof useAppForm>;
type TExpenseForm =
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

export function useExpenseForm() {
  const form = useFormContext();
  return form as unknown as TExpenseForm;
}
