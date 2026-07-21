export type Fresh = "green" | "amber" | "red";

/** Traffic-light on enrichment age: ≤1mo green, ≤3mo amber, older/never red. */
export function freshness(enrichedAt: string | null | undefined): {
  tone: Fresh;
  label: string;
  days: number | null;
} {
  if (!enrichedAt) return { tone: "red", label: "Never", days: null };
  const days = Math.floor((Date.now() - new Date(enrichedAt).getTime()) / 86_400_000);
  const label =
    days < 1 ? "Today" : days < 30 ? `${days}d ago` : `${Math.floor(days / 30)}mo ago`;
  if (days <= 30) return { tone: "green", label, days };
  if (days <= 90) return { tone: "amber", label, days };
  return { tone: "red", label, days };
}

export const FRESH_TONE_CLASSES: Record<Fresh, string> = {
  green: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
};
export const FRESH_DOT: Record<Fresh, string> = {
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
};
