import { parseCsv, normalizeHandle } from "./seed-import";
import type { VenueDossier } from "@/lib/ai/enrich";

/**
 * "Import facts sheet" (COST-EFFICIENT-ENRICHMENT §4). Parse a completed dossier
 * spreadsheet (one venue per row, columns = the dossier fields + why_blank) so we
 * can SKIP Grok entirely and run only the (cheap) Claude writing step. Blank
 * fields are fine — `why_blank` explains them and the writer writes around them.
 */

export function parseFactsSheet(csv: string): Record<string, string>[] {
  const table = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length < 2) return [];
  const header = table[0].map((h) => h.trim().toLowerCase());
  return table.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

const list = (s?: string): string[] =>
  s ? s.split(/[;|]/).map((x) => x.trim()).filter(Boolean) : [];
const num = (s?: string): number | null => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : null;
};

/** Build a facts dossier from one sheet row. */
export function rowToDossier(row: Record<string, string>): VenueDossier {
  const g = (k: string): string | null => (row[k] ?? "").trim() || null;
  return {
    name: g("name"),
    also_known_as: list(row["also_known_as"]),
    what_it_is: g("what_it_is"),
    address: g("address"),
    city: g("city"),
    region_state: g("region_state"),
    country: g("country"),
    postcode: g("postcode"),
    lat: num(row["lat"]),
    lng: num(row["lng"]),
    phone: g("phone"),
    website: g("website"),
    instagram: g("instagram"),
    other_socials: list(row["other_socials"]),
    hours: null, // sheet hours are free text; structured hours left null
    established: g("established"),
    founders_pitmaster: g("founders_pitmaster"),
    bbq_style: g("bbq_style"),
    specialities: list(row["specialities"]),
    cook_method: g("cook_method"),
    wood_fuel: g("wood_fuel"),
    price_band: g("price_band"),
    awards_press: list(row["awards_press"]),
    setting_vibe: g("setting_vibe"),
    ordering_notes: g("ordering_notes"),
    best_photo_post_url: g("best_photo_post_url"),
    recent_instagram_posts: list(row["recent_instagram_posts"]).filter((u) =>
      /instagram\.com\/(p|reel)\//.test(u)
    ),
    location_label: g("location_label"),
    sources: list(row["sources"]),
    // why_blank explains missing fields — the writer treats it like `unknowns`.
    unknowns: list(row["unknowns"] || row["why_blank"]),
  };
}

/** Idempotency key for a facts row: normalised IG handle if present. */
export function factsHandle(row: Record<string, string>): string | null {
  const ig = row["instagram_handle"] || row["instagram"];
  return ig ? normalizeHandle(ig) : null;
}
