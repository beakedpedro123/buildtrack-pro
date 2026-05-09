import type { Express, NextFunction, Request, Response } from "express";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { eq, sql } from "drizzle-orm";
import { ENV } from "./_core/env";
import { createCompanyForAdmin, getDb, listAdminPinManagement, resetEmployeePinForAdmin, setEmployeeCompanyForAdmin, setEmployeePinDisabledForAdmin } from "./db";
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
    defaultHash: "pbkdf2_sha256$210000$dbdb1d5f7838d729ab701931273f0cbfcaf07618c4dce85f$e7560dd153509afe49c2430a27a05a06811999184348f1b34ee52ec26be3834d",
  },
  {
    id: "lupe-mejia",
    defaultKeyId: "lupe_primary",
    name: "Lupe Mejia",
    role: "office_manager",
    envKeyName: "ADMIN_DASHBOARD_KEY_LUPE",
    defaultHash: "pbkdf2_sha256$210000$c9342151c7fc32bb5727c99f961c6675e2fc28158d3c74b5$65eef7dcbc8429fde09ac5bd7dd1bbe744d1dbcba4c9c439c03c1a6d2e817e52",
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


function parsePositiveInt(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseEmployeePin(value: unknown) {
  const pin = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4,8}$/.test(pin)) return null;
  return pin;
}

function rowsFromExecute<T = any>(result: any): T[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as T[];
    return result as T[];
  }
  if (Array.isArray(result?.rows)) return result.rows as T[];
  return [];
}

async function executeRaw(statement: string) {
  const db = await getDb();
  if (!db) return;
  await (db as any).execute(sql.raw(statement));
}

let adminSupportTablesEnsured = false;
let ensuringAdminSupportTables: Promise<void> | null = null;

async function ensureAdminSupportTables() {
  if (adminSupportTablesEnsured) return;
  if (ensuringAdminSupportTables) return ensuringAdminSupportTables;
  ensuringAdminSupportTables = (async () => {
    const db = await getDb();
    if (!db) return;
    await executeRaw(`CREATE TABLE IF NOT EXISTS adminSupportTickets (
      id int AUTO_INCREMENT NOT NULL,
      companyId int NULL,
      subject varchar(180) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'open',
      priority varchar(32) NOT NULL DEFAULT 'medium',
      requesterName varchar(128) NOT NULL DEFAULT 'Unknown',
      requesterRole varchar(64) NULL,
      lastMessage text NULL,
      adminReply text NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT adminSupportTickets_id PRIMARY KEY(id),
      INDEX adminSupportTickets_companyId_idx(companyId)
    )`);
    await executeRaw(`CREATE TABLE IF NOT EXISTS adminKnowledgeBaseArticles (
      id int AUTO_INCREMENT NOT NULL,
      companyId int NULL,
      title varchar(220) NOT NULL,
      category varchar(96) NOT NULL DEFAULT 'support',
      body text NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'draft',
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT adminKnowledgeBaseArticles_id PRIMARY KEY(id),
      INDEX adminKnowledgeBaseArticles_companyId_idx(companyId)
    )`);
    await executeRaw(`CREATE TABLE IF NOT EXISTS adminPivotLearning (
      id int AUTO_INCREMENT NOT NULL,
      companyId int NULL,
      title varchar(220) NOT NULL,
      source varchar(96) NOT NULL DEFAULT 'admin',
      lesson text NOT NULL,
      confidence decimal(5,4) NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT adminPivotLearning_id PRIMARY KEY(id),
      INDEX adminPivotLearning_companyId_idx(companyId)
    )`);
    await executeRaw(`CREATE TABLE IF NOT EXISTS adminPivotChatHistory (
      id int AUTO_INCREMENT NOT NULL,
      companyId int NULL,
      userName varchar(128) NOT NULL,
      userRole varchar(64) NULL,
      prompt text NOT NULL,
      response text NOT NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT adminPivotChatHistory_id PRIMARY KEY(id),
      INDEX adminPivotChatHistory_companyId_idx(companyId)
    )`);
    adminSupportTablesEnsured = true;
  })().catch((error) => {
    ensuringAdminSupportTables = null;
    console.warn("[admin] Failed to ensure support/Pivot admin tables:", error);
    throw error;
  });
  return ensuringAdminSupportTables;
}

