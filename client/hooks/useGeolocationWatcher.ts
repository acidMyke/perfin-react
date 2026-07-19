import { distanceBetween } from '#client/utils';
import { useEffect, useRef, useState } from 'react';

export const GEOLOCATION_KEY = ['user', 'location'] as const;
export type LocationCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

export class GeolocationError extends Error {
  code: number;
  static UNSUPPORTED = 0;
  static PERMISSION_DENIED = 1;
  static POSITION_UNAVAILABLE = 2;
  static TIMEOUT = 3;

  constructor(nativeError: GeolocationPositionError | { code: number; message: string }) {
    super(nativeError.message);
    this.name = 'GeolocationError';
    this.code = nativeError.code;

    Object.setPrototypeOf(this, GeolocationError.prototype);
  }

  getFormmatedError() {
    switch (this.code) {
      case 0:
        return 'Your browser does not support location services.';
      case 1:
        return 'Location permission was denied.';
      case 2:
        return 'Unable to determine your location.';
      case 3:
        return 'Location request timed out.';
      default:
        return this.message;
    }
  }
}

type UseGeolocationWatcherOptions = {
  /**
   * Called whenever the position changes and passes the threshold.
   */
  onSuccess?: (coords: LocationCoordinates) => void;

  /**
   * Called when the Geolocation API returns an error.
   */
  onError?: (error: GeolocationError) => void;

  /**
   * Minimum distance (m) before emitting a new location.
   *
   * @default 20
   */
  distanceThreshold?: number;

  /**
   * Minimum time (ms) between emitted locations.
   *
   * @default 4000
   */
  timeThreshold?: number;
} & PositionOptions;

export function useGeolocationWatcher(options: UseGeolocationWatcherOptions = {}) {
  const { enableHighAccuracy = true, maximumAge = 10000, timeout = 5000, onSuccess, onError } = options;
  const [data, setData] = useState<LocationCoordinates | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [isPending, setIsPending] = useState(true);
  const lastCoords = useRef<LocationCoordinates | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      const error = new GeolocationError({ code: GeolocationError.UNSUPPORTED, message: 'Not supported' });
      setError(error);
      setIsPending(false);
      onError?.(error);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      position => {
        const distanceThreshold = Math.max(options.distanceThreshold ?? 20, 20);
        const timeThreshold = Math.max(options.timeThreshold ?? 1000, 1000);
        const { latitude, longitude, accuracy } = position.coords;
        const coords: LocationCoordinates = { latitude, longitude, accuracy, timestamp: position.timestamp };

        const prev = lastCoords.current;
        if (prev) {
          const distance = distanceBetween(prev.latitude, prev.longitude, latitude, longitude);
          const time = position.timestamp - prev.timestamp;
          const movedEnough = distance >= distanceThreshold;
          const waitedEnough = time >= timeThreshold;

          if (!movedEnough || !waitedEnough) {
            return;
          }
        }

        lastCoords.current = coords;

        setData(coords);
        setError(null);
        setIsPending(false);
        onSuccess?.(coords);
      },
      err => {
        const error = new GeolocationError(err);

        setError(error);
        setIsPending(false);
        onError?.(error);
      },
      {
        enableHighAccuracy,
        maximumAge,
        timeout,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const isSuccess = data !== null && error === null;
  const isError = error !== null;

  return {
    data,
    error,
    isPending,
    isSuccess,
    isError,
  };
}
