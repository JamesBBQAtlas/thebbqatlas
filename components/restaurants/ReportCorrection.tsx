"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Wrench, Check } from "lucide-react";

/**
 * "Report a correction or closure" flow on a venue page. Files a pending
 * correction/closure submission that lands in the admin Corrections queue.
 * Built on Radix Dialog for a proper focus trap, Escape-to-close, and
 * aria-modal semantics (F-22).
 */
export function ReportCorrection({
  restaurantId,
  name,
}: {
  restaurantId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"correction" | "closure">("correction");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle"
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < 3) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          submissionType: kind,
          message,
          email,
        }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset the form when the dialog closes.
      setStatus("idle");
      setMessage("");
      setEmail("");
      setKind("correction");
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-text-muted underline-offset-2 transition-colors hover:text-brand-gold hover:underline"
        >
          <Wrench className="h-3.5 w-3.5" />
          See something wrong? Report a correction or closure
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className="fixed inset-x-3 bottom-3 z-[71] mx-auto w-auto max-w-md rounded-xl border border-border-default bg-surface-0 p-6 shadow-2xl focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2"
          aria-describedby="report-desc"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <Dialog.Title className="font-heading text-lg font-bold text-text-primary">
              Report an update
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-11 w-11 place-items-center text-text-muted transition-colors hover:text-text-primary"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {status === "done" ? (
            <div className="py-6 text-center">
              <p id="report-desc" className="sr-only">
                Your report has been submitted.
              </p>
              <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-gold/15">
                <Check className="h-6 w-6 text-brand-gold" />
              </div>
              <p className="font-semibold text-text-primary">Thanks for the tip.</p>
              <p className="mt-1 text-sm text-text-muted">
                Our team will review your report on {name}.
              </p>
              <Dialog.Close className="mt-5 rounded-md bg-brand-gold px-5 py-2 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90">
                Done
              </Dialog.Close>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p id="report-desc" className="sr-only">
                Tell us what needs fixing on {name}, and optionally leave an email
                so we can follow up.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(["correction", "closure"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={
                      "rounded-md border px-3 py-2 text-sm font-semibold capitalize transition-colors " +
                      (kind === k
                        ? "border-brand-gold bg-brand-gold/10 text-brand-gold"
                        : "border-border-default text-text-secondary hover:border-border-strong")
                    }
                  >
                    {k === "closure" ? "Closed / moved" : "Correction"}
                  </button>
                ))}
              </div>

              <div>
                <label
                  htmlFor="report-message"
                  className="u-eyebrow mb-1.5 block text-[0.6875rem] text-text-muted"
                >
                  What needs fixing?
                </label>
                <textarea
                  id="report-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={4}
                  placeholder={
                    kind === "closure"
                      ? "e.g. This spot has permanently closed."
                      : "e.g. The hours are wrong — they open at 11am, not 9am."
                  }
                  className="w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                />
              </div>

              <div>
                <label
                  htmlFor="report-email"
                  className="u-eyebrow mb-1.5 block text-[0.6875rem] text-text-muted"
                >
                  Email (optional)
                </label>
                <input
                  id="report-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="In case we need to follow up"
                  className="w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">
                  Something went wrong — please try again.
                </p>
              )}

              <button
                type="submit"
                disabled={status === "sending" || message.trim().length < 3}
                className="w-full rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
              >
                {status === "sending" ? "Sending…" : "Send report"}
              </button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