function normalizeTextInput(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.slice(0, maxLength);
}

async function listAdminCompaniesSummary() {
  const pinData = await listAdminPinManagement();
  const companies = pinData.companies.map((company: any) => {
    const employeeCount = pinData.employees.filter((employee: any) => Number(employee.companyId) === Number(company.id)).length;
    return { ...company, employeeCount, ticketCount: 0, openTicketCount: 0 };
  });

  const db = await getDb();
  if (!db) return companies;
  try {
    await ensureAdminSupportTables();
    const rows = rowsFromExecute<any>(await (db as any).execute(sql.raw(`
      SELECT companyId, COUNT(*) AS ticketCount,
        SUM(CASE WHEN status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS openTicketCount
      FROM adminSupportTickets
      GROUP BY companyId
    `)));
    const counts = new Map(rows.map((row: any) => [Number(row.companyId || 0), row]));
    return companies.map((company: any) => {
      const row = counts.get(Number(company.id));
      return { ...company, ticketCount: Number(row?.ticketCount || 0), openTicketCount: Number(row?.openTicketCount || 0) };
    });
  } catch (error) {
    console.warn("[admin] Company ticket summary unavailable:", error);
    return companies;
  }
}

async function listSupportTickets() {
  await ensureAdminSupportTables();
  const db = await getDb();
  if (!db) return [];
  return rowsFromExecute(await (db as any).execute(sql.raw(`
    SELECT t.id, t.companyId, COALESCE(c.name, 'Unassigned') AS companyName,
      t.subject, t.status, t.priority, t.requesterName, t.requesterRole,
      t.lastMessage, t.createdAt, t.updatedAt
    FROM adminSupportTickets t
    LEFT JOIN companies c ON c.id = t.companyId
    ORDER BY t.updatedAt DESC, t.id DESC
    LIMIT 300
  `)));
}

async function listKnowledgeBaseArticles() {
  await ensureAdminSupportTables();
  const db = await getDb();
  if (!db) return [];
  return rowsFromExecute(await (db as any).execute(sql.raw(`
    SELECT kb.id, kb.companyId, COALESCE(c.name, 'Global') AS companyName,
      kb.title, kb.category, kb.body, kb.status, kb.createdAt, kb.updatedAt
    FROM adminKnowledgeBaseArticles kb
    LEFT JOIN companies c ON c.id = kb.companyId
    ORDER BY kb.updatedAt DESC, kb.id DESC
    LIMIT 300
  `)));
}

async function listPivotLearningEntries() {
  await ensureAdminSupportTables();
  const db = await getDb();
  if (!db) return [];
  return rowsFromExecute(await (db as any).execute(sql.raw(`
    SELECT pl.id, pl.companyId, COALESCE(c.name, 'Global') AS companyName,
      pl.title, pl.source, pl.lesson, pl.confidence, pl.createdAt
    FROM adminPivotLearning pl
    LEFT JOIN companies c ON c.id = pl.companyId
    ORDER BY pl.createdAt DESC, pl.id DESC
    LIMIT 300
  `)));
}

async function listPivotChatHistory() {
  await ensureAdminSupportTables();
  const db = await getDb();
  if (!db) return [];
  return rowsFromExecute(await (db as any).execute(sql.raw(`
    SELECT ch.id, ch.companyId, COALESCE(c.name, 'Global') AS companyName,
      ch.userName, ch.userRole, ch.prompt, ch.response, ch.createdAt
    FROM adminPivotChatHistory ch
    LEFT JOIN companies c ON c.id = ch.companyId
    ORDER BY ch.createdAt DESC, ch.id DESC
    LIMIT 300
  `)));
}

