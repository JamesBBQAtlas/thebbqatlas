import type { SupabaseClient } from "@supabase/supabase-js";

const firstToken = (n: string | null | undefined): string | null => {
  const t = (n ?? "").trim().split(/\s+/)[0];
  return t || null;
};

/**
 * The FIRST name to greet in a transactional email (policy — all emails).
 * Source of truth = `profiles.display_name`; falls back to OAuth full_name/name
 * for a profile not yet backfilled. Never uses the email local-part or a
 * @username. Returns null when there's no real name on file → the template
 * greets with no name (in-voice), never "Welcome, ." or "Welcome, <prefix>".
 */
export async function emailFirstName(
  admin: SupabaseClient,
  opts: { userId?: string | null; email?: string | null }
): Promise<string | null> {
  if (!opts.userId) return null;
  const emailLocal = opts.email ? opts.email.split("@")[0].toLowerCase() : null;

  const { data: prof } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", opts.userId)
    .maybeSingle();
  let name = prof?.display_name?.trim() || null;
  // Ignore an auto email-prefix display_name (the old default) — that's a
  // "no real name" case, not a name to greet by.
  if (name && emailLocal && name.toLowerCase() === emailLocal) name = null;

  if (!name) {
    // Fallback for a profile not yet backfilled: OAuth metadata.
    try {
      const { data } = await admin.auth.admin.getUserById(opts.userId);
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>;
      const cand = [meta.full_name, meta.name, meta.given_name].find(
        (v) => typeof v === "string" && v.trim()
      ) as string | undefined;
      name = cand?.trim() || null;
    } catch {
      /* ignore — greet with no name */
    }
  }
  return firstToken(name);
}
