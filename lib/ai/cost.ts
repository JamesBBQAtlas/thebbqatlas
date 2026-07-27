/**
 * Real per-call cost, computed from each API's own usage numbers (§09 item 1).
 * Grok gives web-search count + tokens; Claude gives tokens. Prices are current
 * published rates (override via env if they move).
 */
export const PRICING = {
  grokInPerM: Number(process.env.GROK_PRICE_IN_PER_M ?? 0.2), // $/M input tokens
  grokOutPerM: Number(process.env.GROK_PRICE_OUT_PER_M ?? 0.5), // $/M output tokens
  grokSearch: Number(process.env.GROK_PRICE_SEARCH ?? 0.005), // $/web search
  claudeInPerM: Number(process.env.CLAUDE_PRICE_IN_PER_M ?? 1.0), // Haiku 4.5
  claudeOutPerM: Number(process.env.CLAUDE_PRICE_OUT_PER_M ?? 5.0),
};

export interface Usage {
  in_tokens: number;
  out_tokens: number;
  searches?: number;
}

// Per-model rates, keyed on the id the API RETURNS — so the meter is
// self-correcting if the served model changes (grok-4-fast → grok-4-3, etc.).
// Unknown ids fall back to the default (fast/Haiku) rates.
const GROK_RATES: Record<string, { in: number; out: number }> = {
  "grok-4-fast": { in: PRICING.grokInPerM, out: PRICING.grokOutPerM },
  "grok-4-3": { in: PRICING.grokInPerM, out: PRICING.grokOutPerM },
};
const CLAUDE_RATES: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: PRICING.claudeInPerM, out: PRICING.claudeOutPerM },
  "claude-haiku-4-5-20251001": { in: PRICING.claudeInPerM, out: PRICING.claudeOutPerM },
};

function ratesFor(
  map: Record<string, { in: number; out: number }>,
  model: string | undefined,
  dflt: { in: number; out: number }
): { in: number; out: number } {
  if (model && map[model]) return map[model];
  // Prefix match (e.g. dated variants) before the default.
  if (model) {
    const hit = Object.keys(map).find((k) => model.startsWith(k));
    if (hit) return map[hit];
  }
  return dflt;
}

export function grokCost(u: Usage, model?: string): number {
  const r = ratesFor(GROK_RATES, model, { in: PRICING.grokInPerM, out: PRICING.grokOutPerM });
  return (
    (u.in_tokens / 1e6) * r.in +
    (u.out_tokens / 1e6) * r.out +
    (u.searches ?? 0) * PRICING.grokSearch
  );
}

export function claudeCost(u: Usage, model?: string): number {
  const r = ratesFor(CLAUDE_RATES, model, { in: PRICING.claudeInPerM, out: PRICING.claudeOutPerM });
  return (u.in_tokens / 1e6) * r.in + (u.out_tokens / 1e6) * r.out;
}

export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
