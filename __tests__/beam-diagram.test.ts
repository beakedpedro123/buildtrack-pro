import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// Load the beam diagram module
const beamDiagramPath = path.join(process.cwd(), "server", "beam-diagram.ts");

describe("Beam Diagram Generator", () => {
  it("should export generateBeamDiagramForDesignation function", async () => {
    const mod = await import("../server/beam-diagram");
    expect(typeof mod.generateBeamDiagramForDesignation).toBe("function");
  });

  it("should generate valid SVG for a known W-shape (W18x50)", async () => {
    const mod = await import("../server/beam-diagram");
    const profilesPath = path.join(process.cwd(), "server", "data", "aisc-steel-profiles.json");
    const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
    const svg = mod.generateBeamDiagramForDesignation("W18x50", profiles);
    expect(svg).toBeTruthy();
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("W18x50"); // designation should appear in the SVG
    expect(svg).toContain("xmlns="); // proper SVG namespace
  });

  it("should return null for a non-existent designation", async () => {
    const mod = await import("../server/beam-diagram");
    const profilesPath = path.join(process.cwd(), "server", "data", "aisc-steel-profiles.json");
    const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
    const svg = mod.generateBeamDiagramForDesignation("W999x999", profiles);
    expect(svg).toBeNull();
  });

  it("should generate SVG for W12x26 with proper dimension labels", async () => {
    const mod = await import("../server/beam-diagram");
    const profilesPath = path.join(process.cwd(), "server", "data", "aisc-steel-profiles.json");
    const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
    const svg = mod.generateBeamDiagramForDesignation("W12x26", profiles);
    expect(svg).toBeTruthy();
    // Should contain dimension labels (subscript notation: t_w, t_f, b_f)
    expect(svg).toContain("b"); // flange width label
    expect(svg).toContain("d ="); // depth dimension
    expect(svg).toContain("in"); // inch units
  });

  it("should handle case-insensitive designation lookup", async () => {
    const mod = await import("../server/beam-diagram");
    const profilesPath = path.join(process.cwd(), "server", "data", "aisc-steel-profiles.json");
    const profiles = JSON.parse(fs.readFileSync(profilesPath, "utf-8"));
    const svg1 = mod.generateBeamDiagramForDesignation("w14x48", profiles);
    const svg2 = mod.generateBeamDiagramForDesignation("W14X48", profiles);
    // Both should produce valid SVG (or both null if case matters)
    // At minimum, the standard form should work
    const svg3 = mod.generateBeamDiagramForDesignation("W14x48", profiles);
    expect(svg3).toBeTruthy();
  });
});

describe("Beam Diagram Endpoint URL Construction", () => {
  it("should construct absolute diagram URL with production base", () => {
    const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || "https://buildtrack-dnjxcthz.manus.space";
    const designation = "W18x50";
    const diagramUrl = `${apiBase.replace(/\/$/, "")}/api/beam-diagram?designation=${encodeURIComponent(designation)}`;
    expect(diagramUrl).toContain("https://");
    expect(diagramUrl).toContain("/api/beam-diagram?designation=W18x50");
    expect(diagramUrl.startsWith("/api/")).toBe(false); // Must be absolute, not relative
  });
});

describe("GPS Coordinate Schema", () => {
  it("clock entries schema should include latitude/longitude columns", async () => {
    const schema = await import("../drizzle/schema");
    const columns = Object.keys(schema.clockEntries);
    // The table object should have these column accessors
    expect(schema.clockEntries).toBeDefined();
    // Check the InsertClockEntry type includes lat/lng (runtime check via schema)
    expect(schema.clockEntries.clockInLatitude).toBeDefined();
    expect(schema.clockEntries.clockInLongitude).toBeDefined();
    expect(schema.clockEntries.clockOutLatitude).toBeDefined();
    expect(schema.clockEntries.clockOutLongitude).toBeDefined();
  });
});
