import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import {
  pushHistory,
  useCompleteShopDetailMutation,
  useExpenseForm,
  type ExpenseFormApi,
  type TrackableFieldName,
} from './-common';
import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { trpc, type RouterOutputs } from '#client/trpc';
import { skipToken, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { distanceBetween, formatDistance, SG_CENTER, toLatLng, type Coordinate } from '#client/utils';
import { ArrowRight, Building, Store } from 'lucide-react';
import { useGeolocationWatcher } from '#client/hooks/useGeolocationWatcher';
import { ExpenseSuggestableField } from './-common/ExpenseSuggestableField';
import { AdvancedMarker, APIProvider, ControlPosition, Map as EmbeddedGoogleMap, Pin } from '@vis.gl/react-google-maps';

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

function formatCoordinate(coord: { latitude: number; longitude: number; accuracy?: number }) {
  const { latitude, longitude, accuracy } = coord;
  let coordString = `${latitude.toPrecision(8)}, ${longitude.toPrecision(8)}`;
  if (accuracy) {
    coordString += ' ' + formatDistance(accuracy);
  }
  return coordString;
}

function RouteComponent() {
  const { data: optionsData } = useSuspenseQuery(trpc.expense.loadOptions.queryOptions());
  const navigate = Route.useNavigate();
  const form = useExpenseForm();
  const [showMap, setShowMap] = useState(false);
  const [customCoordinate, setCustomCoordinate] = useState<Coordinate>();
  const currentLocationQuery = useGeolocationWatcher({ distanceThreshold: 100 });
  const shopSuggestionsMutation = useQuery(
    trpc.expense.searchShopByLocation.queryOptions(
      customCoordinate ?? (currentLocationQuery.isSuccess ? currentLocationQuery.data : skipToken) ?? skipToken,
    ),
  );
  const completeShopDetailMutation = useCompleteShopDetailMutation(form, optionsData);

  const continueToMainForm = useCallback(
    (args?: { isOnline: true } | { shopName?: string | null; shopMall?: string | null }) => {
      navigate({ to: '/expenses/$expenseId' });
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
    <div className='mb-20'>
      {customCoordinate ? (
        <p className='mb-2'>Custom coordinate: {formatCoordinate(customCoordinate)}</p>
      ) : (
        <p className='mb-2'>
          Current coordinate:{' '}
          {currentLocationQuery.isPending && <span className='skeleton skeleton-text'>Retriving location...</span>}
          {currentLocationQuery.isError && <span>Error: {currentLocationQuery.error?.getFormmatedError()}</span>}
          {currentLocationQuery.data && <span className=''>{formatCoordinate(currentLocationQuery.data)}</span>}
        </p>
      )}
      <div className='mb-6 flex gap-x-4'>
        <button className='btn btn-primary w-5/12 grow' onClick={() => setShowMap(v => !v)}>
          {showMap ? 'Hide map' : 'Change coordinate'}
        </button>
        <button className='btn btn-secondary w-5/12 grow' onClick={() => continueToMainForm({ isOnline: true })}>
          Online
        </button>
      </div>

      {showMap && (
        <CoordinatePicker
          currentLocationQuery={currentLocationQuery}
          customCoordinate={customCoordinate}
          setCustomCoordinate={setCustomCoordinate}
        />
      )}

      <p>Manual entry</p>
      <ManualEntryFields
        form={form}
        onShopNameSelect={shopName => completeShopDetailMutation.mutateAsync({ shopName })}
      />

      <p className='mt-6'>Pick from existing</p>
      <NearbyResultList normalizedResult={normalizedResult} continueToMainForm={continueToMainForm} />
    </div>
  );
}

type ManualEntryFieldsOptions = {
  form: ExpenseFormApi;
  onShopNameSelect: (shopName: string) => {};
};

function ManualEntryFields({ form, onShopNameSelect }: ManualEntryFieldsOptions) {
  return (
    <div className='mt-2 mb-2 flex gap-x-4'>
      <ExpenseSuggestableField
        form={form}
        fields={{ text: 'shopName' }}
        scope='shopName'
        getContext={() => form.getFieldValue('shopMall')}
        label='Shop name'
        triggerChangeOnFocus
        hideError
        onSuggestionSelected={onShopNameSelect}
      />
      <ExpenseSuggestableField
        form={form}
        fields={{ text: 'shopMall' }}
        scope='shopMall'
        label='Mall'
        triggerChangeOnFocus
        hideError
      />
      <Link className='btn btn-primary' to='/expenses/$expenseId' params={{ expenseId: 'create' }}>
        <ArrowRight />
      </Link>
    </div>
  );
}

type NearbyResultListProps = {
  normalizedResult: { shops: ShopResult[]; malls: MallResult[] } | undefined;
  continueToMainForm: (args: { isOnline: true } | { shopName?: string | null; shopMall?: string | null }) => any;
};

function NearbyResultList({ normalizedResult, continueToMainForm }: NearbyResultListProps) {
  return (
    <div className='flex w-full flex-row gap-x-1'>
      <div className='w-lg border-r pr-1'>
        <h3 className='menu-title text-primary text-center text-2xl'>
          <Store size={30} className='inline' /> Shops
        </h3>

        <ul className='menu rounded-box w-full p-0'>
          {normalizedResult?.shops.map(shop => (
            <li key={`${shop.shopMall}-${shop.shopName}`}>
              <button onClick={() => continueToMainForm(shop)} className='flex justify-between'>
                <div className='text-left'>
                  <div className='max-w-full font-medium text-ellipsis'>{shop.shopName}</div>
                  <div className='text-xs opacity-60'>🏬 {shop.shopMall ?? '<Unspecified>'}</div>
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

      <div className='min-w-32'>
        <h3 className='menu-title text-secondary text-center text-2xl'>
          <Building size={30} className='inline' /> Malls
        </h3>

        <ul className='menu rounded-box w-full p-0'>
          {normalizedResult?.malls.map(mall => (
            <li key={mall.mallName}>
              <button
                onClick={() => continueToMainForm({ shopMall: mall.mallName })}
                className='flex h-12 justify-between'
              >
                <div className='font-medium'>{mall.mallName}</div>
              </button>
            </li>
          )) ??
            [...Array(3)].map((_, i) => (
              <li key={i}>
                <div className='flex h-12 justify-between'>
                  <div className='skeleton h-4 w-36' />
                </div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

type CoordinatePickerProps = {
  currentLocationQuery: ReturnType<typeof useGeolocationWatcher>;
  customCoordinate: Coordinate | undefined;
  setCustomCoordinate: Dispatch<SetStateAction<Coordinate | undefined>>;
};

function CoordinatePicker(props: CoordinatePickerProps) {
  const { currentLocationQuery, customCoordinate, setCustomCoordinate } = props;
  const defaultCenter = customCoordinate
    ? toLatLng(customCoordinate)
    : currentLocationQuery.data
      ? toLatLng(currentLocationQuery.data)
      : SG_CENTER;
  const defaualtZoom = customCoordinate ? 17 : currentLocationQuery.data ? 15 : 11;

  return (
    <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}>
      <EmbeddedGoogleMap
        mapId='80d716b53c1956d425c4c9f3'
        className='col-span-2 my-4 h-100'
        gestureHandling='greedy'
        disableDefaultUI={false}
        zoomControl
        mapTypeControl={false}
        fullscreenControl={false}
        streetViewControl={false}
        colorScheme='DARK'
        reuseMaps
        defaultCenter={defaultCenter}
        defaultZoom={defaualtZoom}
        onClick={e => {
          const latLng = e.detail.latLng;
          if (!latLng) return;
          setCustomCoordinate({ latitude: latLng.lat, longitude: latLng.lng });
        }}
        options={{
          zoomControlOptions: {
            position: ControlPosition.RIGHT_BOTTOM,
          },
        }}
      >
        {currentLocationQuery.data && (
          <AdvancedMarker
            position={{ lat: currentLocationQuery.data.latitude, lng: currentLocationQuery.data.longitude }}
          >
            <div className='current-location-dot'>
              <div className='pulse-ring'></div>
              <div className='core-dot'></div>
            </div>
          </AdvancedMarker>
        )}
        {customCoordinate && (
          <AdvancedMarker position={{ lat: customCoordinate.latitude, lng: customCoordinate.longitude }}>
            <Pin background='#ea4335' glyphColor='#b41412' />
          </AdvancedMarker>
        )}
      </EmbeddedGoogleMap>
    </APIProvider>
  );
}
