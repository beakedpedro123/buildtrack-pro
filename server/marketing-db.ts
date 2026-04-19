/**
 * BuildTrack Pro SaaS Marketing Database
 * SQLite-based multi-tenant database for trial signups, subscriptions, and knowledge base.
 * Stored at server/data/buildtrack-saas.db
 */
import Database from "better-sqlite3";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import fs from "fs";

const dataDir = path.join(process.cwd(), "server", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, "buildtrack-saas.db");
const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ============================================
// MULTI-TENANT SCHEMA
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    owner_email TEXT NOT NULL,
    trade TEXT DEFAULT 'general',
    plan TEXT NOT NULL DEFAULT 'starter',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'trialing',
    max_employees INTEGER DEFAULT 10,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    trial_expires_at TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'worker',
    phone TEXT,
    hourly_rate REAL DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE(company_id, email)
  );

  CREATE TABLE IF NOT EXISTS subscription_events (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    stripe_event_id TEXT,
    plan TEXT,
    amount REAL,
    currency TEXT DEFAULT 'usd',
    metadata TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS signups (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    company_name TEXT,
    contact_name TEXT,
    trade TEXT,
    phone TEXT,
    plan_interest TEXT,
    source TEXT DEFAULT 'website',
    status TEXT DEFAULT 'pending',
    converted_company_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS owner_knowledge (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    notes TEXT,
    is_private INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_mkt_users_company ON users(company_id);
  CREATE INDEX IF NOT EXISTS idx_mkt_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_mkt_companies_slug ON companies(slug);
  CREATE INDEX IF NOT EXISTS idx_mkt_companies_stripe ON companies(stripe_customer_id);
  CREATE INDEX IF NOT EXISTS idx_mkt_signups_email ON signups(email);
  CREATE INDEX IF NOT EXISTS idx_mkt_owner_knowledge_category ON owner_knowledge(category);
`);

// ============================================
// HELPER FUNCTIONS
// ============================================

export function createCompany(data: {
  name: string; slug: string; ownerEmail: string; trade?: string;
  plan: string; stripeCustomerId?: string; stripeSubscriptionId?: string; maxEmployees: number;
}): string {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO companies (id, name, slug, owner_email, trade, plan, stripe_customer_id, stripe_subscription_id, max_employees, subscription_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `).run(id, data.name, data.slug, data.ownerEmail, data.trade || "general", data.plan,
    data.stripeCustomerId || null, data.stripeSubscriptionId || null, data.maxEmployees);
  return id;
}

export function createTrialCompany(data: {
  name: string; slug: string; ownerEmail: string;
  ownerFirstName: string; ownerLastName: string; ownerPassword: string;
  trade?: string; phone?: string;
}): { companyId: string; userId: string } {
  const companyId = uuidv4();
  const trialExpires = new Date();
  trialExpires.setDate(trialExpires.getDate() + 14);

  db.prepare(`
    INSERT INTO companies (id, name, slug, owner_email, trade, plan, max_employees, subscription_status, trial_expires_at)
    VALUES (?, ?, ?, ?, ?, 'pro', 25, 'trialing', ?)
  `).run(companyId, data.name, data.slug, data.ownerEmail, data.trade || "general", trialExpires.toISOString());

  const userId = createUser({
    companyId, email: data.ownerEmail, password: data.ownerPassword,
    firstName: data.ownerFirstName, lastName: data.ownerLastName,
    role: "owner", phone: data.phone
  });

  logSubscriptionEvent(companyId, "trial_started", {
    plan: "pro", metadata: JSON.stringify({ trialExpires: trialExpires.toISOString() })
  });

  return { companyId, userId };
}

export function createUser(data: {
  companyId: string; email: string; password: string;
  firstName: string; lastName: string; role: string;
  phone?: string; hourlyRate?: number;
}): string {
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(data.password, 10);
  db.prepare(`
    INSERT INTO users (id, company_id, email, password_hash, first_name, last_name, role, phone, hourly_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.companyId, data.email, passwordHash,
    data.firstName, data.lastName, data.role, data.phone || null, data.hourlyRate || 0);
  return id;
}

export function isTrialExpired(companyId: string): boolean {
  const company = db.prepare("SELECT subscription_status, trial_expires_at FROM companies WHERE id = ?").get(companyId) as any;
  if (!company) return true;
  if (company.subscription_status !== "trialing") return false;
  if (!company.trial_expires_at) return true;
  return new Date(company.trial_expires_at) < new Date();
}

export function getTrialDaysRemaining(companyId: string): number {
  const company = db.prepare("SELECT trial_expires_at FROM companies WHERE id = ?").get(companyId) as any;
  if (!company?.trial_expires_at) return 0;
  const diff = new Date(company.trial_expires_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function upgradeTrialToPaid(companyId: string, data: {
  plan: string; stripeCustomerId: string; stripeSubscriptionId: string; maxEmployees: number;
}) {
  db.prepare(`
    UPDATE companies SET plan = ?, stripe_customer_id = ?, stripe_subscription_id = ?,
    subscription_status = 'active', max_employees = ?, trial_expires_at = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(data.plan, data.stripeCustomerId, data.stripeSubscriptionId, data.maxEmployees, companyId);
  logSubscriptionEvent(companyId, "trial_converted", {
    plan: data.plan, metadata: JSON.stringify({ convertedAt: new Date().toISOString() })
  });
}

export function getCompanyByOwnerEmail(email: string) {
  return db.prepare("SELECT * FROM companies WHERE owner_email = ? ORDER BY created_at DESC LIMIT 1").get(email);
}

export function getCompanyById(id: string) {
  return db.prepare("SELECT * FROM companies WHERE id = ?").get(id);
}

export function getCompanyBySlug(slug: string) {
  return db.prepare("SELECT * FROM companies WHERE slug = ?").get(slug);
}

export function getCompanyByStripeCustomer(stripeCustomerId: string) {
  return db.prepare("SELECT * FROM companies WHERE stripe_customer_id = ?").get(stripeCustomerId);
}

export function getUserByEmail(companyId: string, email: string) {
  return db.prepare("SELECT * FROM users WHERE company_id = ? AND email = ?").get(companyId, email);
}

export function getCompanyUsers(companyId: string) {
  return db.prepare("SELECT id, company_id, email, first_name, last_name, role, phone, hourly_rate, is_active, created_at FROM users WHERE company_id = ? ORDER BY created_at").all(companyId);
}

export function updateSubscription(companyId: string, data: {
  plan: string; stripeSubscriptionId: string; subscriptionStatus: string; maxEmployees: number;
}) {
  db.prepare(`
    UPDATE companies SET plan = ?, stripe_subscription_id = ?, subscription_status = ?, max_employees = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(data.plan, data.stripeSubscriptionId, data.subscriptionStatus, data.maxEmployees, companyId);
}

export function logSubscriptionEvent(companyId: string, eventType: string, data: {
  stripeEventId?: string; plan?: string; amount?: number; metadata?: string;
}) {
  db.prepare(`
    INSERT INTO subscription_events (id, company_id, event_type, stripe_event_id, plan, amount, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), companyId, eventType, data.stripeEventId || null, data.plan || null, data.amount || null, data.metadata || null);
}

export function createSignup(data: {
  email: string; companyName?: string; contactName?: string;
  trade?: string; phone?: string; planInterest?: string;
}) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO signups (id, email, company_name, contact_name, trade, phone, plan_interest)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.email, data.companyName || null, data.contactName || null,
    data.trade || null, data.phone || null, data.planInterest || null);
  return id;
}

export function setOwnerKnowledge(category: string, key: string, value: string, notes?: string) {
  const existing = db.prepare("SELECT id FROM owner_knowledge WHERE category = ? AND key = ?").get(category, key) as any;
  if (existing) {
    db.prepare("UPDATE owner_knowledge SET value = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(value, notes || null, existing.id);
    return existing.id;
  }
  const id = uuidv4();
  db.prepare("INSERT INTO owner_knowledge (id, category, key, value, notes) VALUES (?, ?, ?, ?, ?)")
    .run(id, category, key, value, notes || null);
  return id;
}

export function getOwnerKnowledge(category?: string) {
  if (category) return db.prepare("SELECT * FROM owner_knowledge WHERE category = ? ORDER BY key").all(category);
  return db.prepare("SELECT * FROM owner_knowledge ORDER BY category, key").all();
}

export function deleteOwnerKnowledge(id: string) {
  db.prepare("DELETE FROM owner_knowledge WHERE id = ?").run(id);
}

export function getAllSignups() {
  return db.prepare("SELECT * FROM signups ORDER BY created_at DESC").all();
}

export function getAllCompanies() {
  return db.prepare("SELECT * FROM companies ORDER BY created_at DESC").all();
}

export default db;
