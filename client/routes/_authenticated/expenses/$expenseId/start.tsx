import { createFileRoute, redirect } from '@tanstack/react-router';
import { setCurrentLocation, useExpenseForm } from './-common';
import { useEffect, useMemo } from 'react';
import { trpc } from '#client/trpc';
import { skipToken, useQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/start')({
  component: RouteComponent,
  beforeLoad: ({ params }) => {
    if (params.expenseId !== 'create') {
      throw redirect({ to: '/expenses/$expenseId/view', params });
    }
  },
});

type ShopNameMallFinalized = { shopName: string | null; shopMall: string | null };

function RouteComponent() {
  const form = useExpenseForm();
  const currentLocationQuery = useQuery({ queryKey: ['current_coord'], queryFn: () => setCurrentLocation(form) });
  const shopSuggestionsMutation = useQuery(
    trpc.expense.queryShopSuggestion.queryOptions(
      currentLocationQuery.data?.isSuccess ? currentLocationQuery.data : skipToken,
    ),
  );
  const shopSuggestions = shopSuggestionsMutation.data;

  const normalizedShopList = useMemo(() => {
    if (!shopSuggestions) return [];
    const normalized: ShopNameMallFinalized[] = [];
    const uniqueMalls = new Set<string>();
    for (const { shopName, shopMall } of shopSuggestions.result) {
      normalized.push({ shopName, shopMall });
      if (shopMall) uniqueMalls.add(shopMall);
    }

    normalized.push(...uniqueMalls.values().map(shopMall => ({ shopName: null, shopMall })));
    return normalized;
  }, [shopSuggestions]);

  useEffect(() => {
    form.setFieldValue('billedAt', new Date(), { dontUpdateMeta: true, dontRunListeners: true });
  }, []);

  return (
    <div className='grid grid-cols-6 gap-x-4'>
      <button className='btn col-span-3'>Pick another location</button>
      <button className='btn btn-secondary col-span-3'>Online</button>
      <div className='col-span-6 mt-2 flex flex-col gap-y-4'>
        {normalizedShopList.map(
          ({ shopMall, shopName }, idx) =>
            (shopMall || shopName) && (
              <button
                key={idx}
                onClick={() => {
                  // onFinalized({ shopMall, shopName });
                  // shopPickerDialogRef.current?.close();
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
            // onTryAgainClick();
            // shopPickerDialogRef.current?.close();
          }}
        >
          No, try again later
        </button>
        <button
          key='no1'
          className='btn btn-soft btn-error w-full'
          // onClick={() => shopPickerDialogRef.current?.close()}
        >
          No, I have never been here, STOP ASKING
        </button>
      </div>
    </div>
  );
}
