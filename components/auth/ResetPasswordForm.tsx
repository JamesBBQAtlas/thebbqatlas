"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, CircleCheck, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const inputCls =
  "w-full rounded-md border border-border-default bg-surface-1 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20";

/**
 * Set a new password after following a reset link. The recovery session is
 * established by /auth/callback (from the email link), so on arrival the user is
 * authenticated and can updateUser({ password }). If there's no session the link
 * was invalid/expired.
 */
export function ResetPasswordForm() {
  const [supabase] = useState(() => createClient());
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => setState(data.user ? "ready" : "invalid"))
      .catch(() => setState("invalid"));
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (pw !== pw2) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setError(error.message);
    else setDone(true);
  }

  if (state === "checking") {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface-0 p-8 text-center shadow-xl">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (state === "invalid") {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface-0 p-8 text-center shadow-xl">
        <AlertTriangle className="mx-auto mb-3 h-7 w-7 text-brand-sienna-light" />
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Link expired
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          This password-reset link is invalid or has expired. Request a fresh one
          from the sign-in screen.
        </p>
        <a
          href="/login"
          className="mt-6 inline-flex rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-surface-0 p-8 text-center shadow-xl">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-brand-gold/15">
          <CircleCheck className="h-7 w-7 text-brand-gold" />
        </div>
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Password updated
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          You&apos;re all set — your new password is ready to use.
        </p>
        <a
          href="/profile"
          className="mt-6 inline-flex rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90"
        >
          Go to My Atlas
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-0 p-8 shadow-xl">
      <div className="mb-6 text-center">
        <KeyRound className="mx-auto mb-2 h-7 w-7 text-brand-gold" />
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Choose a new password for your account.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-pw" className="sr-only">
            New password
          </label>
          <input
            id="new-pw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
            minLength={6}
            placeholder="New password"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="new-pw2" className="sr-only">
            Confirm new password
          </label>
          <input
            id="new-pw2"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            required
            minLength={6}
            placeholder="Confirm new password"
            className={inputCls}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || pw.length < 6}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
