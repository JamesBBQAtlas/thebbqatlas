import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-LESS anon Supabase client for PUBLIC catalogue reads (venues, hubs,
 * guides, news, events, sitemap, llms.txt, "nearby").
 *
 * Why this exists (F-06): the cookie-bound server client calls cookies(), which
 * forces Next into dynamic rendering during static generation and defeats ISR
 * site-wide. This client never touches cookies, so pages that read only public
 * data can be statically generated and revalidated (revalidate = 3600) as
 * intended. It uses the anon key, so it still fully respects RLS.
 *
 * Use the cookie-bound client (@/lib/supabase/server) ONLY for user-scoped reads
 * (auth, saved spots, a user's own check-in, profile settings).
 */
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
