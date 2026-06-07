import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/restaurants/StarRating";
import { STYLE_LABELS } from "@/lib/constants/styles";
import type { Restaurant } from "@/lib/types/database";

interface MapPreviewPanelProps {
  restaurant: Restaurant | null;
  onClose: () => void;
}

export function MapPreviewPanel({ restaurant, onClose }: MapPreviewPanelProps) {
  if (!restaurant) return null;

  return (
    <div className="absolute right-4 top-4 bottom-4 z-[1000] w-full max-w-sm hidden md:flex flex-col rounded-xl border border-white/20 bg-black/85 backdrop-blur-md shadow-2xl overflow-hidden">
      <div className="bg-brand-orange px-4 py-2 flex items-center justify-between">
        <span className="font-semibold text-sm">Preview</span>
        <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="relative aspect-video w-full">
        <Image
          src={restaurant.hero_image_url}
          alt={restaurant.name}
          fill
          className="object-cover"
        />
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        <h3 className="text-xl font-bold">{restaurant.name}</h3>
        <StarRating rating={restaurant.avg_rating} className="mt-1" />
        <p className="text-white/60 text-sm mt-1">
          {"$".repeat(restaurant.price_level)}
          <span className="text-white/30">{"$".repeat(4 - restaurant.price_level)}</span>
        </p>
        <Badge variant="style" className="mt-2">
          {STYLE_LABELS[restaurant.style]} style
        </Badge>
        <p className="text-white/70 text-sm mt-3 line-clamp-4">{restaurant.description}</p>
        <Button asChild className="w-full mt-4">
          <Link href={`/restaurants/${restaurant.slug}`}>View Full Details</Link>
        </Button>
      </div>
    </div>
  );
}