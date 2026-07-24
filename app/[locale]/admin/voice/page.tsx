import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VoiceConsole } from "@/components/admin/VoiceConsole";
import type { VoiceLine } from "@/lib/types/database";

export const metadata = { title: "Voice" };
export const dynamic = "force-dynamic";

export default async function AdminVoicePage() {
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
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Access Denied
        </h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const { data } = await db
    .from("voice_lines")
    .select("*")
    .order("slot", { ascending: true })
    .order("sort_order", { ascending: true });
  const lines = (data ?? []) as VoiceLine[];

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h1 className="font-heading text-3xl font-bold text-text-primary">
        Voice Bank
      </h1>
      <p className="mt-1 max-w-2xl text-text-muted">
        House-voice microcopy shown in the rotating/low-stakes slots. Edits go
        live without a redeploy. Never used in the homepage headline or meta
        description.
      </p>
      <div className="mt-8">
        <VoiceConsole initialLines={lines} />
      </div>
    </div>
  );
}
