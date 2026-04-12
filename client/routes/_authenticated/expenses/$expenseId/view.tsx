import { createFileRoute, Link } from '@tanstack/react-router';
import { invalidateAndRedirectBackToList, useExpenseForm } from './-common';
import { useStore } from '@tanstack/react-form';
import { currencyNumberFormat, dateFormat, formatBps } from '#client/utils';
import { useMutation } from '@tanstack/react-query';
import { Fragment, useRef } from 'react';
import { trpc } from '#client/trpc';
import { BillTotal } from './-common/BillTotal';
import { GST_NAME, SERVICE_CHARGE_NAME } from '#server/lib/expenseHelper';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/view')({
  component: RouteComponent,
});

function formatCents(cents: number) {
  return currencyNumberFormat.format(cents / 100);
}

function RouteComponent() {
  const form = useExpenseForm();
  const { expenseId } = Route.useParams();

  const expense = useStore(form.store, state => state.values);
  const { geolocation, items, adjustments, account, category, isDeleted, billedAt } = expense;
  const shopName = expense.shopName ? expense.shopName : 'Unknown Shop';
  const { itemResults, adjustmentResults } = expense.ui.calculateResult;

  return (
    <div className='mx-auto max-w-md grid-cols-1 gap-1 p-4'>
      <h1 className='col-span-2 text-lg font-bold'>
        {geolocation ? (
          <Link
            to='/expenses/$expenseId/geolocation'
            params={{ expenseId }}
            search={{ readOnly: true }}
            className='link'
          >
            {shopName}
          </Link>
        ) : (
          shopName
        )}
      </h1>
      <div className='grid grid-cols-2 space-y-1 pb-2'>
        {expense.shopMall && <p className='text-sm opacity-70'>{expense.shopMall}</p>}
        <p className='text-sm opacity-60'>{dateFormat.format(expense.billedAt)}</p>
        <p className='text-sm opacity-60'>Category: {category?.label ?? 'Unspecified'}</p>
        <p className='text-sm opacity-60'>Account: {account?.label ?? 'Unspecified'}</p>
      </div>
      <div className='grid w-full auto-cols-min auto-rows-auto grid-cols-[1fr_auto_auto_auto] gap-x-4 pb-3'>
        {items.length > 0 && (
          <>
            <div className='border-base-300 col-span-full border-b' />
            <span className='text-sm'>Name</span>
            <span className='text-sm'></span>
            <span className='text-sm'>Qty</span>
            <span className='text-sm'>Amount</span>
          </>
        )}
        {items.map((item, itemIdx) => {
          const { id: itemId, name, priceCents, quantity } = item;
          const itemResult = itemResults[itemId];
          return (
            <Fragment key={itemId}>
              <span className='col-start-1 mt-2 font-medium'>{name ? name : 'Item ' + (itemIdx + 1)}</span>
              <span className='mt-2'>{formatCents(priceCents)}</span>
              <span className='mt-2'>{quantity}</span>
              <span className='mt-2 text-right'>{itemResult && formatCents(itemResult?.grossTotalCents)}</span>

              {adjustments.map((adj, adjIdx) => {
                const { id: adjId, name, rateBps } = adj;
                const adjustmentResult = adjustmentResults[adjIdx][2][itemId];
                if (!adjustmentResult) {
                  return undefined;
                }
                const displayName = !name
                  ? 'Nameless adjustment'
                  : name === GST_NAME
                    ? 'GST'
                    : name === SERVICE_CHARGE_NAME
                      ? 'Service charge'
                      : name;
                return (
                  <Fragment key={itemId + adjId}>
                    <span className='col-start-1 indent-4 text-sm'>{displayName}</span>
                    <span className='text-sm'>{rateBps && formatBps(rateBps)}</span>
                    <span className='col-start-4 text-right text-sm'>
                      {adjustmentResult && formatCents(adjustmentResult?.amountCents)}
                    </span>
                  </Fragment>
                );
              })}

              {itemResult && itemResult.netTotalCents !== itemResult.grossTotalCents && (
                <span className='col-start-4 text-right font-semibold'>{formatCents(itemResult.netTotalCents)}</span>
              )}
            </Fragment>
          );
        })}
      </div>

      <BillTotal className='col-span-2' isView />

      <ActionSection isDeleted={isDeleted} billedAt={billedAt} />
    </div>
  );
}

function ActionSection(props: { isDeleted: boolean; billedAt: Date }) {
  const { isDeleted, billedAt } = props;
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
          billedAt,
        });
      },
    }),
  );

  const deleteOrRestore = isDeleted ? 'restore' : 'delete';

  return (
    <>
      <Link to='/expenses/$expenseId' params={{ expenseId }} className='btn btn-lg btn-primary mt-4 w-full'>
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
      <Link
        to='/expenses'
        className='btn col-span-2 mt-2 w-full'
        search={{ month: billedAt.getMonth(), year: billedAt.getFullYear() }}
      >
        Back
      </Link>
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
