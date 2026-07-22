import { MfaChallenge } from "@/components/auth/MfaChallenge";
import { safeNext } from "@/lib/auth/next";

export const metadata = {
  title: "Two-factor verification",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function MfaPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next = safeNext(searchParams?.next);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <MfaChallenge next={next} />
    </div>
  );
}
