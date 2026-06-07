export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function restaurantSlug(name: string, city: string): string {
  return slugify(`${name}-${city}`);
}