import Link from "next/link";
import { BRAND } from "@/lib/constants/styles";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-brand-black/90 mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="flex flex-col md:flex-row justify-between gap-8">
          <div>
            <p className="text-brand-gold font-bold text-lg">{BRAND.name}</p>
            <p className="text-white/60 text-sm mt-1 italic">{BRAND.strapline}</p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-white/70">
            <Link href="/terms" className="hover:text-brand-gold">Terms</Link>
            <Link href="/privacy" className="hover:text-brand-gold">Privacy</Link>
            <Link href="/disclaimer" className="hover:text-brand-gold">Disclaimer</Link>
            <a href="mailto:hello@thebbqatlas.com" className="hover:text-brand-gold">
              hello@thebbqatlas.com
            </a>
          </div>
        </div>
        <p className="text-white/40 text-xs mt-8">
          © {new Date().getFullYear()} The BBQ Atlas Ltd. User reviews are opinions of individual contributors.
        </p>
      </div>
    </footer>
  );
}