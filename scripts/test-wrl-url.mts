/**
 * Unit tests for the WRL admin URL helpers (Part B follow-ups) — pure, no network.
 * Covers kind detection, id extraction, the dedupe key (so equivalent URLs
 * collide), the duplicate finder, and the reorder math.
 *
 * Run: npm run test:wrl
 */
import {
  extractYouTubeVideoId,
  extractYouTubeHandle,
  extractYouTubeChannelId,
  extractAmazonAsin,
  extractApplePodcastId,
  extractSpotifyShowId,
  detectMediaKind,
  mediaDedupeKey,
  findDuplicateByUrl,
  reindexOrder,
  moveItem,
} from "../lib/media/wrl-url";

let pass = 0;
let fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log("\n[id extraction]");
ok("video id from watch URL", extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ") === "dQw4w9WgXcQ");
ok("video id from youtu.be", extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ") === "dQw4w9WgXcQ");
ok("video id from shorts", extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ") === "dQw4w9WgXcQ");
ok("bare 11-char id", extractYouTubeVideoId("dQw4w9WgXcQ") === "dQw4w9WgXcQ");
ok("no video id in a channel URL", extractYouTubeVideoId("https://www.youtube.com/@mad_scientist_bbq") === null);
ok("channel handle", extractYouTubeHandle("https://www.youtube.com/@mad_scientist_bbq") === "mad_scientist_bbq");
ok("channel id (/channel/UC…)", extractYouTubeChannelId("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv") === "UCabcdefghijklmnopqrstuv");
ok("amazon asin from /dp/", extractAmazonAsin("https://www.amazon.com/dp/1607747006?tag=x") === "1607747006");
ok("amazon asin from /gp/product/", extractAmazonAsin("https://www.amazon.com/gp/product/1607747006") === "1607747006");
ok("apple podcast id", extractApplePodcastId("https://podcasts.apple.com/us/podcast/foo/id1481594820") === "1481594820");
ok("spotify show id", extractSpotifyShowId("https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk") === "4rOoJ6Egrf8K2IrywzwOMk");

console.log("\n[kind detection]");
ok("watch video → video", detectMediaKind("https://youtu.be/dQw4w9WgXcQ") === "video");
ok("channel @handle → youtube", detectMediaKind("https://www.youtube.com/@mad_scientist_bbq") === "youtube");
ok("channel /channel/ → youtube", detectMediaKind("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv") === "youtube");
ok("amazon → book", detectMediaKind("https://www.amazon.com/dp/1607747006") === "book");
ok("apple podcasts → podcast", detectMediaKind("https://podcasts.apple.com/us/podcast/foo/id1481594820") === "podcast");
ok("spotify show → podcast", detectMediaKind("https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk") === "podcast");
ok("unknown → null", detectMediaKind("https://example.com/whatever") === null);

console.log("\n[dedupe key — equivalent URLs collide]");
ok("youtu.be and watch?v= collide", mediaDedupeKey("https://youtu.be/dQw4w9WgXcQ") === mediaDedupeKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
ok("amazon with/without tracking collide", mediaDedupeKey("https://www.amazon.com/dp/1607747006?tag=a-20") === mediaDedupeKey("https://amazon.com/dp/1607747006"));
ok("distinct videos don't collide", mediaDedupeKey("https://youtu.be/dQw4w9WgXcQ") !== mediaDedupeKey("https://youtu.be/oHg5SJYRHA0"));
ok("generic URL normalises www + trailing slash", mediaDedupeKey("https://www.Example.com/Foo/") === mediaDedupeKey("http://example.com/Foo"));

console.log("\n[duplicate finder]");
{
  const rows = [
    { id: "1", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    { id: "2", url: "https://www.amazon.com/dp/1607747006" },
  ];
  ok("finds the same video via youtu.be", findDuplicateByUrl("https://youtu.be/dQw4w9WgXcQ", rows)?.id === "1");
  ok("finds the same book ignoring ?tag", findDuplicateByUrl("https://amazon.com/dp/1607747006?tag=z-20", rows)?.id === "2");
  ok("new URL → no duplicate", findDuplicateByUrl("https://youtu.be/oHg5SJYRHA0", rows) === null);
  ok("editing self is not a duplicate", findDuplicateByUrl("https://youtu.be/dQw4w9WgXcQ", rows, "1") === null);
}

console.log("\n[reorder math]");
ok("reindex assigns 0..n-1", JSON.stringify(reindexOrder(["a", "b", "c"])) === JSON.stringify([{ id: "a", sort_order: 0 }, { id: "b", sort_order: 1 }, { id: "c", sort_order: 2 }]));
ok("move down", JSON.stringify(moveItem(["a", "b", "c"], 0, 2)) === JSON.stringify(["b", "c", "a"]));
ok("move up", JSON.stringify(moveItem(["a", "b", "c"], 2, 0)) === JSON.stringify(["c", "a", "b"]));
ok("move clamps past the end", JSON.stringify(moveItem(["a", "b", "c"], 0, 99)) === JSON.stringify(["b", "c", "a"]));
ok("move with out-of-range from is a no-op copy", JSON.stringify(moveItem(["a", "b"], 5, 0)) === JSON.stringify(["a", "b"]));

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
