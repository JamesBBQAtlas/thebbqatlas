import type { Faq } from "@/lib/seo/hub-content";

/**
 * Part G — a stored FAQ entry (operator-edited or venue-provided). Distinct from
 * the auto-generated FAQ, which is computed at render and never persisted.
 *   • source "admin"  — entered by an operator; trusted, shown immediately.
 *   • source "venue"  — submitted by the venue owner; shown ONLY once moderated
 *     (status "approved").
 *   • source "auto"   — an auto entry the operator has pinned/edited (optional).
 */
export interface StoredFaq {
  q: string;
  a: string;
  source?: "auto" | "admin" | "venue";
  status?: "pending" | "approved";
}

const FAQ_SOURCES = new Set(["auto", "admin", "venue"]);
const FAQ_STATUSES = new Set(["pending", "approved"]);

/** Validate/normalise an arbitrary value into a clean StoredFaq[] (for the DB). */
export function parseStoredFaq(v: unknown): StoredFaq[] {
  if (!Array.isArray(v)) return [];
  const out: StoredFaq[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const q = typeof o.q === "string" ? o.q.trim() : "";
    const a = typeof o.a === "string" ? o.a.trim() : "";
    if (!q || !a) continue;
    const source = typeof o.source === "string" && FAQ_SOURCES.has(o.source) ? (o.source as StoredFaq["source"]) : "admin";
    const status = typeof o.status === "string" && FAQ_STATUSES.has(o.status) ? (o.status as StoredFaq["status"]) : undefined;
    out.push({ q: q.slice(0, 300), a: a.slice(0, 2000), source, ...(status ? { status } : {}) });
  }
  return out.slice(0, 30);
}

const normQ = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Merge stored (admin/venue) FAQ with the auto-generated list into the single
 * list rendered in the accordion AND the FAQPage JSON-LD. Venue-provided entries
 * only appear once approved; admin entries are trusted. Stored entries come FIRST
 * (the venue's own answers lead), then auto entries whose question isn't already
 * covered. De-duplicated by normalised question.
 */
export function mergeVenueFaqs(stored: StoredFaq[] | null | undefined, auto: Faq[]): Faq[] {
  const out: Faq[] = [];
  const seen = new Set<string>();
  for (const e of stored ?? []) {
    if (!e?.q || !e?.a) continue;
    if (e.source === "venue" && e.status !== "approved") continue; // owner FAQ needs moderation
    const k = normQ(e.q);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ q: e.q, a: e.a });
  }
  for (const e of auto) {
    const k = normQ(e.q);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}
