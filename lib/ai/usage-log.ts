import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Append-only AI usage ledger (§ PRE-623). One row per AI API call — the exact,
 * system-wide record of provider/model/task cost and token profile. Wired at
 * every AI call site; reads the REAL usage figures off the API response (never
 * an estimate where an actual number exists). Best-effort: a logging failure
 * must NEVER break the actual enrichment/find-IG/etc. request.
 */

export type AiProvider = "anthropic" | "xai";

/** Canonical task names (extensible — any future AI op logs its own). */
export type AiTask =
  | "enrich"
  | "flagship_enrich"
  | "find_ig"
  | "rewrite"
  | "roster"
  | "facts_import"
  | (string & {});

export interface AiUsageEntry {
  provider: AiProvider;
  model: string;
  task: AiTask;
  entity_type?: string | null;
  entity_id?: string | null;
  input_tokens?: number;
  output_tokens?: number;
  search_count?: number;
  cost: number;
  /** Raw usage block from the API response, so we can re-derive if prices move. */
  usage_raw?: unknown;
  /** The admin who ran this AI call (Fable M-2) — so spend is answerable to a person. */
  user_id?: string | null;
}

/** Derive the provider from the model id the API returned. */
export function providerForModel(model: string | undefined | null): AiProvider {
  const m = (model ?? "").toLowerCase();
  if (m.startsWith("grok") || m.includes("xai")) return "xai";
  return "anthropic";
}

const int = (v: unknown): number => {
  const n = Math.round(Number(v) || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Insert ONE ledger row for an AI call. Never throws — a telemetry write must
 * not fail the operation it's measuring.
 */
export async function logAiUsage(db: SupabaseClient, entry: AiUsageEntry): Promise<void> {
  try {
    await db.from("ai_usage_log").insert({
      provider: entry.provider,
      model: entry.model || "unknown",
      task: entry.task,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      input_tokens: int(entry.input_tokens),
      output_tokens: int(entry.output_tokens),
      search_count: int(entry.search_count),
      cost: Number(entry.cost) || 0,
      usage_raw: entry.usage_raw ?? null,
      user_id: entry.user_id ?? null,
    });
  } catch {
    // best-effort telemetry — swallow.
  }
}
