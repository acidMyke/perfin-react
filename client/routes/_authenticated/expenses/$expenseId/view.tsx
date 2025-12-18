import { createFileRoute } from '@tanstack/react-router';
import { invalidateAndRedirectBackToList, useExpenseForm } from './-expense.common';
import { useStore } from '@tanstack/react-form';
import { currencyNumberFormat, dateFormat } from '../../../../utils';
import { calculateExpenseItem } from '../../../../../server/lib/expenseHelper';
import { useMutation } from '@tanstack/react-query';
import { ArchiveRestore, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { trpc } from '../../../../trpc';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/view')({
  component: RouteComponent,
});

function formatCents(cents: number) {
  return currencyNumberFormat.format(cents / 100);
}

function RouteComponent() {
  const form = useExpenseForm();

  const expense = useStore(form.store, state => state.values);
  const { ui, items } = expense;
  const { grossAmount, expectedRefundSum, amount } = ui.calculateResult;

  return (
    <div className='mx-auto grid max-w-md auto-cols-min auto-rows-auto grid-cols-1 gap-1 p-4'>
      <div className='border-base-300 col-span-2 space-y-1 border-b pb-2'>
        <h1 className='text-lg font-bold'>{expense.shopName ?? 'Unknown Shop'}</h1>
        {expense.shopMall && <p className='text-sm opacity-70'>{expense.shopMall}</p>}
        <p className='text-sm opacity-60'>{dateFormat.format(expense.billedAt)}</p>
      </div>

      {items.map(item => {
        const { grossAmount, amount, minRefundCents } = calculateExpenseItem(item, expense);
        return (
          <div key={item.id} className='border-base-300 col-span-2 grid grid-cols-subgrid pt-2 pb-2 last:border-0'>
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

      <div className='border-t-base-content/20 col-span-2 grid grid-cols-subgrid border-t pt-4 text-xl *:odd:font-bold *:even:text-right'>
        <span>Gross amount:</span>
        <span>{currencyNumberFormat.format(grossAmount)}</span>
        {expectedRefundSum > 0 && (
          <>
            <span>Expected total:</span>
            <span>{currencyNumberFormat.format(grossAmount - expectedRefundSum)}</span>
          </>
        )}
        <span>Total paid:</span>
        <span>{currencyNumberFormat.format(amount)}</span>
      </div>

      <ToggleDeleteButtonAndModal className='btn btn-lg col-span-full' />
    </div>
  );
}

function ToggleDeleteButtonAndModal(props: { className: string }) {
  const { className } = props;
  const confirmModalRef = useRef<HTMLDialogElement>(null);
  const navigate = Route.useNavigate();
  const { expenseId } = Route.useParams();
  const isCreate = expenseId === 'create';
  const form = useExpenseForm();

  const setIsDeleteExpenseMutation = useMutation(
    trpc.expense.setDelete.mutationOptions({
      onSuccess() {
        return invalidateAndRedirectBackToList({
          expenseId,
          navigate,
          optionsCreated: false,
          billedAt: form.getFieldValue('billedAt'),
        });
      },
    }),
  );

  if (!isCreate) {
    return undefined;
  }

  const isDeleted = form.state.values.isDeleted;
  const deleteOrRestore = isDeleted ? 'restore' : 'delete';

  return (
    <>
      {isDeleted ? (
        <button className={className} onClick={() => confirmModalRef.current?.showModal()}>
          <ArchiveRestore />
          Restore
        </button>
      ) : (
        <button className={className} onClick={() => confirmModalRef.current?.showModal()}>
          <Trash2 />
          Delete
        </button>
      )}
      <dialog className='modal' ref={confirmModalRef}>
        <div className='modal-box'>
          <h3 className='text-lg font-bold'>Confirm {deleteOrRestore}?</h3>
          <p className='py-4'>Are you sure you want to {deleteOrRestore} this record?</p>
          <div className='modal-action'>
            <button
              className='btn btn-error'
              onClick={() => {
                const version = form.getFieldValue('version');
                setIsDeleteExpenseMutation.mutateAsync({ expenseId, version, isDeleted: !isDeleted });
                confirmModalRef.current?.close();
              }}
            >
              {setIsDeleteExpenseMutation.isPending && <span className='loading' />}
              Yes
            </button>
            <button className='btn' onClick={() => confirmModalRef.current?.close()}>
              No
            </button>
          </div>
          <div></div>
        </div>
      </dialog>
    </>
  );
}
