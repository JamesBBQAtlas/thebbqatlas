import { createAnonClient } from "@/lib/supabase/anon";

export type MediaKind = "youtube" | "book" | "podcast";

export interface MediaPick {
  id: string;
  kind: MediaKind;
  name: string;
  creator: string | null;
  url: string;
  blurb: string;
  image_url: string | null;
  gear_link: string | null;
  sort_order: number;
  is_published: boolean;
}

export interface MediaPicksByKind {
  youtube: MediaPick[];
  book: MediaPick[];
  podcast: MediaPick[];
}

const EMPTY: MediaPicksByKind = { youtube: [], book: [], podcast: [] };

/**
 * Published Watch/Read/Listen picks, grouped by kind and ordered by sort_order.
 * Public read is gated by RLS (is_published) too; the explicit filter keeps the
 * query honest even under the service role. An empty result is a valid answer.
 */
export async function getMediaPicks(): Promise<MediaPicksByKind> {
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("media_picks")
      .select(
        "id, kind, name, creator, url, blurb, image_url, gear_link, sort_order, is_published"
      )
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error || !data) return EMPTY;
    const out: MediaPicksByKind = { youtube: [], book: [], podcast: [] };
    for (const row of data as MediaPick[]) {
      if (row.kind in out) out[row.kind].push(row);
    }
    return out;
  } catch {
    return EMPTY;
  }
}
