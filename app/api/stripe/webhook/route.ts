import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** Reconcile a Stripe subscription into our `subscriptions` table. */
async function upsertSubscription(
  admin: SupabaseClient,
  metaUserId: string | undefined,
  sub: Stripe.Subscription
) {
  let userId = metaUserId;
  if (!userId) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", sub.customer as string)
      .maybeSingle();
    userId = data?.id;
  }
  if (!userId) return;

  // In recent Stripe API versions period fields live on the subscription item.
  const item = sub.items?.data?.[0];
  const periodEnd = item?.current_period_end ?? null;

  await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: sub.customer as string,
      status: sub.status,
      price_id: item?.price?.id ?? null,
      plan: "premium",
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = request.headers.get("stripe-signature");
  const body = await request.text();

  let event: Stripe.Event;
  try {
    event =
      secret && sig
        ? stripe.webhooks.constructEvent(body, sig, secret)
        : (JSON.parse(body) as Stripe.Event);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.metadata?.user_id;
        if (s.mode === "subscription" && s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string);
          await upsertSubscription(admin, userId, sub);
        } else if (s.mode === "payment") {
          await admin.from("orders").upsert(
            {
              stripe_session_id: s.id,
              user_id: userId ?? null,
              stripe_payment_intent: (s.payment_intent as string) ?? null,
              type: s.metadata?.type ?? "other",
              description: s.metadata?.description ?? null,
              amount_total: s.amount_total ?? null,
              currency: s.currency ?? null,
              status: "paid",
            },
            { onConflict: "stripe_session_id" }
          );
          // BBQ Mail order-receipt hook — DORMANT scaffold (Phase 8c).
          // When billing goes live, send the receipt here, e.g.:
          //   import { sendOrderReceipt } from "@/lib/email/senders";
          //   const email = s.customer_details?.email;
          //   if (email) await sendOrderReceipt({
          //     to: email,
          //     description: s.metadata?.description ?? "The BBQ Atlas order",
          //     amount: formatAmount(s.amount_total, s.currency),
          //   });
          // Intentionally not wired until Stripe is activated. sendOrderReceipt
          // is already gated on RESEND_API_KEY, so this stays a no-op regardless.
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await upsertSubscription(admin, sub.metadata?.user_id, sub);
        break;
      }
      default:
        break;
    }
  } catch {
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
