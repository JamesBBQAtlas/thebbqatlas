import { AuthForm } from "@/components/auth/AuthForm";
import { safeNext } from "@/lib/auth/next";

export const metadata = {
  title: "Sign Up",
  // F-34: keep auth pages out of the index.
  robots: { index: false, follow: false },
};

export default function SignupPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next = safeNext(searchParams?.next);
  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <AuthForm mode="signup" next={next} />
    </div>
  );
}
