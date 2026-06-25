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
});
