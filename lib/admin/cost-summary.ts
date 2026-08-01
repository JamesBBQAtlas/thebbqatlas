/**
 * Spend-by-provider readout for the admin listings page.
 *
 * The accurate all-time total is `enrichment_cost` summed across venues — it's
 * cumulative per venue (every run adds to it). The per-provider SPLIT, however,
 * can only be read from `enrichment_cost_breakdown`, which holds ONLY each
 * venue's most-recent run. So the split is an approximation: we take each
 * venue's last-run provider ratio and use it to distribute that venue's full
 * cumulative cost, keeping the split proportional to the exact total.
 *
 * enrichment_runs (the provenance log) does NOT store per-run provider costs,
 * so it can't give a truer split — hence this row-based derivation.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const n = (v: unknown): number => Number(v) || 0;

/** Exact spend split read straight from the append-only ai_usage_log ledger. */
export interface UsageReport {
  allTime: { anthropic: number; xai: number; total: number; searches: number; calls: number };
  today: { anthropic: number; xai: number; total: number };
  week: { anthropic: number; xai: number; total: number };
  venuesEnriched: number;
  byModel: { provider: string; model: string; cost: number; calls: number; input_tokens: number; output_tokens: number; searches: number }[];
  byTask: { task: string; cost: number; calls: number; anthropic: number; xai: number }[];
}

/**
 * Read the EXACT spend rollup from the ledger (via the ai_usage_report() SQL
 * function — server-side aggregation, so no 1000-row API cap and no scaling).
 * Returns null if the ledger/function isn't available (older env) so the caller
 * can fall back to the legacy per-venue derivation.
 */
export async function getAiUsageReport(db: SupabaseClient): Promise<UsageReport | null> {
  try {
    const { data, error } = await db.rpc("ai_usage_report");
    if (error || !data || typeof data !== "object") return null;
    const d = data as Record<string, Record<string, unknown>>;
    const money = (o: Record<string, unknown> | undefined) => ({
      anthropic: n(o?.anthropic),
      xai: n(o?.xai),
      total: n(o?.total),
    });
    return {
      allTime: {
        ...money(d.allTime),
        searches: n(d.allTime?.searches),
        calls: n(d.allTime?.calls),
      },
      today: money(d.today),
      week: money(d.week),
      venuesEnriched: n((d as Record<string, unknown>).venuesEnriched),
      byModel: Array.isArray((d as Record<string, unknown>).byModel)
        ? ((d as unknown as { byModel: Record<string, unknown>[] }).byModel).map((m) => ({
            provider: String(m.provider ?? ""),
            model: String(m.model ?? ""),
            cost: n(m.cost),
            calls: n(m.calls),
            input_tokens: n(m.input_tokens),
            output_tokens: n(m.output_tokens),
            searches: n(m.searches),
          }))
        : [],
      byTask: Array.isArray((d as Record<string, unknown>).byTask)
        ? ((d as unknown as { byTask: Record<string, unknown>[] }).byTask).map((t) => ({
            task: String(t.task ?? ""),
            cost: n(t.cost),
            calls: n(t.calls),
            anthropic: n(t.anthropic),
            xai: n(t.xai),
          }))
        : [],
    };
  } catch {
    return null;
  }
}

export interface CostSummary {
  anthropicAllTime: number;
  xaiAllTime: number;
  totalAllTime: number;
  anthropicToday: number;
  xaiToday: number;
  totalToday: number;
  venuesEnriched: number;
  totalSearches: number;
  basis: string; // one-line honest note on how the split was derived
}

type Breakdown = Record<string, unknown> | null;

interface CostRow {
  enrichment_cost: number | null;
  enrichment_cost_breakdown: Breakdown;
  enriched_at: string | null;
}

const num = (v: unknown): number => Number(v) || 0;

/** Claude side of a last-run breakdown. */
function anthropicOf(b: Breakdown): number {
  if (!b) return 0;
  return num(b.claude_cost);
}

/** xAI side of a last-run breakdown (Grok tokens + web-search fees). */
function xaiOf(b: Breakdown): number {
  if (!b) return 0;
  return num(b.grok_cost) + num(b.search_cost);
}

export function summarizeCosts(rows: CostRow[], todayIso: string): CostSummary {
  let anthropicAllTime = 0;
  let xaiAllTime = 0;
  let totalAllTime = 0;
  let anthropicToday = 0;
  let xaiToday = 0;
  let totalToday = 0;
  let venuesEnriched = 0;
  let totalSearches = 0;

  for (const row of rows) {
    const cost = num(row.enrichment_cost);
    const b = row.enrichment_cost_breakdown;

    // Accurate all-time total (cumulative per venue).
    totalAllTime += cost;
    if (cost > 0) venuesEnriched += 1;

    // Searches — prefer the explicit total, fall back to the raw grok count.
    if (b) {
      const searches = num(b.total_searches) || num(b.grok_searches);
      totalSearches += searches;
    }

    // Provider split all-time: distribute this venue's full cumulative cost by
    // its last-run provider ratio, so the split sums back to totalAllTime.
    const lastAnthropic = anthropicOf(b);
    const lastXai = xaiOf(b);
    const lastTotal = lastAnthropic + lastXai;
    if (lastTotal > 0) {
      const scale = cost / lastTotal;
      anthropicAllTime += lastAnthropic * scale;
      xaiAllTime += lastXai * scale;
    }
    // else: cost with no attributable breakdown stays "unattributed" — folded
    // into totalAllTime only, never invented onto a provider.

    // Today: sum the last-run breakdown for venues enriched today.
    if (row.enriched_at && row.enriched_at.slice(0, 10) === todayIso) {
      anthropicToday += lastAnthropic;
      xaiToday += lastXai;
      totalToday += lastTotal;
    }
  }

  return {
    anthropicAllTime,
    xaiAllTime,
    totalAllTime,
    anthropicToday,
    xaiToday,
    totalToday,
    venuesEnriched,
    totalSearches,
    basis:
      "All-time total is exact (cumulative per venue); the Anthropic/xAI split is derived from each venue's most-recent run breakdown and scaled to that total.",
  };
}
