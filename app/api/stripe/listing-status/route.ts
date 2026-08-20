import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getListingStatus } from "@/lib/account/listing";
import { PRO_PURCHASABLE, FEATURED_PURCHASABLE, PRO, FEATURED } from "@/lib/stripe/config";

export const dynamic = "force-dynamic";

/**
 * The current user's ownership + entitlement state for a venue — drives the owner
 * "manage listing" island on the (static) venue page. Exposes BOTH the $49 Pro page-
 * control state and the separate time-boxed Featured prominence state, plus what's on sale.
 */
export async function GET(request: Request) {
  const restaurantId = new URL(request.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Missing venue" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;

  const status = await getListingStatus(admin, user?.id ?? null, restaurantId);
  return NextResponse.json({
    ...status,
    proPurchasable: PRO_PURCHASABLE,
    featuredPurchasable: FEATURED_PURCHASABLE,
    proPrice: `${PRO.price}/${PRO.interval}`,
    featuredPrice: `${FEATURED.price}/${FEATURED.interval}`,
  });
}
