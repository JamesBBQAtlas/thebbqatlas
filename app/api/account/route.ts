import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Update the signed-in user's own profile (display name / account type). */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (typeof body.displayName === "string") {
    updates.display_name = body.displayName.trim().slice(0, 80) || null;
  }
  if (["consumer", "owner", "seller"].includes(body.accountType)) {
    updates.account_type = body.accountType;
  }
  if (typeof body.avatarUrl === "string") {
    updates.avatar_url = body.avatarUrl.trim().slice(0, 500) || null;
  }
  if (typeof body.username === "string") {
    const username = body.username.trim().toLowerCase();
    if (username && !/^[a-z0-9_]{3,20}$/.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3–20 letters, numbers or underscores." },
        { status: 400 }
      );
    }
    updates.username = username || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // The profile row always exists (created at signup), so a plain UPDATE is all
  // we need — and it avoids requiring INSERT on profiles, which F-01 correctly
  // revoked. Runs as the user's own session so RLS + column grants apply.
  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const { error } = await db
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) {
    // 23505 = unique_violation (username already taken)
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
