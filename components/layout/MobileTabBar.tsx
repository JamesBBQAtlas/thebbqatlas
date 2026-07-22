"use client";

import { Map, Compass, BookOpen, PlusCircle, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils/cn";

const TABS: { href: string; key: string; icon: LucideIcon }[] = [
  { href: "/map", key: "map", icon: Map },
  { href: "/directory", key: "directory", icon: Compass },
  { href: "/guides", key: "guides", icon: BookOpen },
  { href: "/submit", key: "submit", icon: PlusCircle },
  { href: "/profile", key: "myAtlas", icon: User },
];

/**
 * App-style persistent bottom navigation for phones/tablets. Hidden at lg+
 * (desktop uses the header nav). Sits above content with a blurred warm-dark
 * bar and honours the home-indicator inset via safe-area padding.
 */
export function MobileTabBar() {
  const t = useTranslations("Nav");
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/profile"
      ? pathname === href || pathname.startsWith(`${href}/`)
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-border-default/50 bg-background/85 backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-[0.625rem] font-semibold uppercase tracking-[0.06em] transition-colors",
                  active
                    ? "text-brand-gold"
                    : "text-text-muted hover:text-text-secondary active:text-text-secondary"
                )}
              >
                <Icon
                  className={cn("h-[1.35rem] w-[1.35rem]", active && "drop-shadow-[0_0_6px_rgba(212,175,55,0.45)]")}
                  strokeWidth={active ? 2.4 : 1.9}
                />
                <span className="leading-none">{t(key)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
