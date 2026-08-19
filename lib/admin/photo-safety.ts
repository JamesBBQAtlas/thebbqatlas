import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkImageSafety,
  PHOTO_SAFETY_ENABLED,
  PhotoSafetyError,
} from "@/lib/ai/photo-safety";
import { grokCost, round4 } from "@/lib/ai/cost";
import { logAiUsage, providerForModel } from "@/lib/ai/usage-log";
import { logAdminAction } from "@/lib/admin/audit-log";

/**
 * Photo safety runner (Prompt 4). Screens one image, or sweeps a batch of not-yet-
 * screened / stalest photos. Writes the safety_* result columns, logs the AI spend,
 * and audit-logs a flag. NEVER changes moderation status — a flag is a signal for the
 * human moderator, and the weekly re-sweep flags (never unpublishes). Runs on the
 * caller's db (service-role for admin/cron).
 */

export type SafetyTable = "media" | "review_photos";

export interface SafetyRunResult {
  id: string;
  table: SafetyTable;
  status: "pass" | "flag" | "error" | "skipped";
  label?: string;
}

const nowIso = () => new Date().toISOString();

/** Screen a single {id, url} row of `table` and persist the verdict. */
export async function screenPhoto(
  db: SupabaseClient,
  table: SafetyTable,
  row: { id: string; url: string | null }
): Promise<SafetyRunResult> {
  if (!row.url || !/^https:\/\//i.test(row.url)) {
    await db
      .from(table)
      .update({
        safety_status: "error",
        safety_reason: "No screenable https image URL",
        safety_checked_at: nowIso(),
      })
      .eq("id", row.id);
    return { id: row.id, table, status: "error" };
  }

  try {
    const { verdict, model, usage, raw } = await checkImageSafety(row.url);

    await db
      .from(table)
      .update({
        safety_status: verdict.status, // 'pass' | 'flag' — NOT the moderation status
        safety_label: verdict.label,
        safety_score: verdict.score,
        safety_reason: verdict.reason,
        safety_model: model,
        safety_checked_at: nowIso(),
        safety_raw: raw,
      })
      .eq("id", row.id);

    // Spend ledger — same path the enrichment calls use.
    const cost = round4(
      grokCost({ in_tokens: usage.in_tokens, out_tokens: usage.out_tokens, searches: usage.searches }, model)
    );
    await logAiUsage(db, {
      provider: providerForModel(model),
      model,
      task: "photo_safety",
      entity_type: table,
      entity_id: row.id,
      input_tokens: usage.in_tokens,
      output_tokens: usage.out_tokens,
      search_count: usage.searches,
      cost,
      usage_raw: usage,
    });

    if (verdict.status === "flag") {
      await logAdminAction({
        db,
        actorId: null,
        actorEmail: "system:photo-safety",
        action: "photo.safety_flag",
        entityType: table === "media" ? "media" : "review_photo",
        entityId: row.id,
        summary: `photo flagged by safety screen: ${verdict.label}${verdict.reason ? ` — ${verdict.reason}` : ""}`,
        context: { table, label: verdict.label, score: verdict.score, categories: verdict.categories, model },
      });
    }

    return { id: row.id, table, status: verdict.status, label: verdict.label };
  } catch (e) {
    // A screen failure is recorded (still pending; a human reviews) — never a silent pass.
    await db
      .from(table)
      .update({
        safety_status: "error",
        safety_reason: e instanceof PhotoSafetyError ? e.message.slice(0, 300) : "safety check error",
        safety_checked_at: nowIso(),
      })
      .eq("id", row.id);
    return { id: row.id, table, status: "error" };
  }
}

export interface SweepSummary {
  enabled: boolean;
  screened: number;
  flagged: number;
  errors: number;
  passed: number;
  byTable: Record<SafetyTable, number>;
}

/**
 * Sweep the least-recently-screened photos across both tables (unchecked first, then
 * stalest), skipping rows already flagged (they await a human). Bounded by `limit` so a
 * weekly run stays cheap. This is the engine behind both the cron re-sweep and the
 * admin "run now".
 */
export async function sweepPhotoSafety(
  db: SupabaseClient,
  opts: { limit?: number } = {}
): Promise<SweepSummary> {
  const limit = Math.max(1, Math.min(1000, opts.limit ?? 200));
  const summary: SweepSummary = {
    enabled: PHOTO_SAFETY_ENABLED,
    screened: 0,
    flagged: 0,
    errors: 0,
    passed: 0,
    byTable: { media: 0, review_photos: 0 },
  };
  if (!PHOTO_SAFETY_ENABLED) return summary;

  // Split the budget across the two tables.
  const perTable = Math.max(1, Math.floor(limit / 2));
  const tables: SafetyTable[] = ["media", "review_photos"];

  for (const table of tables) {
    // Unchecked first (safety_checked_at is null), then stalest. Never re-run 'flag'.
    const { data } = await db
      .from(table)
      .select("id, url, safety_status")
      .neq("safety_status", "flag")
      .order("safety_checked_at", { ascending: true, nullsFirst: true })
      .limit(perTable);

    for (const row of (data ?? []) as { id: string; url: string | null }[]) {
      const res = await screenPhoto(db, table, row);
      summary.screened++;
      summary.byTable[table]++;
      if (res.status === "flag") summary.flagged++;
      else if (res.status === "error") summary.errors++;
      else if (res.status === "pass") summary.passed++;
    }
  }

  return summary;
}
