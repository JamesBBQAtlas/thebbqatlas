import type { NewsPost } from "@/lib/types/database";

/**
 * Seed content for News & Missives. Used as a graceful fallback whenever the
 * `news` table is empty or unreachable, so the section is never blank. Real
 * posts in Supabase (is_published = true) always take precedence.
 *
 * Categories:
 *  - "news"    → dispatches, openings, festival reports, the world of smoke
 *  - "missive" → the Atlas's own voice: opinion, craft, the long letters
 */
export const FALLBACK_NEWS: NewsPost[] = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    slug: "welcome-to-the-atlas",
    title: "A Letter from the Pit: Welcome to The BBQ Atlas",
    excerpt:
      "Why the world needs one honest map of great barbecue — and the promise we're making to every pitmaster, pilgrim and stranger who lands here.",
    content_md: `## We built a map for the faithful

Barbecue is the oldest way we cook and the most human way we gather. Every
culture that ever caught fire has a version of it — the Texan's post-oak
brisket, the Argentine's asado laid across the coals, the Korean table where
the grill sits between friends, the Cape Malay braai, the Carolina whole hog
lifted from a cinderblock pit at dawn.

The BBQ Atlas exists to hold all of it in one place. Not a leaderboard. Not a
league table. A **map** — because the truth of barbecue is that it lives
somewhere, cooked by someone, for a community that already knows it's good.

### What we promise

- **We celebrate, we don't rank.** No star scores flattening a lifetime's craft into a number.
- **We keep it honest.** Closed venues get marked closed. Corrections get read.
- **We go everywhere.** If someone, somewhere, is doing it right over live fire — we want a pin on them.

### What comes next

This is the beginning. The map grows every week, the guides go deeper, and the
missives — letters like this one — keep coming. Pull up a chair. The fire's
already going.

*— The BBQ Atlas*`,
    hero_image_url:
      "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=1200&q=80",
    category: "missive",
    author: "The BBQ Atlas",
    is_published: true,
    published_at: "2026-06-10T00:00:00Z",
    created_at: "2026-06-10T00:00:00Z",
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    slug: "asado-crosses-borders",
    title: "The Asado Crosses Borders",
    excerpt:
      "From the pampas of Argentina to backyards worldwide, live-fire asado is having a global moment. We map the spread.",
    content_md: `## Fire, iron, and patience

The Argentine asado was never just a meal — it's an afternoon, a ritual, a
slow negotiation between the *asador* and the coals. Now that patience is
spreading. Open-fire restaurants from London to Los Angeles are pulling the
parrilla out of the backyard and onto the world stage.

### Why now

Live fire reads as honesty. In an age of sous-vide precision, cooking over
wood coals is gloriously imprecise — and diners can taste the difference.

### On the Atlas

Look for the asado and Argentine-style pins spreading well beyond South
America. Every one is a place where someone still trusts the fire to do the
work.

*Explore them on the map.*`,
    hero_image_url:
      "https://images.unsplash.com/photo-1558030006-450675393462?w=1200&q=80",
    category: "news",
    author: "The BBQ Atlas",
    is_published: true,
    published_at: "2026-06-24T00:00:00Z",
    created_at: "2026-06-24T00:00:00Z",
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    slug: "on-the-stall-and-the-virtue-of-waiting",
    title: "On the Stall, and the Virtue of Waiting",
    excerpt:
      "A missive on the most frustrating hours in barbecue — and why the best pitmasters have made peace with them.",
    content_md: `## The stall is a test of faith

Somewhere around 150°F, a brisket stops climbing. The moisture on its surface
evaporates as fast as the pit adds heat, and the thermometer sits still for
hours. Newcomers panic. Veterans pour another coffee.

### Wrap, or ride it out

The Texas crutch — foil or butcher paper — pushes through the stall by trapping
moisture. Purists ride it out for a firmer bark. There's no wrong answer, only
the one your fire and your patience agree on.

### The wider lesson

Barbecue rewards the cook who can wait. It's the rare craft where doing *less*,
for *longer*, is the whole secret. Maybe that's why it feels like more than
dinner.

*— The BBQ Atlas*`,
    hero_image_url:
      "https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&q=80",
    category: "missive",
    author: "The BBQ Atlas",
    is_published: true,
    published_at: "2026-07-08T00:00:00Z",
    created_at: "2026-07-08T00:00:00Z",
  },
];
