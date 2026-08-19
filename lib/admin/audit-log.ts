import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The ONE write helper for `admin_audit_log` (patch 0075 / Build Prompt 1) — the
 * unified, append-only trail of admin / owner / system actions across entities.
 * Wire it into every admin mutation; claims, subscriptions and photo moderation
 * (later prompts) call this same helper so there is ONE timeline.
 *
 * Contract:
 *   • Uses a SERVICE-ROLE client (bypasses RLS) — the table has no insert policy,
 *     so a cookie/RLS client cannot write. Pass `ctx.db` from requireAdmin().
 *   • BEST-EFFORT: a logging failure never throws, so it can't break the mutation
 *     it records (matches content_audit). Call it AFTER the mutation has committed
 *     successfully, so we never log a success that didn't happen.
 *   • `actorId: null` = a system / automated action (roster, enrichment, sweeps).
 *   • `diff` is capped — an oversized blob is replaced with a marker, never stored.
 */

/** A `{ field: { old, new } }` shape (the common case), or any small JSON blob. */
export type AuditDiff = Record<string, { old: unknown; new: unknown }> | Record<string, unknown>;

export interface LogAdminActionInput {
  /** Service-role client (bypasses RLS). */
  db: SupabaseClient;
  /** The acting admin/user's auth id, or null for a system/automated action. */
  actorId: string | null;
  /** Denormalised actor email. If omitted (undefined) AND actorId is set, it's
   *  resolved once via the auth admin API; pass null to skip the lookup. */
  actorEmail?: string | null;
  /** Dotted verb, e.g. "venue.publish", "user.role_change", "claim.approve". */
  action: string;
  /** "restaurant" | "profile" | "restaurant_claim" | "subscription" | "media" | … */
  entityType: string;
  entityId?: string | null;
  /** Human one-liner. */
  summary: string;
  diff?: AuditDiff | null;
  /** Minimal request meta (route, method). NO PII beyond email/route. */
  context?: Record<string, unknown> | null;
}

/** Oversized diffs are omitted (cap ~8 KB of JSON) — the log stays lean. */
const MAX_DIFF_BYTES = 8_000;

function capDiff(diff: AuditDiff | null | undefined): AuditDiff | null {
  if (!diff) return null;
  let s: string;
  try {
    s = JSON.stringify(diff);
  } catch {
    return { _omitted: "diff not serialisable — omitted" };
  }
  if (s.length > MAX_DIFF_BYTES) {
    return { _omitted: `diff too large (${s.length} bytes) — omitted`, _keys: Object.keys(diff).slice(0, 40) };
  }
  return diff;
}

/**
 * Build a `{ field: { old, new } }` diff from a before-row and a patch, keeping
 * only the keys that actually changed. A small convenience for the update paths.
 */
export function diffFromPatch(
  before: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, { old: unknown; new: unknown }> {
  const out: Record<string, { old: unknown; new: unknown }> = {};
  for (const k of Object.keys(patch)) {
    const oldV = before ? before[k] ?? null : null;
    const newV = patch[k] ?? null;
    if (JSON.stringify(oldV ?? null) !== JSON.stringify(newV ?? null)) out[k] = { old: oldV, new: newV };
  }
  return out;
}

export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  try {
    // Resolve the actor email once when the caller didn't supply it (best-effort).
    let actorEmail = input.actorEmail ?? null;
    if (input.actorEmail === undefined && input.actorId) {
      try {
        const { data } = await input.db.auth.admin.getUserById(input.actorId);
        actorEmail = data?.user?.email ?? null;
      } catch {
        /* email is best-effort */
      }
    }
    const { error } = await input.db.from("admin_audit_log").insert({
      actor_id: input.actorId,
      actor_email: actorEmail,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      diff: capDiff(input.diff),
      context: input.context ?? null,
    });
    // Surface (but never throw) a real write failure so it's diagnosable.
    if (error) console.warn(`[admin_audit_log] insert failed for ${input.action}: ${error.message}`);
  } catch (e) {
    console.warn(`[admin_audit_log] unexpected error for ${input.action}:`, e instanceof Error ? e.message : e);
  }
}
