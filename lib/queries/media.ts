import { createAnonClient } from "@/lib/supabase/anon";

export interface MediaItem {
  id: string;
  kind: "image" | "video";
  url: string;
  caption: string | null;
  created_at: string;
}

/** Approved community media for a venue, newest first. */
export async function getApprovedMedia(restaurantId: string): Promise<MediaItem[]> {
  try {
    const supabase = createAnonClient();
    const { data } = await supabase
      .from("media")
      .select("id, kind, url, caption, created_at")
      .eq("restaurant_id", restaurantId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(24);
    return (data ?? []) as MediaItem[];
  } catch {
    return [];
  }
}
