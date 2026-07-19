import { cn } from "@/lib/utils/cn";

/**
 * Renders a real flag as a self-hosted SVG (flag-icons), not an emoji.
 * Emoji flags fail on Windows (they show the 2-letter code instead), so we use
 * icons for reliable, cross-platform rendering. `code` is ISO 3166-1 alpha-2.
 */
export function FlagIcon({
  code,
  className,
}: {
  code?: string | null;
  className?: string;
}) {
  if (!code || code.length !== 2) return null;
  return (
    <span
      className={cn(`fi fi-${code.toLowerCase()} rounded-[2px]`, className)}
      role="img"
      aria-label={code}
    />
  );
}