async function requireAdminSession(req: Request, res: Response, eventType: string) {
  try {
    return await verifyAdminToken(req);
  } catch (error) {
    await writeAudit({ eventType, result: "failure", req, metadata: { reason: "invalid_or_expired_token" } });
    jsonError(res, 401, "Admin session expired. Please log in again.");
    return null;
  }
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
    const submittedKey = typeof req.body?.key === "string" ? req.body.key : typeof req.body?.adminKey === "string" ? req.body.adminKey : "";
    const key = submittedKey.trim();
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
      return res.json({ success: true, ...signed, sessionToken: signed.token });
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


  app.get("/api/admin/pin-management", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_pin_management_list");
    if (!session) return;
    try {
      const data = await listAdminPinManagement();
      await writeAudit({ eventType: "admin_pin_management_list", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, employeeCount: data.employees.length, companyCount: data.companies.length } });
      return res.json({ success: true, ...data });
    } catch (error) {
      console.error("[admin] PIN management list failed:", error);
      await writeAudit({ eventType: "admin_pin_management_list", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to load employee PIN management data.");
    }
  });

  app.post("/api/admin/pin-management/reset", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_pin_reset");
    if (!session) return;
    const employeeId = parsePositiveInt(req.body?.employeeId);
    const pin = parseEmployeePin(req.body?.pin);
    if (!employeeId || !pin) {
      await writeAudit({ eventType: "admin_pin_reset", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "invalid_input", adminId: session.adminId, employeeId } });
      return jsonError(res, 400, "Employee ID and a 4-8 digit PIN are required.");
    }
    try {
      const result = await resetEmployeePinForAdmin(employeeId, pin);
      await writeAudit({ eventType: "admin_pin_reset", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, employeeId, employeeName: result.employeeName, companyId: result.companyId } });
      return res.json({ success: true, message: "Employee PIN was reset securely.", employeeId });
    } catch (error: any) {
      const message = String(error?.message || "");
      await writeAudit({ eventType: "admin_pin_reset", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: message || "server_error", adminId: session.adminId, employeeId } });
      return jsonError(res, /not found/i.test(message) ? 404 : 500, /not found/i.test(message) ? "Employee not found." : "Failed to reset employee PIN.");
    }
  });

  app.post("/api/admin/pin-management/disable", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_pin_disable");
    if (!session) return;
    const employeeId = parsePositiveInt(req.body?.employeeId);
    const disabled = req.body?.disabled !== false;
    if (!employeeId) {
      await writeAudit({ eventType: "admin_pin_disable", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "invalid_employee", adminId: session.adminId } });
      return jsonError(res, 400, "Employee ID is required.");
    }
    try {
      const result = await setEmployeePinDisabledForAdmin(employeeId, disabled);
      await writeAudit({ eventType: "admin_pin_disable", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, employeeId, employeeName: result.employeeName, companyId: result.companyId, disabled } });
      return res.json({ success: true, message: disabled ? "Employee PIN was disabled." : "Employee PIN was enabled.", employeeId, disabled });
    } catch (error: any) {
      const message = String(error?.message || "");
      await writeAudit({ eventType: "admin_pin_disable", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: message || "server_error", adminId: session.adminId, employeeId, disabled } });
      return jsonError(res, /not found/i.test(message) ? 404 : 500, /not found/i.test(message) ? "Employee not found." : "Failed to update employee PIN status.");
    }
  });

  app.post("/api/admin/pin-management/company", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_company_create");
    if (!session) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name.length < 2 || name.length > 128) {
      await writeAudit({ eventType: "admin_company_create", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "invalid_company_name", adminId: session.adminId } });
      return jsonError(res, 400, "Company name must be between 2 and 128 characters.");
    }
    try {
      const company = await createCompanyForAdmin(name);
      await writeAudit({ eventType: "admin_company_create", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, companyId: company.id, companyName: company.name } });
      return res.json({ success: true, company });
    } catch (error) {
      console.error("[admin] Company create failed:", error);
      await writeAudit({ eventType: "admin_company_create", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to create company.");
    }
  });

  app.post("/api/admin/pin-management/set-company", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_employee_company_update");
    if (!session) return;
    const employeeId = parsePositiveInt(req.body?.employeeId);
    const companyId = parsePositiveInt(req.body?.companyId);
    if (!employeeId || !companyId) {
      await writeAudit({ eventType: "admin_employee_company_update", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "invalid_input", adminId: session.adminId, employeeId, companyId } });
      return jsonError(res, 400, "Employee ID and company ID are required.");
    }
    try {
      await setEmployeeCompanyForAdmin(employeeId, companyId);
      await writeAudit({ eventType: "admin_employee_company_update", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, employeeId, companyId } });
      return res.json({ success: true, message: "Employee company assignment updated.", employeeId, companyId });
    } catch (error: any) {
      const message = String(error?.message || "");
      await writeAudit({ eventType: "admin_employee_company_update", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: message || "server_error", adminId: session.adminId, employeeId, companyId } });
      return jsonError(res, /not found/i.test(message) ? 404 : 500, /not found/i.test(message) ? "Employee or company not found." : "Failed to update employee company assignment.");
    }
  });

  app.get("/api/admin/companies", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_companies_list");
    if (!session) return;
    try {
      const companies = await listAdminCompaniesSummary();
      await writeAudit({ eventType: "admin_companies_list", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, companyCount: companies.length } });
      return res.json({ success: true, companies });
    } catch (error) {
      console.error("[admin] Companies list failed:", error);
      await writeAudit({ eventType: "admin_companies_list", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to load customer companies.");
    }
  });

  app.get("/api/admin/support/stats", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_support_stats");
    if (!session) return;
    try {
      const tickets = await listSupportTickets();
      const articles = await listKnowledgeBaseArticles();
      const learningEntries = await listPivotLearningEntries();
      const chatMessages = await listPivotChatHistory();
      const stats = {
        totalTickets: tickets.length,
        openTickets: tickets.filter((ticket: any) => !/resolved|closed/i.test(String(ticket.status))).length,
        resolvedTickets: tickets.filter((ticket: any) => /resolved|closed/i.test(String(ticket.status))).length,
        kbArticles: articles.length,
        learningEntries: learningEntries.length,
        chatMessages: chatMessages.length,
      };
      await writeAudit({ eventType: "admin_support_stats", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, ...stats } });
      return res.json({ success: true, stats });
    } catch (error) {
      console.error("[admin] Support stats failed:", error);
      await writeAudit({ eventType: "admin_support_stats", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to load support statistics.");
    }
  });

  app.get("/api/admin/support/tickets", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_support_tickets_list");
    if (!session) return;
    try {
      const tickets = await listSupportTickets();
      await writeAudit({ eventType: "admin_support_tickets_list", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, ticketCount: tickets.length } });
      return res.json({ success: true, tickets });
    } catch (error) {
      console.error("[admin] Support ticket list failed:", error);
      await writeAudit({ eventType: "admin_support_tickets_list", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to load support tickets.");
    }
  });

  app.post("/api/admin/support/tickets/:ticketId/reply", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_support_ticket_reply");
    if (!session) return;
    const ticketId = parsePositiveInt(req.params.ticketId);
    const message = normalizeTextInput(req.body?.message, 5000);
    if (!ticketId || message.length < 3) {
      await writeAudit({ eventType: "admin_support_ticket_reply", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "invalid_input", adminId: session.adminId, ticketId } });
      return jsonError(res, 400, "Ticket ID and reply message are required.");
    }
    try {
      await ensureAdminSupportTables();
      const db = await getDb();
      if (!db) return jsonError(res, 503, "Database is not available.");
      await (db as any).execute(sql`UPDATE adminSupportTickets SET adminReply = ${message}, lastMessage = ${message}, status = 'waiting_customer' WHERE id = ${ticketId}`);
      await writeAudit({ eventType: "admin_support_ticket_reply", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, ticketId } });
      return res.json({ success: true, message: "Support reply was recorded." });
    } catch (error) {
      console.error("[admin] Support ticket reply failed:", error);
      await writeAudit({ eventType: "admin_support_ticket_reply", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId, ticketId } });
      return jsonError(res, 500, "Failed to save support reply.");
    }
  });

  app.post("/api/admin/support/tickets/:ticketId/resolve", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_support_ticket_resolve");
    if (!session) return;
    const ticketId = parsePositiveInt(req.params.ticketId);
    if (!ticketId) return jsonError(res, 400, "Ticket ID is required.");
    try {
      await ensureAdminSupportTables();
      const db = await getDb();
      if (!db) return jsonError(res, 503, "Database is not available.");
      await (db as any).execute(sql`UPDATE adminSupportTickets SET status = 'resolved' WHERE id = ${ticketId}`);
      await writeAudit({ eventType: "admin_support_ticket_resolve", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, ticketId } });
      return res.json({ success: true, message: "Support ticket was resolved." });
    } catch (error) {
      console.error("[admin] Support ticket resolve failed:", error);
      await writeAudit({ eventType: "admin_support_ticket_resolve", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId, ticketId } });
      return jsonError(res, 500, "Failed to resolve support ticket.");
    }
  });

  app.get("/api/admin/support/kb", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_kb_list");
    if (!session) return;
    try {
      const articles = await listKnowledgeBaseArticles();
      await writeAudit({ eventType: "admin_kb_list", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, articleCount: articles.length } });
      return res.json({ success: true, articles });
    } catch (error) {
      console.error("[admin] Knowledge-base list failed:", error);
      await writeAudit({ eventType: "admin_kb_list", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to load knowledge-base articles.");
    }
  });

  app.post("/api/admin/support/kb", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_kb_create");
    if (!session) return;
    const title = normalizeTextInput(req.body?.title, 220);
    const category = normalizeTextInput(req.body?.category, 96) || "support";
    const body = normalizeTextInput(req.body?.body, 20000);
    const status = normalizeTextInput(req.body?.status, 32) || "draft";
    const companyId = parsePositiveInt(req.body?.companyId);
    if (title.length < 3 || body.length < 10) {
      await writeAudit({ eventType: "admin_kb_create", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "invalid_input", adminId: session.adminId } });
      return jsonError(res, 400, "Knowledge-base title and body are required.");
    }
    try {
      await ensureAdminSupportTables();
      const db = await getDb();
      if (!db) return jsonError(res, 503, "Database is not available.");
      await (db as any).execute(sql`INSERT INTO adminKnowledgeBaseArticles (companyId, title, category, body, status) VALUES (${companyId}, ${title}, ${category}, ${body}, ${status})`);
      await writeAudit({ eventType: "admin_kb_create", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, title, companyId } });
      return res.json({ success: true, message: "Knowledge-base article was saved." });
    } catch (error) {
      console.error("[admin] Knowledge-base create failed:", error);
      await writeAudit({ eventType: "admin_kb_create", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to save knowledge-base article.");
    }
  });

  app.get("/api/admin/pivot/learning", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_pivot_learning_list");
    if (!session) return;
    try {
      const learnings = await listPivotLearningEntries();
      await writeAudit({ eventType: "admin_pivot_learning_list", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, learningCount: learnings.length } });
      return res.json({ success: true, learnings });
    } catch (error) {
      console.error("[admin] Pivot learning list failed:", error);
      await writeAudit({ eventType: "admin_pivot_learning_list", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to load Pivot learning entries.");
    }
  });

  app.post("/api/admin/pivot/learning", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_pivot_learning_create");
    if (!session) return;
    const title = normalizeTextInput(req.body?.title, 220);
    const source = normalizeTextInput(req.body?.source, 96) || "admin";
    const lesson = normalizeTextInput(req.body?.lesson, 20000);
    const confidenceRaw = Number(req.body?.confidence);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null;
    const companyId = parsePositiveInt(req.body?.companyId);
    if (title.length < 3 || lesson.length < 10) {
      await writeAudit({ eventType: "admin_pivot_learning_create", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "invalid_input", adminId: session.adminId } });
      return jsonError(res, 400, "Pivot learning title and lesson are required.");
    }
    try {
      await ensureAdminSupportTables();
      const db = await getDb();
      if (!db) return jsonError(res, 503, "Database is not available.");
      await (db as any).execute(sql`INSERT INTO adminPivotLearning (companyId, title, source, lesson, confidence) VALUES (${companyId}, ${title}, ${source}, ${lesson}, ${confidence})`);
      await writeAudit({ eventType: "admin_pivot_learning_create", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, title, companyId } });
      return res.json({ success: true, message: "Pivot learning entry was saved." });
    } catch (error) {
      console.error("[admin] Pivot learning create failed:", error);
      await writeAudit({ eventType: "admin_pivot_learning_create", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to save Pivot learning entry.");
    }
  });

  app.get("/api/admin/pivot/chat-history", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_pivot_chat_history");
    if (!session) return;
    try {
      const messages = await listPivotChatHistory();
      await writeAudit({ eventType: "admin_pivot_chat_history", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, messageCount: messages.length } });
      return res.json({ success: true, messages });
    } catch (error) {
      console.error("[admin] Pivot chat history failed:", error);
      await writeAudit({ eventType: "admin_pivot_chat_history", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to load Pivot chat history.");
    }
  });

  app.get("/api/admin/pivot/chat", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_pivot_chat_capability");
    if (!session) return;
    return res.json({ success: true, available: true, message: "POST a message to this route to ask Pivot from the admin dashboard." });
  });

  app.post("/api/admin/pivot/chat", requireAllowedIp(), async (req, res) => {
    const session = await requireAdminSession(req, res, "admin_pivot_chat");
    if (!session) return;
    const prompt = normalizeTextInput(req.body?.message ?? req.body?.prompt, 12000);
    const companyId = parsePositiveInt(req.body?.companyId);
    if (prompt.length < 3) {
      await writeAudit({ eventType: "admin_pivot_chat", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "invalid_prompt", adminId: session.adminId } });
      return jsonError(res, 400, "Pivot prompt is required.");
    }
    try {
      await ensureAdminSupportTables();
      const tickets = await listSupportTickets();
      const articles = await listKnowledgeBaseArticles();
      const learnings = await listPivotLearningEntries();
      const openTicketCount = tickets.filter((ticket: any) => !/resolved|closed/i.test(String(ticket.status))).length;
      const reply = [
        "Pivot admin summary:",
        `I reviewed ${tickets.length} support ticket(s), including ${openTicketCount} still open, ${articles.length} knowledge-base article(s), and ${learnings.length} owner-approved learning entr${learnings.length === 1 ? "y" : "ies"}.`,
        "Keep all answers company-scoped, avoid exposing payroll or owner financial data to employee/customer accounts, and convert repeated support issues into approved knowledge-base articles before broad reuse.",
        `Owner prompt: ${prompt}`,
      ].join("\n\n");
      const db = await getDb();
      if (db) {
        await (db as any).execute(sql`INSERT INTO adminPivotChatHistory (companyId, userName, userRole, prompt, response) VALUES (${companyId}, ${session.name}, ${session.role}, ${prompt}, ${reply})`);
      }
      await writeAudit({ eventType: "admin_pivot_chat", result: "success", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { adminId: session.adminId, companyId, promptLength: prompt.length } });
      return res.json({ success: true, reply });
    } catch (error) {
      console.error("[admin] Pivot chat failed:", error);
      await writeAudit({ eventType: "admin_pivot_chat", result: "failure", req, adminKeyId: session.adminKeyId, adminName: session.name, metadata: { reason: "server_error", adminId: session.adminId } });
      return jsonError(res, 500, "Failed to process Pivot admin prompt.");
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
