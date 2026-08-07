import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveYouTubeVideo, videoIdFrom } from "@/lib/media/youtube";

export const dynamic = "force-dynamic";

/**
 * Phase 6.5 — validate + resolve a YouTube video URL for "Episodes We Love".
 * The admin pastes a watch/share URL; we confirm it exists via the YouTube Data
 * API (server-side, no AI) and return title, channel, thumbnail, duration + id
 * so the add form can auto-fill and save. No external metadata is trusted from
 * the client — everything is re-fetched here from the id.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const url = String(body.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "Paste a YouTube video URL." }, { status: 400 });

  const id = videoIdFrom(url);
  if (!id) {
    return NextResponse.json(
      { error: "That doesn't look like a YouTube video URL." },
      { status: 400 }
    );
  }

  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json(
      { error: "YOUTUBE_API_KEY is not configured — can't validate the video." },
      { status: 503 }
    );
  }

  const meta = await resolveYouTubeVideo(id);
  if (!meta) {
    return NextResponse.json(
      { error: "Couldn't find that video (it may be private or removed)." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    videoId: meta.videoId,
    title: meta.title,
    channelTitle: meta.channelTitle,
    thumb: meta.thumb,
    duration: meta.duration,
    embeddable: meta.embeddable,
    // Ready-to-save shape for media_picks (kind='video').
    row: {
      kind: "video",
      name: meta.title,
      creator: meta.channelTitle,
      url: `https://www.youtube.com/watch?v=${meta.videoId}`,
      image_url: meta.thumb,
      links: { videoId: meta.videoId, duration: meta.duration ?? "" },
    },
  });
}
