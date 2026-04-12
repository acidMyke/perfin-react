import { trpc, type RouterInputs, type RouterOutputs } from '#client/trpc';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ExpenseOptions } from '.';
import { formatBps } from '#client/utils';

type ShopDetailPayload = RouterInputs['expense']['getShopDetail'];
type ShopDetailFinalized = RouterOutputs['expense']['getShopDetail'][number];

interface ShopDetailPickerHandler {
  fetchShopDetail: (param: ShopDetailPayload) => void;
}

type ShopDetailPickerProps = {
  optionsData: ExpenseOptions;
  onEmptyResponse?: () => any;
  onFinalized: (data: ShopDetailFinalized) => any;
};

export const ShopDetailPicker = forwardRef<ShopDetailPickerHandler, ShopDetailPickerProps>((props, ref) => {
  const { onFinalized, onEmptyResponse, optionsData } = props;
  const shopDetailPickerDialogRef = useRef<HTMLDialogElement>(null);

  const shopDetailMutation = useMutation(
    trpc.expense.getShopDetail.mutationOptions({
      onSuccess(potentialShopDetails) {
        if (potentialShopDetails.length === 0) {
          onEmptyResponse?.();
        } else if (potentialShopDetails.length === 1) {
          onFinalized(potentialShopDetails[0]);
        } else {
          shopDetailPickerDialogRef.current?.showModal();
        }
      },
    }),
  );

  useImperativeHandle(ref, () => ({
    fetchShopDetail: param => shopDetailMutation.mutateAsync(param),
  }));

  return (
    <dialog className='modal' ref={shopDetailPickerDialogRef}>
      <div className='modal-box'>
        <h3 className='text-lg font-bold'>Select an option below to autocomplete the form</h3>
        {shopDetailMutation.data?.length && (
          <div className='flex-flex-col-gap-y-4 mt-2'>
            {shopDetailMutation.data.map((shopDetail, idx) => {
              const { categoryId, accountId, serviceChargeBps, isGstExcluded } = shopDetail;
              const { categoryOptions, accountOptions } = optionsData;
              const selCategory = categoryId ? categoryOptions.find(({ value }) => value === categoryId) : null;
              const selAccount = accountId ? accountOptions.find(({ value }) => value === accountId) : null;

              return (
                <button
                  key={idx}
                  onClick={() => {
                    onFinalized(shopDetail);
                    shopDetailPickerDialogRef.current?.close();
                  }}
                  className='btn btn-soft odd:btn-primary even:btn-secondary grid h-auto w-full auto-cols-fr grid-flow-row justify-start gap-x-2 p-2 *:text-left'
                >
                  <p className='col-start-1'>Service charge:</p>
                  <p className='col-start-2'>{serviceChargeBps ? formatBps(serviceChargeBps) : 'N/A'}</p>
                  <p className='col-start-3'>GST:</p>
                  <p className='col-start-4'>{isGstExcluded ? 'Excluded' : 'Included'}</p>

                  <p className='col-start-1'>Category:</p>
                  <p className='col-start-2'>{selCategory?.label ?? 'Unspecified'}</p>
                  <p className='col-start-3'>Account:</p>
                  <p className='col-start-4'>{selAccount?.label ?? 'Unspecified'} </p>
                </button>
              );
            })}
            <button
              key='no'
              className='btn btn-soft btn-warning w-full'
              onClick={() => shopDetailPickerDialogRef.current?.close()}
            >
              None of the above
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
});

export function useShopDetailPickerRef() {
  return useRef<ShopDetailPickerHandler>(null);
}
