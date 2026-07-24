import { Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const TEXT =
  "The BBQ Atlas earns a commission on qualifying purchases made through links on this page — at no extra cost to you. It helps keep the map free.";

/**
 * FTC/ASA-compliant affiliate disclosure. Use the `banner` variant at the top
 * of a monetised page and the `inline` variant right next to the first links.
 */
export function AffiliateDisclosure({
  variant = "banner",
  className,
}: {
  variant?: "banner" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <p className={cn("text-xs text-text-muted", className)}>
        Affiliate links — {TEXT}
      </p>
    );
  }
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-1 px-4 py-3 text-sm text-text-secondary",
        className
      )}
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" />
      <p>
        <span className="font-semibold text-text-primary">
          Affiliate disclosure.{" "}
        </span>
        {TEXT}
      </p>
    </div>
  );
}
