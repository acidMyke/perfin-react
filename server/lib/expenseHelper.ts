export type ExpenseAdjustmentForCalculation = {
  id: string;
  isDeleted?: boolean | null | undefined;
  amountCents?: number;
  rateBps?: number;
  expenseItemId?: string;
};

export type ExpenseDetailForCalculation = {
  items: {
    id: string;
    isDeleted?: boolean | null | undefined;
    quantity: number;
    priceCents: number;
  }[];
  adjustments: ExpenseAdjustmentForCalculation[];
};

type LineResult = {
  /** Price * Quantity */
  lineTotalAmountCents: number;
  /** Price * Quantity */
  lineTotalAmount: number;
  /** Adjustment */
  lineAdjustmentAmountCents: number;
  /** Adjustment */
  lineAdjustmentAmount: number;
  /** Price * Quantity + Adjustments */
  lineGrossAmountCents: number;
  /** Price * Quantity + Adjustments */
  lineGrossAmount: number;
};

type AdjustmentResult = {
  adjustmentCents: number;
  adjustment: number;
};

type CalculateExpenseResult = {
  /** Price * Quantity */
  subtotalAmountCents: number;
  /** Price * Quantity */
  subtotalAmount: number;
  /** Price * Quantity + Adjustments */
  grossAmountCents: number;
  /** Price * Quantity + Adjustments */
  grossAmount: number;

  lineResults: Map<string, LineResult>;
  adjustmentResults: Map<string, AdjustmentResult>;
};

function mapToDollars<T extends Record<`${string}Cents`, number>>(cents: T) {
  return Object.assign(
    cents,
    Object.fromEntries(Object.entries(cents).map(([key, value]) => [key, value / 100])) as {
      [K in keyof T as K extends `${infer Name}Cents` ? Name : never]: number;
    },
  );
}

export function calculateExpense(detail: ExpenseDetailForCalculation): CalculateExpenseResult {
  const { items, adjustments } = detail;

  // Calculating line total and subtotal
  const lineResults = new Map<string, LineResult>();
  let subtotalAmountCents = 0;

  for (const item of items) {
    const { id, isDeleted, quantity, priceCents } = item;
    const lineTotalAmountCents = !isDeleted ? quantity * priceCents : 0;
    subtotalAmountCents += lineTotalAmountCents;
    lineResults.set(
      id,
      mapToDollars({
        lineTotalAmountCents,
        lineAdjustmentAmountCents: 0,
        lineGrossAmountCents: lineTotalAmountCents,
      }),
    );
  }

  // Calculating adjustments
  const adjustmentResults = new Map<string, AdjustmentResult>();
  let grossAmountCents = subtotalAmountCents;

  for (const adj of adjustments) {
    const { id, isDeleted, rateBps, expenseItemId } = adj;
    if (isDeleted) {
      continue;
    }

    let adjustmentCents = 0;

    if (rateBps != null) {
      if (expenseItemId) {
        // Apply rate to only the specified item
        const lineResult = lineResults.get(expenseItemId);
        if (lineResult != null) {
          const lineAdj = Math.round((lineResult.lineGrossAmountCents * rateBps) / 10000);
          lineResult.lineGrossAmountCents += lineAdj;
          lineResult.lineAdjustmentAmountCents += lineAdj;
          lineResults.set(expenseItemId, mapToDollars({ ...lineResult }));
          adjustmentCents += lineAdj;
        }
      } else {
        // Apply rate to all items proportionally
        for (const [itemId, lineResult] of lineResults.entries()) {
          const lineAdj = Math.round((lineResult.lineGrossAmountCents * rateBps) / 10000);
          lineResult.lineGrossAmountCents += lineAdj;
          lineResult.lineAdjustmentAmountCents += lineAdj;
          lineResults.set(itemId, mapToDollars({ ...lineResult }));
          adjustmentCents += lineAdj;
        }
      }
    } else if (adj.amountCents != null) {
      adjustmentCents = adj.amountCents;
    }

    grossAmountCents += adjustmentCents;
    adjustmentResults.set(id, mapToDollars({ adjustmentCents }));
  }

  return {
    ...mapToDollars({
      subtotalAmountCents,
      grossAmountCents,
    }),
    lineResults,
    adjustmentResults,
  };
}
