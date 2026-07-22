import {
  UtensilsCrossed,
  Truck,
  Store,
  ShoppingBasket,
  CalendarDays,
  PartyPopper,
  GraduationCap,
  ChefHat,
  type LucideIcon,
} from "lucide-react";
import type { MapItemCategory } from "@/lib/types/database";

export const CATEGORY_LABELS: Record<MapItemCategory, string> = {
  restaurant: "Restaurant",
  food_truck: "Food Truck",
  retailer: "Shop",
  market: "Market",
  event: "Event",
  festival: "Festival",
  school: "Cooking School",
  caterer: "Caterer",
};

/** Plural labels for headings/filters. */
export const CATEGORY_LABELS_PLURAL: Record<MapItemCategory, string> = {
  restaurant: "Restaurants",
  food_truck: "Food Trucks",
  retailer: "Shops",
  market: "Markets",
  event: "Events",
  festival: "Festivals",
  school: "Cooking Schools",
  caterer: "Caterers",
};

export const CATEGORY_COLORS: Record<MapItemCategory, string> = {
  restaurant: "#C4622D",
  food_truck: "#E0A458",
  retailer: "#6BA3C4",
  market: "#8FB56B",
  event: "#D4AF37",
  festival: "#E86A5C",
  school: "#9B8CC4",
  caterer: "#6BC4A3",
};

export const CATEGORY_ICONS: Record<MapItemCategory, LucideIcon> = {
  restaurant: UtensilsCrossed,
  food_truck: Truck,
  retailer: Store,
  market: ShoppingBasket,
  event: CalendarDays,
  festival: PartyPopper,
  school: GraduationCap,
  caterer: ChefHat,
};

export const CATEGORY_ORDER: MapItemCategory[] = [
  "restaurant",
  "food_truck",
  "caterer",
  "retailer",
  "market",
  "event",
  "festival",
  "school",
];

/** Event & festival are time-based (they have start/end dates and can expire). */
export function isTimeBased(c: MapItemCategory | undefined | null): boolean {
  return c === "event" || c === "festival";
}

export type EventStatus = "upcoming" | "ongoing" | "past";

/** Where an event sits relative to now. Null if it isn't dated. */
export function eventStatus(
  startsAt?: string | null,
  endsAt?: string | null
): EventStatus | null {
  if (!startsAt && !endsAt) return null;
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const start = startsAt ? new Date(startsAt).getTime() : null;
  const rawEnd = endsAt ? new Date(endsAt).getTime() : start;
  // Event dates are typically date-only (parsed as midnight). Treat the end as
  // end-of-day (+24h) so an event stays "ongoing" through its final day rather
  // than flipping to "past" at 00:00 that morning (F-10 off-by-one).
  const end = rawEnd !== null ? rawEnd + DAY : null;
  if (start && now < start) return "upcoming";
  if (end && now > end) return "past";
  return "ongoing";
}

export function formatEventDates(
  startsAt?: string | null,
  endsAt?: string | null
): string {
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const s = startsAt ? new Date(startsAt).toLocaleDateString("en-US", opts) : null;
  const e = endsAt ? new Date(endsAt).toLocaleDateString("en-US", opts) : null;
  if (s && e && s !== e) return `${s} – ${e}`;
  return s || e || "";
}
