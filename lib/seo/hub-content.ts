import type { Restaurant } from "@/lib/types/database";
import { STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";

/**
 * Data-driven, UNIQUE hub copy + FAQs (Fable H-4) — composed from each hub's real
 * venues (styles present, counts, actual names) so no two city/country pages read
 * the same, and every claim is true. Deliberately never ranks ("we don't rank
 * barbecue") — the FAQ "best" answer refuses to crown one, on brand.
 */

/** "a, b and c" — capped at `max`, then "… and more". */
function humanList(items: string[], max = 4): string {
  const list = items.slice(0, max);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  const head = list.slice(0, -1).join(", ");
  const tail = list[list.length - 1];
  return items.length > max ? `${head}, ${tail} and more` : `${head} and ${tail}`;
}

/** Distinct style LABELS present (excludes the generic "other"). */
function stylesPresent(venues: Restaurant[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of venues) {
    const s = v.style as BbqStyle;
    if (s && String(s) !== "other" && !seen.has(String(s))) {
      seen.add(String(s));
      if (STYLE_LABELS[s]) out.push(STYLE_LABELS[s]);
    }
  }
  return out;
}

const names = (venues: Restaurant[], n: number): string[] =>
  venues.slice(0, n).map((v) => v.name).filter(Boolean);

export interface Faq {
  q: string;
  a: string;
}

export function cityIntro(cityName: string, countryName: string, venues: Restaurant[]): string {
  const n = venues.length;
  const styles = stylesPresent(venues);
  const top = names(venues, 3);
  const word = n === 1 ? "spot" : "spots";
  const out: string[] = [];

  if (styles.length >= 2) {
    out.push(`${cityName} has ${n} barbecue ${word} mapped on The BBQ Atlas, spanning ${humanList(styles, 3)}.`);
  } else if (styles.length === 1) {
    out.push(`${cityName} has ${n} barbecue ${word} on The BBQ Atlas, with ${styles[0]}-style smoke on the menu.`);
  } else {
    out.push(`${cityName} has ${n} barbecue ${word} mapped on The BBQ Atlas.`);
  }
  if (top.length >= 2) {
    out.push(`You'll find ${humanList(top, 3)} here${n > 3 ? ", among others" : ""}.`);
  } else if (top.length === 1) {
    out.push(`That includes ${top[0]}.`);
  }
  out.push(`We don't rank them — explore each below and decide where you're eating in ${cityName}, ${countryName}.`);
  return out.join(" ");
}

export function cityFaqs(cityName: string, countryName: string, venues: Restaurant[]): Faq[] {
  const n = venues.length;
  const styles = stylesPresent(venues);
  const top = names(venues, 5);
  const faqs: Faq[] = [
    {
      q: `How many barbecue restaurants are in ${cityName}?`,
      a: `The BBQ Atlas maps ${n} barbecue ${n === 1 ? "venue" : "venues"} in ${cityName}, ${countryName}${top.length ? `, including ${humanList(top, 4)}` : ""}.`,
    },
  ];
  if (styles.length) {
    faqs.push({
      q: `What styles of barbecue can you find in ${cityName}?`,
      a: `Barbecue in ${cityName} spans ${humanList(styles, 5)}.`,
    });
  }
  faqs.push({
    q: `What's the best barbecue in ${cityName}?`,
    a: `The BBQ Atlas celebrates barbecue rather than ranking it, so we won't crown one. ${
      top.length
        ? `In ${cityName} you can explore ${humanList(top, 4)} — each has its own story.`
        : `Explore every ${cityName} venue on the Atlas and decide for yourself.`
    }`,
  });
  return faqs;
}

/** Concise, unique meta description for a city hub (≤~160 chars). */
export function cityMetaDescription(cityName: string, countryName: string, venues: Restaurant[]): string {
  const n = venues.length;
  const styles = stylesPresent(venues);
  const base = `${n} barbecue ${n === 1 ? "spot" : "spots"} in ${cityName}, ${countryName} on The BBQ Atlas`;
  const tail = styles.length ? ` — ${humanList(styles, 3)}. Where to eat live-fire barbecue.` : ` — where to eat live-fire barbecue.`;
  return (base + tail).slice(0, 160);
}

export function countryIntro(countryName: string, venues: Restaurant[], cityCount: number): string {
  const n = venues.length;
  const styles = stylesPresent(venues);
  const out: string[] = [
    `The BBQ Atlas maps ${n} barbecue ${n === 1 ? "venue" : "venues"} across ${cityCount} ${cityCount === 1 ? "city" : "cities"} in ${countryName}.`,
  ];
  if (styles.length >= 2) {
    out.push(`From ${humanList(styles, 4)}, it's a snapshot of how ${countryName} cooks over live fire.`);
  } else if (styles.length === 1) {
    out.push(`${styles[0]}-style barbecue leads the way.`);
  }
  out.push(`Browse by city below, or dive straight into the venues.`);
  return out.join(" ");
}

export function countryFaqs(
  countryName: string,
  venues: Restaurant[],
  cityNames: string[]
): Faq[] {
  const n = venues.length;
  const styles = stylesPresent(venues);
  const faqs: Faq[] = [
    {
      q: `How many barbecue restaurants are in ${countryName}?`,
      a: `The BBQ Atlas maps ${n} barbecue ${n === 1 ? "venue" : "venues"} across ${cityNames.length} ${cityNames.length === 1 ? "city" : "cities"} in ${countryName}${cityNames.length ? `, including ${humanList(cityNames, 4)}` : ""}.`,
    },
  ];
  if (styles.length) {
    faqs.push({
      q: `What styles of barbecue can you find in ${countryName}?`,
      a: `Barbecue in ${countryName} spans ${humanList(styles, 6)}.`,
    });
  }
  return faqs;
}

export function countryMetaDescription(countryName: string, venues: Restaurant[], cityCount: number): string {
  const n = venues.length;
  return `${n} barbecue ${n === 1 ? "venue" : "venues"} across ${cityCount} ${cityCount === 1 ? "city" : "cities"} in ${countryName} on The BBQ Atlas — by city and style.`.slice(0, 160);
}
