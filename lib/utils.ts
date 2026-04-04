import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date/time to 12-hour format (e.g., "2:30 PM")
 * Used everywhere in the app instead of military/24-hour time.
 */
export function formatTime12(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Format a date/time to 12-hour format with date (e.g., "Mar 15 2:30 PM")
 */
export function formatDateTime12(date: Date | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const dateStr = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} ${formatTime12(d)}`;
}

/**
 * Format a time input string for editing (HH:MM in 12hr with AM/PM)
 * Returns { time: "2:30", ampm: "PM" }
 */
export function formatTimeForEdit(date: Date | string): { time: string; ampm: string } {
  const d = new Date(date);
  if (isNaN(d.getTime())) return { time: "", ampm: "AM" };
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return {
    time: `${hours}:${minutes.toString().padStart(2, "0")}`,
    ampm,
  };
}

/**
 * Parse a 12-hour time string back to 24-hour components.
 * Input: "2:30" with ampm "PM" → { hours: 14, minutes: 30 }
 */
export function parse12HrTime(timeStr: string, ampm: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return { hours, minutes };
}
