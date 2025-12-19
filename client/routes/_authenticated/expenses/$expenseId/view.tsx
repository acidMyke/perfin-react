import { createFileRoute, Link } from '@tanstack/react-router';
import { invalidateAndRedirectBackToList, useExpenseForm } from './-expense.common';
import { useStore } from '@tanstack/react-form';
import { currencyNumberFormat, dateFormat } from '../../../../utils';
import { calculateExpenseItem } from '../../../../../server/lib/expenseHelper';
import { useMutation } from '@tanstack/react-query';
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
  const { ui, geolocation, items, account, category, isDeleted, additionalServiceChargePercent } = expense;
  const { baseAmount, grossAmount, expectedRefundSum, amount, gst, serviceCharge } = ui.calculateResult;

  return (
    <div className='mx-auto grid max-w-md auto-cols-min auto-rows-auto grid-cols-1 gap-1 p-4'>
      <div className='border-base-300 col-span-2 grid grid-cols-2 space-y-1 border-b pb-2'>
        <h1 className='col-span-2 text-lg font-bold'>
          {geolocation ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${geolocation.latitude}%2C${geolocation.longitude}`}
              target='_blank'
              className='link'
            >
              {expense.shopName ?? 'Unknown Shop'}
            </a>
          ) : (
            (expense.shopName ?? 'Unknown Shop')
          )}
        </h1>
        {expense.shopMall && <p className='text-sm opacity-70'>{expense.shopMall}</p>}
        <p className='text-sm opacity-60'>{dateFormat.format(expense.billedAt)}</p>
        <p className='text-sm opacity-60'>Category: {category?.label ?? 'Unspecified'}</p>
        <p className='text-sm opacity-60'>Account: {account?.label ?? 'Unspecified'}</p>
      </div>
      <span>Items</span>
      <span>Amount</span>

      {items.map(item => {
        const { grossAmount, amount, minRefundCents } = calculateExpenseItem(item, expense);
        return (
          <div
            key={item.id}
            className='border-base-300 col-span-2 grid grid-cols-subgrid pt-2 pb-2 last:border-0 *:even:justify-self-end'
          >
            <span className='font-medium'>
              {item.name} ({formatCents(item.priceCents)}) × {item.quantity}
            </span>
            <span className={amount === 0 ? 'line-through' : ''}>{currencyNumberFormat.format(grossAmount)}</span>
            {item.expenseRefund && (
              <>
                <span className='text-secondary ml-2 text-sm'>
                  {(item.expenseRefund.actualAmountCents == null
                    ? 'Pending refund '
                    : minRefundCents < grossAmount
                      ? 'Partially refunded '
                      : 'Fully refunded ') + `(${item.expenseRefund.source})`}
                </span>
                {item.expenseRefund.actualAmountCents && (
                  <span className='text-secondary text-sm'>-{formatCents(item.expenseRefund.actualAmountCents)}</span>
                )}
              </>
            )}
          </div>
        );
      })}

      <div className='border-t-base-content/20 col-span-2 grid grid-cols-subgrid border-t pt-4 *:even:text-right'>
        {baseAmount < grossAmount && (
          <>
            <span>Subtotal:</span>
            <span>{currencyNumberFormat.format(baseAmount)}</span>
          </>
        )}
        {serviceCharge > 0 && (
          <>
            <span>Service charge ({additionalServiceChargePercent}%):</span>
            <span>{currencyNumberFormat.format(serviceCharge)}</span>
          </>
        )}
        {gst > 0 && (
          <>
            <span>Excl GST (9%):</span>
            <span>{currencyNumberFormat.format(gst)}</span>
          </>
        )}
      </div>
      <div className='col-span-2 grid grid-cols-subgrid text-xl *:odd:font-bold *:even:text-right'>
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

      <ActionSection isDeleted={isDeleted} />
    </div>
  );
}

function ActionSection(props: { isDeleted: boolean }) {
  const { isDeleted } = props;
  const confirmModalRef = useRef<HTMLDialogElement>(null);
  const navigate = Route.useNavigate();
  const { expenseId } = Route.useParams();
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

  const deleteOrRestore = isDeleted ? 'restore' : 'delete';

  return (
    <>
      <Link to='/expenses/$expenseId' params={{ expenseId }} className='btn btn-lg btn-primary col-span-2 mt-4'>
        Edit
      </Link>

      <div className='col-span-2 mt-2 flex gap-4'>
        <button
          className='btn btn-lg btn-error col-span-2 mt-2 flex-1'
          onClick={() => confirmModalRef.current?.showModal()}
        >
          {isDeleted ? 'Restore' : 'Delete'}
        </button>

        <button
          className='btn btn-secondary btn-lg col-span-2 mt-2 flex-1'
          onClick={() =>
            navigate({
              to: '/expenses/$expenseId',
              params: { expenseId: 'create' },
              search: { copyId: expenseId },
            })
          }
        >
          Duplicate
        </button>
      </div>
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
