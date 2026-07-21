import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Flame, Thermometer, Wrench, Trees, BookOpen } from "lucide-react";
import { AffiliateLink } from "@/components/monetization/AffiliateLink";
import { AdSlot } from "@/components/monetization/AdSlot";

export const metadata: Metadata = {
  title: "Gear",
  description:
    "The pitmaster's kit — smokers, thermometers, tools, fuel and reading, curated by The BBQ Atlas.",
  alternates: { canonical: "/gear" },
};

const SECTIONS = [
  {
    icon: Flame,
    title: "Smokers & Grills",
    blurb: "Where the magic happens. From backyard bullets to offset workhorses.",
    items: [
      "Weber Smokey Mountain Cooker",
      "Offset stick-burner (22\"+)",
      "Kamado-style ceramic grill",
      "Pellet smoker with Wi-Fi",
    ],
  },
  {
    icon: Thermometer,
    title: "Thermometers",
    blurb: "The single biggest upgrade to your barbecue. Cook to temp, not to time.",
    items: [
      "Instant-read thermapen",
      "Dual-probe wireless pit monitor",
      "Leave-in ambient + meat probes",
    ],
  },
  {
    icon: Wrench,
    title: "Tools & Prep",
    blurb: "The unglamorous kit that makes long cooks easy.",
    items: [
      "Heat-resistant nitrile gloves",
      "Boning & slicing knives",
      "Butcher paper (unwaxed)",
      "Heavy-duty cutting board",
    ],
  },
  {
    icon: Trees,
    title: "Fuel & Wood",
    blurb: "Post oak, hickory, fruit woods — the flavour starts here.",
    items: ["Lump charcoal", "Post-oak splits", "Wood chunks variety pack"],
  },
  {
    icon: BookOpen,
    title: "Reading",
    blurb: "The books that made pitmasters.",
    items: ["Franklin Barbecue: A Meat-Smoking Manifesto", "Legends of Texas Barbecue"],
  },
];

export default function GearPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <p className="u-eyebrow mb-3 text-brand-gold">The pitmaster&apos;s kit</p>
      <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        Gear
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-text-secondary">
        The tools we&apos;d put in any pitmaster&apos;s hands — from your first
        smoker to the thermometer that changes everything. Curated by The BBQ
        Atlas.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
        {SECTIONS.map((s) => (
          <div
            key={s.title}
            className="rounded-2xl border border-border-subtle bg-surface-0 p-6"
          >
            <div className="mb-3 flex items-center gap-3">
              <s.icon className="h-6 w-6 text-brand-gold" />
              <h2 className="font-heading text-xl font-bold text-text-primary">
                {s.title}
              </h2>
            </div>
            <p className="mb-4 text-sm text-text-muted">{s.blurb}</p>
            <ul className="space-y-2">
              {s.items.map((item) => (
                <li key={item} className="text-[0.9375rem] text-text-secondary">
                  <AffiliateLink href="#" label={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-8 text-xs text-text-muted">
        Some links are affiliate links — if you buy through them, the Atlas may
        earn a small commission at no cost to you. It helps keep the map free.
        Product links are placeholders until affiliate tags are activated.
      </p>
      <AdSlot slot="in-content" className="mt-8 h-0" />
    </div>
  );
}
