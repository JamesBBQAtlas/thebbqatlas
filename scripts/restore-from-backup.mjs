#!/usr/bin/env node
/**
 * Restore one (or all) tables from a weekly backup snapshot (BUILD PROMPT — DR).
 * Downloads the gzipped NDJSON from the independent S3-compatible store, gunzips it,
 * verifies the row count against the snapshot manifest, and upserts rows by `id` via
 * the service role. See docs/DR-restore.md.
 *
 *   node scripts/restore-from-backup.mjs --date 2026-08-20 --table reviews [--dry-run]
 *   node scripts/restore-from-backup.mjs --date 2026-08-20 --table all    [--dry-run]
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *      BACKUP_S3_ENDPOINT, BACKUP_S3_REGION, BACKUP_S3_BUCKET,
 *      BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY, [BACKUP_S3_PREFIX]
 */
import { gunzipSync } from "node:zlib";
import { AwsClient } from "aws4fetch";
import { createClient } from "@supabase/supabase-js";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return def;
}
const DATE = arg("date");
const TABLE = arg("table");
const DRY = process.argv.includes("--dry-run");
const STORAGE = process.argv.includes("--storage"); // verify mirrored FILES from B2
const YES = process.argv.includes("--yes");         // required to actually WRITE
const PREFIX = process.env.BACKUP_S3_PREFIX || "bbq-atlas-backups";
const PROD_REF = "jsbhgsfnxrgcxlxsbokp";             // production project — never write here

// A real DB write is the ONLY thing that needs Supabase creds. Dry-run + storage-verify
// are keyed B2 reads only, so they need just the BACKUP_S3_* keys.
const needsSupabase = !DRY && !STORAGE;
const required = ["BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"];
if (needsSupabase) required.push("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY");
for (const k of required) { if (!process.env[k]) { console.error(`Missing env: ${k}`); process.exit(1); } }

if (!STORAGE && (!DATE || !TABLE)) {
  console.error("Usage: --date YYYY-MM-DD --table <name|all> [--dry-run] [--yes]\n" +
    "   or: --storage [--date YYYY-MM-DD]   (verify mirrored files pulled from B2)");
  process.exit(1);
}

const aws = new AwsClient({
  accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  region: process.env.BACKUP_S3_REGION,
  service: "s3",
});
const BASE = `${process.env.BACKUP_S3_ENDPOINT.replace(/\/+$/, "")}/${process.env.BACKUP_S3_BUCKET}`;

// SAFETY: a real restore WRITES (upsert). It must never touch production, and it needs
// an explicit --yes. Created lazily so dry-run / storage-verify never open a DB client.
let db = null;
if (needsSupabase) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url.includes(PROD_REF)) {
    console.error(`✗ REFUSING: NEXT_PUBLIC_SUPABASE_URL points at PRODUCTION (${PROD_REF}). A real restore must target a SCRATCH project only. Aborting.`);
    process.exit(1);
  }
  if (!YES) {
    console.error(`✗ This will WRITE (upsert) restored rows into:\n    ${url}\n  If that is your scratch target, re-run with --yes to confirm.`);
    process.exit(1);
  }
  db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Storage-verify: prove the mirrored FILES pull from B2 intact (keyed download + size
 *  vs the storage manifest). Read-only — B2 creds only. */
async function verifyStorage() {
  const man = JSON.parse((await getObject(`${PREFIX}/storage/manifest.json`)).toString("utf8"));
  const objs = man.objects ?? [];
  console.log(`Storage manifest: ${man.totalObjects} file(s) mirrored.`);
  if (!objs.length) { console.log("  (no files to verify)"); return; }
  const sample = objs[0];
  const buf = await getObject(`${PREFIX}/storage/${sample.bucket}/${sample.name}`);
  const match = buf.length === sample.size;
  console.log(`  sample: ${sample.bucket}/${sample.name} — downloaded ${buf.length} bytes (manifest: ${sample.size}) ${match ? "✓" : "✗ SIZE MISMATCH"}`);
  if (!match) throw new Error("storage sample size mismatch vs manifest");
  console.log("  ✓ keyed file download from B2 verified.");
}

async function getObject(key) {
  const res = await aws.fetch(`${BASE}/${key.split("/").map(encodeURIComponent).join("/")}`);
  if (!res.ok) throw new Error(`GET ${key} failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function loadManifest() {
  const buf = await getObject(`${PREFIX}/${DATE}/manifest.json`);
  return JSON.parse(buf.toString("utf8"));
}

async function restoreTable(table, manifest) {
  const buf = await getObject(`${PREFIX}/${DATE}/${table}.ndjson.gz`);
  const text = gunzipSync(buf).toString("utf8");
  const rows = text ? text.trimEnd().split("\n").map((l) => JSON.parse(l)) : [];
  const expected = manifest?.tables?.find((t) => t.table === table)?.exportedRows;
  const countMatch = expected == null || expected === rows.length;
  console.log(`  ${table}: ${rows.length} rows${expected != null ? ` (manifest: ${expected}${countMatch ? " ✓" : " ✗ MISMATCH"})` : ""}`);
  if (!countMatch) throw new Error(`${table}: row count mismatch vs manifest — aborting`);
  if (DRY) return { table, rows: rows.length, wrote: 0, dryRun: true };
  if (!rows.length) return { table, rows: 0, wrote: 0 };

  let wrote = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from(table).upsert(chunk, { onConflict: "id" });
    if (error) throw new Error(`${table}: upsert failed at row ${i}: ${error.message}`);
    wrote += chunk.length;
  }
  return { table, rows: rows.length, wrote };
}

(async () => {
  if (STORAGE) { await verifyStorage(); return; }

  const manifest = await loadManifest().catch(() => null);
  if (!manifest) console.warn("⚠ no manifest.json found for this date — proceeding without row-count verification");
  const tables = TABLE === "all"
    ? (manifest?.tables?.map((t) => t.table) ?? [])
    : [TABLE];
  if (!tables.length) { console.error("Nothing to restore (need a manifest for --table all)."); process.exit(1); }

  console.log(`${DRY ? "[DRY RUN] " : "[WRITING to scratch] "}${tables.length} table(s) from ${PREFIX}/${DATE}:`);
  for (const t of tables) await restoreTable(t, manifest);
  console.log(DRY ? "\nDry run complete — real keyed download + gunzip + count-check, nothing written." : "\n✅ Restore complete.");
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
