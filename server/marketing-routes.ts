/**
 * BuildTrack Pro SaaS Marketing API Routes
 * Registers all marketing/SaaS endpoints on the Express app:
 *   POST /api/marketing-signup    — Lead capture
 *   POST /api/marketing-trial     — Free 14-day trial signup
 *   POST /api/marketing-checkout  — Stripe checkout session
 *   POST /api/marketing-webhook   — Stripe webhook
 *   GET  /api/marketing-health    — Health check
 *   POST /api/marketing-auth/login  — User login
 *   POST /api/marketing-auth/logout — User logout
 *   GET  /api/marketing-trial/status — Trial status (auth required)
 *   POST /api/marketing-trial/upgrade — Upgrade trial to paid (auth required)
 *   GET  /api/marketing-admin/knowledge — Owner knowledge base (super admin)
 *   POST /api/marketing-admin/knowledge — Add/update knowledge (super admin)
 *   DELETE /api/marketing-admin/knowledge/:id — Delete knowledge (super admin)
 *   GET  /api/marketing-admin/pivot-context — Pivot AI context (super admin)
 *   GET  /api/marketing-admin/companies — All companies (super admin)
 *   GET  /api/marketing-admin/signups — All signups (super admin)
 */
import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

import {
  createCompany, createUser, getCompanyBySlug, getCompanyById,
  getUserByEmail, getCompanyUsers, updateSubscription,
  logSubscriptionEvent, createSignup, getCompanyByStripeCustomer,
  setOwnerKnowledge, getOwnerKnowledge, deleteOwnerKnowledge,
  getAllSignups, getAllCompanies,
  createTrialCompany, isTrialExpired, getTrialDaysRemaining,
  upgradeTrialToPaid, getCompanyByOwnerEmail
} from "./marketing-db";

import {
  createCheckoutSession, createPortalSession, constructWebhookEvent,
  PLANS, type PlanKey
} from "./marketing-stripe";

const JWT_SECRET = process.env.JWT_SECRET || "buildtrack-saas-secret-change-me";
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "pedro@buildtrackpro.com";

