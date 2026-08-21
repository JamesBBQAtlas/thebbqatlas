import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { PREMIUM, PREMIUM_PURCHASABLE } from "@/lib/stripe/config";

/** Start a Stripe Checkout session for the premium subscription. */
export async function POST(request: Request) {
  // B5 (H3): gate on the SAME predicate the /premium UI uses — the consumer premium
  // tier is deliberately dormant (CONSUMER_PREMIUM_LIVE !== "1"). Without this, setting
  // a price-id env var alone would let any signed-in user curl a real subscription for a
  // product we aren't selling. 404 so the dormant endpoint isn't even advertised.
  if (!PREMIUM_PURCHASABLE || !stripe) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // B8 — accept a Bearer token (native) OR cookie (web); web flow is unchanged.
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = auth.user;
  const supabase = auth.db;

  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;
  const origin = new URL(request.url).origin;

  try {
    // Ensure the user has a Stripe customer.
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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PREMIUM.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/premium?status=success`,
      cancel_url: `${origin}/premium?status=cancelled`,
      metadata: { user_id: user.id },
      subscription_data: { metadata: { user_id: user.id } },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // M11: log detail server-side, return a generic message (no Stripe/DB internals).
    console.error("[stripe.checkout] failed:", err);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
