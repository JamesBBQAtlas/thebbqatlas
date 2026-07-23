"use client";

import { useEffect, useState } from "react";
import { Mail, KeyRound, Link2, Check, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Msg = { ok: boolean; text: string } | null;

const PROVIDER_LABEL: Record<string, string> = {
  email: "Email & password",
  google: "Google",
};

const inputCls =
  "w-full rounded-md border border-border-default bg-surface-1 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20";

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p
      role="status"
      className={`mt-2 flex items-start gap-1.5 text-xs ${
        msg.ok ? "text-green-400" : "text-destructive"
      }`}
    >
      {msg.ok ? (
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <span>{msg.text}</span>
    </p>
  );
}

/**
 * Account management: linked sign-in methods, change email (branded Supabase
 * confirm flow), and change/set password (works for Google-only accounts too —
 * setting a password additionally enables email sign-in).
 */
export function AccountManagement({ currentEmail }: { currentEmail: string }) {
  const [supabase] = useState(() => createClient());
  const [providers, setProviders] = useState<string[] | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    supabase.auth
      .getUserIdentities()
      .then(({ data }) =>
        setProviders((data?.identities ?? []).map((i) => i.provider))
      )
      .catch(() => setProviders([]));
  }, [supabase]);

  const hasPassword = (providers ?? []).includes("email");
  const googleOnly =
    (providers ?? []).includes("google") && !hasPassword;

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const t = newEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) {
      setEmailMsg({ ok: false, text: "Please enter a valid email address." });
      return;
    }
    if (t === currentEmail.toLowerCase()) {
      setEmailMsg({ ok: false, text: "That's already your email address." });
      return;
    }
    setEmailBusy(true);
    setEmailMsg(null);
    const { error } = await supabase.auth.updateUser(
      { email: t },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/profile/settings` }
    );
    setEmailBusy(false);
    if (error) setEmailMsg({ ok: false, text: error.message });
    else {
      setEmailMsg({
        ok: true,
        text: `We've sent a confirmation link to ${t}. Click it to finish changing your email (you may also get a heads-up at your current address).`,
      });
      setNewEmail("");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) {
      setPwMsg({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    if (pw !== pw2) {
      setPwMsg({ ok: false, text: "Those passwords don't match." });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) setPwMsg({ ok: false, text: error.message });
    else {
      setPwMsg({
        ok: true,
        text: hasPassword
          ? "Password updated."
          : "Password set — you can now sign in with your email and password too.",
      });
      setPw("");
      setPw2("");
    }
  }

  return (
    <div className="space-y-6">
      {/* Linked sign-in methods */}
      <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
        <h3 className="mb-1 flex items-center gap-2 font-heading font-bold text-text-primary">
          <Link2 className="h-4 w-4 text-brand-gold" /> Sign-in methods
        </h3>
        <p className="mb-3 text-sm text-text-muted">
          How your account can sign in.
        </p>
        {providers === null ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : providers.length === 0 ? (
          <p className="text-sm text-text-muted">No linked methods found.</p>
        ) : (
          <ul className="space-y-2">
            {providers.map((p) => (
              <li
                key={p}
                className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-sm text-text-secondary"
              >
                <Check className="h-4 w-4 text-brand-gold" />
                {PROVIDER_LABEL[p] ?? p}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Change email */}
      <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
        <h3 className="mb-1 flex items-center gap-2 font-heading font-bold text-text-primary">
          <Mail className="h-4 w-4 text-brand-gold" /> Email address
        </h3>
        <p className="mb-3 text-sm text-text-muted">
          Currently <span className="text-text-secondary">{currentEmail}</span>.
          Changing it sends a confirmation link to the new address.
        </p>
        <form onSubmit={changeEmail} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="new-email" className="sr-only">
            New email address
          </label>
          <input
            id="new-email"
            type="email"
            autoComplete="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@example.com"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={emailBusy || !newEmail.trim()}
            className="shrink-0 rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
          >
            {emailBusy ? "Sending…" : "Change email"}
          </button>
        </form>
        <Note msg={emailMsg} />
      </div>

      {/* Change / set password */}
      <div className="rounded-xl border border-border-subtle bg-surface-0 p-6">
        <h3 className="mb-1 flex items-center gap-2 font-heading font-bold text-text-primary">
          <KeyRound className="h-4 w-4 text-brand-gold" />{" "}
          {hasPassword ? "Change password" : "Set a password"}
        </h3>
        <p className="mb-3 text-sm text-text-muted">
          {googleOnly
            ? "You currently sign in with Google. Set a password to also sign in with your email."
            : "Update the password you use to sign in."}
        </p>
        <form onSubmit={changePassword} className="space-y-2">
          <label htmlFor="new-password" className="sr-only">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            minLength={6}
            placeholder="New password"
            className={inputCls}
          />
          <label htmlFor="new-password-2" className="sr-only">
            Confirm new password
          </label>
          <input
            id="new-password-2"
            type="password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            minLength={6}
            placeholder="Confirm new password"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={pwBusy || pw.length < 6}
            className="rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
          >
            {pwBusy
              ? "Saving…"
              : hasPassword
                ? "Update password"
                : "Set password"}
          </button>
        </form>
        <Note msg={pwMsg} />
      </div>
    </div>
  );
}
