"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_FILES,
  selectUploadableFiles,
  rejectionMessage,
} from "@/lib/media/upload-limits";

/**
 * Upload photos/videos for a venue. Files go to the `media` storage bucket
 * under the user's own folder, then a `media` row is registered as PENDING —
 * nothing shows publicly until an admin approves it. Limits are props so the
 * community "Add your photos" flow can be images-only with its own caps (Part 5).
 */
export function MediaUpload({
  restaurantId,
  source = "upload",
  label = "Add photos",
  onUploaded,
  maxFiles = DEFAULT_MAX_FILES,
  maxBytes = DEFAULT_MAX_BYTES,
  imagesOnly = false,
}: {
  restaurantId: string;
  source?: string;
  label?: string;
  onUploaded?: (count: number) => void;
  maxFiles?: number;
  maxBytes?: number;
  imagesOnly?: boolean;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  // Rights/ownership attestation (Prompt 4) — must be ticked before uploading; the
  // server also requires it, so this is a UX gate, not the enforcement.
  const [rights, setRights] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    if (!rights) {
      setError("Please confirm you own these photos or have the right to post them.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
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

    // Enforce the count / type / size caps up front (pure, shared with the server rail).
    const sel = selectUploadableFiles(files, { maxFiles, maxBytes, imagesOnly });
    const skipped = rejectionMessage(sel, maxFiles);
    if (skipped) setError(skipped);
    if (!sel.accepted.length) {
      setBusy(false);
      return;
    }

    let count = 0;
    for (const file of sel.accepted) {
      const isVideo = file.type.startsWith("video/");
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
          rightsAttested: true,
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
        accept={imagesOnly ? "image/*" : "image/*,video/*"}
        multiple
        onChange={onChange}
        className="hidden"
        id={`media-${restaurantId}`}
      />
      <label className="mb-2 flex items-start gap-2 text-xs text-text-secondary">
        <input
          type="checkbox"
          checked={rights}
          onChange={(e) => setRights(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brand-gold"
        />
        <span>I own these {imagesOnly ? "photos" : "photos/videos"} or have the right to post them, and they contain no explicit or unsafe content.</span>
      </label>
      <label
        htmlFor={`media-${restaurantId}`}
        aria-disabled={!rights || busy}
        className={`inline-flex items-center gap-2 rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold ${
          busy || !rights ? "pointer-events-none opacity-60" : "cursor-pointer"
        }`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {busy ? "Uploading…" : label}
      </label>
      {msg && <p className="mt-2 text-xs text-brand-gold">{msg}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <p className="mt-1.5 text-[0.6875rem] text-text-muted">
        Up to {maxFiles} {imagesOnly ? "photos" : "photos & videos"} ({Math.round(maxBytes / (1024 * 1024))}MB each) · reviewed before they appear.
      </p>
    </div>
  );
}
