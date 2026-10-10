import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { pushHistory, SET_VAL_NO_TRACK, useExpenseForm } from './-common';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { trpc, type RouterInputs, type RouterOutputs } from '#client/trpc';
import { skipToken, useQuery } from '@tanstack/react-query';
import {
  distanceBetween,
  formatDistance,
  isLocationExceedBoundaries,
  SG_CENTER,
  toLatLng,
  type Coordinate,
} from '#client/utils';
import { ArrowRight } from 'lucide-react';
import { useGeolocationWatcher } from '#client/hooks/useGeolocationWatcher';
import { AdvancedMarker, ControlPosition, Map as EmbeddedGoogleMap, Pin } from '@vis.gl/react-google-maps';
import { ShopNameSubForm } from './-subform/ExpenseShopName';
import { MallNameSubForm } from './-subform/ExpenseMallName';

export const Route = createFileRoute('/_authenticated/expenses/$expenseId/start')({
  component: RouteComponent,
  beforeLoad: ({ params }) => {
    if (params.expenseId !== 'create') {
      throw redirect({ to: '/expenses/$expenseId/view', params });
    }
  },
});

type Shop = RouterOutputs['expense']['searchShopByLocation']['result'][number];

type ResultScoreFactors = { distance: number };
type ShopResult = Shop & ResultScoreFactors;

function formatCoordinate(coord: { latitude: number; longitude: number }) {
  const { latitude, longitude } = coord;
  return `${latitude.toPrecision(6)}, ${longitude.toPrecision(6)}`;
}

function RouteComponent() {
  const form = useExpenseForm();
  const [showMap, setShowMap] = useState(false);
  const currentLocationQuery = useGeolocationWatcher({ distanceThreshold: 40, timeThreshold: 5000 });
  const [customCoordinate, setCustomCoordinate] = useState(() => {
    const { latitude, longitude } = form.getFieldValue('geolocation');
    if (latitude && longitude) return { latitude, longitude };
    return undefined;
  });
  const coordinate =
    customCoordinate ??
    (currentLocationQuery.data
      ? { latitude: currentLocationQuery.data.latitude, longitude: currentLocationQuery.data.longitude }
      : undefined);

  const coordinateRef = useRef(coordinate);
  coordinateRef.current = coordinate;

  useEffect(() => {
    return () => {
      const coordinate = coordinateRef.current;
      if (coordinate) {
        form.setFieldValue('geolocation', { ...coordinate!, isError: false });
      } else {
        form.setFieldValue('geolocation', {
          latitude: null,
          longitude: null,
          isError: currentLocationQuery.error !== null,
        });
      }
    };
  }, []);

  return (
    <div className='px-2'>
      <form.Field
        name='type'
        children={field => (
          <div className='join mb-4 w-full'>
            <button
              className='join-item btn btn-primary btn-soft data-[active=true]:btn-active grow'
              aria-label='Physical'
              onClick={() => field.setValue('physical')}
              data-active={field.state.value === 'physical'}
            >
              Physical
            </button>
            <button
              className='join-item btn btn-primary btn-soft data-[active=true]:btn-active grow'
              aria-label='Online'
              onClick={() => field.setValue('online')}
              data-active={field.state.value === 'online'}
            >
              Online
            </button>
          </div>
        )}
      />

      <form.Subscribe
        selector={state => [state.values.type === 'physical']}
        children={([isPhysical]) => (
          <>
            {!isPhysical ? (
              <p className='mb-2' />
            ) : customCoordinate ? (
              <p className='mb-2 h-8'>
                Custom coordinate: {formatCoordinate(customCoordinate)}
                <button className='btn btn-link btn-xs inline' onClick={() => setShowMap(!showMap)}>
                  {showMap ? 'Hide map' : 'Change'}
                </button>
                {!showMap && (
                  <button className='btn btn-link btn-xs inline' onClick={() => setCustomCoordinate(undefined)}>
                    Revert
                  </button>
                )}
              </p>
            ) : (
              <p className='mb-2 h-8'>
                Current coordinate:{' '}
                {currentLocationQuery.isPending && (
                  <span className='skeleton skeleton-text'>Retriving location...</span>
                )}
                {currentLocationQuery.isError && <span>Error: {currentLocationQuery.error?.getFormmatedError()}</span>}
                {currentLocationQuery.data && <span className=''>{formatCoordinate(currentLocationQuery.data)}</span>}
                <button className='btn btn-link btn-xs inline' onClick={() => setShowMap(!showMap)}>
                  {showMap ? 'Hide map' : 'Change'}
                </button>
              </p>
            )}

            {isPhysical && showMap && (
              <CoordinatePicker
                currentLocationQuery={currentLocationQuery}
                customCoordinate={customCoordinate}
                setCustomCoordinate={setCustomCoordinate}
              />
            )}
            <NearbyResultList
              isOnline={!isPhysical}
              coordinate={coordinate}
              onShopClick={({ shopName, mallName }) => {
                form.setFieldValue('shopName', shopName, SET_VAL_NO_TRACK);
                form.setFieldValue('shopMall', mallName, SET_VAL_NO_TRACK);
                pushHistory(form, ['shopName', 'shopMall']);
              }}
            />

            <div className='my-2 flex gap-4'>
              {isPhysical && <MallNameSubForm form={form} coordinate={coordinate} containerCn='grow w-1/3' />}
              <ShopNameSubForm form={form} coordinate={coordinate} containerCn='grow w-1/3' />
            </div>
          </>
        )}
      />

      <div className='my-2 flex justify-around gap-4'>
        <Link className='btn w-1/3 grow' to='/expenses'>
          Cancel
        </Link>
        <Link className='btn btn-primary w-1/3 grow' to='/expenses/$expenseId' params={{ expenseId: 'create' }}>
          Continue <ArrowRight />
        </Link>
      </div>
    </div>
  );
}

