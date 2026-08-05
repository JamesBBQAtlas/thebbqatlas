import type { Guide } from "@/lib/types/database";

/**
 * Bundled fallback guides — served ONLY if the database read genuinely errors
 * (never for a legitimately-empty result). This is intentionally EMPTY: the real
 * guides live in the database, and the previous placeholder seed (incl. the
 * retired "Top 10 BBQ Joints in Texas" piece) must never resurface from here.
 * Leaving it empty means a DB outage shows an empty guides section rather than
 * leaking pulled or stale editorial content.
 */
export const FALLBACK_GUIDES: Guide[] = [];
