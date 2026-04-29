import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MEETING_NOTIF_ID_KEY = "buildtrack_meeting_notif_id";
const MEETING_NOTIF_ENABLED_KEY = "buildtrack_meeting_notif_enabled";
const CHANNEL_ID = "meeting_reminders";
const GOALS_CHANNEL_ID = "goals_tasks";
const PUSH_TOKEN_KEY = "buildtrack_push_token";

// Management roles that should receive the Friday meeting reminder
const MANAGEMENT_ROLES = ["owner", "office_manager", "logistics", "foreman"];

/**
 * Configure the notification handler so alerts show when the app is in foreground.
 * Call this once at app startup (in _layout.tsx).
 */
export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Create the Android notification channel for meeting reminders.
 */
async function ensureAndroidChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "Meeting Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#E85D04",
      description: "Weekly Friday management meeting reminders",
    });
    await Notifications.setNotificationChannelAsync(GOALS_CHANNEL_ID, {
      name: "Goals & Tasks",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#D4AF37",
      description: "Goal assignments, task reminders, and schedule updates",
    });
  }
}

/**
 * Request notification permissions from the user.
 * Returns true if granted, false otherwise.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  await ensureAndroidChannel();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Schedule the recurring Friday 2:45 PM meeting reminder.
 * Cancels any existing scheduled reminder first to avoid duplicates.
 * Only schedules for management roles.
 */
export async function scheduleFridayMeetingReminder(role: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  if (!MANAGEMENT_ROLES.includes(role)) return false;

  const granted = await requestNotificationPermissions();
  if (!granted) return false;

  // Cancel any existing reminder first
  await cancelFridayMeetingReminder();

  // Schedule weekly recurring notification every Friday (weekday 6 = Friday)
  // weekday: 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday, 7=Saturday
  const notifId = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Friday Management Meeting",
      body: "Your 3:00 PM management meeting starts in 15 minutes. Tap to open the Meetings tab.",
      data: { screen: "meetings" },
      sound: true,
      ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 6, // Friday (1=Sun, 2=Mon, ..., 6=Fri, 7=Sat)
      hour: 14,   // 2:45 PM = 14:45
      minute: 45,
      channelId: Platform.OS === "android" ? CHANNEL_ID : undefined,
    } as any,
  });

  await AsyncStorage.setItem(MEETING_NOTIF_ID_KEY, notifId);
  await AsyncStorage.setItem(MEETING_NOTIF_ENABLED_KEY, "true");

  return true;
}

/**
 * Cancel the Friday meeting reminder notification.
 */
export async function cancelFridayMeetingReminder(): Promise<void> {
  if (Platform.OS === "web") return;

  const existingId = await AsyncStorage.getItem(MEETING_NOTIF_ID_KEY);
  if (existingId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(existingId);
    } catch {
      // Notification may already be cancelled
    }
    await AsyncStorage.removeItem(MEETING_NOTIF_ID_KEY);
  }
  await AsyncStorage.setItem(MEETING_NOTIF_ENABLED_KEY, "false");
}

/**
 * Check if the Friday meeting reminder is currently enabled.
 */
export async function isMeetingReminderEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const val = await AsyncStorage.getItem(MEETING_NOTIF_ENABLED_KEY);
  return val === "true";
}

/**
 * Get the current notification permission status.
 */
export async function getNotificationPermissionStatus(): Promise<string> {
  if (Platform.OS === "web") return "unavailable";
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Toggle the Friday meeting reminder on or off.
 */
export async function toggleMeetingReminder(role: string, enable: boolean): Promise<boolean> {
  if (enable) {
    return scheduleFridayMeetingReminder(role);
  } else {
    await cancelFridayMeetingReminder();
    return false;
  }
}

/**
 * Register the device's Expo push token with the server.
 * Call this after login to enable push notifications for goals, tasks, etc.
 */
export async function registerPushToken(
  employeeId: number,
  trpcClient: { employees: { registerPushToken: { mutate: (input: { employeeId: number; pushToken: string }) => Promise<any> } } }
): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Uses the project ID from app.json automatically
    });
    const token = tokenData.data;

    // Check if token changed
    const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (storedToken === token) return token; // Already registered

    // Register with server
    await trpcClient.employees.registerPushToken.mutate({
      employeeId,
      pushToken: token,
    });

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return token;
  } catch (err) {
    console.warn("[Push] Failed to register push token:", err);
    return null;
  }
}

/**
 * Clear the push token on logout.
 */
export async function clearPushToken(
  employeeId: number,
  trpcClient: { employees: { clearPushToken: { mutate: (input: { employeeId: number }) => Promise<any> } } }
): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    await trpcClient.employees.clearPushToken.mutate({ employeeId });
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {}
}

/**
 * Handle notification response (when user taps a notification).
 * Returns the screen path to navigate to, or null.
 */
/**
 * Register push token using direct fetch (no tRPC client needed).
 * Used from auth-context callbacks where hooks aren't available.
 */
export async function registerPushTokenDirect(employeeId: number): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return null;

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: undefined });
    const token = tokenData.data;

    const storedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (storedToken === token) return token;

    // Use the trpc batch endpoint directly
    const { getApiBaseUrl } = await import("@/constants/oauth");
    const baseUrl = getApiBaseUrl();
    const empRaw = await AsyncStorage.getItem("buildtrack_employee");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (empRaw) {
      try { const emp = JSON.parse(empRaw); if (emp?.companyId) headers["x-company-id"] = String(emp.companyId); } catch {}
    }

    await fetch(`${baseUrl}/api/trpc/employees.registerPushToken`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ json: { employeeId, pushToken: token } }),
    });

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    return token;
  } catch (err) {
    console.warn("[Push] Failed to register push token:", err);
    return null;
  }
}

/**
 * Clear push token using direct fetch.
 */
export async function clearPushTokenDirect(employeeId: number): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { getApiBaseUrl } = await import("@/constants/oauth");
    const baseUrl = getApiBaseUrl();
    const empRaw = await AsyncStorage.getItem("buildtrack_employee");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (empRaw) {
      try { const emp = JSON.parse(empRaw); if (emp?.companyId) headers["x-company-id"] = String(emp.companyId); } catch {}
    }

    await fetch(`${baseUrl}/api/trpc/employees.clearPushToken`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ json: { employeeId } }),
    });
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {}
}

export function getNotificationScreen(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data;
  if (data && typeof data === "object" && "screen" in data) {
    return data.screen as string;
  }
  return null;
}
