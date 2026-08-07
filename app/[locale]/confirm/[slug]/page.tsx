import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { MapPin, Globe, Phone } from "lucide-react";
import { getPublicVenueBySlug } from "@/lib/queries/public-venues";
import { ConfirmDetailsForm } from "@/components/restaurants/ConfirmDetailsForm";

interface Props {
  params: { locale: string; slug: string };
  searchParams: { e?: string };
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your venue details",
  robots: { index: false, follow: false },
};

export default async function ConfirmDetailsPage({ params, searchParams }: Props) {
  setRequestLocale(params.locale);
  const venue = await getPublicVenueBySlug(params.slug);
  if (!venue) notFound();

  const rows: [string, string | null][] = [
    ["Name", venue.name],
    ["Address", venue.address],
    ["City", venue.city],
    ["Country", venue.country],
    ["Phone", venue.phone],
    ["Website", venue.website],
    ["Instagram", venue.instagram_handle ? `@${venue.instagram_handle}` : venue.instagram_url],
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <p className="u-eyebrow mb-2 text-brand-gold">The BBQ Atlas</p>
      <h1 className="font-heading text-3xl font-bold text-text-primary">
        Is this right, {venue.name}?
      </h1>
      <p className="mt-3 text-text-secondary">
        We list your venue on The BBQ Atlas. Give the details below a quick look — if they&apos;re
        right, one tap confirms it. If something&apos;s off, tell us and we&apos;ll fix it. No
        account needed.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-border-subtle bg-surface-0">
        <dl className="divide-y divide-border-subtle">
          {rows
            .filter(([, v]) => v)
            .map(([label, value]) => (
              <div key={label} className="flex gap-4 px-4 py-3 text-sm">
                <dt className="w-28 shrink-0 text-text-muted">{label}</dt>
                <dd className="min-w-0 flex-1 break-words text-text-primary">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-text-muted">
        <Link href={`/restaurants/${params.slug}`} className="inline-flex items-center gap-1 hover:text-brand-gold">
          <MapPin className="h-3.5 w-3.5" /> See the live listing
        </Link>
        {venue.website && (
          <a href={venue.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-gold">
            <Globe className="h-3.5 w-3.5" /> Your site
          </a>
        )}
        {venue.phone && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3.5 w-3.5" /> {venue.phone}
          </span>
        )}
      </div>

      <ConfirmDetailsForm slug={params.slug} initialEmail={searchParams.e ?? ""} />
    </div>
  );
}
