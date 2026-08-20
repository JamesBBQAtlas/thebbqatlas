/**
 * Pure planning helpers for the weekly backup (BUILD PROMPT — independent export).
 * No I/O — unit-testable path/retention logic.
 */

export const DEFAULT_PREFIX = "bbq-atlas-backups";
export const DEFAULT_RETAIN = 8;

/**
 * Tables intentionally NOT backed up (ephemeral / regenerable telemetry). This
 * MIRRORS the DB function backup_table_list() (migration 081) — used as a fallback
 * filter if the RPC is unavailable, and as living documentation of what's excluded.
 */
export const EXCLUDED_TABLES = new Set<string>([
  "rate_limits",
  "click_events",
  "search_impressions",
  "venue_views",
  "view_history",
]);

/** A snapshot's date-folder name, e.g. "2026-08-20", from an ISO timestamp. */
export function snapshotFolder(iso: string): string {
  return iso.slice(0, 10);
}

/** Object key for one table's file within a snapshot. */
export function tableKey(prefix: string, folder: string, table: string): string {
  return `${prefix}/${folder}/${table}.ndjson.gz`;
}

/** Object key for a snapshot's manifest. */
export function manifestKey(prefix: string, folder: string): string {
  return `${prefix}/${folder}/manifest.json`;
}

/** Extract the distinct snapshot date-folders present, from a flat list of keys
 *  like "prefix/2026-08-20/restaurants.ndjson.gz". */
export function foldersFromKeys(prefix: string, keys: string[]): string[] {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(\\d{4}-\\d{2}-\\d{2})/`);
  const set = new Set<string>();
  for (const k of keys) {
    const m = re.exec(k);
    if (m) set.add(m[1]);
  }
  return [...set];
}

/**
 * Given the snapshot date-folders that currently exist and how many to keep, return
 * the folders to PRUNE (oldest first). Keeps the `keep` most-recent by date-string
 * order (YYYY-MM-DD sorts lexicographically == chronologically).
 */
export function foldersToPrune(existingFolders: string[], keep: number): string[] {
  const sorted = [...new Set(existingFolders)].sort().reverse(); // newest first
  return sorted.slice(Math.max(0, keep)).sort(); // the rest, oldest first
}
