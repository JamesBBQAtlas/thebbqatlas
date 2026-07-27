import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED } from "@/lib/ai/grok";
import { CLAUDE_ENABLED } from "@/lib/ai/claude";
import {
  writeVenueCopy,
  buildCopyPatch,
  type VenueDossier,
} from "@/lib/ai/enrich";
import { claudeCost, round4 } from "@/lib/ai/cost";

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
    .select("id, status, dossier, enrichment_cost")
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

  let copy;
  try {
    copy = await writeVenueCopy(row.dossier as unknown as VenueDossier);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Copywriting failed." },
      { status: 502 }
    );
  }

  // Rewrite is Claude-only — accumulate just the writer cost (no Grok).
  const cost = round4(claudeCost(copy.usage));
  const priorCost = Number(row.enrichment_cost ?? 0) || 0;
  const patch = {
    ...buildCopyPatch(row.status, copy),
    enrichment_cost: round4(priorCost + cost),
  };
  const { error: updErr } = await ctx.db
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    pending: row.status === "approved",
    needs_attention: copy.needs_attention,
    attention_reason: copy.attention_reason,
    copy: { hook: copy.hook, description: copy.description },
    cost,
  });
}
