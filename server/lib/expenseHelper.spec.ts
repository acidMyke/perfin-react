import { calculateExpense } from './expenseHelper';

describe('calculateExpense()', () => {
  describe('Non-Itemized Expenses', () => {
    it('should calculate base gross/net with no adjustments', () => {
      const result = calculateExpense({ specifiedAmountCents: 1000, items: [], adjustments: [] });
      expect(result.grossTotalCents, 'grossTotalCents').toBe(1000);
      expect(result.netTotalCents, 'netTotalCents').toBe(1000);
      expect(result.adjustmentResults).toEqual([]);
      expect(result.itemResults).toEqual({});
    });

    describe('Flat Adjustments', () => {
      it('should add a flat dollar amount to the net total', () => {
        const result = calculateExpense({
          items: [],
          adjustments: [{ id: '0', amountCents: 500 }],
          specifiedAmountCents: 2000,
        });
        expect(result.grossTotalCents, 'grossTotalCents').toBe(2000);
        expect(result.netTotalCents, 'netTotalCents').toBe(2500);
      });

      it('should correctly calculate the implied rateBps based on current net', () => {
        const result = calculateExpense({
          items: [],
          adjustments: [{ id: 'id1', amountCents: 500 }],
          specifiedAmountCents: 5000,
        });
        expect(result.adjustmentResults).not.toEqual([]);
        expect(result.adjustmentResults[0]).not.toEqual([]);
        const [actualAdjId, adjResult, itemAdjBreakDown] = result.adjustmentResults[0];
        expect(actualAdjId).toBe('id1');
        expect(adjResult).toEqual({ amountCents: 500, rateBps: 10_00 });
        expect(itemAdjBreakDown).toEqual({});
      });
    });

    describe('Rate Adjustments (Basis Points)', () => {
      it('should apply percentage adjustments, ignore flat adjustment', () => {
        const result = calculateExpense({
          items: [],
          adjustments: [{ id: 'id2', rateBps: 10_00, amountCents: 20 }],
          specifiedAmountCents: 2000,
        });
        expect(result.grossTotalCents, 'grossTotalCents').toBe(2000);
        expect(result.netTotalCents, 'netTotalCents').toBe(2200);
        expect(result.adjustmentResults).not.toEqual([]);
        expect(result.adjustmentResults[0]).not.toEqual([]);
        const [actualAdjId, adjResult, itemAdjBreakDown] = result.adjustmentResults[0];
        expect(actualAdjId).toBe('id2');
        expect(adjResult).toEqual({ amountCents: 200, rateBps: 10_00 });
        expect(itemAdjBreakDown).toEqual({});
      });

      it('should apply percentage adjustments compoundingly', () => {
        // 10% service charge, then 9% gst, then 20% off
        const result = calculateExpense({
          items: [],
          adjustments: [
            { id: 'id3', rateBps: 10_00 },
            { id: 'id4', rateBps: 9_00 },
            { id: 'id5', rateBps: -20_00 },
          ],
          specifiedAmountCents: 2000,
        });
        expect(result.grossTotalCents, 'grossTotalCents').toBe(2000);
        expect.soft(result.adjustmentResults[0][1].amountCents).toBe(200);
        expect.soft(result.adjustmentResults[1][1].amountCents).toBe(198);
        expect.soft(result.adjustmentResults[2][1].amountCents).toBe(-480);
        expect(result.netTotalCents, 'netTotalCents').toBe(1918);
      });
    });
  });

  describe('Itemized Expenses', () => {
    describe('Without adjustments', () => {
      it('should ignore specifiedAmountCents when items is provided', () => {
        const result = calculateExpense({
          specifiedAmountCents: 100_00,
          items: [{ id: 'i001', priceCents: 10_00, quantity: 2 }],
          adjustments: [],
        });
        expect(result.grossTotalCents, 'grossTotalCents').toBe(20_00);
        expect(result.netTotalCents, 'netTotalCents').toBe(20_00);
      });

      it('should calculate line totals based on the provided items', () => {
        const result = calculateExpense({
          specifiedAmountCents: 0,
          items: [
            { id: 'i002', priceCents: 5_00, quantity: 3 },
            { id: 'i003', priceCents: 7_00, quantity: 7 },
          ],
          adjustments: [],
        });
        expect(result.itemResults).toEqual({
          i002: { grossTotalCents: 15_00, netTotalCents: 15_00 },
          i003: { grossTotalCents: 49_00, netTotalCents: 49_00 },
        });
      });

      it('should calculate base gross/net amounts based on the provided items that is not deleted', () => {
        const result = calculateExpense({
          specifiedAmountCents: 0,
          items: [
            { id: 'i004', priceCents: 5_00, quantity: 3 },
            { id: 'del0', priceCents: 30_00, quantity: 1, isDeleted: true },
            { id: 'i005', priceCents: 7_00, quantity: 7 },
          ],
          adjustments: [],
        });
        expect(result.grossTotalCents, 'grossTotalCents').toBe(64_00);
        expect(result.netTotalCents, 'netTotalCents').toBe(64_00);
      });
    });
  });

  describe('With adjustments', () => {
    it('should apply flat adjustment to the total bill', () => {
      const result = calculateExpense({
        specifiedAmountCents: 0,
        items: [{ id: 'i006', priceCents: 5_00, quantity: 3 }],
        adjustments: [{ id: 'a001', amountCents: 10_00 }],
      });

      expect(result.grossTotalCents, 'grossTotalCents').toBe(15_00);
      expect(result.netTotalCents, 'netTotalCents').toBe(25_00);
    });

    it('should apply rate adjustment (no expenseItemId provided) to the total bill', () => {
      const result = calculateExpense({
        specifiedAmountCents: 0,
        items: [
          { id: 'i007', priceCents: 5_00, quantity: 3 },
          { id: 'i008', priceCents: 8_00, quantity: 1 },
        ],
        adjustments: [{ id: 'a002', rateBps: 9_00 }],
      });

      expect(result.itemResults).toEqual({
        i007: { grossTotalCents: 15_00, netTotalCents: 16_35 },
        i008: { grossTotalCents: 8_00, netTotalCents: 8_72 },
      });
      expect(result.adjustmentResults[0]).toEqual([
        'a002',
        { amountCents: 2_07, rateBps: 9_00 },
        {
          i007: { amountCents: 1_35, rateBps: expect.any(Number) },
          i008: { amountCents: 72, rateBps: expect.any(Number) },
        },
      ]);
      expect(result.grossTotalCents, 'grossTotalCents').toBe(23_00);
      expect(result.netTotalCents, 'netTotalCents').toBe(25_07);
    });

    it('should apply rate adjustment (expenseItemId provided) only to the specific item', () => {
      const result = calculateExpense({
        specifiedAmountCents: 0,
        items: [
          { id: 'i009', priceCents: 5_00, quantity: 3 },
          { id: 'i010', priceCents: 20_00, quantity: 1 },
        ],
        adjustments: [{ id: 'a003', rateBps: -50_00, expenseItemId: 'i010' }],
      });

      expect(result.itemResults).toEqual({
        i009: { grossTotalCents: 15_00, netTotalCents: 15_00 },
        i010: { grossTotalCents: 20_00, netTotalCents: 10_00 },
      });
      expect(result.adjustmentResults[0]).toEqual([
        'a003',
        { amountCents: -10_00, rateBps: expect.any(Number) },
        { i010: { amountCents: -10_00, rateBps: -50_00 } },
      ]);

      expect(result.grossTotalCents, 'grossTotalCents').toBe(35_00);
      expect(result.netTotalCents, 'netTotalCents').toBe(25_00);
    });
  });

  describe('Edge cases', () => {
    describe('$0 amount', () => {
      it('should handle flat adjustments when the current total is zero', () => {
        const result = calculateExpense({
          specifiedAmountCents: 0,
          items: [],
          adjustments: [{ id: 'flat-fee', amountCents: 500 }],
        });

        expect(result.netTotalCents).toBe(500);
        expect(result.adjustmentResults[0][1].rateBps).toBe(Infinity);
      });

      it('should handle global rate adjustments when item totals sum to zero', () => {
        const result = calculateExpense({
          specifiedAmountCents: 0,
          items: [{ id: 'free-item', quantity: 1, priceCents: 0 }],
          adjustments: [{ id: 'tax-rate', rateBps: 1000 }],
        });

        expect(result.netTotalCents).toBe(0);
        expect(result.itemResults['free-item'].netTotalCents).toBe(0);
        expect(result.adjustmentResults[0][2]['free-item'].rateBps).toBeNaN();
      });
    });
  });
});
