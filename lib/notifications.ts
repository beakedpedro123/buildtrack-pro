import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MEETING_NOTIF_ID_KEY = "buildtrack_meeting_notif_id";
const MEETING_NOTIF_ENABLED_KEY = "buildtrack_meeting_notif_enabled";
const CHANNEL_ID = "meeting_reminders";

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
