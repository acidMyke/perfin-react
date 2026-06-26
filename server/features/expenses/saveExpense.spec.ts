import { mockSchemaModule } from '#server/test/mocks';
import { expenseAdjustmentsTable } from '../../../db/schema';
import { mockPoc } from './saveExpense';

vi.mock(import('drizzle-orm'), importOriginal => {
  return mockSchemaModule(importOriginal);
});

describe('test', () => {
  it('should be mock', () => {
    expect(mockPoc()).toEqual({
      operator: 'eq',
      args: [expenseAdjustmentsTable.expenseId, 'testing testing poc id'],
    });
  });
});
