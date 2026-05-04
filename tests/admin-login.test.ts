import { describe, it, expect } from "vitest";

const API_BASE = "http://localhost:3000";

describe("Admin Dashboard Login", () => {
  it("should reject login with wrong key", async () => {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "wrong_key_12345" }),
    });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("Invalid admin key");
  });

  it("should accept login with correct ADMIN_DASHBOARD_KEY", async () => {
    const adminKey = process.env.ADMIN_DASHBOARD_KEY;
    if (!adminKey) {
      console.warn("ADMIN_DASHBOARD_KEY not set, skipping test");
      return;
    }
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: adminKey }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.token).toBeTruthy();
    expect(data.user).toBeTruthy();
    expect(data.user.role).toBe("admin");
  });

  it("should verify a valid admin token", async () => {
    const adminKey = process.env.ADMIN_DASHBOARD_KEY;
    if (!adminKey) {
      console.warn("ADMIN_DASHBOARD_KEY not set, skipping test");
      return;
    }
    // First login to get a token
    const loginRes = await fetch(`${API_BASE}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: adminKey }),
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    // Then verify the token
    const verifyRes = await fetch(`${API_BASE}/api/admin/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.valid).toBe(true);
    expect(verifyData.user.role).toBe("admin");
  });

  it("should reject verify with invalid token", async () => {
    const verifyRes = await fetch(`${API_BASE}/api/admin/verify`, {
      headers: { Authorization: "Bearer invalid_token_xyz" },
    });
    expect(verifyRes.status).toBe(401);
    const data = await verifyRes.json();
    expect(data.valid).toBe(false);
  });
});
