import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { GROK_ENABLED, GrokError } from "@/lib/ai/grok";
import { discoverChain, type VenueLead } from "@/lib/ai/enrich";
import { grokCost, round4 } from "@/lib/ai/cost";
import { logAiUsage } from "@/lib/ai/usage-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST — ask Grok whether a business is a multi-location chain and, if so, find
 * ALL of its locations in one hunt. Returns a reviewable result; writes nothing.
 * The console then creates each location as its own venue under a shared brand.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!GROK_ENABLED) {
    return NextResponse.json(
      { error: "AI enrichment is off — set XAI_API_KEY to switch it on." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const lead = (body.lead ?? {}) as VenueLead;
  if (!lead.name && !lead.instagram && !lead.website && !lead.address) {
    return NextResponse.json(
      { error: "Give Grok something to work with — a name, handle, or address." },
      { status: 400 }
    );
  }

  try {
    const chain = await discoverChain(lead);
    // Exact per-call AI ledger row — chain discovery makes real Grok search
    // calls and used to be invisible to the spend dashboard (Fable M-1).
    await logAiUsage(ctx.db, {
      provider: "xai",
      model: chain.model,
      task: "chain_discovery",
      entity_type: "chain",
      entity_id: null,
      input_tokens: chain.usage.in_tokens,
      output_tokens: chain.usage.out_tokens,
      search_count: chain.usage.searches,
      cost: round4(grokCost(chain.usage, chain.model)),
      usage_raw: chain.usage,
      user_id: ctx.userId,
    });
    // Provenance: mirror the venue route's audit trail (F-14). Best-effort.
    try {
      const c = chain as unknown as { citations?: unknown[] };
      await ctx.db.from("enrichment_runs").insert({
        restaurant_id: null,
        entity_type: "chain",
        lead: lead as unknown as Record<string, unknown>,
        result: chain as unknown as Record<string, unknown>,
        citations: Array.isArray(c.citations) && c.citations.length ? c.citations : null,
        model: process.env.XAI_MODEL ?? "grok-4.5",
        created_by: ctx.userId,
      });
    } catch {
      /* provenance logging is secondary */
    }
    return NextResponse.json({ chain });
  } catch (err) {
    const msg = err instanceof GrokError ? err.message : "Discovery failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
