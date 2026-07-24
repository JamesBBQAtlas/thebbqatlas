"use client";

import { useState } from "react";
import Image from "next/image";
import { MapPinCheckInside, ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";

export interface VenueVisitorRow {
  username: string | null;
  note: string | null;
  createdAt: string;
  avatarUrl: string | null;
  initial: string;
  badgeClass: string;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * "X members have been here" — the visit count IS the control: collapsed by
 * default, it expands to the roster of members who made their check-in public
 * (credited by @username). `total` counts every visit (public + private); only
 * public ones are listed, and the remainder is noted honestly.
 */
export function VenueVisitors({
  total,
  visitors,
}: {
  total: number;
  visitors: VenueVisitorRow[];
}) {
  const [open, setOpen] = useState(false);

  // `total` (all check-ins incl. private) can under-report if the metrics count
  // is unavailable, so never show fewer than the public visitors we actually
  // have. Both zero → nothing to show.
  const publicCount = visitors.length;
  const shown = Math.max(total, publicCount);
  if (shown <= 0) return null;

  const remainder = Math.max(0, shown - publicCount);
  const label = `${shown.toLocaleString()} ${shown === 1 ? "member has" : "members have"} been here`;

  return (
    <section className="mb-12">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 border-b border-border-subtle pb-3 text-left transition-colors hover:border-border-default"
      >
        <span className="flex items-center gap-2 font-heading text-xl font-bold text-text-primary">
          <MapPinCheckInside className="h-5 w-5 text-brand-sienna" />
          {label}
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-4">
          {publicCount === 0 ? (
            <p className="rounded-lg border border-border-subtle bg-surface-0 p-4 text-sm text-text-muted">
              Everyone who&apos;s checked in here kept their visit private.
            </p>
          ) : (
            <ul className="space-y-3">
              {visitors.map((v, i) => {
                const name = v.username ? `@${v.username}` : "A BBQ Atlas member";
                return (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-0 p-4"
                  >
                    {v.avatarUrl ? (
                      <Image
                        src={v.avatarUrl}
                        alt={name}
                        width={36}
                        height={36}
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold ${v.badgeClass}`}
                      >
                        {v.initial}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        {v.username ? (
                          <Link
                            href={`/u/${v.username}`}
                            className="font-semibold text-text-primary transition-colors hover:text-brand-gold"
                          >
                            {name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-text-primary">
                            {name}
                          </span>
                        )}
                        <span className="text-xs text-text-muted">
                          · {fmtDate(v.createdAt)}
                        </span>
                      </div>
                      {v.note && (
                        <p className="mt-1 text-sm italic text-text-secondary">
                          &ldquo;{v.note}&rdquo;
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {remainder > 0 && publicCount > 0 && (
            <p className="mt-3 text-sm text-text-muted">
              + {remainder.toLocaleString()} more{" "}
              {remainder === 1 ? "member has" : "members have"} checked in here.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
