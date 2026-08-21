import Stripe from "stripe";

/**
 * Server-side Stripe client. Null when STRIPE_SECRET_KEY isn't set, so callers
 * must guard (`if (!stripe) …`) and degrade gracefully.
 *
 * B5 live-key boot guard: if a LIVE secret key (sk_live…) is present but the explicit
 * STRIPE_LIVE_ENABLED=1 flag is NOT set, we REFUSE to initialise billing — `stripe`
 * stays null, so every money route hits its "billing isn't switched on" 503 and the
 * webhook can't construct events. This is deliberate insurance against a one-character
 * paste error charging a real card during the TEST pass. Fail closed + fail loud.
 */
const secretKey = process.env.STRIPE_SECRET_KEY;
const liveKeyBlocked =
  Boolean(secretKey?.startsWith("sk_live")) &&
  process.env.STRIPE_LIVE_ENABLED !== "1";

if (liveKeyBlocked) {
  // eslint-disable-next-line no-console
  console.error(
    "[stripe] REFUSING to initialise billing: a LIVE secret key (sk_live…) is set but " +
      "STRIPE_LIVE_ENABLED !== '1'. Billing is disabled (stripe=null). Set " +
      "STRIPE_LIVE_ENABLED=1 only when you intend to take real payments."
  );
}

export const stripe =
  secretKey && !liveKeyBlocked ? new Stripe(secretKey) : null;
