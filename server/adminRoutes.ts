import type { Express, NextFunction, Request, Response } from "express";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { eq, sql } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { adminAuditLog, adminSettings } from "../drizzle/schema";

const ADMIN_ISSUER = "buildtrack-pro-admin";
const ADMIN_SCOPE = "buildtrack:admin";
const TOKEN_TTL_SECONDS = Number.parseInt(process.env.ADMIN_DASHBOARD_TOKEN_TTL_SECONDS || "28800", 10);
const HASH_ITERATIONS = 210_000;
const LEGACY_KEY_HASH_SETTING = "admin_dashboard_key_hash";
const LEGACY_KEY_ID_SETTING = "admin_dashboard_key_id";

type AdminDefinition = {
  id: string;
  defaultKeyId: string;
  name: string;
  role: string;
  envKeyName: string;
  defaultHash: string;
};

type AdminSession = {
  scope: string;
  role: string;
  name: string;
  adminId: string;
  adminKeyId: string;
  sessionId: string;
};

type AdminKeyVerification =
  | { configured: true; valid: true; source: "database" | "environment" | "default" | "legacy_database" | "legacy_environment"; admin: AdminDefinition; adminKeyId: string }
  | { configured: true; valid: false; source: "database" | "environment" | "default" | "legacy_database" | "legacy_environment" | "mixed" }
  | { configured: false; valid: false; source: "none" };

type AuditResult = "success" | "failure" | "denied";

type AuditDetails = {
  eventType: string;
  result: AuditResult;
  req: Request;
  adminKeyId?: string;
  adminName?: string;
  metadata?: Record<string, unknown>;
};

const ADMIN_DEFINITIONS: AdminDefinition[] = [
  {
    id: "pedro-carranza",
    defaultKeyId: "pedro_primary",
    name: "Pedro Carranza",
    role: "owner",
    envKeyName: "ADMIN_DASHBOARD_KEY_PEDRO",
    defaultHash: "pbkdf2_sha256$210000$6fe83768312dabb6ad10d063e378f090fa2f97e86401fb50$bd5221bd9714aec8e7685ee3971a9724b08fd7f7ea31ef83b05716f828488363",
  },
  {
    id: "pablo-carranza",
    defaultKeyId: "pablo_primary",
    name: "Pablo Carranza",
    role: "office_manager",
    envKeyName: "ADMIN_DASHBOARD_KEY_PABLO",
    defaultHash: "pbkdf2_sha256$210000$3a34152a5df64fa7d98b75983c7a1f25442ec004b6316cc2$6fb1fc611b9e6994751170eb801f902688b15aef9438dd58a7e3c9a7bcaa0a5d",
  },
  {
    id: "lupe-mejia",
    defaultKeyId: "lupe_primary",
    name: "Lupe Mejia",
    role: "office_manager",
    envKeyName: "ADMIN_DASHBOARD_KEY_LUPE",
    defaultHash: "pbkdf2_sha256$210000$d9032d990cd20a6f3dab59a23d94982fe561a8d79b5c0b82$5ab83faffef130c628f16112aa83a80f6a0573938cad58fd6507a98aca92c1f8",
  },
];

let tablesEnsured = false;
let ensuringTables: Promise<void> | null = null;

function getJwtSecret() {
  return ENV.cookieSecret || process.env.JWT_SECRET || "";
}

