import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { MapPin, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getRestaurants } from "@/lib/queries/restaurants";
import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  itemListJsonLd,
  collectionPageJsonLd,
  breadcrumbJsonLd,
} from "@/lib/seo/jsonld";
import {
  BBQ_STYLES,
  STYLE_LABELS,
  STYLE_DESCRIPTIONS,
  type BbqStyle,
} from "@/lib/constants/styles";
import { routing } from "@/i18n/routing";

interface Props {
  params: { locale: string; style: string };
}

export const revalidate = 3600;

export async function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    BBQ_STYLES.map((style) => ({ locale, style }))
  );
}

function isStyle(s: string): s is BbqStyle {
  return (BBQ_STYLES as string[]).includes(s);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isStyle(params.style)) return { title: "Style Not Found" };
  const label = STYLE_LABELS[params.style];
  return {
    title: `${label} Barbecue`,
    description: `${STYLE_DESCRIPTIONS[params.style]} Explore ${label} barbecue venues around the world on The BBQ Atlas.`,
    alternates: { canonical: `/styles/${params.style}` },
  };
}

export default async function StyleHubPage({ params }: Props) {
  setRequestLocale(params.locale);
  if (!isStyle(params.style)) notFound();
  const style = params.style;
  const label = STYLE_LABELS[style];

  const all = await getRestaurants();
  const venues = all.filter((r) => r.style === style);

  const otherStyles = BBQ_STYLES.filter((s) => s !== style);

  return (
    <div className="mx-auto max-w-7xl px-6 py-16 sm:px-10">
      <JsonLd
        data={[
          collectionPageJsonLd(
            `${label} Barbecue`,
            STYLE_DESCRIPTIONS[style],
            `/styles/${style}`
          ),
          itemListJsonLd(
            `${label} Barbecue venues`,
            venues.map((r) => ({ name: r.name, path: `/restaurants/${r.slug}` }))
          ),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Styles", path: "/styles" },
            { name: label, path: `/styles/${style}` },
          ]),
        ]}
      />

      <nav className="mb-4 text-sm text-text-muted">
        <Link href="/styles" className="hover:text-brand-gold">
          Styles
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-text-secondary">{label}</span>
      </nav>

      <p className="u-eyebrow mb-3 text-brand-gold">Style</p>
      <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        {label} Barbecue
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-text-secondary">
        {STYLE_DESCRIPTIONS[style]}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Link
          href={`/map?style=${style}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-gold hover:underline"
        >
          <MapPin className="h-4 w-4" />
          See {label} spots on the map
        </Link>
        <span className="text-sm text-text-muted">
          {venues.length} {venues.length === 1 ? "venue" : "venues"} on the Atlas
        </span>
      </div>

      {venues.length > 0 ? (
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} />
          ))}
        </div>
      ) : (
        <p className="mt-10 rounded-xl border border-border-subtle bg-surface-0 p-6 text-text-muted">
          No {label} venues on the map yet.{" "}
          <Link href="/submit" className="text-brand-gold hover:underline">
            Know one? Add it.
          </Link>
        </p>
      )}

      {/* Internal linking — other styles */}
      <section className="mt-16 border-t border-border-subtle pt-10">
        <h2 className="mb-4 font-heading text-xl font-bold text-text-primary">
          Explore other styles
        </h2>
        <div className="flex flex-wrap gap-2">
          {otherStyles.map((s) => (
            <Link
              key={s}
              href={`/styles/${s}`}
              className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-0 px-3.5 py-1.5 text-sm text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold"
            >
              {STYLE_LABELS[s]}
              <ArrowRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
