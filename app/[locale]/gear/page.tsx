import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { getGearProducts, groupGearByCategory } from "@/lib/queries/gear";
import { GEAR_CATEGORIES } from "@/lib/constants/gear";
import { GearProductCard } from "@/components/gear/GearProductCard";
import { AffiliateDisclosure } from "@/components/monetization/AffiliateDisclosure";
import { AdSlot } from "@/components/monetization/AdSlot";

export const metadata: Metadata = {
  title: "Gear",
  description:
    "The pitmaster's kit — smokers, thermometers, tools, fuel and cleaning, curated by The BBQ Atlas.",
  alternates: { canonical: "/gear" },
};

// Catalogue is admin-managed; refresh hourly.
export const revalidate = 3600;

export default async function GearPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const products = await getGearProducts();
  const grouped = groupGearByCategory(products);
  const activeCategories = GEAR_CATEGORIES.filter(
    (c) => (grouped[c.key]?.length ?? 0) > 0
  );

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

      {/* Disclosure at the top of the page (FTC/ASA). */}
      <AffiliateDisclosure className="mt-6" />

      {activeCategories.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-border-subtle bg-surface-0 p-10 text-center">
          <p className="text-text-secondary">
            Our curated picks are being seasoned — check back soon.
          </p>
        </div>
      ) : (
        activeCategories.map((cat, i) => {
          const items = grouped[cat.key] ?? [];
          return (
            <section key={cat.key} className="mt-12">
              <div className="mb-4 flex items-center gap-3">
                <cat.icon className="h-6 w-6 text-brand-gold" />
                <div>
                  <h2 className="font-heading text-xl font-bold text-text-primary">
                    {cat.label}
                  </h2>
                  <p className="text-sm text-text-muted">{cat.blurb}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {items.map((p) => (
                  <GearProductCard key={p.id} product={p} />
                ))}
              </div>
              {/* Second disclosure, right next to the first set of links. */}
              {i === 0 && (
                <AffiliateDisclosure variant="inline" className="mt-4" />
              )}
            </section>
          );
        })
      )}

      <AdSlot slot="in-content" className="mt-12 h-0" />
    </div>
  );
}
