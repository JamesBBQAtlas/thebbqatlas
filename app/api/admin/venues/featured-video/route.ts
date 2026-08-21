import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveYouTubeVideo, videoIdFrom } from "@/lib/media/youtube";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";

/**
 * Phase 6.7 (B1) — set or clear a venue's featured video. Paste a YouTube
 * URL/ID → validate it exists + is embeddable via the YouTube Data API → store
 * the id + cached title/channel/thumbnail. An empty url clears the feature.
 * Reusable for any venue (Truth BBQ is just the first to use it).
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "").trim();
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const url = String(body.url ?? "").trim();

  // Empty → clear the feature.
  if (!url) {
    const { error } = await ctx.db
      .from("restaurants")
      .update({
        featured_video_id: null,
        featured_video_title: null,
        featured_video_channel: null,
        featured_video_thumb: null,
      })
      .eq("id", restaurantId);
    if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    revalidateVenues();
    return NextResponse.json({ ok: true, cleared: true });
  }

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
  if (!meta.embeddable) {
    return NextResponse.json(
      { error: "That video can't be embedded (owner disabled embedding)." },
      { status: 422 }
    );
  }

  const { error } = await ctx.db
    .from("restaurants")
    .update({
      featured_video_id: meta.videoId,
      featured_video_title: meta.title,
      featured_video_channel: meta.channelTitle,
      featured_video_thumb: meta.thumb,
    })
    .eq("id", restaurantId);
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });

  revalidateVenues();
  return NextResponse.json({
    ok: true,
    videoId: meta.videoId,
    title: meta.title,
    channel: meta.channelTitle,
    thumb: meta.thumb,
  });
}
