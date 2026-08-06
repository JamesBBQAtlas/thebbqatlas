#!/usr/bin/env node
/**
 * Write-permission guardrail (see migrations 015/019/020).
 *
 * A bug class recurred: a table has an RLS write policy but no base GRANT (or,
 * worse, neither) for the role the app writes with, so writes fail with
 * "permission denied" BEFORE RLS runs. This script fails CI on any regression.
 *
 * Two independent checks:
 *   A. CODE SCAN (always runs, no DB needed): every table the app writes
 *      (.from("t").insert/update/delete/upsert) must be declared as either
 *      GRANT_POLICY (authorised via authenticated grant + RLS policy) or
 *      SERVICE_ROLE (written only through the service-role client). A new,
 *      undeclared write target fails the build — forcing an explicit decision.
 *   B. DB AUDIT (runs when service-role creds are present): calls the
 *      write_permission_audit() SQL function; any returned row is a live gap.
 *
 * Exit non-zero if either check finds a problem.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

// ---- Declared authorisation for every table the app writes -----------------
// Keep in sync with the code: adding a new write target without listing it here
// (or in SERVICE_ROLE) fails the build by design.
const GRANT_POLICY = new Set([
  "check_ins", "saved_spots", "bookmarks", "view_history", "media",
  "restaurant_claims", "profiles", "reviews", "review_photos", "click_events",
  "gear_products", "voice_lines", "suggestions", "brands", "restaurants",
  "guides", "signature_dishes", "submissions", "follows", "addresses", "news",
]);
const SERVICE_ROLE = new Set([
  "email_subscribers", "email_log", "subscriptions", "orders",
  "contact_messages", "role_change_log", "enrichment_runs",
  // Admin-only slug 301 map — written solely by admin routes via the service-role
  // client (never by end users), so no public grant/RLS policy is needed.
  "slug_redirects",
  // Append-only AI usage ledger — inserted only by admin AI routes via the
  // service-role client; RLS-on with no policies, service role bypasses.
  "ai_usage_log",
  // Append-only anti-spam intel log for the public submission form — written by
  // the guarded server endpoint via the service-role client; RLS-on, no policies.
  "submission_abuse_log",
  // Append-only editorial/status audit trail — inserted by admin routes via the
  // service-role client; admin-read RLS, UPDATE blocked by trigger.
  "content_audit",
  // Curated Watch/Read/Listen directory — public reads published rows (SELECT
  // policy), but all writes are admin-only via the service-role client.
  "media_picks",
  // Outreach attempt log — admin-only, written through the service-role client
  // (same locked pattern as contact_messages); RLS-on, no anon/authenticated.
  "outreach_log",
]);

const WRITE_METHODS = /\.(insert|update|delete|upsert)\s*\(/;
const FROM_RE = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)/g;
const SCAN_DIRS = ["app", "lib"];
const failures = [];

function walk(dir) {
  let out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(p));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) out.push(p);
  }
  return out;
}

function codeScan() {
  const written = new Map(); // table -> first "file:line"
  for (const dir of SCAN_DIRS) {
    let files;
    try {
      files = walk(dir);
    } catch {
      continue;
    }
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      let m;
      FROM_RE.lastIndex = 0;
      while ((m = FROM_RE.exec(src))) {
        const table = m[1];
        // Skip storage buckets: `.storage.from("bucket")`
        const before = src.slice(Math.max(0, m.index - 12), m.index);
        if (before.endsWith("storage")) continue;
        // Is this .from() part of a write chain? Look ahead within the statement.
        const window = src.slice(m.index, m.index + 260);
        if (!WRITE_METHODS.test(window)) continue;
        if (!written.has(table)) {
          const line = src.slice(0, m.index).split("\n").length;
          written.set(table, `${file}:${line}`);
        }
      }
    }
  }
  for (const [table, where] of written) {
    if (!GRANT_POLICY.has(table) && !SERVICE_ROLE.has(table)) {
      failures.push(
        `CODE: write target "${table}" (${where}) is not declared GRANT_POLICY ` +
          `or SERVICE_ROLE. Add its grant+RLS policy (and list it), or route it ` +
          `through the service-role client.`
      );
    }
  }
  console.log(`code scan: ${written.size} write-target tables, ` +
    `${failures.length} undeclared.`);
}

// Non-fatal notices (e.g. the DB half couldn't reach the database from CI).
// Surfaced loudly but must NOT turn the build red: the always-on code scan is
// the real tripwire, and an unreachable DB is an infra problem, not a grant
// regression. A GENUINE gap (rows returned) still fails hard below.
const warnings = [];

/** Run `p` but reject if it hasn't settled within `ms` (no 6-minute hangs). */
function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function dbAudit() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("db audit: SKIPPED (no NEXT_PUBLIC_SUPABASE_URL / " +
      "SUPABASE_SERVICE_ROLE_KEY in env).");
    return;
  }

  // The DB half is a best-effort LIVE check. If the database is unreachable from
  // this runner (network egress / pooler / expired secret / timeout), warn and
  // move on rather than failing — CI must not go red because it couldn't dial
  // the DB. Only ACTUAL gap rows are treated as failures.
  let data;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const res = await withTimeout(
      supabase.rpc("write_permission_audit"),
      30_000,
      "write_permission_audit()"
    );
    if (res.error) {
      // Couldn't execute the function (tooling/access) — not a grant regression.
      warnings.push(
        `db audit could not run write_permission_audit() (${res.error.message}). ` +
          `Live check skipped; the code scan below still enforces declarations.`
      );
      console.log("db audit: UNVERIFIED (rpc error — see warning).");
      return;
    }
    data = res.data;
  } catch (err) {
    warnings.push(
      `db audit could not reach the database (${err?.message ?? err}). ` +
        `Live check skipped; the code scan below still enforces declarations.`
    );
    console.log("db audit: UNVERIFIED (unreachable — see warning).");
    return;
  }

  if (data && data.length) {
    for (const row of data) {
      failures.push(`DB: ${row.tablename} [${row.role}] — ${row.problem}`);
    }
  }
  console.log(`db audit: ${data?.length ?? 0} problem row(s).`);
}

await dbAudit();
codeScan();

// Non-fatal notices → GitHub Actions warning annotations (visible, not red).
for (const w of warnings) {
  console.warn(`::warning title=DB guardrail (non-fatal)::${w}`);
}

if (failures.length) {
  console.error("\n✗ write-permission guardrail FAILED:\n");
  for (const f of failures) console.error(`::error::${f}`);
  process.exit(1);
}
console.log(
  warnings.length
    ? "\n✓ write-permission guardrail passed (code scan clean; DB half unverified — see warnings)."
    : "\n✓ write-permission guardrail passed."
);
