import { revalidateTag } from "next/cache";
import { VENUES_TAG } from "@/lib/queries/restaurants";

/**
 * Invalidate every public read of approved venues (directory listing + spot
 * count, map data, venue pages, chain pages) so an admin edit that changes live
 * data surfaces on the NEXT load — within seconds, no redeploy, no waiting on the
 * 1-hour ISR window. Call after any mutation that can change live copy /
 * coordinates / status / socials.
 */
export function revalidateVenues(): void {
  try {
    revalidateTag(VENUES_TAG);
  } catch {
    // revalidateTag can only run in a request/route context; ignore otherwise.
  }
}
