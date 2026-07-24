import { cn } from "@/lib/utils/cn";

/**
 * The Promise — a fixed brand statement (never rotated). Rendered prominently in
 * the footer and on the About page.
 */
export function ThePromise({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-text-secondary", className)}>
      We&apos;ll never rank the barbecue, never sell your details, and never ask
      you to rate us out of five.
    </p>
  );
}
