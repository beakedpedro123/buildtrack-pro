import { describe, it, expect } from "vitest";

describe("Stripe API Keys", () => {
  it("should have BTP_STRIPE_SK set and valid format", () => {
    const sk = process.env.BTP_STRIPE_SK;
    expect(sk).toBeDefined();
    expect(sk!.length).toBeGreaterThan(20);
    expect(sk!.startsWith("sk_test_") || sk!.startsWith("sk_live_")).toBe(true);
  });

  it("should have STRIPE_PUBLISHABLE_KEY set and valid format", () => {
    const pk = process.env.STRIPE_PUBLISHABLE_KEY;
    expect(pk).toBeDefined();
    expect(pk!.length).toBeGreaterThan(20);
    expect(pk!.startsWith("pk_test_") || pk!.startsWith("pk_live_")).toBe(true);
  });

  it("should be able to reach Stripe API with secret key", async () => {
    const sk = process.env.BTP_STRIPE_SK;
    if (!sk) throw new Error("BTP_STRIPE_SK not set");

    // Call Stripe's /v1/balance endpoint as a lightweight validation
    const response = await fetch("https://api.stripe.com/v1/balance", {
      headers: {
        Authorization: `Bearer ${sk}`,
      },
    });

    // 200 = valid key, 401 = invalid key
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.object).toBe("balance");
  });
});
