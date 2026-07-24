import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GearConsole } from "@/components/admin/GearConsole";
import type { GearProduct } from "@/lib/types/database";

export const metadata = { title: "Gear" };
export const dynamic = "force-dynamic";

export default async function AdminGearPage() {
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
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-heading text-2xl font-bold text-text-primary">
          Access Denied
        </h1>
        <p className="mt-2 text-text-muted">Admin access required.</p>
      </div>
    );
  }

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;

  const { data } = await db
    .from("gear_products")
    .select("*")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });
  const products = (data ?? []) as GearProduct[];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <h1 className="font-heading text-3xl font-bold text-text-primary">
        Gear Catalogue
      </h1>
      <p className="mt-1 max-w-2xl text-text-muted">
        Add, edit and retire the affiliate products shown on{" "}
        <span className="text-text-secondary">/gear</span> and in the
        Recommended Gear slot on venue pages. Use official affiliate imagery only
        (Amazon SiteStripe / PA-API, or brand assets) — never scrape or hotlink.
      </p>
      <div className="mt-8">
        <GearConsole initialProducts={products} />
      </div>
    </div>
  );
}
