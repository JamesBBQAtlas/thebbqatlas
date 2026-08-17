/**
 * Photo moderation routing (Part 3). A pending photo can live in one of two tables:
 *   • `media`        — a community "Add your photos" venue upload (kind='image');
 *   • `review_photos`— a photo attached to a user review.
 * The Moderation → Photos tab used to read only `review_photos`, so the 22 pending
 * `media` venue uploads never appeared. These pure helpers decide, from the source the
 * client sends, which table an approve/reject writes back to — so the console, the API,
 * and any test agree on one mapping.
 */
export type PhotoSource = "media" | "review";

/** Normalise an untrusted `source` field from the moderate request body. Defaults to
 *  `review` for back-compat (older clients sent no source and meant review_photos). */
export function normalizePhotoSource(raw: unknown): PhotoSource {
  return raw === "media" ? "media" : "review";
}

/** The DB table a pending photo of this source lives in. */
export function photoModerationTable(source: PhotoSource): "media" | "review_photos" {
  return source === "media" ? "media" : "review_photos";
}
