/**
 * Owner accuracy edits (Build Prompt 2b) — the FREE-tier subset of venue fields an
 * approved owner may PROPOSE. Owner edits never write live: they become a pending
 * `suggestions` row (proposed/current jsonb) that an admin approves through the SAME
 * whitelisted apply the self-heal engine uses. This module is the single source of
 * truth for which fields an owner may touch + their normalisation, so the submit
 * route and the tests agree. Pure + dependency-free.
 *
 * Tiering: these are all FREE (claimed) accuracy edits — hours, phone, website,
 * socials, description (Prompt 3 §1a). Hero-photo control + product links are PREMIUM
 * and live in later slices; they are deliberately NOT in this whitelist.
 */

/** The fields an owner may propose. Keys match the `suggestions` apply whitelist
 *  (app/api/admin/suggestions/route.ts) so an approved owner edit applies cleanly. */
export const OWNER_EDITABLE_FIELDS = [
  "description",
  "website",
  "phone",
  "hours",
  "instagram_url",
  "x_url",
  "facebook_url",
  "tiktok_url",
  "youtube_url",
] as const;

export type OwnerEditableField = (typeof OWNER_EDITABLE_FIELDS)[number];

/**
 * PREMIUM owner link fields (Build Prompt 3c) — the Featured-listing capability.
 * A paid Featured owner may additionally propose an online shop / order-online link
 * and a tickets & events link. These are NOT in the free whitelist above; the submit
 * route only accepts them when the venue's Featured entitlement is active (checked
 * SERVER-SIDE — never trusted from the client), and they apply through the same
 * moderated `suggestions` path. "tickets" is the tickets-&-events link-type folded in
 * from Prompt 2 §5. Keys match the suggestions apply whitelist.
 */
export const PREMIUM_OWNER_LINK_FIELDS = ["shop_url", "tickets_url"] as const;
export type PremiumOwnerLinkField = (typeof PREMIUM_OWNER_LINK_FIELDS)[number];

const URL_FIELDS = new Set<OwnerEditableField>(["website", "instagram_url", "x_url", "facebook_url", "tiktok_url", "youtube_url"]);
const MAX_DESC = 4000;
const MAX_PHONE = 40;

/** A safe https URL (owner links are their own site/socials — https only). Returns the
 *  normalised URL, or null if empty/invalid/non-https. */
export function safeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:") return null; // reject http:, javascript:, data:, …
    return url.toString();
  } catch {
    return null;
  }
}

/** Normalise `hours` — accept a { mon..sun: string } object only; drop anything else. */
function normalizeHours(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const out: Record<string, string> = {};
  for (const d of days) {
    const v = (raw as Record<string, unknown>)[d];
    if (typeof v === "string") out[d] = v.trim().slice(0, 120);
  }
  return Object.keys(out).length ? out : null;
}

export interface OwnerPatchResult {
  /** The cleaned, whitelisted patch (only valid, changed-shape fields). */
  patch: Record<string, unknown>;
  /** Per-field rejection reasons (e.g. a non-https URL), for user feedback. */
  rejected: Record<string, string>;
}

/**
 * Validate + normalise a raw owner-submitted patch down to the whitelisted, safe
 * fields. Unknown fields are ignored; bad URLs / shapes are rejected with a reason.
 * (Whether a field actually CHANGED vs the current row is decided by the caller,
 * which has the `current` values.)
 */
export function sanitizeOwnerPatch(raw: Record<string, unknown>): OwnerPatchResult {
  const patch: Record<string, unknown> = {};
  const rejected: Record<string, string> = {};
  for (const field of OWNER_EDITABLE_FIELDS) {
    if (!(field in raw)) continue;
    const v = raw[field];
    if (field === "hours") {
      const h = normalizeHours(v);
      if (h) patch.hours = h;
      else if (v != null) rejected.hours = "Hours must be a { mon..sun } object of strings.";
      continue;
    }
    if (field === "description") {
      if (typeof v === "string") patch.description = v.trim().slice(0, MAX_DESC);
      else if (v != null) rejected.description = "Description must be text.";
      continue;
    }
    if (field === "phone") {
      if (typeof v === "string") patch.phone = v.trim().slice(0, MAX_PHONE);
      else if (v != null) rejected.phone = "Phone must be text.";
      continue;
    }
    if (URL_FIELDS.has(field)) {
      // Allow clearing a link with an explicit empty string.
      if (v === "" || v === null) { patch[field] = null; continue; }
      const url = safeHttpsUrl(v);
      if (url) patch[field] = url;
      else rejected[field] = "Must be a valid https:// URL.";
      continue;
    }
  }
  return { patch, rejected };
}

/**
 * Validate + normalise the PREMIUM owner link fields (shop_url / tickets_url). Same
 * https-only rule and clear-with-empty-string semantics as the free URL fields.
 * Unknown keys are ignored. The CALLER is responsible for the entitlement gate — this
 * only sanitises; it does not check Featured status. Returns a whitelisted patch.
 */
export function sanitizePremiumLinks(raw: Record<string, unknown>): OwnerPatchResult {
  const patch: Record<string, unknown> = {};
  const rejected: Record<string, string> = {};
  for (const field of PREMIUM_OWNER_LINK_FIELDS) {
    if (!(field in raw)) continue;
    const v = raw[field];
    if (v === "" || v === null) { patch[field] = null; continue; } // explicit clear
    const url = safeHttpsUrl(v);
    if (url) patch[field] = url;
    else rejected[field] = "Must be a valid https:// URL.";
  }
  return { patch, rejected };
}

/** True if a raw patch contains any premium link key at all (used to detect a
 *  not-entitled owner trying to set one, so we can tell them why it was dropped). */
export function hasPremiumLinkKeys(raw: Record<string, unknown>): boolean {
  return PREMIUM_OWNER_LINK_FIELDS.some((f) => f in raw);
}
