import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ParkedList, type ParkedVenue } from "@/components/admin/ParkedList";
import { STYLE_LABELS } from "@/lib/constants/styles";
import type { BbqStyle } from "@/lib/constants/styles";

export const metadata = { title: "Parked" };
export const dynamic = "force-dynamic";

export default async function ParkedPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Access Denied</h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;
  const { data } = await db
    .from("restaurants")
    .select("id, name, city, country, style, enriched_at, description, hook")
    .eq("status", "parked")
    .order("created_at", { ascending: true });

  const venues: ParkedVenue[] = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "Unnamed",
    city: (r.city as string) ?? null,
    country: (r.country as string) ?? null,
    styleLabel: STYLE_LABELS[(r.style as BbqStyle)] ?? "Other",
    enrichedAt: (r.enriched_at as string) ?? null,
    excerpt: ((r.hook as string) || (r.description as string) || null),
  }));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <h1 className="font-heading text-3xl font-bold text-text-primary">Parked</h1>
      <p className="mt-1 max-w-2xl text-text-muted">
        A holding pen for pending accounts that aren&apos;t venues yet — experiences, enthusiasts, a
        contact worth keeping warm. Out of the Pending queue and off the public site, but nothing is
        deleted. Return one to Pending (or approve it) whenever you&apos;re ready.
      </p>
      <div className="mt-8">
        <ParkedList venues={venues} />
      </div>
    </div>
  );
}
