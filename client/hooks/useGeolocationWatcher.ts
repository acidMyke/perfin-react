import { useEffect, useState } from 'react';

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
} & PositionOptions;

export function useGeolocationWatcher(options: UseGeolocationWatcherOptions = {}) {
  const { enableHighAccuracy = true, maximumAge = 0, timeout = 5000, onSuccess, onError } = options;
  const [data, setData] = useState<LocationCoordinates | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [isPending, setIsPending] = useState(true);

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
        const coords: LocationCoordinates = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };

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
