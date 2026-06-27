import { createMockContext, mockDrizzleOrm, mockSchemaModule } from '#server/test/mocks';
import { mockPoc } from './saveExpense';

vi.mock(import('drizzle-orm'), importOriginal => {
  return mockDrizzleOrm(importOriginal);
});

vi.mock(import('#schema'), importOriginal => {
  return mockSchemaModule(importOriginal);
});

describe('test', () => {
  it('should be mock', async () => {
    const [{ expensesTable }, { eq }] = await Promise.all([import('#schema'), import('drizzle-orm')]);
    const { db, dbSpies, addDbResult } = createMockContext({ dbMode: 'mock' });
    addDbResult([{ test: 'hello world' }]);

    const res = await mockPoc(db);

    expect(dbSpies.select).toHaveBeenCalledOnce();
    expect(dbSpies.from).toHaveBeenCalledExactlyOnceWith(expensesTable);
    expect(dbSpies.where).toHaveBeenCalledWith(eq(expensesTable.userId, 'hello'));
    expect(res).toEqual([{ test: 'hello world' }]);
  });
});
