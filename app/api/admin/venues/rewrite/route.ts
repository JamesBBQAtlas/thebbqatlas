import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED } from "@/lib/ai/grok";
import { CLAUDE_ENABLED } from "@/lib/ai/claude";
import {
  writeVenueCopy,
  buildCopyPatch,
  openingStyleFor,
  type VenueDossier,
} from "@/lib/ai/enrich";
import { claudeCost, round4 } from "@/lib/ai/cost";
import { logAiUsage, providerForModel } from "@/lib/ai/usage-log";
import { auditFromPatch } from "@/lib/admin/content-audit";
import { looksLikeSeedStub } from "@/lib/admin/seed-copy";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Rewrite copy (VENUE-SYSTEM-SPEC §5b) — re-runs ONLY the Claude writing step
 * against the venue's STORED dossier (fast, cheap, no re-research). Lands as a
 * draft: a live venue holds it as pending_copy for approval; a pending venue
 * takes it directly. Use "Re-research + rewrite" (enrich-draft) when facts are
 * stale.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!CLAUDE_ENABLED && !GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI is off — set ANTHROPIC_API_KEY (or XAI_API_KEY)." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const { data: row, error } = await ctx.db
    .from("restaurants")
    .select("id, status, dossier, enrichment_cost, hook, description, manual_copy")
    .eq("id", restaurantId)
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }
  if (!row.dossier) {
    return NextResponse.json(
      { error: "No research on file yet — run Re-research + rewrite first." },
      { status: 400 }
    );
  }

  // M5 — never overwrite hand-written copy. If manual_copy is set and the admin didn't
  // explicitly pass overwriteManual, the rewrite is HELD for review (pending_changes)
  // instead of clobbering the draft, mirroring enrich-draft's protectCopy guard. A
  // seed-stub placeholder isn't real manual copy, so it stays freely replaceable.
  const overwriteManual = body.overwriteManual === true;
  const protectCopy =
    Boolean(row.manual_copy) &&
    !overwriteManual &&
    !looksLikeSeedStub(row.description as string | null);

  let copy;
  try {
    copy = await writeVenueCopy(row.dossier as unknown as VenueDossier, { openingStyle: openingStyleFor(restaurantId) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Copywriting failed." },
      { status: 502 }
    );
  }

  // Rewrite is Claude-only — accumulate just the writer cost (no Grok).
  const cost = round4(claudeCost(copy.usage, copy.model));
  // Exact per-call AI ledger row (§ PRE-623).
  await logAiUsage(ctx.db, {
    provider: providerForModel(copy.model),
    model: copy.model,
    task: "rewrite",
    entity_type: "restaurant",
    entity_id: restaurantId,
    input_tokens: copy.usage.in_tokens,
    output_tokens: copy.usage.out_tokens,
    search_count: 0,
    cost,
    usage_raw: copy.usage,
    user_id: ctx.userId,
  });
  const priorCost = Number(row.enrichment_cost ?? 0) || 0;
  // A protected manual draft routes through the pending path (like a live venue) so its
  // copy is preserved and the rewrite waits for approval instead of overwriting.
  const effectiveStatus = protectCopy ? "approved" : row.status;
  const patch = {
    ...buildCopyPatch(effectiveStatus, copy),
    enrichment_cost: round4(priorCost + cost),
  };
  const { error: updErr } = await ctx.db
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId);
  if (updErr) {
    console.error("[admin.rewrite] update failed:", updErr.message);
    return NextResponse.json({ error: "Could not save the rewrite." }, { status: 500 });
  }

  // Audit the copy change now if it landed live (draft); a protected draft or approved
  // venue's rewrite waits in pending_changes and is audited on approve-copy.
  if (effectiveStatus !== "approved") {
    await auditFromPatch(ctx.db, restaurantId, row as Record<string, unknown>, patch, {
      source: "ai_enrichment",
      changedBy: null,
      note: `rewrite · ${copy.model}`,
    });
  }

  const hasCopy = Boolean(copy.hook || copy.description);
  return NextResponse.json({
    ok: true,
    pending: effectiveStatus === "approved" && hasCopy,
    has_pending: effectiveStatus === "approved" && hasCopy,
    protected_manual_copy: protectCopy,
    has_copy: hasCopy,
    thin: copy.needs_attention && !hasCopy,
    needs_attention: copy.needs_attention,
    attention_reason: copy.attention_reason,
    copy: { hook: copy.hook, description: copy.description },
    cost,
  });
}
