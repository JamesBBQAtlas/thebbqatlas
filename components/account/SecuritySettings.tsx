"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Phase = "loading" | "off" | "enrolling" | "on";

/**
 * Two-factor authentication (TOTP / authenticator app) management via Supabase
 * MFA. Enrol -> scan QR -> verify 6-digit code -> on. Disable removes factors.
 */
export function SecuritySettings() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const supabase = createClient();

  const refresh = useCallback(async () => {
    const { data, error: e } = await supabase.auth.mfa.listFactors();
    if (e) {
      setPhase("off");
      return;
    }
    const verified = (data?.totp ?? []).some((f) => f.status === "verified");
    setPhase(verified ? "on" : "off");
  }, [supabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function startEnroll() {
    setBusy(true);
    setError("");
    try {
      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (e || !data) throw e ?? new Error("Could not start enrolment");
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setPhase("enrolling");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start 2FA");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError("");
    try {
      const { data: ch, error: ce } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (ce || !ch) throw ce ?? new Error("Challenge failed");
      const { error: ve } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (ve) throw ve;
      setQr(null);
      setSecret(null);
      setCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      for (const f of data?.totp ?? []) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable 2FA");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
      <div className="flex items-center gap-3">
        {phase === "on" ? (
          <ShieldCheck className="h-6 w-6 text-brand-gold" />
        ) : (
          <ShieldAlert className="h-6 w-6 text-text-muted" />
        )}
        <div>
          <h3 className="font-heading font-bold text-text-primary">
            Two-factor authentication
          </h3>
          <p className="text-sm text-text-muted">
            {phase === "on"
              ? "Enabled — your account is protected with an authenticator app."
              : "Add a second step at sign-in with an authenticator app."}
          </p>
        </div>
      </div>

      {phase === "loading" && (
        <Loader2 className="mt-4 h-5 w-5 animate-spin text-text-muted" />
      )}

      {phase === "off" && (
        <button
          type="button"
          onClick={startEnroll}
          disabled={busy}
          className="mt-4 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy ? "Please wait…" : "Enable 2FA"}
        </button>
      )}

      {phase === "enrolling" && (
        <div className="mt-5">
          <p className="text-sm text-text-secondary">
            Scan this with your authenticator app (or enter the key manually),
            then type the 6-digit code.
          </p>
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt="2FA QR code"
              className="mt-3 h-40 w-40 rounded-lg bg-white p-2"
            />
          )}
          {secret && (
            <p className="mt-2 break-all font-mono text-xs text-text-muted">
              {secret}
            </p>
          )}
          <form onSubmit={verify} className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              className="w-32 rounded-md border border-border-default bg-surface-1 px-3 py-2 text-center text-sm tracking-[0.3em] text-text-primary focus:border-border-strong focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
            >
              Verify
            </button>
          </form>
        </div>
      )}

      {phase === "on" && (
        <button
          type="button"
          onClick={disable}
          disabled={busy}
          className="mt-4 rounded-md border border-border-default px-4 py-2 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
        >
          {busy ? "Please wait…" : "Disable 2FA"}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      <p className="mt-4 border-t border-border-subtle pt-3 text-xs text-text-muted">
        Passkeys (fingerprint / Face ID sign-in) are coming soon.
      </p>
    </div>
  );
}
