import { formOptions, type AppFieldExtendedReactFormApi, type FormOptions } from '@tanstack/react-form';
import { queryClient, trpc, type RouterInputs, type RouterOutputs } from '../../../../trpc';
import { useAppForm, useFormContext } from '../../../../components/Form';
import { calculateExpense } from '../../../../../server/lib/expenseHelper';
import type { UseNavigateResult } from '@tanstack/react-router';
import { generateId } from '../../../../utils';

export type ExpenseOptions = RouterOutputs['expense']['loadOptions'];
export type LoadExpenseDetailResponse = RouterOutputs['expense']['loadDetail'];
export type SaveExpenseDetailPayload = RouterInputs['expense']['save'];
export type ExpenseItem = SaveExpenseDetailPayload['items'][number];
export type ExpenseAdjustment = SaveExpenseDetailPayload['adjustments'][number];
export type InferredShopDetail = RouterOutputs['expense']['inferShopDetail'];

export function defaultExpenseItem(): ExpenseItem {
  return {
    id: generateId(),
    name: '',
    isDeleted: false,
    priceCents: 0,
    quantity: 1,
  };
}

export function defaultExpenseAdjustment(item?: ExpenseItem): ExpenseAdjustment {
  const adjustment: ExpenseAdjustment = {
    id: generateId(),
    name: '',
    isDeleted: false,
    amountCents: 0,
  };

  if (item) {
    adjustment.expenseItemId = item.id;
    adjustment.rateBps = 100_00;
  }

  return adjustment;
}

export function mapExpenseDetailToForm(
  detail?: LoadExpenseDetailResponse,
  options?: ExpenseOptions,
  param?: { isCopy: boolean },
) {
  if (detail && options) {
    const { accountOptions, categoryOptions } = options;
    const { billedAt, accountId, categoryId, latitude, longitude, geoAccuracy, ...rest } = detail;
    const account = accountId ? accountOptions.find(({ value }) => value === accountId) : undefined;
    const category = categoryId ? categoryOptions.find(({ value }) => value === categoryId) : undefined;

    let isItemsSubpage = detail.items.length > 2;

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
        isItemsSubpage,
        isCurrentLocationError: false,
        shouldInferShopDetail: false,
        calculateResult: calculateExpense(detail),
      },
      billedAt: param?.isCopy ? new Date() : new Date(billedAt),
      account,
      category,
      geolocation: latitude !== null && longitude !== null ? { latitude, longitude, accuracy: geoAccuracy } : undefined,
      ...rest,
    };
  } else {
    return {
      ui: {
        isCreate: true,
        isItemsSubpage: false,
        isCurrentLocationError: false,
        shouldInferShopDetail: true,
        calculateResult: calculateExpense({ items: [], adjustments: [] }),
      },
      description: undefined,
      billedAt: new Date(),
      account: undefined,
      category: undefined,
      type: 'online' as const,
      geolocation: undefined,
      shopName: undefined,
      shopMall: undefined,
      isDeleted: false,
      items: [defaultExpenseItem()],
      adjustments: [],
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
  const adjustments = form.getFieldValue('adjustments');
  // const additionalServiceChargePercent = form.getFieldValue('additionalServiceChargePercent');
  // const isGstExcluded = form.getFieldValue('isGstExcluded');

  const result = calculateExpense({ items, adjustments });
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

export async function setCurrentLocation(form: TExpenseForm) {
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
