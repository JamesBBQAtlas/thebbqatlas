/**
 * Enrichment cost model (COST-EFFICIENT-ENRICHMENT). Rough per-venue USD
 * estimates for the bounded, cost-capped pipeline — surfaced in the admin hub so
 * a batch never spends silently. The hard per-venue ceiling is $0.04; the
 * bounded model/search/token config keeps each action well under it.
 */
export const COST_PER_VENUE_CEILING = 0.04;

/**
 * Part 4 — the per-venue ceiling is EXPLICITLY LIFTED for a detected chain.
 * James authorised materially higher spend on chains: a deep whole-site crawl
 * (no LLM cost) plus a STRONGER copy writer (Sonnet, higher token budget) for the
 * flagship's brand copy and each branch. This is an order of magnitude above the
 * single-venue cap, not a few cents — a chain venue only trips "over ceiling"
 * above this. Still bounded, so a runaway is still caught and flagged.
 */
export const COST_PER_CHAIN_VENUE_CEILING = 0.5;

/** Estimated USD per action per venue. */
export const ACTION_COST: Record<string, number> = {
  enrich: 0.024, // grok-4-fast dossier (~$0.02) + Haiku copy (~$0.004)
  rewrite: 0.004, // Haiku only, from stored dossier
  ops: 0.018, // grok-4-fast operational refresh, no Haiku (Update details)
  findig: 0.01, // one lean grok-4-fast search
  facts: 0.004, // Haiku only (Grok skipped — facts imported)
  publish: 0,
  reject: 0,
};

/** Ask for confirmation before running a batch estimated above this (USD). */
export const BATCH_CONFIRM_THRESHOLD = 0.5;

export function estimateCost(kind: string, n: number): number {
  return (ACTION_COST[kind] ?? 0) * n;
}

export function fmtUsd(v: number): string {
  if (v <= 0) return "$0.00";
  if (v < 0.01) return "<$0.01";
  return `$${v.toFixed(2)}`;
}
