type ExpenseInfoChildrenForIndexing = {
  id: string;
  name: null | undefined | string;
  isDeleted?: undefined | null | boolean;
};

type ExpenseInfoForIndexing = {
  id: string;
  userId: string;
  shopName?: null | undefined | string;
  shopMall?: null | undefined | string;
  items?: ExpenseInfoChildrenForIndexing[];
  adjustments?: ExpenseInfoChildrenForIndexing[];
};

type Searchable = {
  userId: string;
  expenseId: string;
  context?: string | null;
  text: string;
  sourceId: string;
};

function gatherExpenseSearchables(expense: ExpenseInfoForIndexing) {
  const searchables: Searchable[] = [];

  if (expense.shopName) {
    searchables.push({
      userId: expense.userId,
      expenseId: expense.id,
      context: expense.shopMall,
      text: expense.shopName,
      sourceId: expense.id,
    });
  }

  if (expense.shopMall) {
    searchables.push({
      userId: expense.userId,
      expenseId: expense.id,
      text: expense.shopMall,
      sourceId: expense.id,
    });
  }

  if (expense.items) {
    for (const item of expense.items) {
      if (item.isDeleted || !item.name) continue;
      searchables.push({
        userId: expense.userId,
        expenseId: expense.id,
        context: expense.shopName,
        text: item.name,
        sourceId: item.id,
      });
    }
  }

  if (expense.adjustments) {
    for (const adj of expense.adjustments) {
      if (adj.isDeleted || !adj.name) continue;
      searchables.push({
        userId: expense.userId,
        expenseId: expense.id,
        context: expense.shopName,
        text: adj.name,
        sourceId: adj.id,
      });
    }
  }

  return searchables;
}
