import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";
import { PREMIUM } from "@/lib/stripe/config";

/** Start a Stripe Checkout session for the premium subscription. */
export async function POST(request: Request) {
  if (!stripe || !PREMIUM.priceId) {
    return NextResponse.json(
      { error: "Billing isn't switched on yet." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 500 }
    );
  }
}
