import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/request-user";
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

  // B8 — accept a Bearer token (native) OR cookie (web); web flow is unchanged.
  const auth = await getRequestUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = auth.user;

  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : auth.db;
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
    console.error("[stripe.portal] failed:", err);
    return NextResponse.json({ error: "Could not open billing" }, { status: 500 });
  }
}
