import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveYouTubeVideo, resolveYouTubeChannelMeta, videoIdFrom } from "@/lib/media/youtube";
import { resolveBookByUrl } from "@/lib/media/book-cover";
import { resolvePodcastMeta } from "@/lib/media/podcast-art";
import { detectMediaKind, type MediaKind } from "@/lib/media/wrl-url";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Part B (B4) — one endpoint that turns a pasted URL into a ready-to-save
 * media_picks row, so the operator barely types. Dispatches by kind:
 *   • youtube (channel) → name + handle + avatar + channelId (in `links`)
 *   • video   (single)  → title + channel + thumbnail + duration
 *   • book    (Amazon)  → title + author + cover (raw Amazon URL kept; the
 *                          affiliate tag is applied only at render, so the
 *                          "no link ships unless it earns" rule stays intact)
 *   • podcast (Apple)   → show name + publisher + artwork
 * All metadata is re-fetched here server-side — nothing from the client is
 * trusted. Returns { ok, kind, row, warnings } or a 4xx with a helpful message.
 * Never invents a value: a field it can't resolve comes back empty for the
 * operator to fill (the blurb is always hand-written).
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "Paste a URL first." }, { status: 400 });

  // Trust an explicit kind from the modal; else sniff it from the URL shape.
  const asked = String(body.kind ?? "").trim() as MediaKind | "";
  const kind: MediaKind | null =
    asked === "youtube" || asked === "video" || asked === "book" || asked === "podcast"
      ? asked
      : detectMediaKind(url);
  if (!kind) {
    return NextResponse.json(
      { error: "Couldn't tell what kind of link that is — pick Watch / Read / Listen and try again." },
      { status: 400 }
    );
  }

  if (kind === "video") {
    if (!process.env.YOUTUBE_API_KEY)
      return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured." }, { status: 503 });
    const id = videoIdFrom(url);
    if (!id) return NextResponse.json({ error: "That doesn't look like a YouTube video URL." }, { status: 400 });
    const meta = await resolveYouTubeVideo(id);
    if (!meta) return NextResponse.json({ error: "Couldn't find that video (private or removed)." }, { status: 404 });
    return NextResponse.json({
      ok: true,
      kind,
      row: {
        kind: "video",
        name: meta.title,
        creator: meta.channelTitle,
        url: `https://www.youtube.com/watch?v=${meta.videoId}`,
        image_url: meta.thumb,
        links: { videoId: meta.videoId, duration: meta.duration ?? "" },
      },
      warnings: meta.embeddable ? [] : ["This video isn't embeddable — it'll link out instead of playing inline."],
    });
  }

  if (kind === "youtube") {
    if (!process.env.YOUTUBE_API_KEY)
      return NextResponse.json({ error: "YOUTUBE_API_KEY is not configured." }, { status: 503 });
    const meta = await resolveYouTubeChannelMeta(url);
    if (!meta || !meta.title)
      return NextResponse.json(
        { error: "Couldn't resolve that channel — check the @handle or /channel/ URL." },
        { status: 404 }
      );
    const warnings: string[] = [];
    if (!meta.thumb) warnings.push("No channel avatar found — the row will use a placeholder.");
    return NextResponse.json({
      ok: true,
      kind,
      row: {
        kind: "youtube",
        name: meta.title,
        creator: meta.handle ? `@${meta.handle}` : "",
        url,
        image_url: meta.thumb,
        links: meta.channelId ? { channelId: meta.channelId } : {},
      },
      warnings,
    });
  }

  if (kind === "book") {
    const meta = await resolveBookByUrl(url);
    if (!meta) {
      // No ISBN in the URL, or nothing resolved — return a shell so the operator
      // can type the title/author and backfill the cover via "Resolve book covers".
      return NextResponse.json({
        ok: true,
        kind,
        row: { kind: "book", name: "", creator: "", url, image_url: null, links: {} },
        warnings: ["Couldn't auto-read this book — add the title/author, then use “Resolve book covers” for the cover."],
      });
    }
    const warnings: string[] = [];
    if (!meta.cover) warnings.push("No cover found — use “Resolve book covers” after saving.");
    return NextResponse.json({
      ok: true,
      kind,
      row: {
        kind: "book",
        name: meta.title,
        creator: meta.author ?? "",
        url, // raw Amazon URL — never pre-decorate; AffiliateLink adds the tag at render
        image_url: meta.cover,
        links: {},
      },
      warnings,
    });
  }

  // podcast
  const meta = await resolvePodcastMeta(url);
  if (!meta || !meta.name) {
    return NextResponse.json({
      ok: true,
      kind,
      row: { kind: "podcast", name: "", creator: "", url, image_url: null, links: {} },
      warnings: ["Couldn't auto-read this podcast (Apple Podcasts URLs resolve best) — add the show name by hand."],
    });
  }
  return NextResponse.json({
    ok: true,
    kind,
    row: {
      kind: "podcast",
      name: meta.name,
      creator: meta.publisher ?? "",
      url,
      image_url: meta.artwork,
      links: {},
    },
    warnings: meta.artwork ? [] : ["No artwork found — the row will use a placeholder."],
  });
}
