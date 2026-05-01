import { describe, it, expect } from "vitest";
import crypto from "crypto";

describe("SSN Encryption Key Validation", () => {
  it("SSN_ENCRYPTION_KEY is set and is 64 hex chars", () => {
    const key = process.env.SSN_ENCRYPTION_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(key!)).toBe(true);
  });

  it("can encrypt and decrypt SSN with the key", () => {
    const key = process.env.SSN_ENCRYPTION_KEY!;
    const testSSN = "123-45-6789";

    // Encrypt
    const derivedKey = crypto.createHash("sha256").update(key).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, iv);
    let encrypted = cipher.update(testSSN, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    const encryptedValue = `enc:${iv.toString("hex")}:${authTag}:${encrypted}`;

    expect(encryptedValue.startsWith("enc:")).toBe(true);

    // Decrypt
    const parts = encryptedValue.split(":");
    const decIv = Buffer.from(parts[1], "hex");
    const decTag = Buffer.from(parts[2], "hex");
    const decData = parts[3];
    const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, decIv);
    decipher.setAuthTag(decTag);
    let decrypted = decipher.update(decData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    expect(decrypted).toBe(testSSN);
  });
});
