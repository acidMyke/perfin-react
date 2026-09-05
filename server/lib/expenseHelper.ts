export const GST_NAME = '_gst' as const;
export const SERVICE_CHARGE_NAME = '_service' as const;
export const blacklistSearchableText = new Set(['', GST_NAME, SERVICE_CHARGE_NAME]);

export type ExpenseItemForCalculation = {
  id: string;
  isDeleted?: boolean | null | undefined;
  quantity: number;
  priceCents: number;
  categoryId?: string | undefined;
  category?: { value?: string | null; label?: string } | undefined;
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
  /** After Adjustments */
  netTotalCents: number;
};

export type AdjustmentResult = {
  /** Adjustmnent amount in cents */
  amountCents: number;
  /** Adjustment percent in basis points */
  rateBps: number;
};

export type ExpenseCalculationResult = ItemCalculationResult & {
  /** Individual item result */
  itemResults: Record<string, ItemCalculationResult>;
  /** Amount for each category */
  categoryResults: [string, ItemCalculationResult][];
  /** Amount for each adjustments*/
  adjustmentResults: [string, AdjustmentResult, Record<string, AdjustmentResult>][];
};

export function calculateExpense(detail: ExpenseDetailForCalculation): ExpenseCalculationResult {
  const { specifiedAmountCents, items, adjustments } = detail;

  const isItemizedExpense = items.length > 0;
  let expenseGrossTotal = 0;
  const itemResultsMap = new Map<string, ItemCalculationResult>();
  const categoryToItemsMap = new Map<string, string[]>();

  if (isItemizedExpense) {
    // Itemized bill. Ignore specifiedAmountCents
    for (const item of items) {
      if (item.isDeleted) continue;
      const { id, quantity, priceCents } = item;
      const gross = quantity * priceCents;
      expenseGrossTotal += gross;
      itemResultsMap.set(id, { grossTotalCents: gross, netTotalCents: gross });
      const categoryId = item.categoryId ?? item.category?.value ?? item.category?.label;
      if (categoryId) {
        const existing = categoryToItemsMap.get(categoryId);
        if (existing) existing.push(id);
        else categoryToItemsMap.set(categoryId, [id]);
      }
    }
  } else {
    // Non-itemized bill. Just grossTotalCents then adjustments
    expenseGrossTotal = specifiedAmountCents;
  }

  let expenseNetTotal = expenseGrossTotal;
  const adjustmentResults: ExpenseCalculationResult['adjustmentResults'] = [];

  for (const adjustment of adjustments) {
    if (adjustment.isDeleted) continue;
    const { id, rateBps, amountCents = 0, expenseItemId } = adjustment;

    if (rateBps == null) {
      // Flat adjustment
      let rateBasedOn = expenseNetTotal;
      const itemResult = expenseItemId && itemResultsMap.get(expenseItemId);
      if (itemResult) rateBasedOn = itemResult.netTotalCents;
      const rateBps = Math.round((amountCents / rateBasedOn) * 100_00);
      const adjRes = { amountCents, rateBps };
      const itemizedAdj: Record<string, AdjustmentResult> = {};
      if (itemResult) {
        itemizedAdj[expenseItemId] = adjRes;
        itemResult.netTotalCents += amountCents;
      } else {
        for (const [itemId, itemResult] of itemResultsMap.entries()) {
          const adjCentBps = itemResult.netTotalCents * rateBps;
          const adjAmount = Math.round(adjCentBps / 100_00);
          itemizedAdj[itemId] = { amountCents: adjAmount, rateBps };
          itemResult.netTotalCents += adjAmount;
        }
      }
      adjustmentResults.push([id, adjRes, itemizedAdj]);

      expenseNetTotal += amountCents;
      continue;
    }

    // Rate adjustment: Basis Points (10000 bps = 100%)
    if (!isItemizedExpense) {
      // Base amount from net total
      const amountCents = Math.round((expenseNetTotal * rateBps) / 100_00);
      expenseNetTotal += amountCents;
      adjustmentResults.push([id, { amountCents, rateBps }, {}]);
      continue;
    }

    // switch to keeping track of netTotalCents * rateBps, prevent rounding issue.
    let totalAdjCentBpsForThisRate = 0;
    const itemsAdjustmentResults: Record<string, AdjustmentResult> = {};

    if (expenseItemId) {
      const itemResult = itemResultsMap.get(expenseItemId);
      if (itemResult) {
        const adjCentBps = itemResult.netTotalCents * rateBps;
        totalAdjCentBpsForThisRate += adjCentBps;

        const adjAmount = Math.round(adjCentBps / 100_00);
        const adjRateBps = Math.round((adjAmount / itemResult.netTotalCents) * 100_00);
        itemsAdjustmentResults[expenseItemId] = { amountCents: adjAmount, rateBps: adjRateBps };

        itemResult.netTotalCents += adjAmount;
      }
    } else {
      for (const [itemId, itemResult] of itemResultsMap.entries()) {
        const adjCentBps = itemResult.netTotalCents * rateBps;
        totalAdjCentBpsForThisRate += adjCentBps;

        const adjAmount = Math.round(adjCentBps / 100_00);
        const adjRateBps = Math.round((adjAmount / expenseNetTotal) * 100_00);
        itemsAdjustmentResults[itemId] = { amountCents: adjAmount, rateBps: adjRateBps };
        itemResult.netTotalCents += adjAmount;
      }
    }

    const totalAdjCents = Math.round(totalAdjCentBpsForThisRate / 100_00);
    expenseNetTotal += totalAdjCents;
    adjustmentResults.push([id, { amountCents: totalAdjCents, rateBps }, itemsAdjustmentResults]);
  }

  const categoryResults: ExpenseCalculationResult['categoryResults'] = [];
  for (const [categoryId, itemIds] of categoryToItemsMap) {
    const acc = { grossTotalCents: 0, netTotalCents: 0 };
    for (const itemId of itemIds) {
      const itemResult = itemResultsMap.get(itemId);
      if (itemResult) {
        acc.grossTotalCents += itemResult.grossTotalCents;
        acc.netTotalCents += itemResult.netTotalCents;
      }
    }
    categoryResults.push([categoryId, acc]);
  }

  return {
    itemResults: Object.fromEntries(itemResultsMap),
    categoryResults,
    grossTotalCents: expenseGrossTotal,
    netTotalCents: expenseNetTotal,
    adjustmentResults,
  };
}

export type CalculationResultWithAllocations = Pick<ExpenseCalculationResult, 'netTotalCents'> & {
  allocations: { amountCents: number }[];
};

export function calculateRemainingAllocation(input: CalculationResultWithAllocations) {
  const { netTotalCents, allocations } = input;
  let remainingCents = netTotalCents;
  let isValidForCategory = true;
  for (let i = 0; i < allocations.length; i++) {
    const { amountCents } = allocations[i];
    remainingCents -= amountCents;
    if (amountCents < 0 || remainingCents < 0) {
      isValidForCategory = false;
    }
  }

  const lastAllocationCents = allocations.at(-1)?.amountCents ?? 0 + remainingCents;

  return {
    remainingCents,
    lastAllocationCents,
    isValidForCategory,
  };
}
