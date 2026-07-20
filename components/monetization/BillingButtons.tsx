"use client";

import { useState } from "react";
import { Sparkles, CreditCard } from "lucide-react";

async function post(url: string): Promise<{ url?: string; error?: string }> {
  const res = await fetch(url, { method: "POST" });
  return res.json().catch(() => ({ error: "Something went wrong" }));
}

export function PremiumUpgradeButton({
  label = "Go Premium",
  className,
}: {
  label?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true);
    setError("");
    const data = await post("/api/stripe/checkout");
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error || "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className={
          className ??
          "inline-flex items-center gap-2 rounded-md bg-brand-gold px-6 py-3 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        }
      >
        <Sparkles className="h-4 w-4" />
        {loading ? "Redirecting…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true);
    setError("");
    const data = await post("/api/stripe/portal");
    if (data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error || "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md border border-border-default px-4 py-2 text-sm font-semibold uppercase tracking-[0.06em] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:opacity-40"
      >
        <CreditCard className="h-4 w-4" />
        {loading ? "Opening…" : "Manage billing"}
      </button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
