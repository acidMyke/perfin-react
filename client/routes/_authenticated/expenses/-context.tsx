import { formOptions } from '@tanstack/react-form';
import { createContext, useContext, useRef, type ReactNode, type RefObject } from 'react';
import { type Option } from '#components/Form';

export const expenseListOptions = formOptions({
  defaultValues: {
    showDeleted: false,
    accountIds: [] as Option[],
    categoryIds: [] as Option[],
  },
});

export type ExpenseListOptions = (typeof expenseListOptions)['defaultValues'];

type ExpenseListContextType = {
  listOptionsRef: RefObject<ExpenseListOptions>;
};

const ExpenseContext = createContext<ExpenseListContextType | undefined>(undefined);

export const ExpenseContextProvider = ({ children }: { children: ReactNode }) => {
  const listOptionsRef = useRef<ExpenseListOptions>(expenseListOptions.defaultValues);

  return <ExpenseContext.Provider value={{ listOptionsRef }}>{children}</ExpenseContext.Provider>;
};

export const useExpenseContext = () => {
  const context = useContext(ExpenseContext);
  if (!context) {
    throw new Error('useExpenseListOptions must be used within ExpenseListOptionsProvider');
  }
  return context;
};
