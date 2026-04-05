import { trpc, type RouterInputs, type RouterOutputs } from '#client/trpc';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

type ShopDetailPayload = RouterInputs['expense']['getShopDetail'];
type ShopDetailFinalized = RouterOutputs['expense']['getShopDetail'][number];

interface ShopDetailPickerHandler {
  fetchShopDetail: (param: ShopDetailPayload) => void;
}

type ShopDetailPickerProps = {
  onEmptyResponse?: () => any;
  onFinalized: (data: ShopDetailFinalized) => any;
};

export const ShopDetailPicker = forwardRef<ShopDetailPickerHandler, ShopDetailPickerProps>((props, ref) => {
  const { onFinalized, onEmptyResponse } = props;
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

  return <></>;
});

export function useShopDetailPickerRef() {
  return useRef<ShopDetailPickerHandler>(null);
}
