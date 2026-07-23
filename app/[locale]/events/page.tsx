import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { CalendarDays, MapPin } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getRestaurants } from "@/lib/queries/restaurants";
import { FlagIcon } from "@/components/ui/FlagIcon";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, collectionPageJsonLd, eventJsonLd } from "@/lib/seo/jsonld";
import {
  CATEGORY_LABELS,
  eventStatus,
  formatEventDates,
} from "@/lib/constants/categories";
import { resolveCountryCode } from "@/lib/constants/countries";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "BBQ Events & Festivals",
  description:
    "Upcoming barbecue events, festivals and competitions around the world, mapped on The BBQ Atlas.",
  alternates: { canonical: "/events" },
};

export default async function EventsPage({
  params,
}: {
  params: { locale: string };
}) {
  setRequestLocale(params.locale);
  const all = await getRestaurants();

  // Time-based items that haven't finished yet, soonest first.
  const events = all
    .filter((r) => (r.category === "event" || r.category === "festival"))
    .filter((r) => eventStatus(r.event_starts_at, r.event_ends_at) !== "past")
    .sort((a, b) => {
      const ta = a.event_starts_at ? new Date(a.event_starts_at).getTime() : Infinity;
      const tb = b.event_starts_at ? new Date(b.event_starts_at).getTime() : Infinity;
      return ta - tb;
    });

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:px-10">
      <JsonLd
        data={[
          collectionPageJsonLd(
            "BBQ Events & Festivals",
            "Upcoming barbecue events and festivals worldwide.",
            "/events"
          ),
          breadcrumbJsonLd([
            { name: "Atlas", path: "/" },
            { name: "Events", path: "/events" },
          ]),
          // Only events with a real start date get Event schema — startDate is
          // required, and the @id in eventJsonLd de-dupes against the venue page.
          ...events.filter((r) => Boolean(r.event_starts_at)).map((r) => eventJsonLd(r)),
        ]}
      />

      <p className="u-eyebrow mb-3 text-brand-gold">What&apos;s on</p>
      <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        Events &amp; Festivals
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-text-secondary">
        Barbecue festivals, competitions and pop-up dinners around the world.
        Past events drop off automatically.
      </p>

      {events.length === 0 ? (
        <p className="mt-10 rounded-xl border border-border-subtle bg-surface-0 p-8 text-text-muted">
          No upcoming events on the map yet.{" "}
          <Link href="/submit" className="text-brand-gold hover:underline">
            Know one? Add it.
          </Link>
        </p>
      ) : (
        <div className="mt-10 space-y-4">
          {events.map((r) => {
            const status = eventStatus(r.event_starts_at, r.event_ends_at);
            const dates = formatEventDates(r.event_starts_at, r.event_ends_at);
            const code = resolveCountryCode(r.country_code, r.country);
            return (
              <Link
                key={r.id}
                href={`/restaurants/${r.slug}`}
                className="flex items-start gap-4 rounded-xl border border-border-subtle bg-surface-0 p-5 transition-colors hover:border-brand-gold/50"
              >
                <CalendarDays className="mt-0.5 h-6 w-6 shrink-0 text-brand-gold" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-heading text-lg font-bold text-text-primary">
                      {r.name}
                    </h2>
                    <span className="rounded-full border border-brand-sienna/40 bg-brand-sienna/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-brand-sienna-light">
                      {CATEGORY_LABELS[r.category ?? "event"]}
                    </span>
                    {status === "ongoing" && (
                      <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.06em] text-brand-gold">
                        On now
                      </span>
                    )}
                  </div>
                  {dates && <p className="mt-1 text-sm text-brand-gold">{dates}</p>}
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-text-muted">
                    <MapPin className="h-3.5 w-3.5" />
                    {[r.city, r.country].filter(Boolean).join(", ")}
                    <FlagIcon code={code} className="text-sm" />
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
