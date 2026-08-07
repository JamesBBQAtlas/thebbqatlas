import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NewsAdmin, type AdminNewsPost } from "@/components/admin/NewsAdmin";

export const metadata = { title: "News & Missives — admin" };
export const dynamic = "force-dynamic";

export default async function NewsAdminPage() {
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

  // Service role so DRAFTS (is_published=false) are visible here — the public
  // queries only ever return published posts.
  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const { data } = await db
    .from("news")
    .select("id, slug, title, excerpt, content_md, hero_image_url, category, author, is_published, published_at, featured_video_id, created_at")
    .order("is_published", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as AdminNewsPost[];

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold text-text-primary">News &amp; Missives</h1>
        <p className="mt-1 text-text-muted">
          Write, edit and publish posts. Drafts (unpublished) are visible here only — the public
          News page shows published posts. Add a YouTube video id to embed a video via the
          click-to-play facade.
        </p>
      </div>
      <NewsAdmin rows={rows} />
    </div>
  );
}
