import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SmokeBackground } from "@/components/layout/SmokeBackground";
import { BRAND } from "@/lib/constants/styles";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s | ${BRAND.name}`,
  },
  description:
    "Interactive Global Atlas — Explore, Review, and Celebrate BBQ Worldwide. " +
    BRAND.strapline,
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://thebbqatlas.com"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SmokeBackground>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </SmokeBackground>
      </body>
    </html>
  );
}