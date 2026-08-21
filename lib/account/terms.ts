import type { SupabaseClient } from "@supabase/supabase-js";
import { TERMS_VERSION } from "@/lib/constants/terms";
import { logAdminAction } from "@/lib/admin/audit-log";

/** Basic sanity check so we never try to insert a non-inet (e.g. "unknown") into the
 *  inet `ip` column. Accepts IPv4/IPv6 shapes; anything else is stored as null. */
function asInet(ip?: string | null): string | null {
  if (!ip || ip === "unknown") return null;
  return /^[0-9a-fA-F.:]+$/.test(ip) ? ip : null;
}

/**
 * Has this user accepted the CURRENT owner T&C version? Used to decide whether a paid
 * checkout needs to re-prompt (a version bump makes prior acceptances non-current).
 */
export async function hasCurrentTermsAcceptance(
  db: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await db
    .from("owner_terms_acceptances")
    .select("id")
    .eq("user_id", userId)
    .eq("terms_version", TERMS_VERSION)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Record one owner T&C acceptance (append-only) + an audit row. Written via the
 * service-role client (owner_terms_acceptances has no insert policy). Best-effort on the
 * audit row; the acceptance insert is the important part.
 */
export async function recordOwnerTermsAcceptance(
  db: SupabaseClient,
  opts: {
    userId: string;
    userEmail?: string | null;
    restaurantId?: string | null;
    ip?: string | null;
    at: "claim" | "checkout";
    route: string;
    plan?: string;
  }
): Promise<void> {
  await db.from("owner_terms_acceptances").insert({
    user_id: opts.userId,
    restaurant_id: opts.restaurantId ?? null,
    terms_version: TERMS_VERSION,
    ip: asInet(opts.ip),
    context: {
      at: opts.at,
      route: opts.route,
      ...(opts.plan ? { plan: opts.plan } : {}),
    },
  });
  await logAdminAction({
    db,
    actorId: opts.userId,
    actorEmail: opts.userEmail ?? null,
    action: "owner.terms_accepted",
    entityType: "restaurant",
    entityId: opts.restaurantId ?? null,
    summary: `owner accepted venue T&C ${TERMS_VERSION} at ${opts.at}`,
    context: { at: opts.at, terms_version: TERMS_VERSION, restaurant_id: opts.restaurantId ?? null },
  });
}
