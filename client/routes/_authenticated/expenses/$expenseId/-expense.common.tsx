import { formOptions, type AppFieldExtendedReactFormApi, type FormOptions } from '@tanstack/react-form';
import { type RouterOutputs } from '../../../../trpc';
import { useAppForm, useFormContext } from '../../../../components/Form';
import {
  calculateExpense,
  calculateExpenseItem,
  type ExpenseItemForCalculation,
  type ExpenseSurchargeOption,
} from '../../../../../server/lib/expenseHelper';

export type ExpenseOptions = RouterOutputs['expense']['loadOptions'];
export type ExpenseDetail = RouterOutputs['expense']['loadDetail'];
export type ExpenseItem = ExpenseDetail['items'][number];
export type ExpenseRefund = ExpenseDetail['refunds'][number];

export function defaultExpenseItem(): ExpenseItem {
  return {
    id: 'create',
    name: '',
    isDeleted: false,
    priceCents: 0,
    quantity: 1,
    expenseRefund: null,
  };
}

type CalculateExpectedOption = ExpenseItemForCalculation & ExpenseSurchargeOption;

export function defaultExpenseRefund(option?: CalculateExpectedOption): ExpenseRefund {
  let expectedAmountCents = 0;
  if (option) {
    expectedAmountCents = calculateExpenseItem(option, option).grossAmountCents;
  }
  return {
    id: 'create',
    source: '',
    expectedAmountCents,
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

    let isItemsSubpage = detail.items.length > 2;
    if (!isItemsSubpage) {
      for (const refund of detail.refunds) {
        if (refund.expenseItemId !== null) {
          isItemsSubpage = true;
        }
      }
    }

    return {
      ui: {
        isItemsSubpage,
      },
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
      ui: {
        isItemsSubpage: false,
      },
      description: undefined,
      amountCents: 0,
      billedAt: new Date(),
      account: undefined,
      category: undefined,
      geolocation: undefined,
      shopName: undefined,
      shopMall: undefined,
      additionalServiceChargePercent: null,
      isGstExcluded: null,
      items: [defaultExpenseItem()],
      refunds: [],
    };
  }
}

export const createEditExpenseFormOptions = formOptions({ defaultValues: mapExpenseDetailToForm() });
export const currencyNumberFormat = new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' });

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
