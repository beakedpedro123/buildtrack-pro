import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..");
function readFile(filePath: string) {
  return fs.readFileSync(path.join(ROOT, filePath), "utf-8");
}

describe("Phase 18 — Safety Tab Access Restrictions", () => {
  it("Safety tab uses canViewSafety (not canMeetings) in _layout.tsx", () => {
    const src = readFile("app/(tabs)/_layout.tsx");
    expect(src).toContain("canViewSafety");
    // canViewSafety should include owner, logistics, foreman — NOT secretary or laborer
    const match = src.match(/const canViewSafety\s*=\s*([^;]+);/);
    expect(match).toBeTruthy();
    if (match) {
      expect(match[1]).toContain("owner");
      expect(match[1]).toContain("logistics");
      expect(match[1]).toContain("foreman");
      expect(match[1]).not.toContain("secretary");
      expect(match[1]).not.toContain("laborer");
    }
  });

  it("Safety tab href uses canViewSafety", () => {
    const src = readFile("app/(tabs)/_layout.tsx");
    // The safety tab should use canViewSafety for its href
    const safetySection = src.match(/name="safety"[\s\S]*?href:\s*([^,}]+)/);
    expect(safetySection).toBeTruthy();
    if (safetySection) {
      expect(safetySection[1]).toContain("canViewSafety");
    }
  });

  it("Safety screen uses canManageTopics (owner + logistics only) for topic management", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("canManageTopics");
    // canManageTopics should be owner + logistics only
    const match = src.match(/const canManageTopics\s*=\s*([^;]+);/);
    expect(match).toBeTruthy();
    if (match) {
      expect(match[1]).toContain("isOwner");
      expect(match[1]).toContain("isLogistics");
      expect(match[1]).not.toContain("secretary");
    }
  });

  it("Safety screen does NOT reference isManagement anymore", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    // isManagement was replaced with canManageTopics
    expect(src).not.toMatch(/\bisManagement\b/);
  });

  it("Foreman can document meetings (canDocument includes foreman)", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    const match = src.match(/const canDocument\s*=\s*([^;]+);/);
    expect(match).toBeTruthy();
    if (match) {
      expect(match[1]).toContain("isForeman");
      expect(match[1]).toContain("canManageTopics");
    }
  });
});

describe("Phase 18 — OSHA Safety Topics Library", () => {
  it("safetyTopics table exists in drizzle schema", () => {
    const src = readFile("drizzle/schema.ts");
    expect(src).toContain("safetyTopics");
    expect(src).toContain("title");
    expect(src).toContain("content");
    expect(src).toContain("category");
    expect(src).toContain("isActive");
  });

  it("Safety topics server endpoints exist", () => {
    const src = readFile("server/routers.ts");
    expect(src).toContain("safetyTopics");
    // Should have list and create endpoints
    expect(src).toMatch(/safetyTopics/);
  });

  it("Safety screen renders topics list with topic selection", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    // Should have topic selection UI
    expect(src).toContain("selectedTopicId");
    expect(src).toContain("topics");
  });

  it("Safety screen has meeting types: safety_toolbox and daily_goals", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    expect(src).toContain("safety_toolbox");
    expect(src).toContain("daily_goals");
  });

  it("Safety screen has compliance tracking cards", () => {
    const src = readFile("app/(tabs)/safety.tsx");
    // Should show compliance: X/3 safety meetings, X/5 goal reviews
    expect(src).toContain("compliance");
  });
});
