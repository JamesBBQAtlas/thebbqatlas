import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STYLE_LABELS } from "@/lib/constants/styles";
import type { Restaurant } from "@/lib/types/database";

interface MobilePreviewSheetProps {
  restaurant: Restaurant | null;
  onClose: () => void;
}

export function MobilePreviewSheet({ restaurant, onClose }: MobilePreviewSheetProps) {
  if (!restaurant) return null;

  return (
    <div className="md:hidden absolute bottom-0 left-0 right-0 z-[1000] rounded-t-xl border border-white/20 bg-black/90 backdrop-blur-md shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <span className="font-semibold text-sm text-brand-orange">Preview</span>
        <button type="button" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex gap-3 p-4">
        <div className="relative h-20 w-20 shrink-0 rounded-lg overflow-hidden">
          <Image src={restaurant.hero_image_url} alt={restaurant.name} fill className="object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold truncate">{restaurant.name}</h3>
          <p className="text-white/60 text-xs mt-1">{STYLE_LABELS[restaurant.style]}</p>
        </div>
      </div>
      <div className="px-4 pb-4">
        <Button asChild className="w-full" size="sm">
          <Link href={`/restaurants/${restaurant.slug}`}>View Details</Link>
        </Button>
      </div>
    </div>
  );
}