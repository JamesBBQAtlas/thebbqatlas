import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { pagePath, pageWindow } from "@/lib/directory/paginate";

/**
 * Numbered directory pagination (Part 7). Real crawlable `<a href>`s (page 1 is the bare
 * path, so it never duplicates the base URL), a windowed number list (first · … · nbrs ·
 * … · last) so a 50-page country stays compact, and prev/next. Thumb-friendly targets;
 * renders nothing for a single page. Server component — pure links, no client JS.
 */
export function DirectoryPagination({
  basePath,
  page,
  totalPages,
}: {
  basePath: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const nums = pageWindow(page, totalPages);
  const linkCls =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border-subtle bg-surface-0 px-3 text-sm font-medium text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold";
  const activeCls =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-brand-gold bg-brand-gold/10 px-3 text-sm font-semibold text-brand-gold";
  const disabledCls =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-md border border-border-subtle/60 px-3 text-sm text-text-muted/50 pointer-events-none";

  return (
    <nav className="mt-12 flex flex-wrap items-center justify-center gap-2" aria-label="Directory pages">
      {page > 1 ? (
        <Link href={pagePath(basePath, page - 1)} rel="prev" className={linkCls} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span className={disabledCls} aria-hidden="true">
          <ChevronLeft className="h-4 w-4" />
        </span>
      )}

      {nums.map((n, i) =>
        n === null ? (
          <span key={`gap-${i}`} className="px-1 text-text-muted">
            …
          </span>
        ) : n === page ? (
          <span key={n} aria-current="page" className={activeCls}>
            {n}
          </span>
        ) : (
          <Link key={n} href={pagePath(basePath, n)} className={linkCls}>
            {n}
          </Link>
        )
      )}

      {page < totalPages ? (
        <Link href={pagePath(basePath, page + 1)} rel="next" className={linkCls} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className={disabledCls} aria-hidden="true">
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
