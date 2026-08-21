import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { PRO, FEATURED } from "@/lib/stripe/config";
import { ownsVenue } from "@/lib/account/listing";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { hasCurrentTermsAcceptance, recordOwnerTermsAcceptance } from "@/lib/account/terms";

/**
 * Start a Stripe Checkout session for a venue listing purchase. `plan` selects the
 * product: 'pro' → the $49/mo page-control tier (hero + all links); 'featured' → the
 * time-boxed weekly prominence window. Only the venue's owner (approved claim) can buy.
 * metadata.type (pro|featured) + restaurant_id lets the webhook set the right entitlement.
 */
export async function POST(request: Request) {
  if (!(await rateLimit(`listing-checkout:${clientIp(request)}`, 15, 3600))) {
    return NextResponse.json({ error: "Too many requests — try again later." }, { status: 429 });
  }

  // B8 — accept a Bearer token (native) OR cookie (web); web flow is unchanged.
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = auth.user;
  const supabase = auth.db;

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "").trim();
  if (!restaurantId) return NextResponse.json({ error: "Missing venue" }, { status: 400 });

  // Which product? Default to 'pro' (page control) — the primary paid tier.
  const plan = body.plan === "featured" ? "featured" : "pro";
  const product = plan === "featured" ? FEATURED : PRO;
  if (!stripe || !product.priceId) {
    return NextResponse.json({ error: `${product.name} isn't switched on yet.` }, { status: 503 });
  }

  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

  if (!(await ownsVenue(admin, user.id, restaurantId))) {
    return NextResponse.json({ error: "You don't own this venue." }, { status: 403 });
  }

  // B3 — a paid checkout must be backed by a CURRENT-version T&C acceptance. Owners accept
  // at claim, so this is normally already satisfied; if not (e.g. a version bump), require
  // acceptance in the request and record it before taking any money.
  if (!(await hasCurrentTermsAcceptance(admin, user.id))) {
    if (body.acceptedTerms !== true) {
      return NextResponse.json(
        {
          error: "terms_acceptance_required",
          message: "Please accept the current Venue Owner Terms to continue.",
        },
        { status: 403 }
      );
    }
    await recordOwnerTermsAcceptance(admin, {
      userId: user.id,
      userEmail: user.email ?? null,
      restaurantId,
      ip: clientIp(request),
      at: "checkout",
      route: "listing-checkout",
      plan,
    });
  }

  const { data: venue } = await admin
    .from("restaurants")
    .select("slug, name")
    .eq("id", restaurantId)
    .single();
  const origin = new URL(request.url).origin;

  try {
    // Reuse/create the owner's Stripe customer.
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_customer_id, display_name")
      .eq("id", user.id)
      .single();
    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: profile?.display_name ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      await admin
        .from("profiles")
        .upsert({ id: user.id, stripe_customer_id: customerId }, { onConflict: "id" });
    }

    const back = venue?.slug ? `/restaurants/${venue.slug}` : "/my-atlas";
    const meta = { type: plan, restaurant_id: restaurantId, user_id: user.id };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: product.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}${back}?${plan}=success`,
      cancel_url: `${origin}${back}?${plan}=cancelled`,
      metadata: meta,
      subscription_data: { metadata: meta },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe.listing-checkout] failed:", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
