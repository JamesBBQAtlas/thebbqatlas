import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getListingStatus } from "@/lib/account/listing";
import { LISTING_PURCHASABLE } from "@/lib/stripe/config";

export const dynamic = "force-dynamic";

/**
 * The current user's ownership + Featured state for a venue — drives the
 * "Upgrade to Featured" CTA island on the (static) venue page.
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
  return NextResponse.json({ ...status, purchasable: LISTING_PURCHASABLE });
}
