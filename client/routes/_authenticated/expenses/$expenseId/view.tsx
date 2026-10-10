import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { formatAdjustmentName, invalidateAndRedirectBackToList, useExpenseForm } from './-common';
import { useSelector } from '@tanstack/react-form';
import { currencyNumberFormat, dateFormat, formatBps } from '#client/utils';
import { useMutation } from '@tanstack/react-query';
import { Fragment, useRef } from 'react';
import { trpc } from '#client/trpc';
import { BillTotal } from './-common/BillTotal';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/view')({
  component: RouteComponent,
  beforeLoad: ({ params }) => {
    if (params.expenseId === 'create') {
      throw redirect({ to: '/expenses/$expenseId/view', params });
    }
  },
});

function formatCents(cents: number) {
  return currencyNumberFormat.format(cents / 100);
}

function RouteComponent() {
  const form = useExpenseForm();
  const { expenseId } = Route.useParams();

  const expense = useSelector(form.store, state => state.values);
  const { geolocation, items, adjustments, isDeleted, billedAt } = expense;
  const { accountAllocs, categoryAllocs } = expense;
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
                return (
                  <Fragment key={itemId + adjId}>
                    <span className='col-start-1 indent-4 text-sm'>{formatAdjustmentName(name)}</span>
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

      <label className='label mt-2 p-0'>
        <span className='label-text font-medium'>Category allocations</span>
      </label>
      <ul className='col-span-full flex auto-rows-auto flex-col flex-nowrap items-start gap-2 pb-2 pl-2'>
        {(items.length > 0 ? expense.ui.categoryAllocation : categoryAllocs).map(({ category, amountCents }, idx) => (
          <li key={idx} className='flex w-full flex-row items-center gap-2'>
            <p className='grow'>{category?.label ?? 'Unspecified'}</p>
            <p>{formatCents(amountCents)}</p>
          </li>
        ))}
      </ul>
      <label className='label mt-2 p-0'>
        <span className='label-text font-medium'>Account allocations</span>
      </label>
      <ul className='col-span-full flex auto-rows-auto flex-col flex-nowrap items-start gap-2 pb-2 pl-2'>
        {accountAllocs.map(({ account, amountCents }, idx) => (
          <li key={idx} className='flex w-full flex-row items-center gap-2'>
            <p className='grow'>{account?.label ?? 'Unspecified'}</p>
            <p>{formatCents(amountCents)}</p>
          </li>
        ))}
      </ul>

      <form.AppField name='attachments'>
        {({ AttachmentBox }) => (
          <AttachmentBox
            label='Attachment'
            accept='image/*,application/pdf'
            max={5}
            containerCn='col-span-8 my-2'
            readOnly
          />
        )}
      </form.AppField>
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
              to: '/expenses/$expenseId/start',
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
