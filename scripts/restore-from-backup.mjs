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
const PREFIX = process.env.BACKUP_S3_PREFIX || "bbq-atlas-backups";

if (!DATE || !TABLE) {
  console.error("Usage: --date YYYY-MM-DD --table <name|all> [--dry-run]");
  process.exit(1);
}
for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"]) {
  if (!process.env[k]) { console.error(`Missing env: ${k}`); process.exit(1); }
}

const aws = new AwsClient({
  accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY,
  region: process.env.BACKUP_S3_REGION,
  service: "s3",
});
const BASE = `${process.env.BACKUP_S3_ENDPOINT.replace(/\/+$/, "")}/${process.env.BACKUP_S3_BUCKET}`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

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
  const manifest = await loadManifest().catch(() => null);
  if (!manifest) console.warn("⚠ no manifest.json found for this date — proceeding without row-count verification");
  const tables = TABLE === "all"
    ? (manifest?.tables?.map((t) => t.table) ?? [])
    : [TABLE];
  if (!tables.length) { console.error("Nothing to restore (need a manifest for --table all)."); process.exit(1); }

  console.log(`${DRY ? "[DRY RUN] " : ""}Restoring ${tables.length} table(s) from ${PREFIX}/${DATE}:`);
  for (const t of tables) await restoreTable(t, manifest);
  console.log(DRY ? "\nDry run complete — nothing written." : "\n✅ Restore complete.");
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
