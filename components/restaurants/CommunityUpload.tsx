"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import { ImagePlus } from "lucide-react";
import { MediaUpload } from "@/components/media/MediaUpload";

/**
 * Auth-gated photo upload for the community gallery (Fable H-1) — resolves the
 * signed-in state client-side so the venue page stays static. Signed-in visitors
 * get the uploader; everyone else gets a sign-in prompt.
 */
export function CommunityUpload({ restaurantId }: { restaurantId: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setAuthed(Boolean(data.session));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (authed === null) return null; // resolving — avoid a flash
  if (authed) {
    return <MediaUpload restaurantId={restaurantId} source="venue" label="Add your photos" />;
  }
  return (
    <Link
      href="/login"
      className="inline-flex items-center gap-2 rounded-md border border-border-default px-4 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
    >
      <ImagePlus className="h-4 w-4" />
      Sign in to add your photos
    </Link>
  );
}
