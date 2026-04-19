/**
 * BuildTrack Pro SaaS - Stripe Integration
 * Handles checkout sessions, billing portal, and webhook events.
 */
import Stripe from "stripe";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" as any });
  }
  return stripe;
}

export const PLANS = {
  starter: {
    name: "Starter",
    price: 4900,
    priceDisplay: "$49",
    maxEmployees: 10,
    features: ["Up to 10 employees", "GPS clock-in/out", "Basic reports", "Job tracking", "Mobile app access", "$5/additional user"]
  },
  pro: {
    name: "Pro",
    price: 9900,
    priceDisplay: "$99",
    maxEmployees: 25,
    features: ["Up to 25 employees", "Everything in Starter", "Pivot AI assistant", "Advanced reports & analytics", "Payroll export", "Geofencing", "$4/additional user"]
  },
  premium: {
    name: "Premium",
    price: 19900,
    priceDisplay: "$199",
    maxEmployees: 50,
    features: ["Up to 50 employees", "Everything in Pro", "Priority support", "Custom branding", "API access", "Multi-location support", "Dedicated account manager", "$4/additional user"]
  }
} as const;

export type PlanKey = keyof typeof PLANS;

export async function createCheckoutSession(data: {
  plan: PlanKey; email: string; companyName: string; successUrl: string; cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const s = getStripe();
  const planConfig = PLANS[data.plan];

  const customers = await s.customers.list({ email: data.email, limit: 1 });
  let customer: Stripe.Customer;
  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    customer = await s.customers.create({
      email: data.email, name: data.companyName,
      metadata: { company_name: data.companyName, plan: data.plan }
    });
  }

  return s.checkout.sessions.create({
    customer: customer.id,
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [{
      price_data: {
        currency: "usd",
        product_data: { name: `BuildTrack Pro - ${planConfig.name}`, description: `${planConfig.name} plan for ${data.companyName}` },
        unit_amount: planConfig.price,
        recurring: { interval: "month" }
      },
      quantity: 1
    }],
    metadata: { plan: data.plan, company_name: data.companyName, email: data.email },
    success_url: data.successUrl,
    cancel_url: data.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: "required",
    subscription_data: { metadata: { plan: data.plan, company_name: data.companyName } }
  });
}

export async function createPortalSession(stripeCustomerId: string, returnUrl: string) {
  const s = getStripe();
  return s.billingPortal.sessions.create({ customer: stripeCustomerId, return_url: returnUrl });
}

export function constructWebhookEvent(body: Buffer, signature: string): Stripe.Event {
  const s = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  return s.webhooks.constructEvent(body, signature, webhookSecret);
}
