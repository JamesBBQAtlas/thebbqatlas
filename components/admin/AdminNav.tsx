"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

type BadgeKey = "media" | "suggestions" | "pending";

const TABS: { href: string; label: string; badge?: BadgeKey; primary?: boolean }[] = [
  { href: "/admin/venues", label: "Pending Venues" },
  { href: "/admin/media", label: "Media", badge: "media" },
  { href: "/admin/optimize", label: "Self-Healing", badge: "suggestions" },
  { href: "/admin/health", label: "SEO Health" },
  { href: "/admin/audit", label: "Change Log" },
  { href: "/admin/email", label: "Email Log" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/enrich", label: "AI Enrichment" },
  { href: "/admin/team", label: "Team & Roles" },
  { href: "/admin/moderation", label: "Moderation Queue", badge: "pending", primary: true },
];

export function AdminNav({
  counts,
}: {
  counts: { media: number; suggestions: number; pending: number };
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Admin sections" className="flex flex-wrap items-center gap-1.5">
      {TABS.map((t) => {
        const active = isActive(t.href);
        const n = t.badge ? counts[t.badge] : 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md border px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.05em] transition-colors",
              active
                ? "border-brand-gold bg-brand-gold/10 text-brand-gold"
                : t.primary
                  ? "border-brand-gold/70 text-brand-gold hover:bg-brand-gold/10"
                  : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
            )}
          >
            {t.label}
            {n > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-orange px-1.5 py-0.5 text-[0.625rem] font-bold text-white">
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
