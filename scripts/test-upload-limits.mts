/* Part 5 — community photo upload limits. Pure guard on the shared file selector:
 * up to 15 accepted, images-only rejects video/other, per-file size cap, overflow
 * beyond the cap is dropped (not an error). Run: tsx scripts/test-upload-limits.mts
 */
import {
  selectUploadableFiles,
  rejectionMessage,
  COMMUNITY_MAX_FILES,
  COMMUNITY_MAX_BYTES,
  type FileMeta,
} from "../lib/media/upload-limits";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (cond) { pass++; console.log("  ✓", name); }
  else { fail++; console.log("  ✗", name, extra !== undefined ? JSON.stringify(extra) : ""); }
}

const img = (n: number, mb = 1): FileMeta => ({ name: `p${n}.jpg`, type: "image/jpeg", size: mb * 1024 * 1024 });
const vid = (n: number): FileMeta => ({ name: `v${n}.mp4`, type: "video/mp4", size: 5 * 1024 * 1024 });

console.log("\n[community flow — up to 15 images, ≤10MB, images-only]");
{
  const limits = { maxFiles: COMMUNITY_MAX_FILES, maxBytes: COMMUNITY_MAX_BYTES, imagesOnly: true };
  const twenty = Array.from({ length: 20 }, (_, i) => img(i));
  const sel = selectUploadableFiles(twenty, limits);
  ok("accepts exactly 15 of 20", sel.accepted.length === 15, sel.accepted.length);
  ok("5 overflow (dropped, not per-file errors)", sel.overflow === 5 && sel.rejected.length === 0, { o: sel.overflow, r: sel.rejected.length });
  ok("cap raised above the old 5", COMMUNITY_MAX_FILES === 15);

  const withVideo = selectUploadableFiles([img(1), vid(2), img(3)], limits);
  ok("images-only rejects a video", withVideo.accepted.length === 2 && withVideo.rejected.some((r) => r.reason === "not an image"));

  const big = selectUploadableFiles([img(1, 12), img(2, 3)], limits);
  ok("rejects a >10MB image, keeps the small one", big.accepted.length === 1 && big.rejected[0].reason.startsWith("over "));

  ok("rejectionMessage summarises the skips", /images only|too large|first 15/.test(rejectionMessage(selectUploadableFiles([...twenty, vid(99)], limits), 15)));
}

console.log("\n[general flow — video allowed]");
{
  const limits = { maxFiles: 15, maxBytes: 25 * 1024 * 1024, imagesOnly: false };
  const sel = selectUploadableFiles([img(1), vid(2)], limits);
  ok("video accepted when imagesOnly is false", sel.accepted.length === 2 && sel.rejected.length === 0);
  const junk = selectUploadableFiles([{ name: "x.pdf", type: "application/pdf", size: 10 }], limits);
  ok("a non-image/non-video is always rejected", junk.accepted.length === 0 && junk.rejected[0].reason === "unsupported file type");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
