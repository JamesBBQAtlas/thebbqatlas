import { Star } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function StarRating({
  rating,
  size = "sm",
  className,
}: {
  rating: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            iconSize,
            i < Math.round(rating) ? "fill-brand-gold text-brand-gold" : "text-white/20"
          )}
        />
      ))}
      <span className="ml-1 text-sm text-white/70">{rating.toFixed(1)}</span>
    </div>
  );
}