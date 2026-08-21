import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { BBQ_STYLES } from "@/lib/constants/styles";
import { revalidateVenues } from "@/lib/cache/venues";

export const dynamic = "force-dynamic";

/**
 * Admin Hero panel (VENUE-SYSTEM-SPEC §4). Sets a venue's hero + its provenance:
 *   action="user_photo"  { url }  → approved check-in photo   (hero_source=user_upload)
 *   action="licensed"    { url }  → an image we're licensed to (hero_source=atlas_licensed)
 *   action="venue"       { url }  → venue-provided image       (hero_source=venue_provided)
 *   action="style"       { style }→ change the style default   (clears the real photo)
 *   action="clear"                → back to the style default
 * The public page reflects §2 immediately.
 */
export async function POST(request: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const restaurantId = String(body.restaurantId ?? "");
  const action = String(body.action ?? "");
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const style = typeof body.style === "string" ? body.style : "";
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required." }, { status: 400 });
  }

  const isHttp = (u: string) => /^https?:\/\/.+/i.test(u);
  let patch: Record<string, unknown>;

  switch (action) {
    case "user_photo":
    case "licensed":
    case "venue": {
      if (!isHttp(url)) {
        return NextResponse.json({ error: "A valid image URL is required." }, { status: 400 });
      }
      const source =
        action === "user_photo"
          ? "user_upload"
          : action === "venue"
            ? "venue_provided"
            : "atlas_licensed";
      patch = { hero_image_url: url, hero_source: source };
      break;
    }
    case "style": {
      if (!(BBQ_STYLES as readonly string[]).includes(style)) {
        return NextResponse.json({ error: "Unknown style." }, { status: 400 });
      }
      patch = { style, hero_image_url: null, hero_source: "style_default" };
      break;
    }
    case "clear": {
      patch = { hero_image_url: null, hero_source: "style_default" };
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const { error } = await ctx.db
    .from("restaurants")
    .update(patch)
    .eq("id", restaurantId);
  if (error) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  revalidateVenues();
  return NextResponse.json({ ok: true, ...patch });
}