type NearbyResultListProps = {
  isOnline: boolean;
  coordinate: ReturnType<typeof useGeolocationWatcher>['data'] | Coordinate | undefined;
  onShopClick: (shopDetail: { shopName: string | null; mallName: string | null }) => any;
};

type Location = RouterInputs['expense']['searchShopByLocation'];

function NearbyResultList({ isOnline, coordinate, onShopClick }: NearbyResultListProps) {
  const [cachedLocation, setCachedLocation] = useState<Location | typeof skipToken>(skipToken);
  const shopByLocationQuery = useQuery(trpc.expense.searchShopByLocation.queryOptions(cachedLocation));

  useEffect(() => {
    const location = coordinate ? { isOnline, ...coordinate } : isOnline ? { isOnline: true as const } : undefined;
    if (isLocationExceedBoundaries(location, shopByLocationQuery.data?.locationBounds)) {
      setCachedLocation(location ?? skipToken);
    }
  }, [shopByLocationQuery.data?.locationBounds, isOnline, coordinate?.latitude, coordinate?.longitude]);

  const shops = useMemo(() => {
    if (!coordinate || !shopByLocationQuery.data) return;
    const { latitude: userLat, longitude: userLng } = coordinate;
    const shops: ShopResult[] = [];
    for (const shop of shopByLocationQuery.data.result) {
      if (!shop.shopName) continue;
      const distance = isOnline ? 0 : distanceBetween(userLat, userLng, shop.latitude, shop.longitude);
      shops.push({ ...shop, distance });
    }

    shops.sort((a, b) => a.distance + a.recencyScore * -4 - (b.distance + b.recencyScore * -4));

    return shops;
  }, [shopByLocationQuery.data, coordinate?.latitude, coordinate?.longitude]);

  return (
    <ul className={`menu rounded-box ${isOnline ? 'h-72' : 'h-64'} w-full flex-nowrap overflow-y-auto p-0`}>
      {shops?.map(shop => (
        <li key={`${shop.mallName}-${shop.shopName}`}>
          <button onClick={() => onShopClick(shop)} className='flex justify-between pl-4'>
            <div className='text-left'>
              <div className='max-w-full font-medium text-ellipsis'>{shop.shopName}</div>
              {!isOnline && <div className='text-xs opacity-60'>🏬 {shop.mallName ?? '<Unspecified>'}</div>}
            </div>

            {!isOnline && <span className='badge badge-outline'>{formatDistance(shop.distance)}</span>}
          </button>
        </li>
      )) ??
        [...Array(5)].map((_, i) => (
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
    <EmbeddedGoogleMap
      mapId={import.meta.env.VITE_GOOGLE_MAPS_MAP_ID}
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
  );
}
