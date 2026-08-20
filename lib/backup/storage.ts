import type { SupabaseClient } from "@supabase/supabase-js";
import type { BackupDestination } from "./destination";

/**
 * Storage backup — the FILE half of the weekly backup (BUILD PROMPT / follow-up).
 * The DB export captures the `media` / `review_photos` table rows (metadata), but the
 * actual uploaded photo/video BYTES live in Supabase Storage, separate from Postgres.
 * This mirrors those files to the same off-Cloudflare bucket.
 *
 * Scalable by construction: storage objects are immutable (path = user/uuid.ext), so
 * this is INCREMENTAL — it lists what's already in the backup and copies only NEW
 * files, bounded per run. Steady state each week is "just the new uploads". A deleted
 * source file is KEPT in the backup (that's the point of a backup); nothing is pruned.
 */

export interface StorageObject {
  bucket_id: string;
  name: string;
  size: number;
  mimetype: string | null;
}

export interface StorageBucketResult {
  bucket: string;
  objects: number;
  copied: number;
  skipped: number;
  failed: number;
  bytes: number; // bytes copied this run
}

export interface StorageSummary {
  ok: boolean;
  totalObjects: number;
  copied: number;
  skipped: number;
  failed: number;
  bytesCopied: number;
  capped: boolean;
  buckets: StorageBucketResult[];
  failures: string[];
}

const DEFAULT_LIMIT = 2000;

export function storageKey(prefix: string, bucket: string, name: string): string {
  return `${prefix}/storage/${bucket}/${name}`;
}

export async function runStorageBackup(
  db: SupabaseClient,
  dest: BackupDestination,
  opts: { prefix: string; limit?: number }
): Promise<StorageSummary> {
  const prefix = opts.prefix;
  const limit = Math.max(1, opts.limit ?? (Number(process.env.BACKUP_STORAGE_LIMIT) || DEFAULT_LIMIT));

  const summary: StorageSummary = {
    ok: true,
    totalObjects: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    bytesCopied: 0,
    capped: false,
    buckets: [],
    failures: [],
  };

  // 1) Full flat inventory of every stored object (RPC, migration 082).
  const { data: objsRaw, error: rpcErr } = await db.rpc("backup_storage_objects");
  if (rpcErr) {
    summary.ok = false;
    summary.failures.push(`storage inventory failed: ${rpcErr.message}`);
    return summary;
  }
  const objects = (objsRaw ?? []) as StorageObject[];
  summary.totalObjects = objects.length;

  // 2) What's already mirrored (so we only copy new files). One paginated list.
  let existing = new Set<string>();
  try {
    const listed = await dest.list(`${prefix}/storage/`);
    existing = new Set(listed.map((o) => o.key));
  } catch (e) {
    // If we can't list, fall back to copying everything (put is idempotent/overwrite).
    summary.failures.push(`storage list failed (will re-copy): ${e instanceof Error ? e.message : String(e)}`);
  }

  const byBucket = new Map<string, StorageBucketResult>();
  const bucketOf = (b: string): StorageBucketResult => {
    let r = byBucket.get(b);
    if (!r) {
      r = { bucket: b, objects: 0, copied: 0, skipped: 0, failed: 0, bytes: 0 };
      byBucket.set(b, r);
    }
    return r;
  };

  let budget = limit;
  for (const obj of objects) {
    const br = bucketOf(obj.bucket_id);
    br.objects++;

    const key = storageKey(prefix, obj.bucket_id, obj.name);
    if (existing.has(key)) {
      br.skipped++;
      summary.skipped++;
      continue;
    }
    if (budget <= 0) {
      summary.capped = true;
      continue; // over the per-run cap — a later run picks it up (incremental)
    }
    budget--;

    try {
      const { data: blob, error: dlErr } = await db.storage.from(obj.bucket_id).download(obj.name);
      if (dlErr || !blob) throw new Error(dlErr?.message ?? "empty download");
      const buf = Buffer.from(await blob.arrayBuffer());
      await dest.put(key, buf, obj.mimetype || "application/octet-stream");
      br.copied++;
      br.bytes += buf.length;
      summary.copied++;
      summary.bytesCopied += buf.length;
    } catch (e) {
      br.failed++;
      summary.failed++;
      const msg = `${obj.bucket_id}/${obj.name}: ${e instanceof Error ? e.message : String(e)}`;
      if (summary.failures.length < 25) summary.failures.push(msg); // cap the noise
    }
  }

  summary.buckets = [...byBucket.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  summary.ok = summary.failed === 0 && !summary.failures.length;

  // 3) Inventory manifest (the CURRENT full object list + sizes) for restore verification.
  try {
    await dest.put(
      `${prefix}/storage/manifest.json`,
      Buffer.from(
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            totalObjects: summary.totalObjects,
            objects: objects.map((o) => ({ bucket: o.bucket_id, name: o.name, size: o.size })),
          },
          null,
          2
        ),
        "utf8"
      ),
      "application/json"
    );
  } catch (e) {
    summary.failures.push(`storage manifest: ${e instanceof Error ? e.message : String(e)}`);
    summary.ok = false;
  }

  if (summary.capped) {
    summary.failures.push(
      `storage copy hit the ${limit}-file per-run cap — remaining new files copy on the next run (incremental).`
    );
  }

  return summary;
}
