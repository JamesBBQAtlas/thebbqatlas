import { AwsClient } from "aws4fetch";
import { BackupConfigError, type BackupDestination, type StoredObject } from "./destination";

/**
 * S3-compatible backup destination (Backblaze B2 by default, or AWS S3 — identical
 * API). Uses aws4fetch (SigV4 over fetch) so there's no heavy SDK in the serverless
 * bundle. Path-style addressing (`{endpoint}/{bucket}/{key}`) so it works with B2
 * and any S3-compatible endpoint.
 *
 * Env (server-only, NEVER in a client bundle):
 *   BACKUP_S3_ENDPOINT           e.g. https://s3.us-west-004.backblazeb2.com
 *   BACKUP_S3_REGION             e.g. us-west-004   (B2) / us-east-1 (AWS)
 *   BACKUP_S3_BUCKET             the PRIVATE bucket name
 *   BACKUP_S3_ACCESS_KEY_ID      B2 keyID / AWS access key id
 *   BACKUP_S3_SECRET_ACCESS_KEY  B2 applicationKey / AWS secret
 *   BACKUP_S3_PREFIX (optional)  key prefix (default "bbq-atlas-backups")
 */

function encodeKey(key: string): string {
  // Keep "/" as path separators; encode each segment (handles spaces etc.).
  return key.split("/").map(encodeURIComponent).join("/");
}

export function createS3Destination(): BackupDestination {
  const endpoint = (process.env.BACKUP_S3_ENDPOINT || "").replace(/\/+$/, "");
  const region = process.env.BACKUP_S3_REGION || "";
  const bucket = process.env.BACKUP_S3_BUCKET || "";
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY || "";

  const missing = [
    ["BACKUP_S3_ENDPOINT", endpoint],
    ["BACKUP_S3_REGION", region],
    ["BACKUP_S3_BUCKET", bucket],
    ["BACKUP_S3_ACCESS_KEY_ID", accessKeyId],
    ["BACKUP_S3_SECRET_ACCESS_KEY", secretAccessKey],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new BackupConfigError(`S3 backup destination not configured — missing env: ${missing.join(", ")}`);
  }

  const aws = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });
  const base = `${endpoint}/${bucket}`;

  return {
    label: `S3-compatible (${bucket})`,

    async put(key, body, contentType) {
      const res = await aws.fetch(`${base}/${encodeKey(key)}`, {
        method: "PUT",
        // Buffer is a Uint8Array at runtime (undici accepts it); the DOM lib type
        // for BodyInit doesn't include Node's Buffer, hence the cast.
        body: new Uint8Array(body),
        headers: { "content-type": contentType },
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`S3 PUT ${key} failed (${res.status}): ${detail.slice(0, 300)}`);
      }
    },

    async list(prefix) {
      const out: StoredObject[] = [];
      let token: string | undefined;
      // ListObjectsV2, following continuation tokens.
      do {
        const url = new URL(base + "/");
        url.searchParams.set("list-type", "2");
        url.searchParams.set("prefix", prefix);
        if (token) url.searchParams.set("continuation-token", token);
        const res = await aws.fetch(url.toString(), { method: "GET" });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`S3 LIST failed (${res.status}): ${detail.slice(0, 300)}`);
        }
        const xml = await res.text();
        for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const block = m[1];
          const key = /<Key>([\s\S]*?)<\/Key>/.exec(block)?.[1];
          const size = Number(/<Size>(\d+)<\/Size>/.exec(block)?.[1] ?? "0");
          if (key) out.push({ key: decodeXml(key), size });
        }
        const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
        token = truncated ? /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1] : undefined;
      } while (token);
      return out;
    },

    async del(keys) {
      for (const key of keys) {
        const res = await aws.fetch(`${base}/${encodeKey(key)}`, { method: "DELETE" });
        // S3/B2 return 204 on delete; treat 404 as already-gone (idempotent).
        if (!res.ok && res.status !== 404) {
          const detail = await res.text().catch(() => "");
          throw new Error(`S3 DELETE ${key} failed (${res.status}): ${detail.slice(0, 200)}`);
        }
      }
    },
  };
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
