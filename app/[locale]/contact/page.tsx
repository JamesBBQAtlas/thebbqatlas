import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { ContactForm } from "@/components/content/ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with The BBQ Atlas — suggest a venue, report a correction, or partner with us.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage({ params }: { params: { locale: string } }) {
  setRequestLocale(params.locale);
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 sm:px-10">
      <p className="u-eyebrow mb-3 text-brand-gold">Say hello</p>
      <h1 className="font-heading text-4xl font-bold text-text-primary sm:text-5xl">
        Contact
      </h1>
      <p className="mt-4 text-lg text-text-secondary">
        Know a joint we&apos;re missing? Spotted something that needs fixing? Want
        to work together? Drop us a line — we read every message.
      </p>
      <div className="mt-10">
        <ContactForm />
      </div>
      <p className="mt-8 text-sm text-text-muted">
        You can also reach us at{" "}
        <a
          href="mailto:hello@thebbqatlas.com"
          className="text-brand-gold hover:underline"
        >
          hello@thebbqatlas.com
        </a>
        .
      </p>
    </div>
  );
}
