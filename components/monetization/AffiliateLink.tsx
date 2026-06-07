import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AffiliateLinkProps {
  href?: string;
  label: string;
  partner?: string;
}

export function AffiliateLink({
  href = "#",
  label,
  partner = "Amazon",
}: AffiliateLinkProps) {
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="gap-2"
    >
      <a
        href={href}
        rel="sponsored noopener noreferrer"
        target="_blank"
        data-affiliate={partner.toLowerCase()}
        aria-label={`${label} — affiliate link placeholder`}
      >
        {label}
        <ExternalLink className="h-3 w-3" />
      </a>
    </Button>
  );
}