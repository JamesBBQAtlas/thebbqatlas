/**
 * Stripe/monetization config — the confirmed pricing STRUCTURE (Aug 19 realignment).
 * Prices are config and may flex; the structure is fixed:
 *
 *   • PRO ($49/mo)      — the paid venue tier. FULL page control: hero-photo control +
 *                          ALL owner links (shop/merch, gift cards, tickets & events,
 *                          ordering). Hero + links gate on THIS tier.
 *   • FEATURED (~$100/wk)— a SEPARATE, à-la-carte, TIME-BOXED prominence purchase, bought
 *                          on top of any tier. Changes placement + adds the badge only;
 *                          does NOT unlock links/hero.
 *   • LOWER ($29.99/mo) — a dormant lower tier. Built as an inert seam; NOT sold day one.
 *   • Consumer PREMIUM ($4.99/mo) — DEFERRED. Code path kept, but NOT sold and no live CTA.
 *
 * Everything is gated on STRIPE_SECRET_KEY, so the app runs fine with billing off.
 */
export const STRIPE_ENABLED = Boolean(process.env.STRIPE_SECRET_KEY);

export const STRIPE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

/** Consumer premium subscription — DEFERRED (kept as a code path, not sold now). */
export const PREMIUM = {
  priceId: process.env.STRIPE_PREMIUM_PRICE_ID || "",
  name: "Atlas Premium",
  price: "$4.99",
  interval: "month",
  blurb: "Support the Atlas. A few good perks, no confetti.",
  benefits: [
    "Ad-free browsing across the whole Atlas",
    "Your saved spots as a personal map",
    "Early access to new guides and features",
    "The Pitmaster's Secret — your nearest non-BBQ favorites, wherever you are",
  ],
} as const;

/**
 * Consumer premium is intentionally NOT sold yet (James is "a while off" from consumer
 * subs). This explicit flag — not just the presence of a price — gates the CTA, so even
 * if a price were configured the upgrade button stays dormant. Set CONSUMER_PREMIUM_LIVE=1
 * to stand it up later.
 */
export const CONSUMER_PREMIUM_LIVE = process.env.CONSUMER_PREMIUM_LIVE === "1";

/** Whether a consumer-premium CTA may appear (deferred flag AND price AND Stripe). */
export const PREMIUM_PURCHASABLE =
  CONSUMER_PREMIUM_LIVE && STRIPE_ENABLED && Boolean(PREMIUM.priceId);

/**
 * PRO — the $49/mo venue tier that unlocks full page control: hero-photo control + all
 * owner links. Entitlement is stored on the restaurant (listing_tier='pro' + listing_until).
 */
export const PRO = {
  priceId: process.env.STRIPE_PRO_PRICE_ID || "",
  tier: "pro",
  name: "Pro",
  price: "$49",
  interval: "month",
  perks: [
    "Choose your hero photo (from your approved photos)",
    "All owner links — shop/merch, gift cards, tickets & events, ordering",
    "A verified owner badge on your venue page",
  ],
} as const;
export const PRO_PURCHASABLE = STRIPE_ENABLED && Boolean(PRO.priceId);

/**
 * FEATURED — à-la-carte, TIME-BOXED prominence, sold per week. Bought on top of any tier.
 * Prominence only: featured placement + the badge (drives is_premium / premium_until as
 * the featured WINDOW). Does NOT unlock links or hero. Price falls back to the legacy
 * STRIPE_LISTING_PRICE_ID env so an already-set value keeps working.
 */
export const FEATURED = {
  priceId: process.env.STRIPE_FEATURED_PRICE_ID || process.env.STRIPE_LISTING_PRICE_ID || "",
  tier: "featured",
  name: "Featured",
  price: "$100",
  interval: "week",
  perks: [
    "Featured placement on the homepage, directory and map",
    "A time-boxed prominence window — buy the weeks you want",
  ],
} as const;
export const FEATURED_PURCHASABLE = STRIPE_ENABLED && Boolean(FEATURED.priceId);
/** Length of one purchased Featured window, in days (one week). */
export const FEATURED_WINDOW_DAYS = 7;

/** LOWER — the $29.99/mo dormant tier. An inert seam; not sold from the UI day one. */
export const LOWER = {
  priceId: process.env.STRIPE_LOWER_PRICE_ID || "",
  tier: "lower",
  name: "Starter",
  price: "$29.99",
  interval: "month",
} as const;
/** Deliberately NOT purchasable yet — the seam exists, but nothing sells it. */
export const LOWER_PURCHASABLE = false;

// ── Backward-compat aliases ──────────────────────────────────────────────────────────
// Older references (webhook receipt, listing-status route) imported LISTING for the
// Featured product. FEATURED is the same concept, so alias to avoid churn.
export const LISTING = FEATURED;
export const LISTING_PURCHASABLE = FEATURED_PURCHASABLE;
