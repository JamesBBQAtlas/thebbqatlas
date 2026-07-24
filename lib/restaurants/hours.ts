/**
 * Opening hours helpers. `restaurants.hours` is a free-text jsonb map keyed by
 * day (e.g. { mon: "Closed", tue: "11:00–17:00", fri: "11:00–Sold Out (2pm)" }).
 * We render the free text for humans, but only emit a structured
 * openingHoursSpecification for days with a clean HH:MM–HH:MM range — we never
 * fabricate a close time from fuzzy copy like "Sold Out".
 */

const DAY_NAME: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
const ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function asMap(hours: unknown): Record<string, string> | null {
  if (!hours || typeof hours !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(hours as Record<string, unknown>)) {
    if (v != null && String(v).trim()) out[k.toLowerCase().slice(0, 3)] = String(v).trim();
  }
  return Object.keys(out).length ? out : null;
}

/** Display rows in week order: [{ day: "Monday", value: "11:00–17:00" }, …] */
export function hoursRows(hours: unknown): { day: string; value: string }[] {
  const map = asMap(hours);
  if (!map) return [];
  return ORDER.filter((k) => map[k]).map((k) => ({ day: DAY_NAME[k], value: map[k] }));
}

/** True when we hold any hours at all (for the enrichment flag). */
export function hasHours(hours: unknown): boolean {
  return hoursRows(hours).length > 0;
}

/** schema.org OpeningHoursSpecification — clean HH:MM–HH:MM ranges only. */
export function openingHoursSpec(hours: unknown): {
  "@type": string;
  dayOfWeek: string;
  opens: string;
  closes: string;
}[] {
  const map = asMap(hours);
  if (!map) return [];
  const spec = [];
  for (const k of ORDER) {
    const v = map[k];
    if (!v) continue;
    // Match "11:00–17:00" / "11:00-17:00" / "9:30 — 22:00" (en/em/hyphen dashes).
    const m = v.match(/(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/);
    if (!m) continue;
    spec.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${DAY_NAME[k]}`,
      opens: m[1],
      closes: m[2],
    });
  }
  return spec;
}
