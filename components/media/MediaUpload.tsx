"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB
const MAX_FILES = 5;

/**
 * Upload photos/videos for a venue. Files go to the `media` storage bucket
 * under the user's own folder, then a `media` row is registered as PENDING —
 * nothing shows publicly until an admin approves it.
 */
export function MediaUpload({
  restaurantId,
  source = "upload",
  label = "Add photos",
  onUploaded,
}: {
  restaurantId: string;
  source?: string;
  label?: string;
  onUploaded?: (count: number) => void;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setError("");
    setMsg("");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Please sign in to add photos.");
      setBusy(false);
      return;
    }

    let count = 0;
    for (const file of files.slice(0, MAX_FILES)) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) continue;
      if (file.size > MAX_BYTES) {
        setError("Each file must be under 25MB.");
        continue;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() || (isVideo ? "mp4" : "jpg");
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        continue;
      }
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      const res = await fetch("/api/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
          url: pub.publicUrl,
          kind: isVideo ? "video" : "image",
          restaurantId,
          source,
        }),
      });
      if (res.ok) count++;
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (count > 0) {
      setMsg(`Thanks! ${count} ${count === 1 ? "file" : "files"} sent for review.`);
      onUploaded?.(count);
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={onChange}
        className="hidden"
        id={`media-${restaurantId}`}
      />
      <label
        htmlFor={`media-${restaurantId}`}
        className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {busy ? "Uploading…" : label}
      </label>
      {msg && <p className="mt-2 text-xs text-brand-gold">{msg}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <p className="mt-1.5 text-[0.6875rem] text-text-muted">
        Photos &amp; videos are reviewed before they appear.
      </p>
    </div>
  );
}
