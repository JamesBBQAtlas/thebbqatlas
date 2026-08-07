import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Priority senders — the trust signal comes from OUR live DB, not a hand-kept
 * list. Two sources:
 *  - known-venue domains: the registrable domain of every approved venue's real
 *    website (social/aggregator hosts excluded).
 *  - premium/owner emails: account emails of active subscribers (and, later,
 *    paid listing-tier venue owners).
 */

// Hosts that are NOT a venue's own domain — socials, aggregators, shorteners, maps.
const EXCLUDED_HOSTS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "youtu.be",
  "linktr.ee",
  "linktree.com",
  "google.com",
  "google.co.uk",
  "maps.google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "bit.ly",
  "t.co",
  "linkedin.com",
];

// Multi-label public suffixes so we keep the registrable domain, not "co.uk".
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au", "com.br", "com.mx", "co.nz", "org.nz", "co.za",
  "co.jp", "or.jp", "com.sg", "com.tr", "co.in", "com.ph", "com.my", "com.hk",
]);

export function isExcludedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return EXCLUDED_HOSTS.some((e) => h === e || h.endsWith(`.${e}`));
}

/** The registrable domain (eTLD+1) of a URL, or null if unusable/excluded. */
export function registrableDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
  host = host.toLowerCase().replace(/^www\./, "");
  if (!host || !host.includes(".")) return null;
  if (isExcludedHost(host)) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  return TWO_LEVEL_SUFFIXES.has(lastTwo) ? lastThree : lastTwo;
}

export interface PrioritySenders {
  venueDomains: string[];
  premiumEmails: string[];
}

export async function getPrioritySenders(): Promise<PrioritySenders> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { venueDomains: [], premiumEmails: [] };
  }
  const db = createAdminClient();

  // 1) Known-venue domains from approved venues with a real website.
  const domains = new Set<string>();
  try {
    const { data } = await db
      .from("restaurants")
      .select("website")
      .eq("status", "approved")
      .not("website", "is", null);
    for (const r of data ?? []) {
      const d = registrableDomain((r as { website?: string | null }).website);
      if (d) domains.add(d);
    }
  } catch {
    /* best-effort */
  }

  // 2) Premium/owner emails — active subscribers (emails live in auth.users).
  const emails = new Set<string>();
  try {
    const { data: subs } = await db
      .from("subscriptions")
      .select("user_id, status")
      .in("status", ["active", "trialing"]);
    const ids = [...new Set((subs ?? []).map((s) => (s as { user_id: string }).user_id).filter(Boolean))];
    for (const id of ids) {
      try {
        const { data } = await db.auth.admin.getUserById(id);
        const email = data?.user?.email;
        if (email) emails.add(email.toLowerCase());
      } catch {
        /* skip one bad id */
      }
    }
  } catch {
    /* best-effort */
  }

  return {
    venueDomains: [...domains].sort(),
    premiumEmails: [...emails].sort(),
  };
}

/**
 * Is this signed-in user a "priority" sender — a venue owner or an active
 * subscriber? Identity comes from the session (user id), never a header, so it
 * can't be spoofed. Uses the service-role client to see past RLS.
 */
export async function isPriorityUser(userId: string): Promise<boolean> {
  if (!userId || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const db = createAdminClient();
  try {
    const [owner, sub] = await Promise.all([
      db.from("restaurants").select("id", { count: "exact", head: true }).eq("owner_id", userId),
      db
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ["active", "trialing"]),
    ]);
    return (owner.count ?? 0) > 0 || (sub.count ?? 0) > 0;
  } catch {
    return false;
  }
}
