/**
 * useGpsTracking — Account-level GPS tracking toggle
 *
 * Owner can enable/disable GPS tracking for all clock-in/out events.
 * When enabled, the clock screen captures GPS coordinates.
 * Stored in AsyncStorage (local device setting).
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const GPS_TRACKING_KEY = "buildtrack_gps_tracking_enabled";

export function useGpsTracking() {
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(GPS_TRACKING_KEY)
      .then((val) => {
        setGpsEnabled(val === "true");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const toggleGps = useCallback(async (enabled: boolean) => {
    setGpsEnabled(enabled);
    await AsyncStorage.setItem(GPS_TRACKING_KEY, enabled ? "true" : "false");
  }, []);

  return { gpsEnabled, toggleGps, loaded };
}
