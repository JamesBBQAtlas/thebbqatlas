import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

/**
 * Serialise/compress helpers for the weekly DB export (server-only). Kept pure so
 * the NDJSON shape, gzip round-trip and checksum are unit-testable.
 */

/** Rows → newline-delimited JSON (one compact JSON object per line, trailing \n). */
export function rowsToNdjson(rows: unknown[]): string {
  if (!rows.length) return "";
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

/** Count the data lines in an NDJSON string (for the row-count integrity check). */
export function countNdjsonLines(ndjson: string): number {
  if (!ndjson) return 0;
  // Trailing newline means the last split element is "" — ignore it.
  const trimmed = ndjson.endsWith("\n") ? ndjson.slice(0, -1) : ndjson;
  if (!trimmed) return 0;
  return trimmed.split("\n").length;
}

export function gzip(input: string | Buffer): Buffer {
  return gzipSync(typeof input === "string" ? Buffer.from(input, "utf8") : input, { level: 9 });
}

export function sha256hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}
