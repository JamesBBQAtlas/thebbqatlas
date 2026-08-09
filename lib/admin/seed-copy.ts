/**
 * Part 2 — the auto-generated seed-stub copy is NOT hand-written copy and must
 * never be treated as protected (`manual_copy`). The seed pattern is
 * `"<name> — barbecue[ in <city>]."` with an empty hook (see chain-seed.ts,
 * flagship.ts, seed-import.ts). A venue whose only copy is this stub is
 * effectively unwritten: enrichment must be free to overwrite it, and a save
 * that leaves it unchanged must never flip `manual_copy` on.
 */
export function looksLikeSeedStub(description?: string | null): boolean {
  const s = (description ?? "").trim();
  if (!s) return true; // no description = unwritten
  // "<name> [dash] barbecue[ in <city>]." on one line — em/en dash or hyphen.
  return /^.{1,80}\s[–—-]\sbarbecue(\sin\s.{1,80})?\.\s*$/u.test(s);
}
