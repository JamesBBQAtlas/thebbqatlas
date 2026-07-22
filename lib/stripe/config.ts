/**
 * Stripe/monetization config. Everything is gated on STRIPE_SECRET_KEY being
 * present, so the app builds and runs perfectly with billing switched off —
 * the UI shows "coming soon" until keys + a price are added (a short Stripe
 * setup session, like the Google one).
 */
export const STRIPE_ENABLED = Boolean(process.env.STRIPE_SECRET_KEY);

export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

/** Consumer premium subscription. */
export const PREMIUM = {
  priceId: process.env.STRIPE_PREMIUM_PRICE_ID || "",
  name: "Atlas Premium",
  price: "$4.99",
  interval: "month",
  blurb: "Support the Atlas and unlock the good stuff.",
  benefits: [
    "Ad-free browsing across the whole Atlas",
    "Your saved spots as a personal map",
    "Early access to new guides and features",
    "The Pitmaster's Secret — your nearest non-BBQ favorites, wherever you are",
  ],
} as const;

/** Whether a premium price is actually configured (so we can offer checkout). */
export const PREMIUM_PURCHASABLE = STRIPE_ENABLED && Boolean(PREMIUM.priceId);
