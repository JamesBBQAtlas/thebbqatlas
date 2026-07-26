import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// TEMPORARY admin-only diagnostic for the service-role key. Remove after use.
export const dynamic = "force-dynamic";
export const metadata = { title: "Diag", robots: { index: false, follow: false } };

export default async function DiagPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return <div className="p-24 text-center text-text-muted">Admin only.</div>;
  }

  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const keyFormat = !rawKey
    ? "MISSING"
    : rawKey.startsWith("sb_secret_")
      ? "sb_secret"
      : rawKey.startsWith("eyJ")
        ? "legacy_jwt"
        : "other";
  const trimmedDiffers = rawKey !== rawKey.trim();

  let adminResult = "not-run";
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("check_ins")
      .select("*", { count: "exact", head: true });
    adminResult = error
      ? `ERROR msg="${error.message}" code="${(error as { code?: string }).code ?? "?"}"`
      : `OK count=${count}`;
  } catch (e) {
    adminResult = `THROW: ${(e as Error).message}`;
  }

  return (
    <pre className="mx-auto max-w-3xl whitespace-pre-wrap p-16 text-sm text-text-primary">
      {[
        `keyFormat: ${keyFormat}`,
        `keyLength: ${rawKey.length}`,
        `trailingOrLeadingWhitespace: ${trimmedDiffers}`,
        `NEXT_PUBLIC_SUPABASE_URL set: ${Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)}`,
        `adminClient check_ins: ${adminResult}`,
      ].join("\n")}
    </pre>
  );
}
