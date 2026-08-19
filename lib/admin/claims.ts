/**
 * Claim-review helpers (Build Prompt 2a). Pure + dependency-free so they unit-test
 * without the DB. The domain-match hint is a lightweight verification signal for the
 * admin review queue: does the claimant's contact email sit on the venue's own web
 * domain? (Not proof — a hint. Manual admin approval remains the gate.)
 */

/** Bare registrable-ish host of an email address ("jo@mail.bono.com" → "bono.com"). */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.trim().toLowerCase().split("@");
  if (at.length !== 2 || !at[1]) return null;
  return baseDomain(at[1]);
}

/** Bare registrable-ish host of a website URL ("https://www.bono.com/menu" → "bono.com"). */
export function siteDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  let u = url.trim().toLowerCase();
  if (!/^https?:\/\//.test(u)) u = `https://${u}`;
  try {
    return baseDomain(new URL(u).hostname);
  } catch {
    return null;
  }
}

/** Strip a leading "www." and collapse a host to its last two labels (best-effort —
 *  a hint, not a PSL-accurate registrable domain). */
function baseDomain(host: string): string | null {
  const h = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!h || !h.includes(".")) return h || null;
  const parts = h.split(".");
  return parts.slice(-2).join(".");
}

export type DomainHint = "match" | "mismatch" | "unknown";

/**
 * Does the claimant's contact-email domain match the venue's website domain?
 *  • "match"    — same base domain (a strong ownership signal).
 *  • "mismatch" — both known but different (e.g. a gmail address — review closely).
 *  • "unknown"  — no email and/or no website to compare.
 */
export function domainMatchHint(
  contactEmail: string | null | undefined,
  website: string | null | undefined
): DomainHint {
  const e = emailDomain(contactEmail);
  const s = siteDomain(website);
  if (!e || !s) return "unknown";
  return e === s ? "match" : "mismatch";
}
