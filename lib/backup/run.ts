import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit-log";
import { rowsToNdjson, gzip, sha256hex } from "./ndjson";
import {
  DEFAULT_PREFIX,
  DEFAULT_RETAIN,
  EXCLUDED_TABLES,
  snapshotFolder,
  tableKey,
  manifestKey,
  foldersFromKeys,
  foldersToPrune,
} from "./plan";
import { createS3Destination } from "./s3-destination";
import type { BackupDestination } from "./destination";

/** Resolve the configured backup destination (BACKUP_DEST, default "s3"). */
export function getBackupDestination(): BackupDestination {
  const kind = (process.env.BACKUP_DEST || "s3").toLowerCase();
  switch (kind) {
    case "s3":
    case "b2":
      return createS3Destination();
    default:
      throw new Error(`Unknown BACKUP_DEST "${kind}" — supported: s3 (Backblaze B2 / AWS S3).`);
  }
}

export interface TableResult {
  table: string;
  rows: number; // authoritative count(*) at run time
  exportedRows: number; // rows actually written
  bytes: number; // gzipped size
  sha256: string;
  ok: boolean;
  error?: string;
}

export interface BackupSummary {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  destination: string;
  folder: string;
  prefix: string;
  retain: number;
  tableCount: number;
  totalRows: number;
  totalBytes: number;
  tables: TableResult[];
  failures: string[];
  pruned: string[];
}

const PAGE = 1000;

/** Discover which tables to back up via the RPC (migration 081). Throws — rather than
 *  silently backing up fewer tables — if discovery fails, so a hiccup surfaces loudly
 *  instead of shrinking the backup. EXCLUDED_TABLES is applied again as belt-and-braces. */
async function discoverTables(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.rpc("backup_table_list");
  if (error || !Array.isArray(data) || !data.length) {
    throw new Error(`backup_table_list() unavailable: ${error?.message ?? "empty"}`);
  }
  return (data as string[]).filter((t) => !EXCLUDED_TABLES.has(t));
}

/** Authoritative server-side count(*) for a table. */
async function countRows(db: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Page every row of a table. Orders by a stable column so paging is consistent;
 *  falls back through candidates if a table lacks `id`/`created_at`. */
async function fetchAllRows(db: SupabaseClient, table: string): Promise<unknown[]> {
  for (const orderCol of ["id", "created_at", null] as const) {
    const rows: unknown[] = [];
    let from = 0;
    let failed = false;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = db.from(table).select("*").range(from, from + PAGE - 1);
      if (orderCol) q = q.order(orderCol, { ascending: true });
      const { data, error } = await q;
      if (error) {
        failed = true;
        break;
      }
      rows.push(...((data ?? []) as unknown[]));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    if (!failed) return rows;
  }
  throw new Error(`could not page table ${table}`);
}

async function backupOneTable(
  db: SupabaseClient,
  dest: BackupDestination,
  prefix: string,
  folder: string,
  table: string
): Promise<TableResult> {
  try {
    const rowCount = await countRows(db, table);
    const rows = await fetchAllRows(db, table);
    const ndjson = rowsToNdjson(rows);
    const gz = gzip(ndjson);
    const sha = sha256hex(gz);
    await dest.put(tableKey(prefix, folder, table), gz, "application/gzip");
    // Integrity: exported rows must match the authoritative count taken at run time.
    const ok = rows.length === rowCount;
    return {
      table,
      rows: rowCount,
      exportedRows: rows.length,
      bytes: gz.length,
      sha256: sha,
      ok,
      error: ok ? undefined : `row-count mismatch: counted ${rowCount}, exported ${rows.length}`,
    };
  } catch (e) {
    return {
      table,
      rows: -1,
      exportedRows: 0,
      bytes: 0,
      sha256: "",
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Run the full weekly export. `now` is injected so runs are deterministic in tests. */
export async function runBackup(now: Date = new Date()): Promise<BackupSummary> {
  const startedAt = now.toISOString();
  const t0 = Date.now();
  const prefix = process.env.BACKUP_S3_PREFIX || DEFAULT_PREFIX;
  const retain = Number(process.env.BACKUP_RETAIN) || DEFAULT_RETAIN;
  const folder = snapshotFolder(startedAt);

  const db = createAdminClient();
  const dest = getBackupDestination();

  const tables = await discoverTables(db);
  const results: TableResult[] = [];
  // Sequential: keeps peak memory low and stays well within the function's limits.
  for (const table of tables) {
    results.push(await backupOneTable(db, dest, prefix, folder, table));
  }

  const totalRows = results.reduce((s, r) => s + Math.max(0, r.exportedRows), 0);
  const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
  const failures = results.filter((r) => !r.ok).map((r) => `${r.table}: ${r.error}`);

  // Prune old snapshots to keep only `retain` most-recent.
  let pruned: string[] = [];
  try {
    const existing = await dest.list(`${prefix}/`);
    const folders = foldersFromKeys(prefix, existing.map((o) => o.key));
    const toPrune = foldersToPrune([...folders, folder], retain);
    for (const f of toPrune) {
      const keys = existing.filter((o) => o.key.startsWith(`${prefix}/${f}/`)).map((o) => o.key);
      if (keys.length) await dest.del(keys);
    }
    pruned = toPrune;
  } catch (e) {
    failures.push(`prune: ${e instanceof Error ? e.message : String(e)}`);
  }

  const finishedAt = new Date().toISOString();
  const summary: BackupSummary = {
    ok: failures.length === 0,
    startedAt,
    finishedAt,
    durationMs: Date.now() - t0,
    destination: dest.label,
    folder,
    prefix,
    retain,
    tableCount: tables.length,
    totalRows,
    totalBytes,
    tables: results,
    failures,
    pruned,
  };

  // Write the manifest alongside the table files (row counts + checksums let us spot
  // a truncated/failed export). Best-effort — a manifest failure shouldn't lose the data.
  try {
    await dest.put(
      manifestKey(prefix, folder),
      Buffer.from(JSON.stringify(summary, null, 2), "utf8"),
      "application/json"
    );
  } catch (e) {
    summary.failures.push(`manifest: ${e instanceof Error ? e.message : String(e)}`);
    summary.ok = false;
  }

  // Durable record of the run in the audit trail (best-effort).
  try {
    await logAdminAction({
      db,
      actorId: null,
      actorEmail: "system:backup",
      action: "ops.db_backup",
      entityType: "system",
      entityId: null,
      summary: `Weekly DB backup ${summary.ok ? "OK" : "FAILED"} — ${summary.tableCount} tables, ${summary.totalRows} rows, ${(summary.totalBytes / 1e6).toFixed(1)}MB → ${summary.destination}/${summary.folder}`,
      context: {
        folder: summary.folder,
        ok: summary.ok,
        totalRows: summary.totalRows,
        totalBytes: summary.totalBytes,
        failures: summary.failures,
        pruned: summary.pruned,
      },
    });
  } catch {
    /* swallow */
  }

  return summary;
}
