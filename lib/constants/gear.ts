import { Thermometer, Flame, Trees, UtensilsCrossed, Wrench, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { GearCategory } from "@/lib/types/database";

/**
 * Display order + copy + icon for each gear catalogue category.
 *
 * Order is deliberate (PM, 26 Jul): lead with the cheap, high-velocity items
 * that convert fastest — thermometers, rubs, fuel, tools, cleaning — to chase
 * the first sales (and the PA-API unlock). Big-ticket smokers & grills earn
 * the most per sale but sell slowest, so they sit last.
 */
export const GEAR_CATEGORIES: {
  key: GearCategory;
  label: string;
  blurb: string;
  icon: LucideIcon;
}[] = [
  {
    key: "thermometers",
    label: "Thermometers",
    blurb:
      "Cook to temp, not to time — the single biggest upgrade to your barbecue.",
    icon: Thermometer,
  },
  {
    key: "rubs_spices",
    label: "Rubs & Spices",
    blurb: "Bark, colour, crust — the seasoning that turns meat into barbecue.",
    icon: UtensilsCrossed,
  },
  {
    key: "fuel_wood",
    label: "Fuel & Wood",
    blurb: "Post oak, hickory, fruit woods — the flavour starts here.",
    icon: Trees,
  },
  {
    key: "tools",
    label: "Tools & Prep",
    blurb: "The unglamorous kit that makes long cooks easy.",
    icon: Wrench,
  },
  {
    key: "cleaning",
    label: "Cleaning & Care",
    blurb: "Keep the pit in fighting shape between cooks.",
    icon: Sparkles,
  },
  {
    key: "smokers_grills",
    label: "Smokers & Grills",
    blurb: "Where the magic happens — from backyard bullets to offset workhorses.",
    icon: Flame,
  },
];

export const GEAR_CATEGORY_LABELS = Object.fromEntries(
  GEAR_CATEGORIES.map((c) => [c.key, c.label])
) as Record<GearCategory, string>;

export const GEAR_CATEGORY_ICONS = Object.fromEntries(
  GEAR_CATEGORIES.map((c) => [c.key, c.icon])
) as Record<GearCategory, LucideIcon>;

/** Human label for an affiliate partner slug. */
export function partnerLabel(partner: string | null | undefined): string {
  switch ((partner ?? "").toLowerCase()) {
    case "amazon":
      return "Amazon";
    case "thermoworks":
      return "ThermoWorks";
    case "traeger":
      return "Traeger";
    case "bbqguys":
      return "BBQGuys";
    default:
      return "retailer";
  }
}
