import { getMediaPicks } from "@/lib/queries/media-picks";
import { resolvePodcastArtwork } from "@/lib/media/podcast-art";
import { resolveYouTube } from "@/lib/media/youtube";
import { MediaDirectory } from "@/components/media/MediaDirectory";
import { AdSlot } from "@/components/monetization/AdSlot";

const WRL_DESC =
  "The barbecue YouTube channels, books and podcasts The BBQ Atlas rates — the people worth your time, with an honest word on each.";

export const metadata = {
  title: "Watch, Read & Listen",
  description: WRL_DESC,
  alternates: { canonical: "/watch-read-listen" },
  openGraph: {
    title: "Watch, Read & Listen — The BBQ Atlas",
    description: WRL_DESC,
    url: "/watch-read-listen",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Watch, Read & Listen — The BBQ Atlas", description: WRL_DESC },
};

// Render on every request so newly published/unpublished picks appear at once.
// (Podcast artwork fetches are cached for a week via the fetch cache.)
export const dynamic = "force-dynamic";

export default async function WatchReadListenPage() {
  const picks = await getMediaPicks();

  // Resolve real artwork/data at render (all cached upstream), unless an
  // image_url was set manually in the admin. Podcasts → iTunes artwork;
  // YouTube → channel avatar + subscriber count + latest upload (needs
  // YOUTUBE_API_KEY, else placeholder).
  //
  // Book covers are NOT resolved here: they're resolved once and persisted to
  // media_picks.image_url via the admin "Resolve book covers" backfill, then
  // rendered straight from storage — no per-render external fetch, no
  // rate-limit exposure. Books therefore render whatever image_url they hold
  // (placeholder if still null).
  const book = picks.book;
  const [podcast, youtube] = await Promise.all([
    Promise.all(
      picks.podcast.map(async (p) => {
        if (p.image_url) return p;
        const art = await resolvePodcastArtwork(p.links?.apple ?? p.url);
        return { ...p, image_url: art };
      })
    ),
    Promise.all(
      picks.youtube.map(async (p) => {
        const yt = await resolveYouTube(p.url, p.links?.channelId);
        if (!yt) return p;
        return {
          ...p,
          image_url: p.image_url ?? yt.thumb,
          subscriberCount: yt.subscriberCount,
          latest: yt.latest,
        };
      })
    ),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold text-text-primary">Watch, Read &amp; Listen</h1>
        <p className="mt-2 text-white/60">
          The barbecue channels, books and podcasts we rate — the people worth your time, with an
          honest word on each. The books help keep the Atlas free.
        </p>
      </header>

      <MediaDirectory picks={{ youtube, book, podcast }} />

      <p className="mt-10 text-xs text-white/30">
        As an Amazon Associate, The BBQ Atlas earns from qualifying purchases. Book links are
        affiliate links; channel and podcast links are not.
      </p>
      <AdSlot slot="in-content" className="mt-8 h-0" />
    </div>
  );
}
