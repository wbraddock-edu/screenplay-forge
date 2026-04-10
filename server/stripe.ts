import Stripe from "stripe";
import type { Express, Request, Response } from "express";
import { sqlite } from "./db";

// Screenplay Forge Price IDs from env vars
const MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID || "";
const YEARLY_PRICE_ID = process.env.STRIPE_YEARLY_PRICE_ID || "";

const TRIAL_DAYS = 7;

// Initialize Stripe (lazy — only when key is available)
let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
    stripe = new Stripe(key, { apiVersion: "2025-04-30.basil" as any });
  }
  return stripe;
}

// --- Subscription Helpers ---

export function isTrialActive(user: any): boolean {
  if (!user) return false;
  const trialStart = user.trial_started_at || user.created_at;
  if (!trialStart) return false;
  const trialEnd = new Date(trialStart);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  return new Date() < trialEnd;
}

export function getTrialDaysRemaining(user: any): number {
  if (!user) return 0;
  const trialStart = user.trial_started_at || user.created_at;
  if (!trialStart) return 0;
  const trialEnd = new Date(trialStart);
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  const diff = trialEnd.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function hasActiveSubscription(user: any): boolean {
  if (!user) return false;
  return user.subscription_status === "active" || user.subscription_status === "past_due";
}

export function isAdmin(user: any): boolean {
  return user?.role === "admin";
}

export function canAccessFeatures(user: any): boolean {
  return isAdmin(user) || hasActiveSubscription(user) || isTrialActive(user);
}

// --- Get user from DB by ID ---
function getUser(userId: number): any {
  return sqlite.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

// --- Stripe Routes ---

export function registerStripeRoutes(app: Express) {
  // Get subscription status for current user
  app.get("/api/subscription/status", (req: Request, res: Response) => {
    const user = getUser(req.userId!);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const trialDays = getTrialDaysRemaining(user);
    const trialActive = isTrialActive(user);
    const subActive = hasActiveSubscription(user);

    res.json({
      status: isAdmin(user) ? "admin" : (user.subscription_status || "trial"),
      plan: user.subscription_plan || null,
      trialDaysRemaining: trialDays,
      trialActive,
      subscriptionActive: subActive,
      isAdmin: isAdmin(user),
      canAccess: canAccessFeatures(user),
      expiresAt: user.subscription_expires_at || null,
    });
  });

  // Create Stripe Checkout session
  app.post("/api/subscription/checkout", async (req: Request, res: Response) => {
    const user = getUser(req.userId!);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    try {
      const s = getStripe();
      const { plan } = req.body; // "monthly" or "yearly"
      const priceId = plan === "yearly" ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;
      if (!priceId) return res.status(500).json({ message: "Stripe price IDs not configured" });

      // Create or retrieve Stripe customer
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await s.customers.create({
          email: user.email,
          name: user.display_name,
          metadata: { userId: String(user.id) },
        });
        customerId = customer.id;
        sqlite.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, user.id);
      }

      // Determine the base URL from the request
      const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const baseUrl = `${proto}://${host}`;

      const session = await s.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/#/?checkout=success`,
        cancel_url: `${baseUrl}/#/`,
        subscription_data: {
          metadata: { userId: String(user.id) },
        },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe checkout error:", err?.message);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  // Create Stripe Customer Portal session (manage subscription)
  app.post("/api/subscription/portal", async (req: Request, res: Response) => {
    const user = getUser(req.userId!);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    if (!user.stripe_customer_id) return res.status(400).json({ message: "No subscription found" });

    try {
      const s = getStripe();
      const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      const baseUrl = `${proto}://${host}`;

      const session = await s.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${baseUrl}/#/`,
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe portal error:", err?.message);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  // Stripe Webhook — handles subscription lifecycle events
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    try {
      const s = getStripe();
      if (webhookSecret && sig) {
        event = s.webhooks.constructEvent(
          (req as any).rawBody || req.body,
          sig,
          webhookSecret
        );
      } else {
        event = req.body as Stripe.Event;
      }
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err?.message);
      return res.status(400).send(`Webhook Error: ${err?.message}`);
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const subscriptionId = session.subscription as string;
          const customerId = session.customer as string;

          if (subscriptionId) {
            const s = getStripe();
            const sub = await s.subscriptions.retrieve(subscriptionId);
            const userId = sub.metadata?.userId || session.metadata?.userId;

            if (userId) {
              const priceId = (sub as any).items?.data?.[0]?.price?.id;
              const plan = priceId === YEARLY_PRICE_ID ? "yearly" : "monthly";
              const expiresAt = new Date((sub as any).current_period_end * 1000).toISOString();

              sqlite.prepare(`
                UPDATE users SET
                  subscription_status = 'active',
                  stripe_customer_id = ?,
                  stripe_subscription_id = ?,
                  subscription_plan = ?,
                  subscription_expires_at = ?
                WHERE id = ?
              `).run(customerId, subscriptionId, plan, expiresAt, parseInt(userId));

              console.log(`Subscription activated for user ${userId}: ${plan}`);
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          if (userId) {
            const status = sub.status === "active" ? "active"
              : sub.status === "past_due" ? "past_due"
              : sub.status === "canceled" ? "canceled"
              : sub.status as string;

            const priceId = (sub as any).items?.data?.[0]?.price?.id;
            const plan = priceId === YEARLY_PRICE_ID ? "yearly" : "monthly";
            const expiresAt = new Date((sub as any).current_period_end * 1000).toISOString();

            sqlite.prepare(`
              UPDATE users SET subscription_status = ?, subscription_plan = ?, subscription_expires_at = ?
              WHERE id = ?
            `).run(status, plan, expiresAt, parseInt(userId));

            console.log(`Subscription updated for user ${userId}: ${status} (${plan})`);
          }
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const userId = sub.metadata?.userId;
          if (userId) {
            sqlite.prepare(`
              UPDATE users SET subscription_status = 'canceled', stripe_subscription_id = NULL, subscription_plan = NULL
              WHERE id = ?
            `).run(parseInt(userId));

            console.log(`Subscription canceled for user ${userId}`);
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;
          sqlite.prepare(`
            UPDATE users SET subscription_status = 'past_due' WHERE stripe_customer_id = ?
          `).run(customerId);
          console.log(`Payment failed for customer ${customerId}`);
          break;
        }
      }
    } catch (err: any) {
      console.error("Webhook processing error:", err?.message);
    }

    res.json({ received: true });
  });
}
