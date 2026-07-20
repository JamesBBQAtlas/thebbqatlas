"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, Check } from "lucide-react";

export function UsernameForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus("saved");
        router.refresh();
      } else {
        setStatus("error");
        setError(data.error ?? "Could not save username.");
      }
    } catch {
      setStatus("error");
      setError("Could not save username.");
    }
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <label className="u-eyebrow block text-[0.6875rem] text-text-muted">
        Username
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setStatus("idle");
            }}
            placeholder="pitmaster_jane"
            autoComplete="username"
            maxLength={20}
            className="w-full rounded-md border border-border-default bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
          />
        </div>
        <button
          type="submit"
          disabled={status === "saving"}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {status === "saved" ? <Check className="h-4 w-4" /> : "Save"}
        </button>
      </div>
      <p className="text-xs text-text-muted">
        3–20 letters, numbers or underscores. Used for your public profile.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
