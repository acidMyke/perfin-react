export const GST_NAME = '_gst' as const;
export const SERVICE_CHARGE_NAME = '_service' as const;
export const INFERABLE_ADJ_NAME = new Set<string>([GST_NAME, SERVICE_CHARGE_NAME]);
export const blacklistSearchableText = new Set(['', GST_NAME, SERVICE_CHARGE_NAME]);

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
  /** Amount for each adjustments: [adjustmentId, amountInCent, rateBps] */
  adjustmentCents: [string, number, number][];
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
  const expenseAdjustments: [string, number, number][] = [];

  for (const adjustment of adjustments) {
    if (adjustment.isDeleted) continue;
    const { id, rateBps, amountCents, expenseItemId } = adjustment;

    if (rateBps == null) {
      // Flat adjustment
      const amount = amountCents ?? 0;
      const rateBps = Math.round((amount / expenseNetTotal) * 100_00);
      expenseAdjustments.push([id, amount, rateBps]);
      expenseNetTotal += amount;
      continue;
    }

    // Rate adjustment: Basis Points (10000 bps = 100%)
    if (!isItemizedExpense) {
      // Base amount from net total
      const adjAmount = Math.round((expenseNetTotal * rateBps) / 100_00);
      expenseNetTotal += adjAmount;
      expenseAdjustments.push([id, adjAmount, rateBps]);
      continue;
    }

    // switch to keeping track of netTotalCents * rateBps, prevent rounding issue.
    let totalAdjCentBpsForThisRate = 0;

    if (expenseItemId) {
      const itemResult = itemResultsMap.get(expenseItemId);
      if (itemResult) {
        const adjCentBps = itemResult.netTotalCents * rateBps;
        totalAdjCentBpsForThisRate += adjCentBps;

        const adjAmount = Math.round(adjCentBps / 100_00);
        const adjRateBps = Math.round((adjAmount / itemResult.netTotalCents) * 100_00);
        itemResult.adjustmentCents.push([id, adjAmount, adjRateBps]);
        itemResult.netTotalCents += adjAmount;
      }
    } else {
      for (const itemResult of itemResultsMap.values()) {
        const adjCentBps = itemResult.netTotalCents * rateBps;
        totalAdjCentBpsForThisRate += adjCentBps;

        const adjAmount = Math.round(adjCentBps / 100_00);
        const adjRateBps = Math.round((adjAmount / expenseNetTotal) * 100_00);
        itemResult.adjustmentCents.push([id, adjAmount, adjRateBps]);
        itemResult.netTotalCents += adjAmount;
      }
    }

    const totalAdjCents = Math.round(totalAdjCentBpsForThisRate / 100_00);
    expenseNetTotal += totalAdjCents;
    expenseAdjustments.push([id, totalAdjCents, rateBps]);
  }

  return {
    itemResults: itemResultsMap,
    grossTotalCents: expenseGrossTotal,
    netTotalCents: expenseNetTotal,
    adjustmentCents: expenseAdjustments,
  };
}
