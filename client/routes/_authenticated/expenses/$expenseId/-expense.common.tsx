import { formOptions, type AppFieldExtendedReactFormApi, type FormOptions } from '@tanstack/react-form';
import { queryClient, trpc, type RouterOutputs } from '../../../../trpc';
import { useAppForm, useFormContext } from '../../../../components/Form';
import {
  calculateExpense,
  calculateExpenseItem,
  type ExpenseSurchargeOption,
} from '../../../../../server/lib/expenseHelper';
import type { UseNavigateResult } from '@tanstack/react-router';

export type ExpenseOptions = RouterOutputs['expense']['loadOptions'];
export type ExpenseDetail = RouterOutputs['expense']['loadDetail'];
export type ExpenseItem = ExpenseDetail['items'][number];
export type ExpenseRefund = ExpenseDetail['refunds'][number];
export type InferredShopDetail = RouterOutputs['expense']['inferShopDetail'];

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

type CalculateExpectedOption = ExpenseSurchargeOption & {
  item: Pick<ExpenseItem, 'priceCents' | 'quantity'>;
};

export function defaultExpenseRefund(option?: CalculateExpectedOption): ExpenseRefund {
  let expectedAmountCents = 0;
  if (option) {
    expectedAmountCents = calculateExpenseItem(option.item, option).grossAmountCents;
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

export function mapExpenseDetailToForm(detail?: ExpenseDetail, options?: ExpenseOptions, param?: { isCopy: boolean }) {
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
        isCreate: false,
        isItemsSubpage,
        shouldInferShopDetail: false,
        calculateResult: calculateExpense(rest),
      },
      billedAt: param?.isCopy ? new Date(billedAt) : new Date(),
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
        isCreate: true,
        isItemsSubpage: false,
        shouldInferShopDetail: true,
        calculateResult: calculateExpense({
          items: [],
          refunds: [],
          additionalServiceChargePercent: null,
          isGstExcluded: null,
        }),
      },
      description: undefined,
      billedAt: new Date(),
      account: undefined,
      category: undefined,
      geolocation: undefined,
      shopName: undefined,
      shopMall: undefined,
      additionalServiceChargePercent: null,
      isGstExcluded: null,
      isDeleted: false,
      items: [defaultExpenseItem()],
      refunds: [],
    };
  }
}

export type ExpenseFormData = ReturnType<typeof mapExpenseDetailToForm>;
export const createEditExpenseFormOptions = formOptions({ defaultValues: mapExpenseDetailToForm() });

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

export function calculateExpenseForm(form: TExpenseForm) {
  const items = form.getFieldValue('items');
  const refunds = form.getFieldValue('refunds');
  const additionalServiceChargePercent = form.getFieldValue('additionalServiceChargePercent');
  const isGstExcluded = form.getFieldValue('isGstExcluded');

  const result = calculateExpense({
    items,
    refunds,
    additionalServiceChargePercent,
    isGstExcluded,
  });

  form.setFieldValue('ui.calculateResult', result);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.expenseRefund) continue;
    const { grossAmountCents } = calculateExpenseItem(item, { additionalServiceChargePercent, isGstExcluded });
    form.setFieldValue(`items[${i}].expenseRefund.expectedAmountCents`, grossAmountCents);
  }
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
