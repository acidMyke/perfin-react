export type ExpenseSurchargeOption = {
  additionalServiceChargePercent?: number | null | undefined;
  isGstExcluded?: boolean | null | undefined;
};

function applyExpenseSurcharge(amountCents: number, surchargeOption: ExpenseSurchargeOption) {
  const { additionalServiceChargePercent, isGstExcluded } = surchargeOption;
  if (additionalServiceChargePercent) {
    amountCents = Math.floor(amountCents * (additionalServiceChargePercent / 100));
  }
  if (isGstExcluded) {
    amountCents = Math.floor(amountCents * 0.09);
  }
  return amountCents;
}

export type ExpenseDetailForCalculation = ExpenseSurchargeOption & {
  items: {
    isDeleted?: boolean | null | undefined;
    quantity: number;
    priceCents: number;
  }[];
  refunds: {
    isDeleted?: boolean | null | undefined;
    expectedAmountCents: number;
    actualAmountCents: number | null | undefined;
  }[];
};

export function calculateExpense(detail: ExpenseDetailForCalculation) {
  const { items, refunds } = detail;
  let itemCostSumCents = items.reduce(
    (sumCents, { isDeleted, quantity, priceCents }) => (isDeleted ? sumCents : sumCents + quantity * priceCents),
    0,
  );

  itemCostSumCents = applyExpenseSurcharge(itemCostSumCents, detail);

  const { expectedRefundSumCents, minRefundSumCents } = refunds?.reduce(
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
    itemCostSumCents,
    expectedRefundSumCents,
    minRefundSumCents,
    /** For budgeting and dashboard reporting */
    amountCents: itemCostSumCents - minRefundSumCents,

    itemCostSum: itemCostSumCents / 100,
    expectedRefundSum: expectedRefundSumCents / 100,
    minRefundSum: minRefundSumCents / 100,
    amount: (itemCostSumCents - minRefundSumCents) / 100,
  };
}

export type ExpenseItemForCalculation = {
  item: ExpenseDetailForCalculation['items'][number];
  refund?: ExpenseDetailForCalculation['refunds'][number];
};

export function calculateExpenseItem({ item }: ExpenseItemForCalculation, surchargeOption?: ExpenseSurchargeOption) {
  const { priceCents, quantity } = item;
  const subtotalBeforeFeeCents = priceCents * quantity;
  const subtotalCents = surchargeOption
    ? applyExpenseSurcharge(subtotalBeforeFeeCents, surchargeOption)
    : subtotalBeforeFeeCents;

  return {
    expectedAmountCents: subtotalCents,
    expectedAmount: subtotalCents / 100,
  };
}
