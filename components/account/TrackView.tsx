"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Records a view in the signed-in user's history. Renders nothing; no-ops for
 * signed-out visitors, so it's safe to drop on public (static) pages.
 */
export function TrackView({
  entityType,
  entityId,
  title,
  slug,
}: {
  entityType: "venue" | "guide" | "news";
  entityId: string;
  title?: string;
  slug?: string;
}) {
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, title, slug }),
      }).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, title, slug]);

  return null;
}
