/**
 * THE single internal Easter-egg registry.
 *
 * Every hidden delight on the Atlas is listed here in one place, with its
 * trigger and where it lives — so we can always see the whole set at a glance.
 * The trigger phrases and copy below are the SOURCE OF TRUTH: the components
 * import these constants rather than hard-coding their own, so the list and the
 * behaviour never drift apart.
 *
 * Ground rules every egg obeys: subtle, never fires during normal use,
 * dismissible, no layout shift, no performance cost until triggered, no
 * copyrighted audio, keyboard/reader accessible (never traps focus), and all
 * copy in house voice (dry, warm, certain — the inspiration is never named).
 */

// ── Egg 1 — "We don't rank" creed (map search) ──────────────────────────────
// A ranking phrase still returns normal results; we just wink the creed back.
export const RANKING_TOKENS = [
  "best",
  "#1",
  "number one",
  "no. 1",
  "no 1",
  "top",
  "rank",
  "ranking",
  "greatest",
  "worst",
] as const;
export const CREED_TOAST = "We don't rank barbecue. We celebrate it.";

// ── Egg 2 — Konami code → the map catches fire (global) ──────────────────────
export const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
] as const;

// ── Egg 3 — "low and slow" → a slow zoom (map search) ────────────────────────
export const LOW_AND_SLOW_PHRASES = ["low and slow"] as const;
export const LOW_AND_SLOW_TOAST = "That's the only way.";

// ── Egg 4 — "freebird" → ember cursor trail (global typing) ──────────────────
export const FREEBIRD_PHRASES = ["freebird", "free bird"] as const;

// ── Egg 5 — house-voice empty state (any empty search/filter) ────────────────
export const EMPTY_STATE_LINE = "Nothing here yet. Somebody should fix that. Maybe you.";

// ── Egg 6 — small-hours closed venue → a dry aside (venue page) ──────────────
export const SMALL_HOURS_LINE = "They're asleep. So should you be.";

// ── Egg 7 — "42" / "meaning of life" → the answer (map search) ───────────────
export const MEANING_PHRASES = ["42", "meaning of life"] as const;
export const MEANING_TOAST = "The answer is barbecue.";

export interface EggEntry {
  id: string;
  name: string;
  /** How a visitor sets it off. */
  trigger: string;
  /** Where in the app it lives / fires. */
  where: string;
  /** One-line, house-voice note on what happens. */
  note: string;
  status: "live" | "deferred";
}

/**
 * The full catalogue — existing eggs and the new batch — for humans. Kept in
 * trigger-number order. Deferred entries are noted so they aren't forgotten.
 */
export const EGG_REGISTRY: EggEntry[] = [
  {
    id: "multipass",
    name: "Multipass",
    trigger: "the promo code `multipass` at checkout",
    where: "Premium checkout",
    note: "A knowing discount for anyone who says the magic word.",
    status: "live",
  },
  {
    id: "pit-zero",
    name: "Pit Zero",
    trigger: "search `pit zero` or `lowandslow` on the map",
    where: "Map search box",
    note: "Flies to the secret gold pin where every atlas begins; Basil the fox waits there.",
    status: "live",
  },
  {
    id: "creed",
    name: "We don't rank",
    trigger: "search a ranking word (best, #1, top, greatest, worst…)",
    where: "Map search box",
    note: "Still returns the normal results, and winks the creed back: we celebrate, we don't rank.",
    status: "live",
  },
  {
    id: "konami",
    name: "The map catches fire",
    trigger: "↑ ↑ ↓ ↓ ← → ← → B A anywhere",
    where: "Global",
    note: "A ~3-second ember-rain washes the screen, then settles. Pure joy, no state change.",
    status: "live",
  },
  {
    id: "low-and-slow",
    name: "Low and slow",
    trigger: "search `low and slow` on the map",
    where: "Map search box",
    note: "The next map move eases in slow and smooth — that's the only way.",
    status: "live",
  },
  {
    id: "freebird",
    name: "Freebird",
    trigger: "type `freebird` anywhere",
    where: "Global",
    note: "The cursor trails an ember for ~10 seconds, then fades. A nod to the launch anthem.",
    status: "live",
  },
  {
    id: "empty-state",
    name: "Somebody should fix that",
    trigger: "any search or filter that finds nothing",
    where: "Map (and search results)",
    note: "The empty state speaks in house voice and points you at the submit form.",
    status: "live",
  },
  {
    id: "small-hours",
    name: "They're asleep",
    trigger: "view a currently-closed venue overnight (≈ midnight–5am local)",
    where: "Venue page (near the hours)",
    note: "A quiet aside for the night owls. Only overnight, only when closed.",
    status: "live",
  },
  {
    id: "meaning-of-life",
    name: "The answer is barbecue",
    trigger: "search `42` or `meaning of life` on the map",
    where: "Map search box",
    note: "The answer, and a flight toward Pit Zero where it all began.",
    status: "live",
  },
  {
    id: "kipper",
    name: "Smoke me a kipper",
    trigger: "search `smoke me a kipper` on the map",
    where: "Map search box",
    note: "Flies to Billingsgate, then offers a hop to Craster — the real home of the kipper.",
    status: "live",
  },
  {
    id: "bionic",
    name: "Bionic",
    trigger: "search `bionic` or `jaime sommers` on the map",
    where: "Map search box",
    note: "A superhuman-speed pan to the quarry, with the muse's blessed seal.",
    status: "live",
  },
  {
    id: "partridge-norwich",
    name: "Cookpassbabtridge",
    trigger: "search `cookpassbabtridge` on the map",
    where: "Map search box",
    note: "Ah-ha. A deadpan flight to BBC Radio Norwich.",
    status: "live",
  },
  {
    id: "owl-sanctuary",
    name: "Cracking owl sanctuary",
    trigger: "search `cracking owl sanctuary` on the map",
    where: "Map search box",
    note: "Sometimes a man just needs to look at an owl.",
    status: "live",
  },
  {
    id: "back-of-the-net",
    name: "Back of the net",
    trigger: "search `back of the net` on the map",
    where: "Map search box",
    note: "A surprise-me: flies to a random real published venue and flashes a toast.",
    status: "live",
  },
  {
    id: "jaws",
    name: "Amity Island",
    trigger: "search `jaws` or `amity island` on the map",
    where: "Map search box",
    note: "A bigger-boat flight to Martha's Vineyard with a grinning shark of our own drawing.",
    status: "live",
  },
  {
    id: "grillzilla",
    name: "GrillZilla",
    trigger: "search `grillzilla` on the map",
    where: "Map search box",
    note: "A colossal original monster clambers up a certain Hyde Park Corner hotel; a dry hello, then back to the smoke. The pin is homage only — never in the dataset.",
    status: "live",
  },
  {
    id: "bucees-beaver",
    name: "Buc-ee's beaver trail",
    trigger: "TBD — when Buc-ee's actually lands on the atlas",
    where: "Deferred",
    note: "A hidden beaver nod, held back until there's a Buc-ee's to hang it on.",
    status: "deferred",
  },
];

/** Does a raw search string contain a standalone ranking token? (word-boundary,
 *  so "topeka" never trips "top"). */
export function isRankingQuery(raw: string): boolean {
  const lc = ` ${raw.toLowerCase().replace(/[^\w#. ]+/g, " ")} `;
  return RANKING_TOKENS.some((t) => lc.includes(` ${t} `));
}
