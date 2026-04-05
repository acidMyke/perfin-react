import { trpc, type RouterInputs } from '#client/trpc';
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';

type ShopSuggestionPayload = RouterInputs['expense']['suggestShopByLocation'];
type ShopNameMallFinalized = { shopName: string | null; shopMall: string | null };

type ShopNameMallPickerHandler = {
  fetchShopSuggestions: (param: ShopSuggestionPayload) => void;
};

type ShopNameMallPickerPickerProps = {
  onEmptyResponse?: () => any;
  onFinalized: (data: ShopNameMallFinalized) => any;
  onTryAgainClick: () => any;
};

export const ShopNameMallPicker = forwardRef<ShopNameMallPickerHandler, ShopNameMallPickerPickerProps>((props, ref) => {
  const { onFinalized, onEmptyResponse, onTryAgainClick } = props;
  const shopPickerDialogRef = useRef<HTMLDialogElement>(null);

  const shopSuggestionsMutation = useMutation(
    trpc.expense.suggestShopByLocation.mutationOptions({
      onSuccess(shopSuggestions) {
        if (shopSuggestions.length === 0) {
          onEmptyResponse?.();
        } else {
          shopPickerDialogRef.current?.showModal();
        }
      },
    }),
  );
  const shopSuggestions = shopSuggestionsMutation.data;

  const normalized = useMemo(() => {
    if (!shopSuggestions) return [];
    const normalized: ShopNameMallFinalized[] = [];
    const uniqueMalls = new Set<string>();
    for (const { shopName, shopMalls } of shopSuggestions) {
      let nullMallAdded = false;
      for (const mall of shopMalls) {
        if (mall) {
          uniqueMalls.add(mall);
          normalized.push({ shopName, shopMall: mall });
        } else if (!nullMallAdded) {
          normalized.push({ shopName, shopMall: null });
          nullMallAdded = true;
        }
      }
    }

    normalized.push(...uniqueMalls.values().map(shopMall => ({ shopName: null, shopMall })));

    return normalized;
  }, [shopSuggestions]);

  useImperativeHandle(ref, () => ({
    fetchShopSuggestions: param => shopSuggestionsMutation.mutateAsync(param),
  }));

  return (
    <dialog className='modal' ref={shopPickerDialogRef}>
      <div className='modal-box'>
        <h3 className='text-lg font-bold'>Select an option below to autocomplete the form</h3>
        <div className='mt-2 flex flex-col gap-y-4'>
          {normalized.map(
            ({ shopMall, shopName }, idx) =>
              (shopMall || shopName) && (
                <button
                  key={idx}
                  onClick={() => {
                    onFinalized({ shopMall, shopName });
                    shopPickerDialogRef.current?.close();
                  }}
                  className='btn btn-soft odd:btn-primary even:btn-secondary'
                >
                  {shopName ?? 'Just the mall: '}
                  {shopName && shopMall && ' @ '}
                  {shopMall}
                </button>
              ),
          )}
          <button
            key='no0'
            className='btn btn-soft btn-warning w-full'
            onClick={() => {
              onTryAgainClick();
              shopPickerDialogRef.current?.close();
            }}
          >
            No, try again later
          </button>
          <button
            key='no1'
            className='btn btn-soft btn-error w-full'
            onClick={() => shopPickerDialogRef.current?.close()}
          >
            No, I have never been here, STOP ASKING
          </button>
        </div>
      </div>
    </dialog>
  );
});

export function useShopNameMallPickerRef() {
  return useRef<ShopNameMallPickerHandler>(null);
}
