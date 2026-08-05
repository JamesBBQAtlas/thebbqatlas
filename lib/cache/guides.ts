import { revalidatePath } from "next/cache";
import { purgeCloudflare, siteUrls } from "@/lib/cache/cloudflare";

/**
 * Invalidate the public guides surfaces after a publish/unpublish/schedule
 * change: revalidate Next's cached paths AND purge Cloudflare's edge copy for
 * `/guides` and the affected `/guides/[slug]`, so the change takes effect
 * promptly instead of serving a stale page. Best-effort — safe to call from a
 * route handler. Pass a slug to also target that guide's detail page.
 */
export async function revalidateGuides(slug?: string | null): Promise<void> {
  const paths = ["/guides"];
  if (slug) paths.push(`/guides/${slug}`);

  try {
    revalidatePath("/guides");
    if (slug) revalidatePath(`/guides/${slug}`);
  } catch {
    // revalidatePath only runs in a request/route context; ignore otherwise.
  }

  // Cloudflare purge (no-op unless CLOUDFLARE_* env is set). Purge both the
  // locale-less and default-locale URLs, since the app serves under /[locale].
  const withLocale = paths.flatMap((p) => [p, `/en${p}`]);
  await purgeCloudflare(siteUrls(withLocale));
}
