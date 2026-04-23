import "@/global.css";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { AppState, KeyboardAvoidingView, Platform } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import "@/lib/_core/nativewind-pressable";
import { ThemeProvider } from "@/lib/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { ClockStateProvider } from "@/lib/clock-state-context";
import { OfflineQueueProvider } from "@/lib/offline-queue";
import { setupNotificationHandler } from "@/lib/notifications";
import * as Notifications from "expo-notifications";
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from "react-native-safe-area-context";
import type { EdgeInsets, Metrics, Rect } from "react-native-safe-area-context";
import { trpc, createTRPCClient } from "@/lib/trpc";
import { initManusRuntime, subscribeSafeAreaInsets } from "@/lib/_core/manus-runtime";
import { PivotChat } from "@/components/pivot-chat";
import { LanguageProvider } from "@/lib/language-context";
import { setGlobalQueryClient } from "@/lib/query-client-ref";

// Set up notification handler at module level (before any component mounts)
if (Platform.OS !== "web") {
  setupNotificationHandler();
}

// Bridge React Native AppState to React Query's focusManager
// This makes refetchOnWindowFocus work on mobile — without this,
// data never refreshes when switching tabs or returning to the app
function useAppStateFocusManager() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });
    return () => subscription.remove();
  }, []);
}

// Bridge network state to React Query's onlineManager
// This ensures queries pause when offline and resume when back online
function useOnlineManager() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const isConnected = state.isConnected != null ? state.isConnected : true;
      onlineManager.setOnline(isConnected);
    });
    return () => unsubscribe();
  }, []);
}

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  // Activate AppState → focusManager bridge for data refresh on tab/app switch
  useAppStateFocusManager();
  // Activate network state → onlineManager bridge for offline/online transitions
  useOnlineManager();

  const router = useRouter();
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;

  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);

  // Initialize Manus runtime for cookie injection from parent container
  useEffect(() => {
    initManusRuntime();
  }, []);

  // Handle notification taps — deep-link to Meetings tab
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.screen === "meetings") {
        // Navigate to meetings — if user doesn't have meetings tab, it will just go to home
        try { router.push("/(tabs)/meetings"); } catch { router.push("/(tabs)"); }
      } else if (data?.screen === "goals") {
        try { router.push("/(tabs)/goals"); } catch { router.push("/(tabs)"); }
      } else if (data?.screen === "clock") {
        try { router.push("/(tabs)/clock" as any); } catch { router.push("/(tabs)"); }
      }
    });
    return () => sub.remove();
  }, [router]);

  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const unsubscribe = subscribeSafeAreaInsets(handleSafeAreaUpdate);
    return () => unsubscribe();
  }, [handleSafeAreaUpdate]);

  // Create clients once and reuse them
  const [queryClient] = useState(
    () => {
      const qc = new QueryClient({
        defaultOptions: {
          queries: {
            // Enable refetching on window focus — now works on mobile via AppState bridge
            refetchOnWindowFocus: true,
            // Refetch when component mounts if data is stale
            refetchOnMount: true,
            // Refetch when network reconnects
            refetchOnReconnect: true,
            // Retry failed requests once
            retry: 1,
            // Data stays fresh for 30 seconds — ensures tabs show updated data quickly
            // while still preventing excessive refetches on rapid navigation
            staleTime: 30_000,
            // Keep unused query data in cache for 3 minutes
            gcTime: 3 * 60_000,
          },
          mutations: {
            // Never retry mutations — fail fast so offline queue catches immediately
            retry: 0,
          },
        },
      });
      setGlobalQueryClient(qc);
      return qc;
    },
  );
  const [trpcClient] = useState(() => createTRPCClient());

  // Ensure minimum 8px padding for top and bottom on mobile
  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialInsets, initialFrame]);

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <LanguageProvider>
              <OfflineQueueProvider>
              <ClockStateProvider>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="timecard/[id]" options={{ presentation: "card" }} />
                  <Stack.Screen name="login" options={{ presentation: "fullScreenModal" }} />
                  <Stack.Screen name="oauth/callback" />
                </Stack>
                <StatusBar style="auto" />
                <PivotChat />
              </ClockStateProvider>
              </OfflineQueueProvider>
              </LanguageProvider>
            </AuthProvider>
          </QueryClientProvider>
        </trpc.Provider>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );

  const shouldOverrideSafeArea = Platform.OS === "web";

  if (shouldOverrideSafeArea) {
    return (
      <ThemeProvider>
        <SafeAreaProvider initialMetrics={providerInitialMetrics}>
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>
              {content}
            </SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        </SafeAreaProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>{content}</SafeAreaProvider>
    </ThemeProvider>
  );
}
