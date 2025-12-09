export type ExpenseSurchargeOption = {
  additionalServiceChargePercent?: number | null | undefined;
  isGstExcluded?: boolean | null | undefined;
};

function applyExpenseSurcharge(baseAmountCents: number, surchargeOption?: ExpenseSurchargeOption) {
  const { additionalServiceChargePercent, isGstExcluded } = surchargeOption ?? {};
  const serviceChargeCents = additionalServiceChargePercent
    ? Math.floor(baseAmountCents * (additionalServiceChargePercent / 100))
    : 0;
  const gstCents = isGstExcluded ? Math.floor(baseAmountCents * 0.09) : 0;

  return {
    grossAmountCents: baseAmountCents + serviceChargeCents + gstCents,
    serviceChargeCents,
    gstCents,
  };
}

export type ExpenseDetailForCalculation = ExpenseSurchargeOption & {
  items: {
    isDeleted?: boolean | null | undefined;
    quantity: number;
    priceCents: number;
    expenseRefund?:
      | null
      | undefined
      | {
          isDeleted?: boolean | null | undefined;
          expectedAmountCents: number;
          actualAmountCents: number | null | undefined;
        };
  }[];
  refunds: {
    isDeleted?: boolean | null | undefined;
    expectedAmountCents: number;
    actualAmountCents: number | null | undefined;
  }[];
};

type WithDollarFields<T extends Record<string, number>> = T & {
  [K in keyof T as K extends `${infer Name}Cents` ? Name : never]: number;
};

type CalcualeExpenseResult = {
  /** Price * Quantity */
  baseAmountCents: number;
  /** Price * Quantity + Surcharges */
  grossAmountCents: number;
  expectedRefundSumCents: number;
  /** Refunded */
  minRefundSumCents: number;
  /** Net amount: For budgeting and dashboard reporting */
  amountCents: number;
  /** Service charges */
  serviceChargeCents: number;
  /** Taxes */
  gstCents: number;
};

export function calculateExpense(detail: ExpenseDetailForCalculation): WithDollarFields<CalcualeExpenseResult> {
  const { items, refunds } = detail;
  let { baseAmountCents, itemBondedRefunds } = items.reduce(
    (result, { isDeleted, quantity, priceCents, expenseRefund }) => {
      if (isDeleted) return result;

      return {
        baseAmountCents: result.baseAmountCents + quantity * priceCents,
        itemBondedRefunds: expenseRefund ? [...result.itemBondedRefunds, expenseRefund] : result.itemBondedRefunds,
      };
    },
    { baseAmountCents: 0, itemBondedRefunds: [] as ExpenseDetailForCalculation['refunds'] },
  );

  const { grossAmountCents, serviceChargeCents, gstCents } = applyExpenseSurcharge(baseAmountCents, detail);

  const { expectedRefundSumCents, minRefundSumCents } = [...refunds, ...itemBondedRefunds].reduce(
    (result, { isDeleted, expectedAmountCents, actualAmountCents }) => {
      if (isDeleted) return result;

      return {
        expectedRefundSumCents: result.expectedRefundSumCents + expectedAmountCents,
        minRefundSumCents: result.minRefundSumCents + Math.min(expectedAmountCents, actualAmountCents ?? 0),
      };
    },
    { expectedRefundSumCents: 0, minRefundSumCents: 0 },
  );

  return {
    baseAmountCents,
    grossAmountCents,
    expectedRefundSumCents,
    minRefundSumCents,
    /** For budgeting and dashboard reporting */
    amountCents: grossAmountCents - minRefundSumCents,
    serviceChargeCents,
    gstCents,

    baseAmount: baseAmountCents / 100,
    grossAmount: grossAmountCents / 100,
    expectedRefundSum: expectedRefundSumCents / 100,
    minRefundSum: minRefundSumCents / 100,
    amount: (grossAmountCents - minRefundSumCents) / 100,
    serviceCharge: serviceChargeCents / 100,
    gst: gstCents / 100,
  };
}

type CalcualeExpenseItemResult = {
  /** Price * Quantity */
  baseAmountCents: number;
  /** Service charges */
  serviceChargeCents: number;
  /** Taxes */
  gstCents: number;
  /** Price * Quantity + Surcharges */
  grossAmountCents: number;
  /** Refunded */
  minRefundCents: number;
  /** Net amount: For budgeting and dashboard reporting */
  amountCents: number;
};

export function calculateExpenseItem(
  item: ExpenseDetailForCalculation['items'][number],
  surchargeOption?: ExpenseSurchargeOption,
): WithDollarFields<CalcualeExpenseItemResult> {
  const { priceCents, quantity, expenseRefund } = item;
  const baseAmountCents = priceCents * quantity;
  const { grossAmountCents, serviceChargeCents, gstCents } = applyExpenseSurcharge(baseAmountCents, surchargeOption);
  const minRefundCents = expenseRefund
    ? Math.min(expenseRefund.expectedAmountCents, expenseRefund.actualAmountCents ?? 0)
    : 0;

  return {
    baseAmountCents,
    serviceChargeCents,
    gstCents,
    grossAmountCents,
    minRefundCents,
    amountCents: grossAmountCents - minRefundCents,

    baseAmount: baseAmountCents / 100,
    serviceCharge: serviceChargeCents / 100,
    gst: gstCents / 100,
    grossAmount: grossAmountCents / 100,
    minRefund: minRefundCents / 100,
    amount: (grossAmountCents - minRefundCents) / 100,
  };
}
