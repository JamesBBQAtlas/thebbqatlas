/**
 * Pass-through root layout. The real <html>/<body> (fonts, providers, chrome)
 * live in app/[locale]/layout.tsx. This exists ONLY so that app/not-found.tsx —
 * the global 404 for fully-unmatched, non-locale top-level URLs — has a root
 * layout to render within (a Next.js requirement). It must not add its own
 * <html>/<body>, or normal localized pages would get duplicated document tags.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
