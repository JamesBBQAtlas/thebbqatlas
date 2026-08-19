/* Admin audit log (Build Prompt 1) — logAdminAction helper + diffFromPatch.
 * Pure + NETWORK-FREE: a fake Supabase client captures inserts and stubs the auth
 * admin API. Proves the write shape, system-actor handling, email resolution, the
 * oversized-diff cap, best-effort failure, and "one action → exactly one row".
 * Run: node_modules/.bin/tsx scripts/test-audit-log.mts
 */
import { logAdminAction, diffFromPatch } from "../lib/admin/audit-log";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

interface Captured { table: string; row: Record<string, unknown> }
function makeDb(opts?: { insertError?: boolean; email?: string | null }) {
  const rows: Captured[] = [];
  const calls = { getUserById: 0 };
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (opts?.insertError) return Promise.resolve({ error: { message: "boom" } });
          rows.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => {
          calls.getUserById++;
          return { data: { user: { email: opts?.email === undefined ? `${id}@example.com` : opts.email } } };
        },
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, rows, calls };
}

console.log("\n[logAdminAction — write shape + entity + diff]");
{
  const { db, rows } = makeDb();
  await logAdminAction({
    db, actorId: "admin-1", actorEmail: "boss@bbq.com",
    action: "venue.publish", entityType: "restaurant", entityId: "v-9",
    summary: "venue published (pending → approved)",
    diff: { status: { old: "pending", new: "approved" } },
    context: { route: "admin/venues" },
  });
  ok("exactly one row inserted into admin_audit_log", rows.length === 1 && rows[0].table === "admin_audit_log");
  const r = rows[0].row;
  ok("actor_id + actor_email carried", r.actor_id === "admin-1" && r.actor_email === "boss@bbq.com");
  ok("action + entity_type + entity_id correct", r.action === "venue.publish" && r.entity_type === "restaurant" && r.entity_id === "v-9");
  ok("summary + diff + context stored", r.summary === "venue published (pending → approved)" && JSON.stringify(r.diff) === JSON.stringify({ status: { old: "pending", new: "approved" } }) && !!r.context);
}

console.log("\n[logAdminAction — actor email resolution + system actor]");
{
  const { db, rows, calls } = makeDb({ email: "resolved@bbq.com" });
  await logAdminAction({ db, actorId: "admin-2", action: "user.role_change", entityType: "profile", entityId: "p-1", summary: "x" });
  ok("email resolved via auth admin API when omitted", rows[0].row.actor_email === "resolved@bbq.com" && calls.getUserById === 1);

  const sys = makeDb();
  await logAdminAction({ db: sys.db, actorId: null, action: "chain.roster", entityType: "restaurant", entityId: "v-1", summary: "roster run" });
  ok("system action → actor_id null, NO email lookup", sys.rows[0].row.actor_id === null && sys.rows[0].row.actor_email === null && sys.calls.getUserById === 0);

  const given = makeDb();
  await logAdminAction({ db: given.db, actorId: "a", actorEmail: "given@bbq.com", action: "x", entityType: "profile", summary: "y" });
  ok("provided actorEmail skips the lookup", given.rows[0].row.actor_email === "given@bbq.com" && given.calls.getUserById === 0);
}

console.log("\n[logAdminAction — oversized diff cap + best-effort failure]");
{
  const big: Record<string, { old: unknown; new: unknown }> = {};
  for (let i = 0; i < 2000; i++) big[`f${i}`] = { old: "x".repeat(20), new: "y".repeat(20) };
  const { db, rows } = makeDb();
  await logAdminAction({ db, actorId: "a", actorEmail: "e", action: "venue.update", entityType: "restaurant", entityId: "v", summary: "big edit", diff: big });
  const stored = rows[0].row.diff as Record<string, unknown>;
  ok("an oversized diff is omitted with a marker, not stored raw", typeof stored._omitted === "string" && !("f0" in stored));

  // A DB insert failure must NOT throw (best-effort — never breaks the mutation).
  const failing = makeDb({ insertError: true });
  let threw = false;
  try { await logAdminAction({ db: failing.db, actorId: "a", actorEmail: "e", action: "x", entityType: "profile", summary: "y" }); }
  catch { threw = true; }
  ok("an insert error is swallowed (no throw, mutation unharmed)", threw === false && failing.rows.length === 0);
}

console.log("\n[diffFromPatch — only changed keys, {old,new} shape]");
{
  const d = diffFromPatch({ status: "pending", name: "A", city: "X" }, { status: "approved", name: "A", website: "https://x.com" });
  ok("includes a changed key (status)", JSON.stringify(d.status) === JSON.stringify({ old: "pending", new: "approved" }));
  ok("includes a newly-set key (website: null → value)", JSON.stringify(d.website) === JSON.stringify({ old: null, new: "https://x.com" }));
  ok("excludes an unchanged key (name)", !("name" in d));
  ok("a no-op patch yields an empty diff", Object.keys(diffFromPatch({ a: 1 }, { a: 1 })).length === 0);
}

console.log("\n[acceptance — publishing a venue emits EXACTLY ONE audit row]");
{
  // Mirrors the venues PATCH wiring: one logAdminAction per status transition.
  const { db, rows } = makeDb();
  const prevStatus = "pending", status = "approved";
  await logAdminAction({
    db, actorId: "admin-1",
    action: status === "approved" ? "venue.publish" : "venue.unpublish",
    entityType: "restaurant", entityId: "venue-42",
    summary: `venue published (${prevStatus} → ${status})`,
    diff: { status: { old: prevStatus, new: status } },
  });
  ok("exactly one row, action venue.publish, entity venue-42", rows.length === 1 && rows[0].row.action === "venue.publish" && rows[0].row.entity_id === "venue-42");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
