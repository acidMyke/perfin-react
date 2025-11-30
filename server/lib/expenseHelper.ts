type ExpenseDetail = {
  additionalServiceChargePercent: number | null | undefined;
  isGstExcluded: boolean | null | undefined;
  items: {
    isDeleted: boolean | null | undefined;
    quantity: number;
    priceCents: number;
  }[];
  refunds: {
    isDeleted: boolean | null | undefined;
    expectedAmountCents: number;
    actualAmountCents: number | null | undefined;
  }[];
};

export function calculateExpense(detail: ExpenseDetail) {
  const { additionalServiceChargePercent, isGstExcluded, items, refunds } = detail;
  let itemCostSumCents = items.reduce(
    (sumCents, { isDeleted, quantity, priceCents }) => (isDeleted ? sumCents : sumCents + quantity * priceCents),
    0,
  );

  if (additionalServiceChargePercent) {
    itemCostSumCents = Math.floor(itemCostSumCents * (additionalServiceChargePercent / 100));
  }
  if (isGstExcluded) {
    itemCostSumCents = Math.floor(itemCostSumCents * 0.09);
  }

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
