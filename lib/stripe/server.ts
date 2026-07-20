import Stripe from "stripe";

/**
 * Server-side Stripe client. Null when STRIPE_SECRET_KEY isn't set, so callers
 * must guard (`if (!stripe) …`) and degrade gracefully.
 */
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
