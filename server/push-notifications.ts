/**
 * Push Notification Service for BuildTrack Pro
 * Uses Expo Push Notification API to send push notifications to employee devices.
 * No API key required — Expo push service is free for Expo projects.
 */

import * as db from "./db";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  categoryId?: string;
}

interface PushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Send push notifications to specific employees by their IDs.
 */
export async function sendPushToEmployees(
  employeeIds: number[],
  notification: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channelId?: string;
  }
): Promise<{ sent: number; failed: number }> {
  if (employeeIds.length === 0) return { sent: 0, failed: 0 };

  const tokens = await db.getPushTokensForEmployees(employeeIds);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const messages: PushMessage[] = tokens.map((t) => ({
    to: t.pushToken,
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    sound: "default",
    priority: "high",
    channelId: notification.channelId || "goals_tasks",
  }));

  return sendPushMessages(messages);
}

/**
 * Send push notification to ALL employees in a company.
 */
export async function sendPushToAll(
  companyId: number,
  notification: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
    channelId?: string;
  }
): Promise<{ sent: number; failed: number }> {
  const tokens = await db.getAllPushTokens(companyId);
  if (tokens.length === 0) return { sent: 0, failed: 0 };

  const messages: PushMessage[] = tokens.map((t) => ({
    to: t.pushToken,
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    sound: "default",
    priority: "high",
    channelId: notification.channelId || "goals_tasks",
  }));

  return sendPushMessages(messages);
}

/**
 * Send a goal assignment notification.
 */
export async function notifyGoalAssigned(params: {
  assignedEmployeeIds: number[];
  goalTitle: string;
  priority: string;
  deadline?: string;
  assignedBy: string;
}): Promise<void> {
  const { assignedEmployeeIds, goalTitle, priority, deadline, assignedBy } = params;
  if (assignedEmployeeIds.length === 0) return;

  const priorityEmoji = priority === "high" ? "🔴" : priority === "medium" ? "🟡" : "🟢";
  const deadlineStr = deadline
    ? ` — Due: ${new Date(deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Denver" })}`
    : "";

  await sendPushToEmployees(assignedEmployeeIds, {
    title: `${priorityEmoji} New Goal Assigned`,
    body: `${goalTitle}${deadlineStr}\nAssigned by ${assignedBy}`,
    data: { screen: "/(tabs)/goals", type: "goal_assigned" },
    channelId: "goals_tasks",
  });
}

/**
 * Send a schedule task assignment notification.
 */
export async function notifyTaskAssigned(params: {
  assignedEmployeeIds: number[];
  taskTitle: string;
  jobName: string;
  scheduledDate: string;
}): Promise<void> {
  const { assignedEmployeeIds, taskTitle, jobName, scheduledDate } = params;
  if (assignedEmployeeIds.length === 0) return;

  const dateStr = new Date(scheduledDate).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Denver",
  });

  await sendPushToEmployees(assignedEmployeeIds, {
    title: "📋 New Task Assigned",
    body: `${taskTitle} — ${jobName}\nScheduled: ${dateStr}`,
    data: { screen: "/(tabs)/jobs", type: "task_assigned" },
    channelId: "goals_tasks",
  });
}

/**
 * Send overdue goal reminder notification.
 */
export async function notifyGoalOverdue(params: {
  assignedEmployeeIds: number[];
  goalTitle: string;
  daysOverdue: number;
}): Promise<void> {
  const { assignedEmployeeIds, goalTitle, daysOverdue } = params;
  if (assignedEmployeeIds.length === 0) return;

  await sendPushToEmployees(assignedEmployeeIds, {
    title: "⚠️ Overdue Goal",
    body: `"${goalTitle}" is ${daysOverdue} day${daysOverdue > 1 ? "s" : ""} overdue. Please update your progress.`,
    data: { screen: "/(tabs)/goals", type: "goal_overdue" },
    channelId: "goals_tasks",
  });
}

/**
 * Send day-before schedule reminder notification.
 */
export async function notifyUpcomingTask(params: {
  assignedEmployeeIds: number[];
  taskTitle: string;
  jobName: string;
  scheduledDate: string;
}): Promise<void> {
  const { assignedEmployeeIds, taskTitle, jobName, scheduledDate } = params;
  if (assignedEmployeeIds.length === 0) return;

  const dateStr = new Date(scheduledDate).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: "America/Denver",
  });

  await sendPushToEmployees(assignedEmployeeIds, {
    title: "📅 Tomorrow's Task",
    body: `${taskTitle} — ${jobName}\nScheduled for ${dateStr}`,
    data: { screen: "/(tabs)/jobs", type: "task_reminder" },
    channelId: "goals_tasks",
  });
}

/**
 * Low-level: send batch of push messages to Expo push service.
 * Handles chunking (max 100 per request as per Expo docs).
 */
async function sendPushMessages(messages: PushMessage[]): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  // Expo recommends max 100 notifications per request
  const chunks = chunkArray(messages, 100);

  for (const chunk of chunks) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        console.warn(`[Push] Expo push API returned ${response.status}`);
        failed += chunk.length;
        continue;
      }

      const result = await response.json() as { data: PushTicket[] };
      for (const ticket of result.data) {
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
          if (ticket.details?.error === "DeviceNotRegistered") {
            // Token is invalid — could clean it up from DB
            console.warn(`[Push] Device not registered, should clean token`);
          }
        }
      }
    } catch (err) {
      console.warn(`[Push] Error sending push notifications:`, err);
      failed += chunk.length;
    }
  }

  return { sent, failed };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
