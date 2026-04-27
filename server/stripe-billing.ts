/**
 * Stripe Billing Module for BuildTrack Pro
 * Handles subscription management, checkout sessions, and webhooks
 */
import Stripe from "stripe";
import * as db from "./db";

// Initialize Stripe with the secret key
const stripeSecretKey = process.env.BTP_STRIPE_SK || process.env.STRIPE_SECRET_KEY || "";
let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (!stripeSecretKey) throw new Error("Stripe secret key not configured");
    stripe = new Stripe(stripeSecretKey, { apiVersion: "2025-04-30.basil" as any });
  }
  return stripe;
}

// ─── Product/Price IDs ──────────────────────────────────────────────────────
// These will be created dynamically on first use and cached
let cachedProducts: {
  allTradesProductId?: string;
  allTradesPriceId?: string;
  starterProductId?: string;
  starterPriceId?: string;
  proProductId?: string;
  proPriceId?: string;
} = {};

// ─── Ensure Products Exist ──────────────────────────────────────────────────
async function ensureProducts(): Promise<typeof cachedProducts> {
  if (cachedProducts.allTradesPriceId) return cachedProducts;

  const s = getStripe();

  // Search for existing products
  const products = await s.products.list({ limit: 100 });
  const existingAllTrades = products.data.find(p => p.metadata?.btp_type === "all_trades");
  const existingStarter = products.data.find(p => p.metadata?.btp_type === "starter_plan");
  const existingPro = products.data.find(p => p.metadata?.btp_type === "pro_plan");

  // All Trades Add-on ($4.99/mo)
  if (existingAllTrades) {
    cachedProducts.allTradesProductId = existingAllTrades.id;
    const prices = await s.prices.list({ product: existingAllTrades.id, active: true, limit: 1 });
    cachedProducts.allTradesPriceId = prices.data[0]?.id;
  }
  if (!cachedProducts.allTradesPriceId) {
    const product = await s.products.create({
      name: "BuildTrack Pro — All Trades Unlock",
      description: "Unlock all 24 construction trades for your company. Includes trade-specific AI knowledge, safety protocols, and material databases.",
      metadata: { btp_type: "all_trades" },
    });
    const price = await s.prices.create({
      product: product.id,
      unit_amount: 499, // $4.99
      currency: "usd",
      recurring: { interval: "month" },
    });
    cachedProducts.allTradesProductId = product.id;
    cachedProducts.allTradesPriceId = price.id;
  }

  // Starter Plan ($29.99/mo)
  if (existingStarter) {
    cachedProducts.starterProductId = existingStarter.id;
    const prices = await s.prices.list({ product: existingStarter.id, active: true, limit: 1 });
    cachedProducts.starterPriceId = prices.data[0]?.id;
  }
  if (!cachedProducts.starterPriceId) {
    const product = await s.products.create({
      name: "BuildTrack Pro — Starter",
      description: "Up to 15 employees, 10 active jobs, daily reports, payroll tracking, and AI assistant.",
      metadata: { btp_type: "starter_plan" },
    });
    const price = await s.prices.create({
      product: product.id,
      unit_amount: 2999, // $29.99
      currency: "usd",
      recurring: { interval: "month" },
    });
    cachedProducts.starterProductId = product.id;
    cachedProducts.starterPriceId = price.id;
  }

  // Professional Plan ($59.99/mo)
  if (existingPro) {
    cachedProducts.proProductId = existingPro.id;
    const prices = await s.prices.list({ product: existingPro.id, active: true, limit: 1 });
    cachedProducts.proPriceId = prices.data[0]?.id;
  }
  if (!cachedProducts.proPriceId) {
    const product = await s.products.create({
      name: "BuildTrack Pro — Professional",
      description: "Unlimited employees and jobs, advanced financial dashboards, all trades, priority support.",
      metadata: { btp_type: "pro_plan" },
    });
    const price = await s.prices.create({
      product: product.id,
      unit_amount: 5999, // $59.99
      currency: "usd",
      recurring: { interval: "month" },
    });
    cachedProducts.proProductId = product.id;
    cachedProducts.proPriceId = price.id;
  }

  return cachedProducts;
}

// ─── Create or Get Stripe Customer ─────────────────────────────────────────
async function ensureStripeCustomer(companyId: number): Promise<string> {
  const company = await db.getCompanyById(companyId);
  if (!company) throw new Error("Company not found");

  if (company.stripeCustomerId) return company.stripeCustomerId;

  const s = getStripe();
  const customer = await s.customers.create({
    name: company.name,
    email: company.ownerEmail || undefined,
    phone: company.ownerPhone || undefined,
    metadata: {
      btp_company_id: String(companyId),
      company_name: company.name,
    },
  });

  await db.updateCompany(companyId, { stripeCustomerId: customer.id } as any);
  return customer.id;
}

