import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STYLE_LABELS } from "@/lib/constants/styles";
import type { Restaurant } from "@/lib/types/database";

export function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  return (
    <Link href={`/restaurants/${restaurant.slug}`}>
      <Card className="overflow-hidden hover:border-brand-gold/40 transition-colors h-full">
        <div className="relative aspect-[4/3] w-full">
          <Image
            src={restaurant.hero_image_url}
            alt={restaurant.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 25vw"
          />
          {restaurant.is_featured && (
            <Badge variant="featured" className="absolute top-2 right-2">
              Featured
            </Badge>
          )}
        </div>
        <CardContent className="p-4">
          <h3 className="font-bold text-lg">{restaurant.name}</h3>
          <p className="text-white/60 text-sm mt-1">
            {restaurant.city}, {restaurant.country}
          </p>
          <Badge variant="style" className="mt-2">
            Styles: {STYLE_LABELS[restaurant.style]}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}