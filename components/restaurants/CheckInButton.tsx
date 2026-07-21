"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { MapPinCheckInside, Check, Lock, Globe2, X, Loader2 } from "lucide-react";
import { MediaUpload } from "@/components/media/MediaUpload";
import type { CheckInVisibility } from "@/lib/types/database";

interface Props {
  restaurantId: string;
  restaurantName: string;
  isAuthed: boolean;
  initial: { note: string | null; visibility: CheckInVisibility } | null;
}

export function CheckInButton({
  restaurantId,
  restaurantName,
  isAuthed,
  initial,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checkedIn, setCheckedIn] = useState(Boolean(initial));
  const [note, setNote] = useState(initial?.note ?? "");
  const [visibility, setVisibility] = useState<CheckInVisibility>(
    initial?.visibility ?? "public"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!isAuthed) {
    return (
      <Link
        href="/login"
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-border-default px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
      >
        <MapPinCheckInside className="h-4 w-4" />
        Sign in to check in
      </Link>
    );
  }

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, note, visibility }),
    });
    if (res.ok) {
      setCheckedIn(true);
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save your check-in.");
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/checkins?restaurantId=${restaurantId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setCheckedIn(false);
      setNote("");
      setVisibility("public");
      setOpen(false);
      router.refresh();
    } else {
      setError("Could not remove your check-in.");
    }
    setBusy(false);
  }

  return (
    <>
      {checkedIn ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-brand-gold/50 bg-brand-gold/10 px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.06em] text-brand-gold transition-colors hover:bg-brand-gold/15"
        >
          <Check className="h-4 w-4" />
          You&apos;ve been here
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-sienna px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-sienna/90"
        >
          <MapPinCheckInside className="h-4 w-4" />
          I&apos;ve been here
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border-default bg-surface-0 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-bold text-text-primary">
                  {checkedIn ? "Update your visit" : "Mark your visit"}
                </h3>
                <p className="mt-0.5 text-sm text-text-muted">{restaurantName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Close"
                className="rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
              A note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="What did you eat? How was the smoke?"
              className="w-full resize-none rounded-lg border border-border-default bg-surface-1 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
            />
            <div className="mt-3 rounded-lg border border-border-subtle bg-surface-1 p-3">
              <MediaUpload
                restaurantId={restaurantId}
                source="checkin"
                label="Add photos from your visit"
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  visibility === "public"
                    ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
                    : "border-border-default text-text-secondary hover:border-border-strong"
                }`}
              >
                <Globe2 className="h-4 w-4" /> Public
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                  visibility === "private"
                    ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
                    : "border-border-default text-text-secondary hover:border-border-strong"
                }`}
              >
                <Lock className="h-4 w-4" /> Private
              </button>
            </div>
            <p className="mt-1.5 text-[0.6875rem] text-text-muted">
              {visibility === "public"
                ? "Your note may appear on your public profile. The visit always counts toward this venue's totals."
                : "Only you can see this note. It still counts toward this venue's visit total."}
            </p>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <div className="mt-5 flex items-center justify-between gap-3">
              {checkedIn ? (
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="text-sm font-semibold text-text-muted transition-colors hover:text-destructive disabled:opacity-40"
                >
                  Remove
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {checkedIn ? "Save changes" : "Check in"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