// ─── Create Checkout Session ────────────────────────────────────────────────
export async function createCheckoutSession(
  companyId: number,
  priceType: "all_trades" | "starter" | "professional",
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string; sessionId: string }> {
  const s = getStripe();
  const products = await ensureProducts();
  const customerId = await ensureStripeCustomer(companyId);

  let priceId: string;
  switch (priceType) {
    case "all_trades":
      priceId = products.allTradesPriceId!;
      break;
    case "starter":
      priceId = products.starterPriceId!;
      break;
    case "professional":
      priceId = products.proPriceId!;
      break;
    default:
      throw new Error(`Unknown price type: ${priceType}`);
  }

  const session = await s.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      btp_company_id: String(companyId),
      btp_price_type: priceType,
    },
  });

  return { url: session.url!, sessionId: session.id };
}

// ─── Create Customer Portal Session ────────────────────────────────────────
export async function createPortalSession(
  companyId: number,
  returnUrl: string
): Promise<{ url: string }> {
  const s = getStripe();
  const customerId = await ensureStripeCustomer(companyId);

  const session = await s.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

// ─── Get Subscription Status ────────────────────────────────────────────────
export async function getSubscriptionStatus(companyId: number): Promise<{
  plan: string;
  status: string;
  trialDaysLeft: number;
  hasAllTrades: boolean;
  currentPeriodEnd?: string;
}> {
  const company = await db.getCompanyById(companyId);
  if (!company) throw new Error("Company not found");

  // Calculate trial days left
  let trialDaysLeft = 0;
  if (company.subscriptionStatus === "trialing" && company.trialEndDate) {
    const now = new Date();
    const end = new Date(company.trialEndDate);
    trialDaysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }

  // If they have a Stripe subscription, check its current status
  let currentPeriodEnd: string | undefined;
  if (company.stripeSubscriptionId) {
    try {
      const s = getStripe();
      const sub = await s.subscriptions.retrieve(company.stripeSubscriptionId);
      currentPeriodEnd = new Date((sub as any).current_period_end * 1000).toISOString();
    } catch {}
  }

  return {
    plan: company.plan,
    status: company.subscriptionStatus,
    trialDaysLeft,
    hasAllTrades: company.allTradesUnlocked,
    currentPeriodEnd,
  };
}

// ─── Handle Webhook Events ──────────────────────────────────────────────────
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = parseInt(session.metadata?.btp_company_id || "0");
      const priceType = session.metadata?.btp_price_type;
      if (!companyId) break;

      const updates: any = {
        stripeSubscriptionId: session.subscription as string,
        subscriptionStatus: "active",
      };

      if (priceType === "all_trades") {
        updates.allTradesUnlocked = true;
      } else if (priceType === "starter") {
        updates.plan = "starter";
        updates.maxEmployees = 15;
        updates.maxJobs = 10;
      } else if (priceType === "professional") {
        updates.plan = "professional";
        updates.maxEmployees = 999;
        updates.maxJobs = 999;
        updates.allTradesUnlocked = true; // Pro includes all trades
      }

      await db.updateCompany(companyId, updates);
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      // Find company by stripe customer ID
      const company = await db.getCompanyByStripeCustomerId(customerId);
      if (!company) break;

      const status = subscription.status;
      const updates: any = {};
      if (status === "active") updates.subscriptionStatus = "active";
      else if (status === "past_due") updates.subscriptionStatus = "past_due";
      else if (status === "canceled") updates.subscriptionStatus = "cancelled";

      if (Object.keys(updates).length > 0) {
        await db.updateCompany(company.id, updates);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const company = await db.getCompanyByStripeCustomerId(customerId);
      if (!company) break;

      await db.updateCompany(company.id, {
        subscriptionStatus: "cancelled",
        allTradesUnlocked: false,
      } as any);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const company = await db.getCompanyByStripeCustomerId(customerId);
      if (!company) break;

      await db.updateCompany(company.id, {
        subscriptionStatus: "past_due",
      } as any);
      break;
    }
  }
}

// ─── Check if Stripe is configured ─────────────────────────────────────────
export function isStripeConfigured(): boolean {
  return !!stripeSecretKey;
}
