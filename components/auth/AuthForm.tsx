"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MARKETING_CONSENT_TEXT } from "@/lib/email/consent";

type AuthMode = "login" | "signup" | "magic";

const inputCls =
  "w-full rounded-md border border-border-default bg-surface-1 px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20";

export function AuthForm({ mode: initialMode = "login" }: { mode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const title =
    mode === "signup" ? "Create your account" : mode === "magic" ? "Magic link" : "Welcome back";
  const subtitle =
    mode === "signup"
      ? "Save spots, submit venues, and make the Atlas yours."
      : mode === "magic"
        ? "We'll email you a one-tap sign-in link."
        : "Sign in to your BBQ Atlas.";

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            marketing_opt_in: marketingOptIn,
            marketing_opt_in_text: MARKETING_CONSENT_TEXT,
          },
        },
      });
      if (error) {
        setMessage(error.message);
      } else if (data.session) {
        // No email confirmation required — session is live now.
        await fetch("/api/account/post-signup", { method: "POST" }).catch(() => {});
        window.location.href = "/profile";
      } else {
        setMessage("Check your email to confirm your account.");
      }
    } else if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setMessage(error ? error.message : "Magic link sent — check your email.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else window.location.href = "/profile";
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-0 p-8 shadow-xl">
      <div className="mb-6 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">{title}</h1>
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      </div>

      <form onSubmit={handleEmailAuth} className="space-y-4">
        <div>
          <label htmlFor="email" className="u-eyebrow mb-1.5 block text-[0.6875rem] text-text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className={inputCls}
          />
        </div>
        {mode !== "magic" && (
          <div>
            <label htmlFor="password" className="u-eyebrow mb-1.5 block text-[0.6875rem] text-text-muted">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className={inputCls}
            />
          </div>
        )}
        {mode === "signup" && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border-subtle bg-surface-1 p-3">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-brand-gold"
            />
            <span className="text-xs leading-relaxed text-text-secondary">
              {MARKETING_CONSENT_TEXT}
            </span>
          </label>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {loading
            ? "Please wait…"
            : mode === "signup"
              ? "Sign up"
              : mode === "magic"
                ? "Send magic link"
                : "Sign in"}
        </button>
      </form>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-surface-0 px-2 text-text-muted">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="w-full rounded-md border border-border-default px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong"
      >
        Continue with Google
      </button>

      <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm text-text-muted">
        {mode !== "login" && (
          <button type="button" onClick={() => setMode("login")} className="hover:text-brand-gold">
            Sign in
          </button>
        )}
        {mode !== "signup" && (
          <button type="button" onClick={() => setMode("signup")} className="hover:text-brand-gold">
            Create account
          </button>
        )}
        {mode !== "magic" && (
          <button type="button" onClick={() => setMode("magic")} className="hover:text-brand-gold">
            Magic link
          </button>
        )}
      </div>

      {message && (
        <p className="mt-4 rounded-md border border-border-subtle bg-surface-1 px-3 py-2 text-center text-sm text-text-secondary">
          {message}
        </p>
      )}
    </div>
  );
}
