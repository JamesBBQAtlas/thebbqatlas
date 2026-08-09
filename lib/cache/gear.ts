import { revalidateTag } from "next/cache";
import { GEAR_TAG } from "@/lib/queries/gear";

/**
 * Invalidate every gear read — the /gear catalogue AND the per-venue gear
 * recommendations — so an admin gear edit (a re-pointed affiliate_url, a
 * retire/restore, a new product) shows on the NEXT load without a redeploy.
 * Part 2 fix for the "gear page didn't reflect the DB re-point" bug.
 */
export function revalidateGear(): void {
  try {
    revalidateTag(GEAR_TAG);
  } catch {
    // revalidateTag only runs in a request/route context; ignore otherwise.
  }
}
