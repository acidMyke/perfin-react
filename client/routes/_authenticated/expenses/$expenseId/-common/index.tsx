import {
  formOptions,
  type AppFieldExtendedReactFormApi,
  type DeepKeys,
  type DeepValue,
  type FormOptions,
} from '@tanstack/react-form';
import { queryClient, trpc, type RouterInputs, type RouterOutputs } from '#client/trpc';
import { useAppForm, useFormContext } from '#components/Form';
import { calculateExpense, GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';
import type { UseNavigateResult } from '@tanstack/react-router';
import { generateId } from '#client/utils';

export type ExpenseOptions = RouterOutputs['expense']['loadOptions'];
export type LoadExpenseDetailResponse = RouterOutputs['expense']['loadDetail'];
export type SaveExpenseDetailPayload = RouterInputs['expense']['save'];
export type ExpenseItem = SaveExpenseDetailPayload['items'][number];
export type ExpenseAdjustment = SaveExpenseDetailPayload['adjustments'][number];
export type InferredShopDetail = RouterOutputs['expense']['inferShopDetail'];

export function defaultExpenseItem(priceCents?: number): ExpenseItem {
  return {
    id: generateId(),
    name: '',
    isDeleted: false,
    priceCents: priceCents ?? 0,
    quantity: 1,
  };
}

export function defaultExpenseAdjustment(
  options: Partial<Pick<ExpenseAdjustment, 'expenseItemId' | 'name'>>,
): ExpenseAdjustment {
  const adjustment: ExpenseAdjustment = {
    id: generateId(),
    name: '',
    isDeleted: false,
    amountCents: 0,
  };

  if (options.expenseItemId) {
    adjustment.rateBps = 100_00;
    adjustment.expenseItemId = options.expenseItemId;
  }
  if (options.name === GST_NAME) {
    adjustment.rateBps = 9_00;
  }
  if (options.name === SERVICE_CHARGE_NAME) {
    adjustment.rateBps = 10_00;
  }

  return adjustment;
}

export const MAX_ITEMS_IN_MAIN = 2;
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
        isCurrentLocationError: false,
        shouldInferShopDetail: true,
        calculateResult: calculateExpense({ specifiedAmountCents: 0, items: [], adjustments: [] }),
      },
      description: undefined,
      billedAt: new Date(),
      account: undefined,
      category: undefined,
      type: undefined as 'online' | 'physical' | undefined,
      geolocation: undefined,
      shopName: undefined,
      shopMall: undefined,
      isDeleted: false,
      specifiedAmountCents: 0,
      items: [] as ExpenseItem[],
      adjustments: [] as ExpenseAdjustment[],
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

export type TGetExpenseFormField = <TField extends DeepKeys<ExpenseFormData>>(
  field: TField,
) => DeepValue<ExpenseFormData, TField>;

export function useExpenseForm() {
  const form = useFormContext();
  return form as unknown as TExpenseForm;
}

export function calculateExpenseForm(form: TExpenseForm) {
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

export function createItemCallbacks(form: TExpenseForm, expenseId: string, navigate: UseNavigateResult<string>) {
  return {
    onAddClick: (length: number) => {
      const specifiedAmountCents = form.getFieldValue('specifiedAmountCents');
      const calculatedTotal = form.getFieldValue('ui.calculateResult.grossTotalCents');
      const nextItemPrice = Math.max(0, length === 0 ? specifiedAmountCents : specifiedAmountCents - calculatedTotal);
      form.pushFieldValue('items', defaultExpenseItem(nextItemPrice));
      if (length >= MAX_ITEMS_IN_MAIN) {
        navigate({
          to: '/expenses/$expenseId/items/$indexStr',
          params: { expenseId, indexStr: length.toString() },
        });
      }
      calculateExpenseForm(form);
    },
    onRemoveClick: (itemIndex: number, length: number) => {
      if (length <= MAX_ITEMS_IN_MAIN + 1) {
        navigate({
          to: '/expenses/$expenseId',
          params: { expenseId },
        });
      } else {
        navigate({
          to: '/expenses/$expenseId/items/$indexStr',
          params: { expenseId, indexStr: (itemIndex - 1).toString() },
        });
      }
      form.removeFieldValue('items', itemIndex);
      calculateExpenseForm(form);
    },
  };
}