// Auth middleware
function authenticateToken(req: any, res: any, next: any) {
  const token = req.cookies?.mkt_token || req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireSuperAdmin(req: any, res: any, next: any) {
  if (req.user?.email !== SUPER_ADMIN_EMAIL && req.user?.role !== "super_admin") {
    return res.status(403).json({ error: "Access denied. Super admin only." });
  }
  next();
}

function requireOwner(req: any, res: any, next: any) {
  if (req.user?.role !== "owner" && req.user?.role !== "super_admin") {
    return res.status(403).json({ error: "Access denied. Owner only." });
  }
  next();
}

export function registerMarketingRoutes(app: Express) {
  console.log("[marketing] Registering marketing API routes...");

  // ============================================
  // STRIPE WEBHOOK (raw body, must be before json parser for this route)
  // ============================================
  app.post("/api/marketing-webhook", express.raw({ type: "application/json" }), async (req: any, res: any) => {
    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).send("Missing stripe-signature header");

    try {
      const event = constructWebhookEvent(req.body, sig);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as any;
          const { plan, company_name, email } = session.metadata || {};
          if (plan && company_name && email) {
            const planConfig = PLANS[plan as PlanKey];
            if (planConfig) {
              const existingByEmail = getCompanyByOwnerEmail(email) as any;
              if (existingByEmail && existingByEmail.subscription_status === "trialing") {
                upgradeTrialToPaid(existingByEmail.id, {
                  plan, stripeCustomerId: session.customer,
                  stripeSubscriptionId: session.subscription, maxEmployees: planConfig.maxEmployees
                });
                console.log(`[TRIAL] Trial converted to paid: ${existingByEmail.name} (${plan}) - ${email}`);
              } else if (!existingByEmail) {
                const slug = company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                const companyId = createCompany({
                  name: company_name, slug: slug + "-" + Date.now().toString(36),
                  ownerEmail: email, plan,
                  stripeCustomerId: session.customer, stripeSubscriptionId: session.subscription,
                  maxEmployees: planConfig.maxEmployees
                });
                const tempPassword = uuidv4().slice(0, 12);
                createUser({
                  companyId, email, password: tempPassword,
                  firstName: company_name.split(" ")[0], lastName: "Owner", role: "owner"
                });
                logSubscriptionEvent(companyId, "checkout_completed", {
                  stripeEventId: event.id, plan, amount: planConfig.price / 100
                });
                console.log(`[TENANT] New company created: ${company_name} (${plan}) - ${email}`);
              } else {
                updateSubscription(existingByEmail.id, {
                  plan, stripeSubscriptionId: session.subscription,
                  subscriptionStatus: "active", maxEmployees: planConfig.maxEmployees
                });
              }
            }
          }
          break;
        }
        case "customer.subscription.updated": {
          const subscription = event.data.object as any;
          const company = getCompanyByStripeCustomer(subscription.customer) as any;
          if (company) {
            const plan = subscription.metadata?.plan || company.plan;
            const planConfig = PLANS[plan as PlanKey];
            updateSubscription(company.id, {
              plan, stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.status,
              maxEmployees: planConfig?.maxEmployees || company.max_employees
            });
            logSubscriptionEvent(company.id, "subscription_updated", {
              stripeEventId: event.id, plan, metadata: JSON.stringify({ status: subscription.status })
            });
          }
          break;
        }
        case "customer.subscription.deleted": {
          const subscription = event.data.object as any;
          const company = getCompanyByStripeCustomer(subscription.customer) as any;
          if (company) {
            updateSubscription(company.id, {
              plan: company.plan, stripeSubscriptionId: subscription.id,
              subscriptionStatus: "canceled", maxEmployees: 0
            });
            logSubscriptionEvent(company.id, "subscription_canceled", {
              stripeEventId: event.id, plan: company.plan
            });
          }
          break;
        }
        case "invoice.payment_succeeded": {
          const invoice = event.data.object as any;
          const company = getCompanyByStripeCustomer(invoice.customer) as any;
          if (company) {
            logSubscriptionEvent(company.id, "payment_succeeded", {
              stripeEventId: event.id, amount: invoice.amount_paid / 100
            });
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as any;
          const company = getCompanyByStripeCustomer(invoice.customer) as any;
          if (company) {
            logSubscriptionEvent(company.id, "payment_failed", {
              stripeEventId: event.id, amount: invoice.amount_due / 100
            });
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (err: any) {
      console.error("Webhook error:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

  // ============================================
  // MARKETING / SIGNUP ROUTES
  // ============================================

  // Lead capture
  app.post("/api/marketing-signup", (req: Request, res: Response) => {
    try {
      const { email, companyName, contactName, trade, phone, planInterest } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      const id = createSignup({ email, companyName, contactName, trade, phone, planInterest });
      res.json({ success: true, id, message: "Thanks for signing up! We'll be in touch." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Free trial signup
  app.post("/api/marketing-trial", (req: Request, res: Response) => {
    try {
      const { email, companyName, firstName, lastName, password, trade, phone } = req.body;
      if (!email || !companyName || !firstName || !lastName || !password) {
        return res.status(400).json({ error: "Email, company name, first name, last name, and password are required" });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      const existingCompany = getCompanyByOwnerEmail(email) as any;
      if (existingCompany) {
        return res.status(409).json({ error: "An account with this email already exists. Please log in instead." });
      }

      const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
      const { companyId, userId } = createTrialCompany({
        name: companyName, slug, ownerEmail: email,
        ownerFirstName: firstName, ownerLastName: lastName,
        ownerPassword: password, trade, phone
      });

      const token = jwt.sign({
        id: userId, email, role: "owner", companyId, companyName
      }, JWT_SECRET, { expiresIn: "14d" });

      res.cookie("mkt_token", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 14 * 24 * 60 * 60 * 1000 });
      console.log(`[TRIAL] New trial started: ${companyName} (${email})`);

      res.json({
        success: true, token, companySlug: slug, trialDays: 14,
        message: `Welcome to BuildTrack Pro! Your 14-day free trial is active.`
      });
    } catch (err: any) {
      console.error("Trial signup error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Trial status
  app.get("/api/marketing-trial/status", authenticateToken, (req: any, res: Response) => {
    try {
      const company = getCompanyById(req.user.companyId) as any;
      if (!company) return res.status(404).json({ error: "Company not found" });
      const daysRemaining = getTrialDaysRemaining(company.id);
      const expired = isTrialExpired(company.id);
      res.json({
        subscriptionStatus: company.subscription_status, plan: company.plan,
        isTrialing: company.subscription_status === "trialing",
        isExpired: expired, daysRemaining, trialExpiresAt: company.trial_expires_at,
        hasPaymentMethod: !!company.stripe_customer_id
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upgrade trial to paid
  app.post("/api/marketing-trial/upgrade", authenticateToken, requireOwner, async (req: any, res: Response) => {
    try {
      const { plan } = req.body;
      if (!plan || !PLANS[plan as PlanKey]) {
        return res.status(400).json({ error: "Valid plan required (starter, pro, premium)" });
      }
      const company = getCompanyById(req.user.companyId) as any;
      if (!company) return res.status(404).json({ error: "Company not found" });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await createCheckoutSession({
        plan: plan as PlanKey, email: company.owner_email, companyName: company.name,
        successUrl: `${baseUrl}/api/marketing/success.html?session_id={CHECKOUT_SESSION_ID}&upgrade=true`,
        cancelUrl: `${baseUrl}/api/marketing/`
      });
      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Stripe checkout session
  app.post("/api/marketing-checkout", async (req: Request, res: Response) => {
    try {
      const { plan, email, companyName } = req.body;
      if (!plan || !email || !companyName) {
        return res.status(400).json({ error: "Plan, email, and company name are required" });
      }
      if (!PLANS[plan as PlanKey]) {
        return res.status(400).json({ error: "Invalid plan" });
      }
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await createCheckoutSession({
        plan: plan as PlanKey, email, companyName,
        successUrl: `${baseUrl}/api/marketing/success.html?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/api/marketing/#pricing`
      });
      res.json({ url: session.url });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================
  // AUTH ROUTES
  // ============================================

  app.post("/api/marketing-auth/login", (req: Request, res: Response) => {
    try {
      const { email, password, companySlug } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password required" });

      if (email === SUPER_ADMIN_EMAIL) {
        const superAdminPass = process.env.SUPER_ADMIN_PASSWORD || "buildtrack2026";
        if (password !== superAdminPass) return res.status(401).json({ error: "Invalid credentials" });
        const token = jwt.sign({ id: "super_admin", email, role: "super_admin", companyId: null }, JWT_SECRET, { expiresIn: "7d" });
        res.cookie("mkt_token", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
        return res.json({ token, user: { id: "super_admin", email, role: "super_admin", firstName: "Pedro", lastName: "Carranza" } });
      }

      if (!companySlug) return res.status(400).json({ error: "Company identifier required" });
      const company = getCompanyBySlug(companySlug) as any;
      if (!company) return res.status(404).json({ error: "Company not found" });
      const user = getUserByEmail(company.id, email) as any;
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: "Invalid credentials" });

      const token = jwt.sign({
        id: user.id, email: user.email, role: user.role, companyId: company.id, companyName: company.name
      }, JWT_SECRET, { expiresIn: "7d" });

      res.cookie("mkt_token", token, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
      res.json({
        token, user: {
          id: user.id, email: user.email, role: user.role,
          firstName: user.first_name, lastName: user.last_name,
          companyId: company.id, companyName: company.name
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/marketing-auth/logout", (_req: Request, res: Response) => {
    res.clearCookie("mkt_token");
    res.json({ success: true });
  });

  // ============================================
  // SUPER ADMIN ROUTES
  // ============================================

  app.get("/api/marketing-admin/companies", authenticateToken, requireSuperAdmin, (_req: Request, res: Response) => {
    try { res.json({ companies: getAllCompanies() }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/marketing-admin/signups", authenticateToken, requireSuperAdmin, (_req: Request, res: Response) => {
    try { res.json({ signups: getAllSignups() }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/marketing-admin/knowledge", authenticateToken, requireSuperAdmin, (req: Request, res: Response) => {
    try {
      const category = req.query.category as string | undefined;
      res.json({ data: getOwnerKnowledge(category) });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/marketing-admin/knowledge", authenticateToken, requireSuperAdmin, (req: Request, res: Response) => {
    try {
      const { category, key, value, notes } = req.body;
      if (!category || !key || !value) return res.status(400).json({ error: "Category, key, and value are required" });
      const id = setOwnerKnowledge(category, key, value, notes);
      res.json({ success: true, id });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/marketing-admin/knowledge/:id", authenticateToken, requireSuperAdmin, (req: Request, res: Response) => {
    try { deleteOwnerKnowledge(req.params.id); res.json({ success: true }); }
    catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/marketing-admin/pivot-context", authenticateToken, requireSuperAdmin, (_req: Request, res: Response) => {
    try {
      const allKnowledge = getOwnerKnowledge();
      const context: Record<string, Record<string, string>> = {};
      (allKnowledge as any[]).forEach((entry: any) => {
        if (!context[entry.category]) context[entry.category] = {};
        context[entry.category][entry.key] = entry.value;
      });
      res.json({ context });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ============================================
  // BILLING PORTAL
  // ============================================

  app.post("/api/marketing-billing/portal", authenticateToken, requireOwner, async (req: any, res: Response) => {
    try {
      const company = getCompanyById(req.user.companyId) as any;
      if (!company?.stripe_customer_id) return res.status(400).json({ error: "No billing account found" });
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const session = await createPortalSession(company.stripe_customer_id, `${baseUrl}/api/marketing/`);
      res.json({ url: session.url });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ============================================
  // HEALTH CHECK
  // ============================================

  app.get("/api/marketing-health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "BuildTrack Pro SaaS",
      version: "1.0.0",
      timestamp: new Date().toISOString()
    });
  });

  console.log("[marketing] Marketing API routes registered successfully");
}
