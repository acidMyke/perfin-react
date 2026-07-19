import { createFileRoute, redirect } from '@tanstack/react-router';
import { pushHistory, useCompleteShopDetailMutation, useExpenseForm, type TrackableFieldName } from './-common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { trpc, type RouterOutputs } from '#client/trpc';
import { skipToken, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { distanceBetween, formatDistance } from '#client/utils';
import { AlertTriangle, Building, Store } from 'lucide-react';
import { useGeolocationWatcher } from '#client/hooks/useGeolocationWatcher';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/start')({
  component: RouteComponent,
  beforeLoad: ({ params }) => {
    if (params.expenseId !== 'create') {
      throw redirect({ to: '/expenses/$expenseId/view', params });
    }
  },
});

type Shop = RouterOutputs['expense']['searchShopByLocation']['result'][number];

type ShopResult = Shop & { distance: number };
type MallResult = { mallName: string; latitude: number; longitude: number; distance: number; shopCount: number };

function RouteComponent() {
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const navigate = Route.useNavigate();
  const form = useExpenseForm();
  const [showMap, setShowMap] = useState(false);
  const [customCoordinate, setCustomCoordinate] = useState<{ latitude: number; longitude: number }>();
  const currentLocationQuery = useGeolocationWatcher();
  const shopSuggestionsMutation = useQuery(
    trpc.expense.searchShopByLocation.queryOptions(
      customCoordinate ?? (currentLocationQuery.isSuccess ? currentLocationQuery.data : skipToken) ?? skipToken,
    ),
  );
  const completeShopDetailMutation = useCompleteShopDetailMutation(form, optionsData);

  const continueToMainForm = useCallback(
    (args?: { isOnline: true } | { shopName?: string | null; shopMall?: string | null }) => {
      if (args && 'isOnline' in args) {
        form.setFieldValue('type', 'online');
      } else {
        const { shopMall, shopName } = args ?? {};
        const fields: TrackableFieldName[] = [];
        if (currentLocationQuery.data) {
          fields.push('geolocation');
          const { latitude, longitude, accuracy } = currentLocationQuery.data;
          form.setFieldValue(
            'geolocation',
            { isError: false, latitude, longitude, accuracy },
            { dontValidate: true, dontRunListeners: true },
          );
        }
        form.setFieldValue('type', 'physical', { dontValidate: true, dontRunListeners: true });
        if (shopName) {
          completeShopDetailMutation.mutateAsync({ shopName });
          fields.push('shopName');
          form.setFieldValue('shopName', shopName, { dontValidate: true, dontRunListeners: true });
        }
        if (shopMall) {
          fields.push('shopMall');
          form.setFieldValue('shopMall', shopMall, { dontValidate: true, dontRunListeners: true });
        }
        pushHistory(form, fields);
      }
      navigate({ to: '/expenses/$expenseId' });
    },
    [form],
  );

  const normalizedResult = useMemo(() => {
    if (!currentLocationQuery.data || !shopSuggestionsMutation.data) return;
    const { latitude: userLat, longitude: userLng } = currentLocationQuery.data;
    const shops: ShopResult[] = [];
    const mallMap = new Map<string, { latSum: number; lngSum: number; count: number }>();
    for (const shop of shopSuggestionsMutation.data.result) {
      if (!shop.shopName) continue;
      const distance = distanceBetween(userLat, userLng, shop.latitude, shop.longitude);
      shops.push({ ...shop, distance });

      if (!shop.shopMall) continue;

      const mall = mallMap.get(shop.shopMall) ?? { latSum: 0, lngSum: 0, count: 0 };
      if (!mallMap.has(shop.shopMall)) mallMap.set(shop.shopMall, mall);
      mall.latSum += shop.latitude;
      mall.lngSum += shop.longitude;
      mall.count++;
    }

    const malls = Array.from(mallMap, ([mallName, m]) => {
      const latitude = m.latSum / m.count;
      const longitude = m.lngSum / m.count;
      const distance = distanceBetween(userLat, userLng, latitude, longitude);
      return { mallName, latitude, longitude, shopCount: m.count, distance } satisfies MallResult;
    });

    shops.sort((a, b) => a.distance - b.distance);
    malls.sort((a, b) => a.distance - b.distance);

    return { shops, malls };
  }, [shopSuggestionsMutation.data, currentLocationQuery.data]);

  useEffect(() => {
    form.setFieldValue('billedAt', new Date(), { dontUpdateMeta: true, dontRunListeners: true });
  }, []);

  return (
    <div>
      <div className='mb-2 flex gap-x-4'>
        <button className='btn btn-primary w-5/12 grow' onClick={() => setShowMap(v => !v)}>
          {showMap ? 'Hide map' : 'Change coordinate'}
        </button>
        <button className='btn btn-secondary w-5/12 grow' onClick={() => continueToMainForm({ isOnline: true })}>
          Online
        </button>
      </div>
      {currentLocationQuery.data && currentLocationQuery.isError && (
        <div className='alert alert-warning'>
          <AlertTriangle className='h-5 w-5' />

          <div className='flex-1'>
            <div className='font-semibold'>Location unavailable</div>
            <div className='text-sm opacity-80'>{currentLocationQuery.error?.getFormmatedError()}</div>
          </div>
        </div>
      )}
      <div className='space-y-6'>
        <div>
          <h3 className='menu-title text-2xl'>
            <Store size={30} className='inline' /> Shops
          </h3>

          <ul className='menu bg-base-100 rounded-box w-full border'>
            {normalizedResult?.shops.map(shop => (
              <li key={`${shop.shopMall}-${shop.shopName}`}>
                <button onClick={() => continueToMainForm(shop)} className='flex justify-between'>
                  <div className='text-left'>
                    <div className='font-medium'>{shop.shopName}</div>
                    <div className='text-xs opacity-60'>📍 {shop.shopMall ?? '<Unspecified>'}</div>
                  </div>

                  <span className='badge badge-outline'>{formatDistance(shop.distance)}</span>
                </button>
              </li>
            )) ??
              [...Array(4)].map((_, i) => (
                <li key={i}>
                  <div className='flex justify-between'>
                    <div className='space-y-2'>
                      <div className='skeleton h-4 w-32' />
                      <div className='skeleton h-3 w-24' />
                    </div>

                    <div className='skeleton h-5 w-12' />
                  </div>
                </li>
              ))}
          </ul>

          <div className='space-y-2'>{}</div>
        </div>

        <div>
          <h3 className='menu-title text-2xl'>
            <Building size={30} className='inline' /> Malls
          </h3>

          <ul className='menu bg-base-100 rounded-box w-full border'>
            {normalizedResult?.malls.map(mall => (
              <li key={mall.mallName}>
                <button
                  onClick={() => continueToMainForm({ shopMall: mall.mallName })}
                  className='flex justify-between'
                >
                  <div className='text-left'>
                    <div className='font-medium'>{mall.mallName}</div>
                    <div className='text-xs opacity-60'>{mall.shopCount} shops</div>
                  </div>

                  <span className='badge badge-outline'>{formatDistance(mall.distance)}</span>
                </button>
              </li>
            )) ??
              [...Array(3)].map((_, i) => (
                <li key={i}>
                  <div className='flex justify-between'>
                    <div className='space-y-2'>
                      <div className='skeleton h-4 w-36' />
                      <div className='skeleton h-3 w-16' />
                    </div>

                    <div className='skeleton h-5 w-12' />
                  </div>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
