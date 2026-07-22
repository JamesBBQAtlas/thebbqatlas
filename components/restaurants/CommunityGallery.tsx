import { MediaUpload } from "@/components/media/MediaUpload";
import type { MediaItem } from "@/lib/queries/media";

/**
 * Approved community photos/videos for a venue, plus an upload entry point for
 * signed-in visitors. Uploads are moderated before they show here.
 */
export function CommunityGallery({
  restaurantId,
  media,
  canUpload,
}: {
  restaurantId: string;
  media: MediaItem[];
  canUpload: boolean;
}) {
  if (media.length === 0 && !canUpload) return null;

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

      {canUpload && (
        <MediaUpload restaurantId={restaurantId} source="venue" label="Add your photos" />
      )}
    </section>
  );
}
