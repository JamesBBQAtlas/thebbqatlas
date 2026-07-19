import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ModerationQueue } from "@/components/admin/ModerationQueue";
import type { Submission } from "@/lib/types/database";

export const metadata = { title: "Moderation" };

export default async function ModerationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="text-white/60 mt-2">Admin access required. Set your profile role to admin in Supabase.</p>
      </div>
    );
  }

  const { data: submissions } = await supabase
    .from("submissions")
    .select("*")
    .eq("moderation_status", "pending")
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Moderation Queue</h1>
      <p className="text-white/60 mb-8">Review and approve user-submitted BBQ spots.</p>
      <ModerationQueue submissions={(submissions ?? []) as Submission[]} />
    </div>
  );
}