function getAllowedIps() {
  return (process.env.ADMIN_DASHBOARD_ALLOWED_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

function getClientIp(req: Request) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  const real = String(req.headers["x-real-ip"] || "").trim();
  const raw = forwarded || real || req.socket.remoteAddress || "unknown";
  return raw.replace(/^::ffff:/, "");
}

function isIpAllowed(req: Request) {
  const allowedIps = getAllowedIps();
  if (allowedIps.length === 0) return true;
  const ip = getClientIp(req);
  return allowedIps.includes(ip);
}

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function hashAdminKey(key: string) {
  const salt = randomBytes(24).toString("hex");
  const derived = pbkdf2Sync(key, salt, HASH_ITERATIONS, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$${HASH_ITERATIONS}$${salt}$${derived}`;
}

function verifyHashedAdminKey(key: string, storedHash: string) {
  const [algorithm, iterationText, salt, expectedHex] = storedHash.split("$");
  const iterations = Number.parseInt(iterationText, 10);
  if (algorithm !== "pbkdf2_sha256" || !Number.isFinite(iterations) || !salt || !expectedHex) return false;
  const actual = pbkdf2Sync(key, salt, iterations, 32, "sha256");
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function fingerprintKey(key: string) {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function adminHashSetting(adminId: string) {
  return `admin_dashboard_key_hash:${adminId}`;
}

function adminKeyIdSetting(adminId: string) {
  return `admin_dashboard_key_id:${adminId}`;
}

function getAdminById(adminId: string) {
  return ADMIN_DEFINITIONS.find((admin) => admin.id === adminId) || ADMIN_DEFINITIONS[0];
}

function getAdminEnvKey(admin: AdminDefinition) {
  return process.env[admin.envKeyName] || "";
}

async function ensureAdminTables() {
  if (tablesEnsured) return;
  if (ensuringTables) return ensuringTables;

  ensuringTables = (async () => {
    const db = await getDb();
    if (!db) return;
    const executor = db as any;
    await executor.execute(sql`
      CREATE TABLE IF NOT EXISTS adminSettings (
        settingKey varchar(128) NOT NULL,
        settingValue text NOT NULL,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT adminSettings_settingKey PRIMARY KEY(settingKey)
      )
    `);
    await executor.execute(sql`
      CREATE TABLE IF NOT EXISTS adminAuditLog (
        id int AUTO_INCREMENT NOT NULL,
        eventType varchar(96) NOT NULL,
        result enum('success','failure','denied') NOT NULL,
        adminKeyId varchar(64),
        adminName varchar(128),
        ipAddress varchar(64),
        userAgent text,
        metadata text,
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT adminAuditLog_id PRIMARY KEY(id)
      )
    `);
    tablesEnsured = true;
  })().catch((error) => {
    ensuringTables = null;
    console.warn("[admin] Failed to ensure admin tables:", error);
  });

  return ensuringTables;
}

async function getSetting(key: string) {
  await ensureAdminTables();
  const db = await getDb();
  if (!db) return undefined;
  try {
    const rows = await db.select().from(adminSettings).where(eq(adminSettings.settingKey, key)).limit(1);
    return rows[0]?.settingValue;
  } catch (error) {
    console.warn(`[admin] Failed to read setting ${key}:`, error);
    return undefined;
  }
}

async function setSetting(key: string, value: string) {
  await ensureAdminTables();
  const db = await getDb();
  if (!db) throw new Error("Database not available for admin key storage");
  await db.insert(adminSettings).values({ settingKey: key, settingValue: value }).onDuplicateKeyUpdate({ set: { settingValue: value } });
}

async function getActiveAdminKeyId(admin: AdminDefinition) {
  return (await getSetting(adminKeyIdSetting(admin.id))) || admin.defaultKeyId;
}

async function verifyAdminKeyForAdmin(key: string, admin: AdminDefinition) {
  const storedHash = await getSetting(adminHashSetting(admin.id));
  if (storedHash) return { configured: true, valid: verifyHashedAdminKey(key, storedHash), source: "database" as const };

  const envKey = getAdminEnvKey(admin);
  if (envKey) return { configured: true, valid: safeCompare(key, envKey), source: "environment" as const };

  return { configured: true, valid: verifyHashedAdminKey(key, admin.defaultHash), source: "default" as const };
}

async function verifyLegacyAdminKey(key: string): Promise<AdminKeyVerification | null> {
  const legacyAdmin = ADMIN_DEFINITIONS[0];
  const legacyHash = await getSetting(LEGACY_KEY_HASH_SETTING);
  if (legacyHash && verifyHashedAdminKey(key, legacyHash)) {
    return { configured: true, valid: true, source: "legacy_database", admin: legacyAdmin, adminKeyId: (await getSetting(LEGACY_KEY_ID_SETTING)) || legacyAdmin.defaultKeyId };
  }

  const legacyEnvKey = process.env.ADMIN_DASHBOARD_KEY || "";
  if (legacyEnvKey && safeCompare(key, legacyEnvKey)) {
    return { configured: true, valid: true, source: "legacy_environment", admin: legacyAdmin, adminKeyId: process.env.ADMIN_DASHBOARD_KEY_ID || legacyAdmin.defaultKeyId };
  }

  return legacyHash || legacyEnvKey ? { configured: true, valid: false, source: legacyHash ? "legacy_database" : "legacy_environment" } : null;
}

async function verifyAdminKey(key: string): Promise<AdminKeyVerification> {
  let configured = false;
  for (const admin of ADMIN_DEFINITIONS) {
    const verification = await verifyAdminKeyForAdmin(key, admin);
    configured = configured || verification.configured;
    if (verification.valid) {
      return { configured: true, valid: true, source: verification.source, admin, adminKeyId: await getActiveAdminKeyId(admin) };
    }
  }

  const legacyVerification = await verifyLegacyAdminKey(key);
  if (legacyVerification?.valid) return legacyVerification;
  configured = configured || Boolean(legacyVerification?.configured);

  return configured ? { configured: true, valid: false, source: "mixed" } : { configured: false, valid: false, source: "none" };
}

async function writeAudit(details: AuditDetails) {
  const row = {
    eventType: details.eventType,
    result: details.result,
    adminKeyId: details.adminKeyId || null,
    adminName: details.adminName || null,
    ipAddress: getClientIp(details.req),
    userAgent: String(details.req.headers["user-agent"] || ""),
    metadata: details.metadata ? JSON.stringify(details.metadata) : null,
  };

  try {
    await ensureAdminTables();
    const db = await getDb();
    if (!db) throw new Error("database unavailable");
    await db.insert(adminAuditLog).values(row);
  } catch (error) {
    console.warn("[admin-audit]", { ...row, metadata: details.metadata, storage: "console-fallback" });
  }
}

function jsonError(res: Response, status: number, error: string) {
  return res.status(status).json({ success: false, error });
}

function getBearerToken(req: Request) {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

async function signAdminToken(admin: AdminDefinition, adminKeyId: string) {
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET is required for admin dashboard sessions");
  const sessionId = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  const token = await new SignJWT({ scope: ADMIN_SCOPE, role: admin.role, name: admin.name, adminId: admin.id, adminKeyId, sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ADMIN_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt, user: { name: admin.name, role: admin.role }, adminKeyId };
}

async function verifyAdminToken(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Missing bearer token");
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET is required for admin dashboard sessions");
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: ADMIN_ISSUER });
  if (payload.scope !== ADMIN_SCOPE || typeof payload.sessionId !== "string") {
    throw new Error("Invalid admin token scope");
  }

  const admin = getAdminById(String(payload.adminId || "pedro-carranza"));
  return {
    scope: String(payload.scope),
    role: String(payload.role || admin.role),
    name: String(payload.name || admin.name),
    adminId: admin.id,
    adminKeyId: String(payload.adminKeyId || admin.defaultKeyId),
    sessionId: String(payload.sessionId),
  } satisfies AdminSession;
}

function requireAllowedIp() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (isIpAllowed(req)) return next();
    await writeAudit({ eventType: "admin_ip_denied", result: "denied", req, metadata: { route: req.path } });
    return jsonError(res, 403, "Admin portal access is not allowed from this IP address.");
  };
}

export function registerAdminRoutes(app: Express) {
  app.post("/api/admin/login", requireAllowedIp(), async (req, res) => {
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    if (!key) {
      await writeAudit({ eventType: "admin_login", result: "failure", req, metadata: { reason: "missing_key" } });
      return jsonError(res, 400, "Admin key is required.");
    }

    try {
      const verification = await verifyAdminKey(key);
      if (!verification.configured) {
        await writeAudit({ eventType: "admin_login", result: "failure", req, metadata: { reason: "admin_key_not_configured" } });
        return jsonError(res, 503, "Admin dashboard key is not configured on the backend.");
      }
      if (!verification.valid) {
        await writeAudit({ eventType: "admin_login", result: "failure", req, metadata: { reason: "invalid_key", keySource: verification.source, fingerprint: fingerprintKey(key) } });
        return jsonError(res, 401, "Invalid admin key.");
      }

      const signed = await signAdminToken(verification.admin, verification.adminKeyId);
      await writeAudit({ eventType: "admin_login", result: "success", req, adminKeyId: verification.adminKeyId, adminName: signed.user.name, metadata: { adminId: verification.admin.id, keySource: verification.source } });
      return res.json({ success: true, ...signed });
    } catch (error) {
      console.error("[admin] Login failed:", error);
      await writeAudit({ eventType: "admin_login", result: "failure", req, metadata: { reason: "server_error" } });
      return jsonError(res, 500, "Admin login is temporarily unavailable.");
    }
  });

  app.get("/api/admin/verify", requireAllowedIp(), async (req, res) => {
    try {
      const session = await verifyAdminToken(req);
      await writeAudit({ eventType: "admin_verify", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId } });
      return res.json({ valid: true, success: true, user: { name: session.name, role: session.role }, adminKeyId: session.adminKeyId });
    } catch (error) {
      await writeAudit({ eventType: "admin_verify", result: "failure", req, metadata: { reason: "invalid_or_expired_token" } });
      return res.status(401).json({ valid: false, success: false, error: "Admin session expired. Please log in again." });
    }
  });

  app.post("/api/admin/change-key", requireAllowedIp(), async (req, res) => {
    let session: AdminSession | null = null;
    try {
      session = await verifyAdminToken(req);
    } catch (error) {
      await writeAudit({ eventType: "admin_change_key", result: "failure", req, metadata: { reason: "invalid_or_expired_token" } });
      return jsonError(res, 401, "Admin session expired. Please log in again.");
    }

    const currentKey = typeof req.body?.currentKey === "string" ? req.body.currentKey.trim() : "";
    const newKey = typeof req.body?.newKey === "string" ? req.body.newKey.trim() : "";
    if (!currentKey || !newKey) {
      await writeAudit({ eventType: "admin_change_key", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "missing_key_fields", adminId: session.adminId } });
      return jsonError(res, 400, "Current key and new key are required.");
    }
    if (newKey.length < 6) {
      await writeAudit({ eventType: "admin_change_key", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "new_key_too_short", adminId: session.adminId } });
      return jsonError(res, 400, "New key must be at least 6 characters.");
    }

    try {
      const admin = getAdminById(session.adminId);
      const currentVerification = await verifyAdminKeyForAdmin(currentKey, admin);
      if (!currentVerification.configured) {
        await writeAudit({ eventType: "admin_change_key", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "admin_key_not_configured", adminId: session.adminId } });
        return jsonError(res, 503, "Admin dashboard key is not configured on the backend.");
      }
      if (!currentVerification.valid) {
        await writeAudit({ eventType: "admin_change_key", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "current_key_invalid", adminId: session.adminId, keySource: currentVerification.source } });
        return jsonError(res, 403, "Current admin key is incorrect.");
      }

      const newAdminKeyId = `${admin.id}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
      await setSetting(adminHashSetting(admin.id), hashAdminKey(newKey));
      await setSetting(adminKeyIdSetting(admin.id), newAdminKeyId);
      await writeAudit({ eventType: "admin_change_key", result: "success", req, adminKeyId: newAdminKeyId, adminName: session.name, metadata: { adminId: admin.id, previousAdminKeyId: session.adminKeyId } });
      return res.json({ success: true, message: "Admin key updated successfully.", adminKeyId: newAdminKeyId });
    } catch (error) {
      console.error("[admin] Change key failed:", error);
      await writeAudit({ eventType: "admin_change_key", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to update admin key.");
    }
  });
}
