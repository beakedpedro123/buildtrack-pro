/**
 * OfflineBanner — Shows a subtle banner when the device is offline.
 * Uses navigator.onLine + periodic fetch check for connectivity detection.
 * Displays "Offline — showing cached data" when no internet.
 */
import { useEffect, useState, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

export function OfflineBanner() {
  const colors = useColors();
  const [isOffline, setIsOffline] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Check connectivity via navigator.onLine (web) or a lightweight fetch
    const checkConnectivity = async () => {
      if (Platform.OS === "web") {
        setIsOffline(!navigator.onLine);
        return;
      }
      try {
        // Lightweight connectivity check — HEAD request to our own API
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        await fetch("/api/health", { method: "HEAD", signal: controller.signal });
        clearTimeout(timeout);
        setIsOffline(false);
      } catch {
        setIsOffline(true);
      }
    };

    checkConnectivity();

    // Re-check every 10 seconds
    intervalRef.current = setInterval(checkConnectivity, 10000);

    // Listen for online/offline events on web
    if (Platform.OS === "web") {
      const goOnline = () => setIsOffline(false);
      const goOffline = () => setIsOffline(true);
      window.addEventListener("online", goOnline);
      window.addEventListener("offline", goOffline);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
      };
    }

    return () => {
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
