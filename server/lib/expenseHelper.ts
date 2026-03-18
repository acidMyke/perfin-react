export type ExpenseItemForCalculation = {
  id: string;
  isDeleted?: boolean | null | undefined;
  quantity: number;
  priceCents: number;
};

export type ExpenseAdjustmentForCalculation = {
  id: string;
  isDeleted?: boolean | null | undefined;
  amountCents?: number;
  rateBps?: number | null;
  expenseItemId?: string | null;
};

export type ExpenseDetailForCalculation = {
  specifiedAmountCents: number;
  items: ExpenseItemForCalculation[];
  adjustments: ExpenseAdjustmentForCalculation[];
};

export type ItemCalculationResult = {
  /** Before Adjustments */
  grossTotalCents: number;
  /** Amount for each adjustments: [adjustmentId, amountInCent] */
  adjustmentCents: [string, number][];
  /** After Adjustments */
  netTotalCents: number;
};

export type ExpenseCalculationResult = ItemCalculationResult & {
  /** Individual item result */
  itemResults: Map<string, ItemCalculationResult>;
};

export function calculateExpense(detail: ExpenseDetailForCalculation): ExpenseCalculationResult {
  const { specifiedAmountCents, items, adjustments } = detail;

  const isItemizedExpense = items.length > 0;
  let expenseGrossTotal = 0;
  const itemResultsMap = new Map<string, ItemCalculationResult>();

  if (isItemizedExpense) {
    // Itemized bill. Ignore specifiedAmountCents
    for (const item of items) {
      if (item.isDeleted) continue;
      const { id, quantity, priceCents } = item;
      const gross = quantity * priceCents;
      expenseGrossTotal += gross;

      itemResultsMap.set(id, {
        grossTotalCents: gross,
        netTotalCents: gross,
        adjustmentCents: [],
      });
    }
  } else {
    // Non-itemized bill. Just grossTotalCents then adjustments
    expenseGrossTotal = specifiedAmountCents;
  }

  let expenseNetTotal = expenseGrossTotal;
  const expenseAdjustments: [string, number][] = [];

  for (const adjustment of adjustments) {
    if (adjustment.isDeleted) continue;
    const { id, rateBps, amountCents, expenseItemId } = adjustment;

    if (rateBps == null) {
      // Flat adjustment
      const amount = amountCents ?? 0;
      expenseNetTotal += amount;
      expenseAdjustments.push([id, amount]);
      continue;
    }

    // Rate adjustment: Basis Points (10000 bps = 100%)
    if (!isItemizedExpense) {
      // Base amount from net total
      const adjAmount = Math.round((expenseNetTotal * rateBps) / 100_00);
      expenseNetTotal += adjAmount;
      expenseAdjustments.push([id, adjAmount]);
      continue;
    }

    let totalAdjAmountForThisRate = 0;

    if (expenseItemId) {
      const itemResult = itemResultsMap.get(expenseItemId);
      if (itemResult) {
        const adjAmount = Math.round((itemResult.netTotalCents * rateBps) / 100_00);
        itemResult.adjustmentCents.push([id, adjAmount]);
        itemResult.netTotalCents += adjAmount;
        totalAdjAmountForThisRate += adjAmount;
      }
    } else {
      for (const itemResult of itemResultsMap.values()) {
        const adjAmount = Math.round((itemResult.netTotalCents * rateBps) / 100_00);
        itemResult.adjustmentCents.push([id, adjAmount]);
        itemResult.netTotalCents += adjAmount;
        totalAdjAmountForThisRate += adjAmount;
      }
    }

    expenseNetTotal += totalAdjAmountForThisRate;
    expenseAdjustments.push([id, totalAdjAmountForThisRate]);
  }

  return {
    itemResults: itemResultsMap,
    grossTotalCents: expenseGrossTotal,
    netTotalCents: expenseNetTotal,
    adjustmentCents: expenseAdjustments,
  };
}
