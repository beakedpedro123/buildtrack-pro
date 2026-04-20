/**
 * OfflineBanner — Shows a subtle banner when the device is truly offline.
 * Uses the same connectivity check as the offline queue (full API base URL).
 * Defaults to ONLINE (hidden) to avoid false positives on startup.
 * Only shows after multiple consecutive failed checks to prevent flicker.
 */
import { useEffect, useState, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { getApiBaseUrl } from "@/constants/oauth";

// Number of consecutive failures before showing the banner
const FAILURE_THRESHOLD = 2;
const CHECK_INTERVAL = 15_000; // 15 seconds

export function OfflineBanner() {
  const colors = useColors();
  const [isOffline, setIsOffline] = useState(false); // Default to online
  const failCountRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const checkConnectivity = async () => {
      // On web, use navigator.onLine as primary signal
      if (Platform.OS === "web") {
        if (!navigator.onLine) {
          failCountRef.current++;
          if (failCountRef.current >= FAILURE_THRESHOLD) {
            setIsOffline(true);
          }
        } else {
          failCountRef.current = 0;
          setIsOffline(false);
        }
        return;
      }

      // On native: use the full API base URL (same as offline-queue.tsx)
      try {
        const base = getApiBaseUrl();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${base}/api/health`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timer);
        if (res.ok) {
          failCountRef.current = 0;
          setIsOffline(false);
          return;
        }
      } catch {
        // First check failed, try fallback
      }

      // Fallback: check navigator.onLine if available
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        failCountRef.current++;
        if (failCountRef.current >= FAILURE_THRESHOLD) {
          setIsOffline(true);
        }
        return;
      }

      // Second attempt: try tRPC endpoint
      try {
        const base = getApiBaseUrl();
        const controller2 = new AbortController();
        const timer2 = setTimeout(() => controller2.abort(), 6000);
        await fetch(`${base}/api/trpc`, {
          method: "HEAD",
          signal: controller2.signal,
        });
        clearTimeout(timer2);
        failCountRef.current = 0;
        setIsOffline(false);
        return;
      } catch {
        // Second check also failed
      }

      // If navigator says we're online, trust it (avoid false positives)
      if (typeof navigator !== "undefined" && navigator.onLine) {
        failCountRef.current = 0;
        setIsOffline(false);
        return;
      }

      // Both checks failed and navigator doesn't say online
      failCountRef.current++;
      if (failCountRef.current >= FAILURE_THRESHOLD) {
        setIsOffline(true);
      }
    };

    // Delay first check slightly to let the app initialize
    const initialTimer = setTimeout(checkConnectivity, 3000);

    // Re-check periodically
    intervalRef.current = setInterval(checkConnectivity, CHECK_INTERVAL);

    // Listen for online/offline events on web
    if (Platform.OS === "web") {
      const goOnline = () => {
        failCountRef.current = 0;
        setIsOffline(false);
      };
      const goOffline = () => {
        failCountRef.current = FAILURE_THRESHOLD;
        setIsOffline(true);
      };
      window.addEventListener("online", goOnline);
      window.addEventListener("offline", goOffline);
      return () => {
        clearTimeout(initialTimer);
        if (intervalRef.current) clearInterval(intervalRef.current);
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
      };
    }

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.warning }]}>
      <Text style={styles.text}>
        {Platform.OS === "web" ? "\u26A1" : "\uD83D\uDCF6"} Offline — showing cached data
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#000",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
