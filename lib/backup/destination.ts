/**
 * Backup destination abstraction (BUILD PROMPT — weekly independent export). The
 * export engine writes through this interface, so the destination is pluggable and
 * configurable via env (BACKUP_DEST). Today: an S3-compatible store (Backblaze B2 by
 * default, or AWS S3 — same API). A Google Drive adapter can be added later behind
 * the same interface with zero change to the engine.
 *
 * The whole point of this backup is INDEPENDENCE: the destination must live OUTSIDE
 * the Cloudflare account that runs the site, so a hosting/Cloudflare problem can
 * never take out both the site and its backup at once.
 */

export interface StoredObject {
  key: string;
  size: number;
}

export interface BackupDestination {
  /** Human label for logs/manifest/emails (e.g. "Backblaze B2 (bucket/prefix)"). */
  label: string;
  /** Upload one object. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** List objects under a key prefix. */
  list(prefix: string): Promise<StoredObject[]>;
  /** Delete objects by key. */
  del(keys: string[]): Promise<void>;
}

export class BackupConfigError extends Error {}
