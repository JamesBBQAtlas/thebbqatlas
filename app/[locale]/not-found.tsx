import { Link } from "@/i18n/navigation";
import { Map, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
      <p className="u-eyebrow mb-3 text-brand-gold">404 — Off the map</p>
      <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        This pit&apos;s gone cold.
      </h1>
      <p className="mt-4 max-w-md text-lg text-text-secondary">
        We couldn&apos;t find that page. It may have moved, closed, or never
        existed. Let&apos;s get you back to the good stuff.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/map"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-gold px-5 py-2.5 font-semibold text-brand-black transition-opacity hover:opacity-90"
        >
          <Map className="h-4 w-4" />
          Explore the map
        </Link>
        <Link
          href="/directory"
          className="inline-flex items-center gap-2 rounded-lg border border-border-default px-5 py-2.5 font-semibold text-text-primary transition-colors hover:border-brand-gold hover:text-brand-gold"
        >
          <Compass className="h-4 w-4" />
          Browse the directory
        </Link>
      </div>
    </div>
  );
}
