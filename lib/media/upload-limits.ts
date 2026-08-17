/**
 * Community upload limits + a pure file selector (Part 5). The public "Add your photos"
 * flow raises the per-upload cap from 5 → 15 while keeping the safety rails: images
 * only, a per-file size cap, and (server-side) a per-venue/day total to deter abuse.
 * The selection logic is pure so it's unit-tested and shared by the client component.
 */

/** Community "Add your photos": up to 15 images per upload, ≤10 MB each. */
export const COMMUNITY_MAX_FILES = 15;
export const COMMUNITY_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
/** General media upload (check-in flow keeps video): larger cap, more files. */
export const DEFAULT_MAX_FILES = 15;
export const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
/** Server abuse rail: most pending photos one user can stack on one venue per day. */
export const MAX_PENDING_PER_VENUE_PER_DAY = 30;

export interface UploadLimits {
  maxFiles: number;
  maxBytes: number;
  /** When true, reject anything that isn't an image (the community photo flow). */
  imagesOnly: boolean;
}

export interface FileMeta {
  name: string;
  type: string;
  size: number;
}

export interface UploadSelection<T> {
  accepted: T[];
  rejected: { file: T; reason: string }[];
  /** Files dropped purely because they exceeded maxFiles (not a per-file fault). */
  overflow: number;
}

/**
 * Choose which files may be uploaded under `limits`, in order, with a reason for each
 * rejection. Enforces the type rule (images-only when set; otherwise image or video),
 * the per-file byte cap, and the count cap (extra files become `overflow`, not errors).
 * Pure — no DOM, no File API beyond the {name,type,size} shape — so it unit-tests and is
 * the single source of truth the client component and any server check can share.
 */
export function selectUploadableFiles<T extends FileMeta>(
  files: T[],
  limits: UploadLimits
): UploadSelection<T> {
  const accepted: T[] = [];
  const rejected: { file: T; reason: string }[] = [];
  let overflow = 0;
  const mb = (n: number) => `${Math.round(n / (1024 * 1024))}MB`;

  for (const f of files) {
    const isImage = typeof f.type === "string" && f.type.startsWith("image/");
    const isVideo = typeof f.type === "string" && f.type.startsWith("video/");
    if (limits.imagesOnly && !isImage) {
      rejected.push({ file: f, reason: "not an image" });
      continue;
    }
    if (!limits.imagesOnly && !isImage && !isVideo) {
      rejected.push({ file: f, reason: "unsupported file type" });
      continue;
    }
    if (f.size > limits.maxBytes) {
      rejected.push({ file: f, reason: `over ${mb(limits.maxBytes)}` });
      continue;
    }
    if (accepted.length >= limits.maxFiles) {
      overflow++;
      continue;
    }
    accepted.push(f);
  }
  return { accepted, rejected, overflow };
}

/** A short, friendly message for the files that couldn't be sent (or "" if none). */
export function rejectionMessage<T extends FileMeta>(sel: UploadSelection<T>, maxFiles: number): string {
  const parts: string[] = [];
  if (sel.overflow > 0) parts.push(`only the first ${maxFiles} were sent`);
  const badType = sel.rejected.filter((r) => r.reason === "not an image" || r.reason === "unsupported file type").length;
  const tooBig = sel.rejected.filter((r) => r.reason.startsWith("over ")).length;
  if (badType > 0) parts.push(`${badType} skipped (images only)`);
  if (tooBig > 0) parts.push(`${tooBig} skipped (too large)`);
  return parts.join(" · ");
}
