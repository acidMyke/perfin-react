import { createFileRoute } from '@tanstack/react-router';
import { useExpenseForm } from './-expense.common';
import { useStore } from '@tanstack/react-form';
import { currencyNumberFormat, dateFormat } from '../../../../utils';
import { calculateExpenseItem } from '../../../../../server/lib/expenseHelper';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/view')({
  component: RouteComponent,
});

function formatCents(cents: number) {
  return currencyNumberFormat.format(cents / 100);
}

function RouteComponent() {
  const form = useExpenseForm();

  const expense = useStore(form.store, state => state.values);

  return (
    <div className='mx-auto grid max-w-md auto-cols-min auto-rows-auto grid-cols-1 gap-1 space-y-4 p-4'>
      <div className='border-base-300 col-span-2 space-y-1 border-b pb-2'>
        <h1 className='text-lg font-bold'>{expense.shopName ?? 'Unknown Shop'}</h1>
        {expense.shopMall && <p className='text-sm opacity-70'>{expense.shopMall}</p>}
        <p className='text-sm opacity-60'>{dateFormat.format(expense.billedAt)}</p>
      </div>

      {expense.items.map(item => {
        const { grossAmount, amount, minRefundCents } = calculateExpenseItem(item, expense);
        return (
          <div key={item.id} className='border-base-300 col-span-2 grid grid-cols-subgrid border-b pb-2 last:border-0'>
            <span className='font-medium'>
              {item.name} ({formatCents(item.priceCents)}) × {item.quantity}
            </span>
            <span className={amount === 0 ? 'line-through' : ''}>{currencyNumberFormat.format(grossAmount)}</span>
            {item.expenseRefund && (
              <>
                <span className='text-warning ml-2 text-sm'>
                  {(item.expenseRefund.actualAmountCents == null
                    ? 'Pending refund '
                    : minRefundCents < grossAmount
                      ? 'Partially refunded '
                      : 'Fully refunded ') + `(${item.expenseRefund.source})`}
                </span>
                {item.expenseRefund.actualAmountCents && (
                  <span className='text-warning text-sm'>-{formatCents(item.expenseRefund.actualAmountCents)}</span>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
