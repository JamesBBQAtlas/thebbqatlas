"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShieldCheck, Loader2 } from "lucide-react";

/**
 * Two-factor step-up challenge. Reached after a successful first-factor login
 * when the account has a verified TOTP factor (aal1 → aal2). The user must enter
 * a valid 6-digit code before we forward them to their destination. Verifying
 * upgrades the session to aal2.
 */
export function MfaChallenge({ next }: { next: string }) {
  const [supabase] = useState(() => createClient());
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      // Already stepped up? Don't re-challenge.
      const { data: aal } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        window.location.href = next;
        return;
      }
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp =
        factors?.totp?.find((f) => f.status === "verified") ?? factors?.totp?.[0];
      if (!totp) {
        // No factor to challenge (shouldn't happen on this path) — move along.
        window.location.href = next;
        return;
      }
      if (active) {
        setFactorId(totp.id);
        setReady(true);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!factorId || !/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (chErr || !ch) throw chErr ?? new Error("challenge failed");
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: trimmed,
      });
      if (vErr) {
        setError("That code didn't match. Please try again.");
        setBusy(false);
        return;
      }
      // Session is now aal2.
      window.location.href = next;
    } catch {
      setError("Something went wrong — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-0 p-8 shadow-xl">
      <div className="mb-6 text-center">
        <ShieldCheck className="mx-auto mb-2 h-7 w-7 text-brand-gold" />
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Two-factor verification
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Enter the 6-digit code from your authenticator app to finish signing
          in.
        </p>
      </div>

      {!ready ? (
        <div className="flex items-center justify-center py-6 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <div>
            <label htmlFor="mfa-code" className="sr-only">
              Authentication code
            </label>
            <input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              className="w-full rounded-md border border-border-default bg-surface-1 px-3 py-3 text-center text-lg tracking-[0.5em] text-text-primary placeholder:text-text-muted focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}
    </div>
  );
}
