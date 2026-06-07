"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { BRAND } from "@/lib/constants/styles";

const NAV_LINKS = [
  { href: "/map", label: "Map" },
  { href: "/directory", label: "Directory" },
  { href: "/guides", label: "Guides" },
  { href: "/submit", label: "Submit" },
  { href: "/profile", label: "Profile" },
];

export function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-brand-black/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <button
          type="button"
          className="lg:hidden text-white p-2"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <div className="hidden lg:block w-24" />

        <Link href="/" className="flex flex-col items-center gap-1">
          <Image
            src="/logos/crest.jpg"
            alt={BRAND.name}
            width={80}
            height={80}
            className="rounded-full"
            priority
          />
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/80 hover:text-brand-gold transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="lg:hidden w-10" />
      </div>

      <nav
        className={cn(
          "lg:hidden border-t border-white/10 bg-brand-black/95 overflow-hidden transition-all",
          open ? "max-h-96" : "max-h-0"
        )}
      >
        <div className="flex flex-col px-4 py-4 gap-3">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-white/90 hover:text-brand-gold py-2"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}