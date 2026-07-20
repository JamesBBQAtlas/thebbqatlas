import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe/server";

/** Open the Stripe billing portal so a member can manage their subscription. */
export async function POST(request: Request) {
  if (!stripe) {
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

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet." }, { status: 400 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/profile`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not open billing" },
      { status: 500 }
    );
  }
}
