"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/map", key: "map" },
  { href: "/directory", key: "directory" },
  { href: "/guides", key: "guides" },
  { href: "/news", key: "news" },
  { href: "/gear", key: "gear" },
  { href: "/submit", key: "submit" },
] as const;

export function Header() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="safe-top sticky top-0 z-50 w-full border-b border-border-default/40 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Logo lockup */}
        <Link
          href="/"
          aria-label="The BBQ Atlas — home"
          className="group flex shrink-0 items-center gap-2.5"
        >
          <Image
            src="/logos/crest-emblem.png"
            alt=""
            width={44}
            height={44}
            priority
            className="h-9 w-9 object-contain transition-transform duration-200 group-hover:scale-[1.04] [filter:drop-shadow(0_2px_5px_rgba(0,0,0,0.55))] sm:h-10 sm:w-10"
          />
          <span className="font-heading text-xl font-bold uppercase tracking-[0.06em] text-text-primary transition-colors duration-200 group-hover:text-brand-gold sm:text-[1.4rem]">
            The BBQ Atlas
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative py-1 text-sm font-semibold uppercase tracking-[0.08em] transition-colors duration-200",
                  active
                    ? "text-brand-gold"
                    : "text-text-secondary hover:text-text-primary"
                )}
              >
                {t(item.key)}
                {active && (
                  <span className="absolute -bottom-[6px] left-0 right-0 h-[2px] rounded-full bg-brand-gold" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* CTA + mobile toggle */}
        <div className="flex items-center gap-2">
          <Link
            href="/profile"
            className="hidden rounded-md border-[1.5px] border-brand-gold px-5 py-2 text-sm font-semibold uppercase tracking-[0.06em] text-brand-gold transition-colors duration-200 hover:bg-brand-gold hover:text-text-inverse lg:inline-block"
          >
            {t("myAtlas")}
          </Link>
          <button
            type="button"
            className="p-2 text-text-primary lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label={open ? t("close") : t("menu")}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <nav
        className={cn(
          "overflow-hidden border-t border-border-subtle bg-surface-0/95 backdrop-blur-xl transition-[max-height] duration-300 lg:hidden",
          open ? "max-h-96" : "max-h-0"
        )}
      >
        <div className="flex flex-col gap-1 px-4 py-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-md px-3 py-3 text-sm font-semibold uppercase tracking-[0.08em] transition-colors",
                isActive(item.href)
                  ? "bg-surface-2 text-brand-gold"
                  : "text-text-secondary hover:bg-surface-1 hover:text-text-primary"
              )}
            >
              {t(item.key)}
            </Link>
          ))}
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="mt-2 rounded-md border-[1.5px] border-brand-gold px-3 py-3 text-center text-sm font-semibold uppercase tracking-[0.06em] text-brand-gold"
          >
            {t("myAtlas")}
          </Link>
        </div>
      </nav>
    </header>
  );
}
