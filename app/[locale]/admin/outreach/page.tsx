import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { OutreachList, type OutreachRow } from "@/components/admin/OutreachList";

export const metadata = { title: "Outreach Hub" };
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const asStr = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

export default async function OutreachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Access Denied</h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  // Everyone we owe a conversation: thin venues needing facts, parked
  // non-venues we keep warm, and anything mid-outreach.
  const { data: rawRows } = await db
    .from("restaurants")
    .select(
      "id, name, slug, city, status, needs_attention, attention_reason, dossier, " +
        "instagram_handle, instagram_url, facebook_url, x_url, website, phone, " +
        "contact_email, outreach_status, outreach_next_followup_at"
    )
    .or("needs_attention.eq.true,status.eq.parked,outreach_status.not.in.(none,resolved)")
    .order("outreach_next_followup_at", { ascending: true, nullsFirst: false })
    .limit(500);

  const rows = (rawRows ?? []) as unknown as Row[];
  const ids = rows.map((r) => r.id as string);

  // Last-contact summary per venue, from the outreach log.
  const lastContact = new Map<string, { at: string; channel: string; note: string | null }>();
  if (ids.length) {
    const { data: logs } = await db
      .from("outreach_log")
      .select("restaurant_id, channel, contacted_at, note")
      .in("restaurant_id", ids)
      .order("contacted_at", { ascending: false });
    for (const l of (logs ?? []) as unknown as Row[]) {
      const rid = l.restaurant_id as string;
      if (!lastContact.has(rid)) {
        lastContact.set(rid, {
          at: l.contacted_at as string,
          channel: l.channel as string,
          note: asStr(l.note),
        });
      }
    }
  }

  const outreach: OutreachRow[] = rows.map((r) => {
    const dossier = (r.dossier ?? {}) as Record<string, unknown>;
    const unknowns = Array.isArray(dossier.unknowns)
      ? (dossier.unknowns as unknown[]).map(String).filter(Boolean)
      : [];
    const igHandle = asStr(r.instagram_handle);
    const igUrl =
      asStr(r.instagram_url) ?? (igHandle ? `https://instagram.com/${igHandle.replace(/^@/, "")}` : null);
    const last = lastContact.get(r.id as string) ?? null;
    return {
      id: r.id as string,
      name: (r.name as string) ?? "Untitled",
      slug: asStr(r.slug),
      city: asStr(r.city),
      status: (r.status as string) ?? "pending",
      needsAttention: Boolean(r.needs_attention),
      attentionReason: asStr(r.attention_reason),
      unknowns,
      channels: {
        instagram: igUrl,
        email: asStr(r.contact_email),
        facebook: asStr(r.facebook_url),
        phone: asStr(r.phone),
        website: asStr(r.website),
        x: asStr(r.x_url),
      },
      outreachStatus: (r.outreach_status as string) ?? "none",
      nextFollowupAt: asStr(r.outreach_next_followup_at),
      lastContact: last,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-text-primary">Outreach Hub</h1>
        <p className="mt-1 text-text-muted">
          Every relationship where we need something back — thin-dossier venues waiting on facts, and
          parked non-venues worth keeping warm. All irons in the fire: hit every channel, log each
          touch, never let one go cold.
        </p>
      </div>
      {outreach.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          Nothing needs chasing right now. Venues flagged <em>needs attention</em>, anything parked,
          and anything mid-outreach will appear here.
        </p>
      ) : (
        <OutreachList rows={outreach} />
      )}
    </div>
  );
}
