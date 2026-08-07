import { CommunityUpload } from "@/components/restaurants/CommunityUpload";
import type { MediaItem } from "@/lib/queries/media";

/**
 * Approved community photos/videos for a venue, plus an upload entry point for
 * signed-in visitors. Uploads are moderated before they show here. The upload
 * gate resolves auth client-side (CommunityUpload) so the venue page stays
 * static (Fable H-1); the section always renders — an empty state invites the
 * first photo.
 */
export function CommunityGallery({
  restaurantId,
  media,
}: {
  restaurantId: string;
  media: MediaItem[];
}) {
  return (
    <section id="add-photos" className="mb-12 scroll-mt-28">
      <h2 className="mb-5 border-b border-border-subtle pb-3 font-heading text-xl font-bold text-text-primary">
        Community photos
      </h2>

      {media.length === 0 ? (
        <p className="mb-4 text-sm text-text-muted">
          No community photos yet — be the first to share one.
        </p>
      ) : (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((m) =>
            m.kind === "video" ? (
              <video
                key={m.id}
                controls
                preload="metadata"
                className="aspect-square w-full rounded-lg border border-border-subtle object-cover"
                src={m.url}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.url}
                alt={m.caption ?? "Community photo"}
                loading="lazy"
                className="aspect-square w-full rounded-lg border border-border-subtle object-cover"
              />
            )
          )}
        </div>
      )}

      <CommunityUpload restaurantId={restaurantId} />
    </section>
  );
}
