import { getMediaPicks } from "@/lib/queries/media-picks";
import { resolvePodcastArtwork } from "@/lib/media/podcast-art";
import { MediaDirectory } from "@/components/media/MediaDirectory";
import { AdSlot } from "@/components/monetization/AdSlot";

export const metadata = {
  title: "Watch, Read & Listen",
  description:
    "The barbecue YouTube channels, books and podcasts The BBQ Atlas rates — the people worth your time, with an honest word on each.",
  alternates: { canonical: "/watch-read-listen" },
};

// Render on every request so newly published/unpublished picks appear at once.
// (Podcast artwork fetches are cached for a week via the fetch cache.)
export const dynamic = "force-dynamic";

export default async function WatchReadListenPage() {
  const picks = await getMediaPicks();

  // Resolve podcast cover art from iTunes (by Apple id in the platform links),
  // unless an image_url was set manually in the admin. Cached upstream.
  const podcast = await Promise.all(
    picks.podcast.map(async (p) => {
      if (p.image_url) return p;
      const art = await resolvePodcastArtwork(p.links?.apple ?? p.url);
      return { ...p, image_url: art };
    })
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-bold text-text-primary">Watch, Read &amp; Listen</h1>
        <p className="mt-2 text-white/60">
          The barbecue channels, books and podcasts we rate — the people worth your time, with an
          honest word on each. The books help keep the Atlas free.
        </p>
      </header>

      <MediaDirectory picks={{ ...picks, podcast }} />

      <p className="mt-10 text-xs text-white/30">
        As an Amazon Associate, The BBQ Atlas earns from qualifying purchases. Book links are
        affiliate links; channel and podcast links are not.
      </p>
      <AdSlot slot="in-content" className="mt-8 h-0" />
    </div>
  );
}
