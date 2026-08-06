import { unstable_noStore as noStore } from "next/cache";
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
  links: Record<string, string>;
  sort_order: number;
  is_published: boolean;
  // Runtime enrichments (resolved server-side on the page, cached upstream).
  subscriberCount?: string | null;
  latest?: { title: string; videoId: string; thumb: string | null } | null;
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
  // The page is dynamic, but the Supabase client's fetch can still be stored in
  // Next's Data Cache — so DB edits (and resolved book covers) get frozen at an
  // earlier snapshot and never surface. noStore() forces this read to run fresh
  // on every request.
  noStore();
  try {
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("media_picks")
      .select(
        "id, kind, name, creator, url, blurb, image_url, gear_link, links, sort_order, is_published"
      )
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error || !data) return EMPTY;
    const out: MediaPicksByKind = { youtube: [], book: [], podcast: [] };
    for (const row of data as MediaPick[]) {
      const pick = { ...row, links: (row.links ?? {}) as Record<string, string> };
      if (pick.kind in out) out[pick.kind].push(pick);
    }
    return out;
  } catch {
    return EMPTY;
  }
}
