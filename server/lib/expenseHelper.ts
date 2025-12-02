export type ExpenseSurchargeOption = {
  additionalServiceChargePercent?: number | null | undefined;
  isGstExcluded?: boolean | null | undefined;
};

function applyExpenseSurcharge(netAmountCents: number, surchargeOption?: ExpenseSurchargeOption) {
  const { additionalServiceChargePercent, isGstExcluded } = surchargeOption ?? {};
  const serviceChargeCents = additionalServiceChargePercent
    ? Math.floor(netAmountCents * (additionalServiceChargePercent / 100))
    : 0;
  const gstCents = isGstExcluded ? Math.floor(netAmountCents * 0.09) : 0;

  return {
    grossAmountCents: netAmountCents + serviceChargeCents + gstCents,
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

export function calculateExpense(detail: ExpenseDetailForCalculation) {
  const { items, refunds } = detail;
  let { itemsSubtotalCents, itemBondedRefunds } = items.reduce(
    (result, { isDeleted, quantity, priceCents, expenseRefund }) => {
      if (isDeleted) return result;

      return {
        itemsSubtotalCents: result.itemsSubtotalCents + quantity * priceCents,
        itemBondedRefunds: expenseRefund ? [...result.itemBondedRefunds, expenseRefund] : result.itemBondedRefunds,
      };
    },
    { itemsSubtotalCents: 0, itemBondedRefunds: [] as ExpenseDetailForCalculation['refunds'] },
  );

  const { grossAmountCents, serviceChargeCents, gstCents } = applyExpenseSurcharge(itemsSubtotalCents, detail);

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
    itemsSubtotalCents,
    grossAmountCents,
    expectedRefundSumCents,
    minRefundSumCents,
    /** For budgeting and dashboard reporting */
    amountCents: grossAmountCents - minRefundSumCents,
    serviceChargeCents,
    gstCents,

    itemsSubtotal: itemsSubtotalCents / 100,
    grossAmount: grossAmountCents / 100,
    expectedRefundSum: expectedRefundSumCents / 100,
    minRefundSum: minRefundSumCents / 100,
    amount: (grossAmountCents - minRefundSumCents) / 100,
    serviceCharge: serviceChargeCents / 100,
    gst: gstCents / 100,
  };
}

export type ExpenseItemForCalculation = {
  item: ExpenseDetailForCalculation['items'][number];
  refund?: ExpenseDetailForCalculation['refunds'][number];
};

export function calculateExpenseItem({ item }: ExpenseItemForCalculation, surchargeOption?: ExpenseSurchargeOption) {
  const { priceCents, quantity } = item;
  const netAmountCents = priceCents * quantity;
  const { grossAmountCents, serviceChargeCents, gstCents } = applyExpenseSurcharge(netAmountCents, surchargeOption);

  return {
    netAmountCents,
    serviceChargeCents,
    gstCents,

    grossAmountCents,
    grossAmount: grossAmountCents / 100,
    serviceCharge: serviceChargeCents / 100,
    gst: gstCents / 100,
  };
}
