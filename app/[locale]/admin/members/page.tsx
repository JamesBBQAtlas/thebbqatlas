import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MembersConsole, type MemberRow, type MemberTiles } from "@/components/admin/MembersConsole";

export const metadata = { title: "Members" };
export const dynamic = "force-dynamic";

/** Tally a table's rows by a user-id column into a Map. */
function tally(rows: Array<Record<string, unknown>> | null, key: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows ?? []) {
    const id = r[key] as string | null;
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export default async function MembersPage() {
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
        <p className="mt-2 text-text-muted">
          Admin access required. Set your profile role to admin in Supabase.
        </p>
      </div>
    );
  }

  // Service-role client bypasses RLS for reliable admin reads.
  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const [
    profilesRes,
    savedRes,
    checkInsRes,
    bookmarksRes,
    reviewsRes,
    followsRes,
  ] = await Promise.all([
    db
      .from("profiles")
      .select(
        "id, display_name, username, role, account_type, created_at, marketing_opt_in, marketing_opt_in_at"
      )
      .order("created_at", { ascending: false }),
    db.from("saved_spots").select("user_id"),
    db.from("check_ins").select("user_id"),
    db.from("bookmarks").select("user_id"),
    db.from("reviews").select("user_id"),
    db.from("follows").select("follower_id"),
  ]);

  const savesBy = tally(savedRes.data, "user_id");
  const checkinsBy = tally(checkInsRes.data, "user_id");
  const bookmarksBy = tally(bookmarksRes.data, "user_id");
  const reviewsBy = tally(reviewsRes.data, "user_id");
  const followsBy = tally(followsRes.data, "follower_id");

  // Email + last_sign_in_at + provider live in auth.users — service role only.
  const authById = new Map<
    string,
    { email: string | null; lastActive: string | null; provider: string | null }
  >();
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    const perPage = 1000;
    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      const users: User[] = data?.users ?? [];
      for (const u of users) {
        authById.set(u.id, {
          email: u.email ?? null,
          lastActive: u.last_sign_in_at ?? null,
          provider: (u.app_metadata?.provider as string | undefined) ?? null,
        });
      }
      if (users.length < perPage) break;
    }
  }

  const profiles = profilesRes.data ?? [];
  const rows: MemberRow[] = profiles.map((p) => {
    const auth = authById.get(p.id);
    return {
      id: p.id,
      name: p.username || p.display_name || "—",
      email: auth?.email ?? null,
      role: p.role ?? "user",
      account_type: p.account_type ?? null,
      joined: p.created_at ?? null,
      lastActive: auth?.lastActive ?? null,
      marketingOptIn: Boolean(p.marketing_opt_in),
      marketingOptInAt: p.marketing_opt_in_at ?? null,
      provider: auth?.provider ?? null,
      counts: {
        saves: savesBy.get(p.id) ?? 0,
        checkins: checkinsBy.get(p.id) ?? 0,
        bookmarks: bookmarksBy.get(p.id) ?? 0,
        reviews: reviewsBy.get(p.id) ?? 0,
        follows: followsBy.get(p.id) ?? 0,
      },
    };
  });

  const weekAgo = Date.now() - 7 * 86_400_000;
  const total = rows.length;
  const withSaves = rows.filter((r) => r.counts.saves >= 1).length;
  const newThisWeek = rows.filter(
    (r) => r.joined && new Date(r.joined).getTime() >= weekAgo
  ).length;
  const optedIn = rows.filter((r) => r.marketingOptIn).length;
  const optInPct = total > 0 ? Math.round((optedIn / total) * 100) : 0;

  const tiles: MemberTiles = { total, withSaves, newThisWeek, optInPct };

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <h1 className="font-heading text-3xl font-bold text-text-primary">Members</h1>
      <p className="mt-1 text-text-muted">
        Everyone who&apos;s signed up — search, sort, inspect their activity, and export.
      </p>
      <MembersConsole members={rows} tiles={tiles} />
    </div>
  );
}
