/**
 * Security Crypto Utilities
 * - PIN hashing with bcrypt
 * - SSN encryption with AES-256-GCM
 */
import bcrypt from "bcryptjs";
import crypto from "crypto";

// ─── PIN Hashing ─────────────────────────────────────────────────────────────
const PIN_SALT_ROUNDS = 10;

/**
 * Hash a PIN using bcrypt. Returns the hash string.
 */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, PIN_SALT_ROUNDS);
}

/**
 * Verify a PIN against a bcrypt hash.
 * Also supports legacy plaintext comparison during migration period.
 */
export async function verifyPin(pin: string, storedValue: string): Promise<boolean> {
  // If the stored value looks like a bcrypt hash ($2a$ or $2b$ prefix), use bcrypt compare
  if (storedValue.startsWith("$2a$") || storedValue.startsWith("$2b$")) {
    return bcrypt.compare(pin, storedValue);
  }
  // Legacy: plaintext comparison (for PINs not yet migrated)
  // This allows existing users to still log in while we migrate
  return pin === storedValue;
}

// ─── SSN Encryption ──────────────────────────────────────────────────────────
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard IV length
const TAG_LENGTH = 16; // GCM auth tag length

/**
 * Get the encryption key from environment. Must be 32 bytes (64 hex chars).
 * SECURITY FIX (R1-4): In production, SSN_ENCRYPTION_KEY is REQUIRED.
 * No fallback to JWT_SECRET — SSN encryption uses a dedicated key.
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.SSN_ENCRYPTION_KEY;
  if (envKey && envKey.length === 64) {
    return Buffer.from(envKey, "hex");
  }
  // In production, require the dedicated key — no fallback
  if (process.env.NODE_ENV === "production") {
    throw new Error("[FATAL] SSN_ENCRYPTION_KEY must be set in production (64 hex chars).");
  }
  // Development only: derive from JWT_SECRET for local testing convenience
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("SSN_ENCRYPTION_KEY or JWT_SECRET must be set for SSN encryption");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt an SSN value. Returns base64-encoded ciphertext (iv + tag + encrypted).
 */
export function encryptSSN(ssn: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(ssn, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  
  // Concatenate: iv (12) + tag (16) + ciphertext
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString("base64");
}

/**
 * Decrypt an SSN value from base64-encoded ciphertext.
 * Returns null if decryption fails (tampered data).
 */
export function decryptSSN(encryptedBase64: string): string | null {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedBase64, "base64");
    
    if (combined.length < IV_LENGTH + TAG_LENGTH + 1) {
      return null; // Too short to be valid
    }
    
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString("utf8");
  } catch {
    return null; // Decryption failed — data may be tampered or key mismatch
  }
}

/**
 * Check if a value looks like it's already encrypted (base64 with sufficient length).
 */
export function isEncrypted(value: string): boolean {
  // Encrypted SSN will be at least ~40 chars base64 (12 + 16 + 9 bytes = 37 bytes -> ~52 base64 chars)
  // A plaintext SSN is at most 11 chars (xxx-xx-xxxx)
  return value.length > 20 && /^[A-Za-z0-9+/=]+$/.test(value);
}

/**
 * Get the last 4 digits of an SSN (for display purposes).
 * Works with both encrypted and plaintext SSNs.
 */
export function getSSNLast4(value: string): string {
  if (isEncrypted(value)) {
    const decrypted = decryptSSN(value);
    if (!decrypted) return "****";
    return decrypted.replace(/\D/g, "").slice(-4);
  }
  // Plaintext
  return value.replace(/\D/g, "").slice(-4);
}
