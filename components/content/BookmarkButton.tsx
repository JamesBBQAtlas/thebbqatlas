"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Save/unsave a guide or news post. Fetches its own state on mount so it can
 * live on statically-rendered content pages without making them dynamic.
 * No-ops (prompts sign-in) for signed-out visitors.
 */
export function BookmarkButton({
  entityType,
  entityId,
  title,
  slug,
}: {
  entityType: "guide" | "news";
  entityId: string;
  title?: string;
  slug?: string;
}) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      const res = await fetch(
        `/api/bookmarks?entityType=${entityType}&entityId=${entityId}`
      );
      const json = await res.json().catch(() => ({}));
      if (!cancelled) setSaved(Boolean(json.bookmarked));
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  async function toggle() {
    if (!authed) {
      window.location.href = "/login";
      return;
    }
    setBusy(true);
    if (saved) {
      await fetch(`/api/bookmarks?entityType=${entityType}&entityId=${entityId}`, {
        method: "DELETE",
      });
      setSaved(false);
    } else {
      await fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, title, slug }),
      });
      setSaved(true);
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
        saved
          ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
          : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
      }`}
    >
      {saved ? (
        <>
          <BookmarkCheck className="h-4 w-4" /> Saved
        </>
      ) : (
        <>
          <Bookmark className="h-4 w-4" /> Save
        </>
      )}
    </button>
  );
}
