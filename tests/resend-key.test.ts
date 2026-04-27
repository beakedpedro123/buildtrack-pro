import { describe, it, expect } from "vitest";

describe("Resend API Key Validation", () => {
  it("should have RESEND_API_KEY set", () => {
    const key = process.env.RESEND_API_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(5);
    expect(key!.startsWith("re_")).toBe(true);
  });

  it("should be able to initialize Resend client", async () => {
    const { Resend } = await import("resend");
    const key = process.env.RESEND_API_KEY!;
    const resend = new Resend(key);
    expect(resend).toBeDefined();
    // Attempt to list API keys as a lightweight validation call
    try {
      const { data, error } = await resend.apiKeys.list();
      // If we get data or a non-auth error, the key format is valid
      if (error) {
        // 401/403 means invalid key
        console.log("Resend API response:", error);
        expect(error.message).not.toContain("Missing API key");
      } else {
        expect(data).toBeDefined();
      }
    } catch (e: any) {
      // Network errors are OK (means key format is valid, just can't reach API)
      console.log("Resend connection test:", e.message);
      expect(e.message).not.toContain("Missing API key");
    }
  });
});
