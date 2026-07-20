"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Store, ShoppingBag, Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ClaimVenue = {
  id: string;
  name: string;
  city: string;
  country: string;
  slug: string;
};

export type ExistingClaim = {
  restaurantName: string;
  role: string;
  status: string;
};

export function ClaimForm({
  venues,
  existingClaims,
  presetSlug,
  defaultEmail,
}: {
  venues: ClaimVenue[];
  existingClaims: ExistingClaim[];
  presetSlug?: string;
  defaultEmail?: string;
}) {
  const router = useRouter();
  const preset = presetSlug ? venues.find((v) => v.slug === presetSlug) : undefined;

  const [role, setRole] = useState<"owner" | "seller">("owner");
  const [query, setQuery] = useState(preset ? preset.name : "");
  const [selected, setSelected] = useState<ClaimVenue | null>(preset ?? null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && selected.name === query)) return [];
    return venues
      .filter((v) =>
        `${v.name} ${v.city} ${v.country}`.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [query, venues, selected]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: selected.id,
          roleRequested: role,
          note,
          email,
        }),
      });
      if (res.ok) {
        setStatus("done");
        router.refresh();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-xl border border-border-default bg-surface-0 p-8 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-gold/15">
          <Check className="h-6 w-6 text-brand-gold" />
        </div>
        <h3 className="font-heading text-xl font-bold text-text-primary">
          Claim submitted
        </h3>
        <p className="mt-1 text-text-muted">
          We&apos;ll verify your connection to {selected?.name} and get back to you.
          You can track it in your{" "}
          <a href="/profile" className="text-brand-gold hover:underline">
            My Atlas
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border-subtle bg-surface-0 p-6 sm:p-8"
    >
      {existingClaims.length > 0 && (
        <div className="mb-6 rounded-lg border border-border-subtle bg-surface-1 p-4">
          <p className="u-eyebrow mb-2 text-text-muted">Your claims</p>
          <ul className="space-y-1.5">
            {existingClaims.map((c, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{c.restaurantName}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em]",
                    c.status === "approved"
                      ? "bg-brand-gold/15 text-brand-gold"
                      : c.status === "rejected"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-surface-2 text-text-muted"
                  )}
                >
                  {c.role} · {c.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Role */}
      <p className="u-eyebrow mb-2 text-text-muted">I am a…</p>
      <div className="mb-6 grid grid-cols-2 gap-3">
        {(
          [
            { key: "owner", label: "Venue owner", icon: Store, hint: "A restaurant, food truck or pit" },
            { key: "seller", label: "Seller", icon: ShoppingBag, hint: "Gear, rubs, sauces & retail" },
          ] as const
        ).map(({ key, label, icon: Icon, hint }) => (
          <button
            key={key}
            type="button"
            onClick={() => setRole(key)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
              role === key
                ? "border-brand-gold bg-brand-gold/10"
                : "border-border-default hover:border-border-strong"
            )}
          >
            <Icon className={cn("h-5 w-5", role === key ? "text-brand-gold" : "text-text-muted")} />
            <span className="font-semibold text-text-primary">{label}</span>
            <span className="text-xs text-text-muted">{hint}</span>
          </button>
        ))}
      </div>

      {/* Venue picker */}
      <label className="u-eyebrow mb-2 block text-text-muted">Which venue?</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Search your venue by name or city"
          className="w-full rounded-md border border-border-default bg-surface-1 py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
        />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border-default bg-surface-1 shadow-xl">
            {matches.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(v);
                    setQuery(v.name);
                  }}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-2"
                >
                  <span className="text-sm font-medium text-text-primary">{v.name}</span>
                  <span className="text-xs text-text-muted">
                    {[v.city, v.country].filter(Boolean).join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Not listed yet?{" "}
        <a href="/submit" className="text-brand-gold hover:underline">
          Submit your venue first
        </a>
        .
      </p>

      <label className="u-eyebrow mb-2 mt-6 block text-text-muted">
        Anything to help us verify? (optional)
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="e.g. I'm the owner — here's our website / socials."
        className="w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
      />

      <label className="u-eyebrow mb-2 mt-4 block text-text-muted">Contact email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@business.com"
        className="w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-brand-gold/20"
      />

      {status === "error" && (
        <p className="mt-4 text-sm text-destructive">
          Something went wrong — please try again.
        </p>
      )}

      <button
        type="submit"
        disabled={!selected || status === "sending"}
        className="mt-6 w-full rounded-md bg-brand-gold px-4 py-3 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
      >
        {status === "sending" ? "Submitting…" : "Submit claim"}
      </button>
    </form>
  );
}
