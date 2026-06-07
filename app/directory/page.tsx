import { RestaurantCard } from "@/components/restaurants/RestaurantCard";
import { getRestaurants } from "@/lib/queries/restaurants";
import { DirectoryFilters } from "@/components/restaurants/DirectoryFilters";

interface DirectoryPageProps {
  searchParams: { style?: string; rating?: string; price?: string; q?: string };
}

export const metadata = { title: "Directory" };

export default async function DirectoryPage({ searchParams }: DirectoryPageProps) {
  let restaurants = await getRestaurants();

  if (searchParams.style && searchParams.style !== "all") {
    restaurants = restaurants.filter((r) => r.style === searchParams.style);
  }
  if (searchParams.rating && searchParams.rating !== "all") {
    restaurants = restaurants.filter((r) => r.avg_rating >= parseFloat(searchParams.rating!));
  }
  if (searchParams.price && searchParams.price !== "all") {
    restaurants = restaurants.filter((r) => r.price_level === parseInt(searchParams.price!));
  }
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    restaurants = restaurants.filter((r) =>
      `${r.name} ${r.city} ${r.country}`.toLowerCase().includes(q)
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">BBQ Directory</h1>
      <p className="text-white/60 mb-8">Search and filter {restaurants.length} spots worldwide</p>
      <DirectoryFilters />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
        {restaurants.map((r) => (
          <RestaurantCard key={r.id} restaurant={r} />
        ))}
      </div>
    </div>
  );
}