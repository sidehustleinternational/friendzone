import Geolocation from '@react-native-community/geolocation';
import { logger } from '../utils/logger';

export type LocationSample = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
};

// Poll device location on an interval. Caller must ensure permissions are granted
// and stop the watcher when no longer needed.
export function startLocationPolling(
  onUpdate: (loc: LocationSample) => void,
  options?: { intervalMs?: number; enableHighAccuracy?: boolean }
) {
  const { intervalMs = 15000, enableHighAccuracy = true } = options || {};

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const poll = () => {
    Geolocation.getCurrentPosition(
      pos => {
        if (stopped) return;
        const { latitude, longitude, accuracy } = pos.coords;
        onUpdate({ latitude, longitude, accuracy, timestamp: pos.timestamp });
      },
      err => {
        // In a production app, route this to logging/monitoring
        logger.warn('Location error', err);
      },
      { enableHighAccuracy, maximumAge: 0, timeout: 10000 }
    );
  };

  // initial
  poll();
  timer = setInterval(poll, intervalMs);

  return () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
}
