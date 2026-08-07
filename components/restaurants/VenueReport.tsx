"use client";

import { useEffect, useState } from "react";
import { Eye, Globe, Phone, MapPin, Instagram, Bookmark, Users, Search, TrendingUp, TrendingDown } from "lucide-react";

interface Metric {
  cur: number;
  prev: number;
}
interface Report {
  window_days: number;
  views: Metric;
  search: Metric;
  checkins: Metric;
  saves: Metric;
  website: Metric;
  phone: Metric;
  directions: Metric;
  instagram: Metric;
  shares: Metric;
}

const TILES: { key: keyof Report; label: string; Icon: typeof Eye }[] = [
  { key: "views", label: "Profile views", Icon: Eye },
  { key: "search", label: "Search appearances", Icon: Search },
  { key: "website", label: "Website clicks", Icon: Globe },
  { key: "directions", label: "Directions", Icon: MapPin },
  { key: "phone", label: "Phone taps", Icon: Phone },
  { key: "instagram", label: "Instagram", Icon: Instagram },
  { key: "saves", label: "Saves", Icon: Bookmark },
  { key: "checkins", label: "Check-ins", Icon: Users },
];

function Delta({ cur, prev }: Metric) {
  if (prev === 0 && cur === 0) return null;
  const diff = cur - prev;
  if (diff === 0) return <span className="text-[0.625rem] text-text-muted">no change</span>;
  const up = diff > 0;
  const pct = prev === 0 ? null : Math.round((diff / prev) * 100);
  return (
    <span className={`inline-flex items-center gap-0.5 text-[0.625rem] font-semibold ${up ? "text-emerald-400" : "text-destructive"}`}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{diff}
      {pct !== null ? ` (${up ? "+" : ""}${pct}%)` : ""}
    </span>
  );
}

/**
 * Owner-only venue report (Phase 5.2). Fetches the last-30-days metrics after
 * hydration; renders nothing for non-owners (the API 403s). The "N discovered
 * you" headline is the outreach/renewal hook.
 */
export function VenueReport({ restaurantId }: { restaurantId: string }) {
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");

  useEffect(() => {
    let live = true;
    fetch(`/api/venues/report?restaurantId=${restaurantId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!live) return;
        if (d?.report) {
          setReport(d.report as Report);
          setState("ok");
        } else setState("hidden");
      })
      .catch(() => live && setState("hidden"));
    return () => {
      live = false;
    };
  }, [restaurantId]);

  if (state !== "ok" || !report) return null;

  return (
    <section className="mt-8 rounded-xl border border-border-subtle bg-surface-0 p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.05em] text-brand-gold">
          Owner
        </span>
        <h2 className="font-heading text-lg font-bold text-text-primary">Your venue report</h2>
      </div>
      <p className="mb-4 text-sm text-text-secondary">
        <strong className="text-text-primary">{report.views.cur}</strong> people discovered you on
        The BBQ Atlas in the last {report.window_days} days
        {report.directions.cur > 0 ? ` — ${report.directions.cur} tapped directions` : ""}.
        <span className="text-text-muted"> Compared with the previous {report.window_days} days.</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TILES.map(({ key, label, Icon }) => {
          const m = report[key] as Metric;
          return (
            <div key={key} className="rounded-lg border border-border-subtle bg-surface-1 p-3">
              <Icon className="h-4 w-4 text-brand-gold/70" aria-hidden />
              <p className="mt-1.5 text-xl font-bold tabular-nums text-text-primary">{m.cur}</p>
              <p className="text-[0.6875rem] text-text-muted">{label}</p>
              <div className="mt-0.5">
                <Delta cur={m.cur} prev={m.prev} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
