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

export function grokCost(u: Usage): number {
  return (
    (u.in_tokens / 1e6) * PRICING.grokInPerM +
    (u.out_tokens / 1e6) * PRICING.grokOutPerM +
    (u.searches ?? 0) * PRICING.grokSearch
  );
}

export function claudeCost(u: Usage): number {
  return (
    (u.in_tokens / 1e6) * PRICING.claudeInPerM +
    (u.out_tokens / 1e6) * PRICING.claudeOutPerM
  );
}

export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
