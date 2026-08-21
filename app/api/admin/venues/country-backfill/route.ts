import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { revalidateVenues } from "@/lib/cache/venues";
import { canonicalCountry, isRecognizedCountry } from "@/lib/constants/countries";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * One-off country normalization backfill (country-normalize build). Maps existing
 * non-canonical `country` values ("MX" → Mexico, "Deutschland" → Germany) to the
 * single canonical name, and REPORTS anything it can't confidently map — an
 * unknown value, or an ambiguous one ("Georgia" is both a country and a US state)
 * — for a human, never a silent change.
 *
 * Dry-run by default (changes nothing); ?apply=1 writes. Idempotent — a second
 * run finds nothing left to map. RLS: admin-gated like every /api/admin route.
 */
interface Row {
  id: string;
  country: string | null;
}

export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const apply = url.searchParams.get("apply") === "1" || body.apply === true;

  const { data, error } = await ctx.db
    .from("restaurants")
    .select("id, country")
    .not("country", "is", null)
    .neq("country", "");
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  const rows = (data ?? []) as Row[];

  // A row needs mapping when its stored value isn't already the canonical name.
  const mappedByPair = new Map<string, { from: string; to: string; count: number; ids: string[] }>();
  const reviewByValue = new Map<string, { value: string; count: number; ids: string[] }>();

  for (const r of rows) {
    const stored = (r.country ?? "").trim();
    if (!stored) continue;
    const canon = canonicalCountry(stored);
    if (canon === stored) continue; // already canonical — nothing to do
    if (isRecognizedCountry(stored)) {
      // Confidently maps to a canonical name → safe to rewrite.
      const key = `${stored}→${canon}`;
      const e = mappedByPair.get(key) ?? { from: stored, to: canon, count: 0, ids: [] };
      e.count++; e.ids.push(r.id);
      mappedByPair.set(key, e);
    } else {
      // Unknown or ambiguous (e.g. "Georgia") → list for a human, never touched.
      const e = reviewByValue.get(stored) ?? { value: stored, count: 0, ids: [] };
      e.count++; e.ids.push(r.id);
      reviewByValue.set(stored, e);
    }
  }

  let updated = 0;
  if (apply) {
    for (const { to, ids } of mappedByPair.values()) {
      // Chunk the id list to keep the IN clause sane.
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200);
        const { error: upErr } = await ctx.db.from("restaurants").update({ country: to }).in("id", slice);
        if (!upErr) updated += slice.length;
      }
    }
    if (updated) revalidateVenues();
  }

  const mapped = [...mappedByPair.values()].map(({ from, to, count }) => ({ from, to, count }))
    .sort((a, b) => b.count - a.count);
  const needsReview = [...reviewByValue.values()].map(({ value, count }) => ({ value, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    mode: apply ? "apply" : "dry-run",
    scanned: rows.length,
    would_map: mapped.reduce((n, m) => n + m.count, 0),
    updated,
    mapped,
    needs_review: needsReview,
    note:
      needsReview.length
        ? `${needsReview.length} value(s) can't be confidently mapped (unknown or ambiguous like "Georgia") — left untouched for a human. See needs_review.`
        : mapped.length
          ? apply ? `Mapped ${updated} row(s) to canonical country names.` : `${mapped.reduce((n, m) => n + m.count, 0)} row(s) would be mapped — re-run with ?apply=1.`
          : "Every country value is already canonical. Nothing to do.",
  });
}
