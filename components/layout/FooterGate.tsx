"use client";

import { usePathname } from "@/i18n/navigation";

/**
 * Hides the site footer on the full-screen map routes so the map reads as a
 * true app-style screen (no scroll-to-footer below it). Everywhere else the
 * footer renders normally. Footer is passed in as children so it can stay a
 * server component.
 */
export function FooterGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname === "/map" || pathname.startsWith("/profile/map");
  if (isMap) return null;
  return <>{children}</>;
}
