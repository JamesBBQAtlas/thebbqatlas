import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EnrichConsole } from "@/components/admin/EnrichConsole";
import { GROK_ENABLED } from "@/lib/ai/grok";

export const metadata = { title: "AI Enrichment" };
export const dynamic = "force-dynamic";

export default async function EnrichPage({
  searchParams,
}: {
  searchParams: { slug?: string };
}) {
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

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h1 className="mb-1 font-heading text-3xl font-bold text-text-primary">
        AI Enrichment
      </h1>
      <p className="mb-8 max-w-2xl text-text-muted">
        Hand Grok whatever you have — a name, an Instagram handle, a rough
        address — and let it hunt the web for the rest. Everything comes back as
        a draft for you to check and polish; nothing publishes on its own.
      </p>
      <EnrichConsole enabled={GROK_ENABLED} initialSlug={searchParams.slug} />
    </div>
  );
}
