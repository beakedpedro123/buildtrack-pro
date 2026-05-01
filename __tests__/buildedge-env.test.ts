import { describe, it, expect } from "vitest";

describe("BuildEdge Owner Company ID", () => {
  it("BUILDEDGE_OWNER_COMPANY_ID is set and is a positive integer", () => {
    const val = process.env.BUILDEDGE_OWNER_COMPANY_ID;
    expect(val).toBeDefined();
    const num = parseInt(val!, 10);
    expect(num).toBeGreaterThan(0);
    expect(Number.isInteger(num)).toBe(true);
  });
});
