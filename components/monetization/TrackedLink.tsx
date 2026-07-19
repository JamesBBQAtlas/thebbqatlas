"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { logClick } from "@/lib/analytics/track";
import type { ClickEventPayload } from "@/lib/analytics/track";

/**
 * A plain outbound link (restaurant website, phone, email, Instagram) that logs
 * a first-party click_event on activation. Non-affiliate — no URL rewriting.
 */
export function TrackedLink({
  href,
  eventType,
  restaurantId,
  children,
  className,
}: {
  href: string;
  eventType: ClickEventPayload["event_type"];
  restaurantId?: string | null;
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const external = /^https?:/i.test(href);

  return (
    <a
      href={href}
      className={className}
      onClick={() =>
        logClick({
          event_type: eventType,
          restaurant_id: restaurantId ?? null,
          target_url: href,
          page_path: pathname,
        })
      }
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer nofollow" }
        : {})}
    >
      {children}
    </a>
  );
}
