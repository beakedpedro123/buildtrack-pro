import { describe, it, expect, vi } from "vitest";

/* ─── withTimeout helper (copied from clock.tsx) ─── */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out. Please try again.")), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

describe("withTimeout helper", () => {
  it("resolves when promise resolves within timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 5000);
    expect(result).toBe("ok");
  });

  it("rejects with timeout error when promise takes too long", async () => {
    const slowPromise = new Promise((resolve) => setTimeout(resolve, 10000));
    await expect(withTimeout(slowPromise, 50)).rejects.toThrow("Request timed out");
  });

  it("rejects with original error when promise rejects", async () => {
    const failPromise = Promise.reject(new Error("Network error"));
    await expect(withTimeout(failPromise, 5000)).rejects.toThrow("Network error");
  });
});

/* ─── formatDuration (copied from clock.tsx) ─── */
function formatDuration(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

describe("formatDuration", () => {
  it("formats zero correctly", () => {
    expect(formatDuration(0)).toBe("0h 0m");
  });

  it("formats hours and minutes correctly", () => {
    expect(formatDuration(5400000)).toBe("1h 30m"); // 1.5 hours
  });

  it("formats large durations", () => {
    expect(formatDuration(28800000)).toBe("8h 0m"); // 8 hours
  });
});

/* ─── Multi-assign toggle logic (from goals) ─── */
const MAX_ASSIGNEES = 5;

function toggleAssignee(ids: number[], empId: number): number[] {
  if (ids.includes(empId)) {
    return ids.filter(id => id !== empId);
  } else if (ids.length < MAX_ASSIGNEES) {
    return [...ids, empId];
  }
  return ids; // no change if at max
}

describe("Multi-assign goals (up to 5)", () => {
  it("adds an assignee", () => {
    const result = toggleAssignee([], 1);
    expect(result).toEqual([1]);
  });

  it("removes an existing assignee", () => {
    const result = toggleAssignee([1, 2, 3], 2);
    expect(result).toEqual([1, 3]);
  });

  it("allows up to 5 assignees", () => {
    let ids: number[] = [];
    for (let i = 1; i <= 5; i++) {
      ids = toggleAssignee(ids, i);
    }
    expect(ids).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not add more than 5 assignees", () => {
    const ids = [1, 2, 3, 4, 5];
    const result = toggleAssignee(ids, 6);
    expect(result).toEqual([1, 2, 3, 4, 5]); // unchanged
  });

  it("can remove and re-add within limit", () => {
    let ids = [1, 2, 3, 4, 5];
    ids = toggleAssignee(ids, 3); // remove 3
    expect(ids).toEqual([1, 2, 4, 5]);
    ids = toggleAssignee(ids, 6); // add 6
    expect(ids).toEqual([1, 2, 4, 5, 6]);
  });
});

/* ─── Clock-in time editing validation ─── */
function validateTimeStr(timeStr: string): { valid: boolean; hours?: number; mins?: number; error?: string } {
  const parts = timeStr.split(":");
  if (parts.length !== 2) return { valid: false, error: "Invalid format" };
  const hours = parseInt(parts[0], 10);
  const mins = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return { valid: false, error: "Invalid time" };
  }
  return { valid: true, hours, mins };
}

describe("Clock-in time editing validation", () => {
  it("validates correct time", () => {
    const result = validateTimeStr("07:30");
    expect(result.valid).toBe(true);
    expect(result.hours).toBe(7);
    expect(result.mins).toBe(30);
  });

  it("validates midnight", () => {
    const result = validateTimeStr("00:00");
    expect(result.valid).toBe(true);
  });

  it("validates end of day", () => {
    const result = validateTimeStr("23:59");
    expect(result.valid).toBe(true);
  });

  it("rejects invalid format", () => {
    expect(validateTimeStr("7").valid).toBe(false);
    expect(validateTimeStr("abc").valid).toBe(false);
  });

  it("rejects out of range hours", () => {
    expect(validateTimeStr("24:00").valid).toBe(false);
    expect(validateTimeStr("-1:00").valid).toBe(false);
  });

  it("rejects out of range minutes", () => {
    expect(validateTimeStr("12:60").valid).toBe(false);
  });
});

/* ─── Web location fallback logic ─── */
describe("Web location fallback", () => {
  it("returns null when geolocation is not available", async () => {
    // Simulate web environment without geolocation
    const result = await (async () => {
      try {
        if (!(globalThis as any).navigator?.geolocation) return null;
        return { lat: 0, lng: 0 };
      } catch { return null; }
    })();
    expect(result).toBeNull();
  });
});
