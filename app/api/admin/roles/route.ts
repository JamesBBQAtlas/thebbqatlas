import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * Admin-only role management — the ONLY sanctioned path that can write
 * profiles.role (RLS forbids it for everyone else after F-01). Promotes an
 * existing user to admin by email, or revokes admin back to `user`. Never
 * allows removing the last admin, and logs every change to role_change_log.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Role writes MUST go through the service role (RLS blocks the cookie client).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Role management requires the service role key (not configured)." },
      { status: 503 }
    );
  }
  const { db, userId: actorId } = ctx;

  const body = await request.json().catch(() => ({}));
  const action: unknown = body.action;
  const email: string | undefined =
    typeof body.email === "string" ? body.email.trim() : undefined;
  const targetIdInput: string | undefined =
    typeof body.userId === "string" ? body.userId : undefined;

  if (action !== "promote" && action !== "revoke") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Resolve the target user (by email for promote, by id or email for revoke).
  let targetId: string | undefined;
  let targetEmail: string | null = null;
  let targetRole: "user" | "admin" | null = null;

  if (email) {
    const { data, error } = await db.rpc("admin_lookup_user", { p_email: email });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return NextResponse.json(
        { error: "No account with that email. Ask them to sign up first, then promote." },
        { status: 404 }
      );
    }
    targetId = row.id;
    targetEmail = row.email ?? null;
    targetRole = row.role ?? "user";
  } else if (targetIdInput) {
    targetId = targetIdInput;
    const { data } = await db
      .from("profiles")
      .select("role")
      .eq("id", targetId)
      .single();
    targetRole = (data?.role as "user" | "admin") ?? null;
    try {
      const { data: u } = await db.auth.admin.getUserById(targetId);
      targetEmail = u?.user?.email ?? null;
    } catch {
      /* email best-effort */
    }
  } else {
    return NextResponse.json(
      { error: "Provide an email (promote) or userId (revoke)." },
      { status: 400 }
    );
  }

  if (!targetId || targetRole === null) {
    return NextResponse.json({ error: "Target user not found." }, { status: 404 });
  }

  const newRole: "user" | "admin" = action === "promote" ? "admin" : "user";

  // No-op guard.
  if (targetRole === newRole) {
    return NextResponse.json({
      ok: true,
      message:
        action === "promote"
          ? "That user is already an admin."
          : "That user is already a standard user.",
    });
  }

  // Guardrail: never remove the last admin (prevents lockout).
  if (action === "revoke") {
    const { data: count } = await db.rpc("admin_count");
    if ((typeof count === "number" ? count : 1) <= 1) {
      return NextResponse.json(
        { error: "You can't remove the last admin — promote someone else first." },
        { status: 409 }
      );
    }
  }

  // Apply the change (service role — the only path RLS permits for `role`).
  const { error: updErr } = await db
    .from("profiles")
    .update({ role: newRole })
    .eq("id", targetId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Audit trail (best-effort — never fail the operation on a log error).
  let actorEmail: string | null = null;
  try {
    const { data: a } = await db.auth.admin.getUserById(actorId);
    actorEmail = a?.user?.email ?? null;
  } catch {
    /* best-effort */
  }
  await db.from("role_change_log").insert({
    actor_id: actorId,
    actor_email: actorEmail,
    target_id: targetId,
    target_email: targetEmail,
    old_role: targetRole,
    new_role: newRole,
  });

  return NextResponse.json({
    ok: true,
    message:
      action === "promote"
        ? `${targetEmail ?? "User"} is now an admin.`
        : `${targetEmail ?? "User"} is now a standard user.`,
  });
}
