/**
 * Opening hours helpers.
 *
 * CANONICAL SHAPE — `restaurants.hours` is a jsonb object keyed by 3-letter
 * lowercase day (`mon,tue,wed,thu,fri,sat,sun`). Each PRESENT day's value is a
 * canonical STRING:
 *   - "Closed"
 *   - "24 hours"
 *   - one or more `HH:MM–HH:MM` slots (24-hour clock, EN DASH "–" U+2013,
 *     zero-padded) joined by ", " — e.g. "11:00–14:00, 17:00–22:00" (split shift).
 *   - A day ABSENT from the object = unknown (not rendered).
 *
 * Legacy data sometimes holds free text (e.g. "Sold Out (2pm)"). The parsers
 * degrade gracefully — they keep such values as-is / best-effort, and NEW saves
 * emit the canonical form. We never fabricate a close time from fuzzy copy in the
 * schema.org spec.
 */

const DAY_NAME: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

const DAY_SHORT: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const ORDER = DAY_KEYS;

export interface DaySlot {
  open: string;
  close: string;
}
export interface DayHours {
  closed: boolean;
  allDay: boolean;
  slots: DaySlot[];
}

function asMap(hours: unknown): Record<string, string> | null {
  if (!hours || typeof hours !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(hours as Record<string, unknown>)) {
    if (v != null && String(v).trim()) out[k.toLowerCase().slice(0, 3)] = String(v).trim();
  }
  return Object.keys(out).length ? out : null;
}

/** Display rows in week order: [{ day: "Monday", value: "11:00–17:00" }, …] */
export function hoursRows(hours: unknown): { day: string; value: string }[] {
  const map = asMap(hours);
  if (!map) return [];
  return ORDER.filter((k) => map[k]).map((k) => ({ day: DAY_NAME[k], value: map[k] }));
}

/** True when we hold any hours at all (for the enrichment flag). */
export function hasHours(hours: unknown): boolean {
  return hoursRows(hours).length > 0;
}

// ---------------------------------------------------------------------------
// Canonical single-day <-> structured DayHours
// ---------------------------------------------------------------------------

const SLOT_RE = /(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})/;

/** Canonical/loose day string → DayHours (best-effort, never throws). */
export function parseDayValue(value: string | null | undefined): DayHours {
  const empty: DayHours = { closed: false, allDay: false, slots: [] };
  if (value == null) return empty;
  const v = String(value).trim();
  if (!v) return empty;
  if (/^closed$/i.test(v)) return { closed: true, allDay: false, slots: [] };
  if (/^(24\s*h(?:ours)?|open\s*24\s*hours|all\s*day)$/i.test(v))
    return { closed: false, allDay: true, slots: [] };
  const slots: DaySlot[] = [];
  for (const part of v.split(",")) {
    const m = part.match(SLOT_RE);
    if (m) slots.push({ open: m[1], close: m[2] });
  }
  if (slots.length) return { closed: false, allDay: false, slots };
  return empty;
}

/** DayHours → canonical string. Empty (unknown) → "" so the caller omits the day. */
export function serializeDayValue(d: DayHours): string {
  if (d.closed) return "Closed";
  if (d.allDay) return "24 hours";
  const slots = d.slots.filter((s) => s.open && s.close);
  if (!slots.length) return "";
  return slots.map((s) => `${s.open}–${s.close}`).join(", ");
}

// getDay() order (0 = Sunday) mapped to our 3-letter keys.
const GETDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const hhmmToMin = (s: string): number | null => {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * Open / closed / unknown for a specific instant, from the canonical hours map.
 * Best-effort and timezone-naive by design (it reads `at` in whatever timezone
 * the Date carries) — used only for the small-hours aside, never for anything
 * authoritative. Handles slots that wrap past midnight (e.g. Fri 18:00–02:00 is
 * still open at 01:00 Sat). "unknown" when we simply have no hours to judge by.
 */
export function openStateAt(hours: unknown, at: Date): "open" | "closed" | "unknown" {
  const map = asMap(hours);
  if (!map) return "unknown";
  const idx = at.getDay();
  const todayKey = GETDAY_KEYS[idx];
  const yestKey = GETDAY_KEYS[(idx + 6) % 7];
  const mins = at.getHours() * 60 + at.getMinutes();
  const today = map[todayKey];
  const yest = map[yestKey];
  if (today === undefined && yest === undefined) return "unknown";

  if (today !== undefined) {
    const d = parseDayValue(today);
    if (d.allDay) return "open";
    for (const s of d.slots) {
      const o = hhmmToMin(s.open);
      const c = hhmmToMin(s.close);
      if (o === null || c === null) continue;
      if (c > o) { if (mins >= o && mins < c) return "open"; }
      else if (c < o) { if (mins >= o) return "open"; } // wraps into tomorrow
    }
  }
  // A previous-day slot that wraps past midnight can still be open now.
  if (yest !== undefined) {
    const d = parseDayValue(yest);
    for (const s of d.slots) {
      const o = hhmmToMin(s.open);
      const c = hhmmToMin(s.close);
      if (o === null || c === null) continue;
      if (c < o && mins < c) return "open";
    }
  }
  return "closed";
}

// ---------------------------------------------------------------------------
// Human display formatting
// ---------------------------------------------------------------------------

function fmtClock(hhmm: string): string | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  const period = h < 12 || h === 24 ? "am" : "pm";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}${min ? ":" + String(min).padStart(2, "0") : ""}${period}`;
}

/** Canonical → human am/pm, e.g. "11:00–21:00" → "11am–9pm". Legacy text passes through. */
export function formatHoursValue(canonical: string): string {
  const v = (canonical ?? "").trim();
  if (!v) return v;
  if (/^closed$/i.test(v)) return "Closed";
  if (/^24 hours$/i.test(v)) return "Open 24 hours";
  const out: string[] = [];
  for (const part of v.split(",")) {
    const m = part.trim().match(/^(\d{1,2}:\d{2})\s*[–—-]\s*(\d{1,2}:\d{2})$/);
    if (!m) return canonical; // legacy free text — pass through unchanged
    const a = fmtClock(m[1]);
    const b = fmtClock(m[2]);
    if (!a || !b) return canonical;
    out.push(`${a}–${b}`);
  }
  return out.join(", ");
}

/**
 * Week-ordered rows, GROUPING consecutive days that share an identical canonical
 * value into a range label, e.g. Mon closed + Tue..Sun "11:00–21:00" →
 * [{days:"Mon", value:"Closed"}, {days:"Tue–Sun", value:"11am–9pm"}].
 */
export function groupedHours(hours: unknown): { days: string; value: string }[] {
  const map = asMap(hours);
  if (!map) return [];
  const present = ORDER.filter((k) => map[k]);
  const out: { days: string; value: string }[] = [];
  let i = 0;
  while (i < present.length) {
    const val = map[present[i]];
    let j = i;
    while (
      j + 1 < present.length &&
      map[present[j + 1]] === val &&
      ORDER.indexOf(present[j + 1]) === ORDER.indexOf(present[j]) + 1
    ) {
      j++;
    }
    const label =
      i === j ? DAY_SHORT[present[i]] : `${DAY_SHORT[present[i]]}–${DAY_SHORT[present[j]]}`;
    out.push({ days: label, value: formatHoursValue(val) });
    i = j + 1;
  }
  return out;
}

/**
 * schema.org OpeningHoursSpecification — one entry per SLOT (split shifts emit
 * multiple entries), "24 hours" → 00:00–23:59. Legacy non-canonical values are
 * skipped — we never fabricate a close time from fuzzy copy.
 */
export function openingHoursSpec(hours: unknown): {
  "@type": string;
  dayOfWeek: string;
  opens: string;
  closes: string;
}[] {
  const map = asMap(hours);
  if (!map) return [];
  const spec = [];
  for (const k of ORDER) {
    const v = map[k];
    if (!v) continue;
    const d = parseDayValue(v);
    if (d.closed) continue;
    if (d.allDay) {
      spec.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${DAY_NAME[k]}`,
        opens: "00:00",
        closes: "23:59",
      });
      continue;
    }
    for (const s of d.slots) {
      spec.push({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${DAY_NAME[k]}`,
        opens: s.open,
        closes: s.close,
      });
    }
  }
  return spec;
}

// ---------------------------------------------------------------------------
// Natural-language parser
// ---------------------------------------------------------------------------

function normDay(tok: string): DayKey | null {
  const t = tok.toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return null;
  const t3 = t.slice(0, 3);
  return (DAY_KEYS as readonly string[]).includes(t3) ? (t3 as DayKey) : null;
}

function expandDayRange(a: DayKey, b: DayKey): DayKey[] {
  const bi = DAY_KEYS.indexOf(b);
  let i = DAY_KEYS.indexOf(a);
  const out: DayKey[] = [];
  for (let n = 0; n < 7; n++) {
    out.push(DAY_KEYS[i]);
    if (i === bi) break;
    i = (i + 1) % 7;
  }
  return out;
}

/** Parse a day fragment: "mon–fri", "tue-sun", "mon to fri", "mon", "mon wed fri". */
function parseDaySpec(text: string): DayKey[] | null {
  const d = text.trim();
  if (!d) return null;
  const rangeM = d.match(/^([a-z]+)\s*(?:–|—|-|to)\s*([a-z]+)$/i);
  if (rangeM) {
    const a = normDay(rangeM[1]);
    const b = normDay(rangeM[2]);
    return a && b ? expandDayRange(a, b) : null;
  }
  const keys: DayKey[] = [];
  for (const p of d.split(/\s+/).filter(Boolean)) {
    const k = normDay(p);
    if (!k) return null; // an unknown word means this isn't a clean day spec
    if (!keys.includes(k)) keys.push(k);
  }
  return keys.length ? keys : null;
}

function minToHHMM(min: number): string {
  const mm = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(mm / 60)).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
}

/** Candidate minute values for a single clock token (bare → am AND pm options). */
function clockCandidates(token: string): number[] | null {
  const t = token.trim().toLowerCase();
  if (t === "noon") return [12 * 60];
  if (t === "midnight") return [0];
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 24 || min > 59) return null;
  const mer = m[3];
  if (mer === "am") {
    if (h === 12) h = 0;
    return [h * 60 + min];
  }
  if (mer === "pm") {
    if (h !== 12) h += 12;
    return [h * 60 + min];
  }
  if (h >= 13 && h <= 24) return [(h % 24) * 60 + min]; // 24-hour notation, e.g. "17"
  if (h === 0) return [0];
  if (h === 12) return [0, 12 * 60]; // midnight or noon
  return [h * 60 + min, (h + 12) * 60 + min]; // 1..11 → am or pm
}

/** Pick the earliest candidate at/after the cursor; else roll to the latest (pm). */
function resolveEndpoint(cands: number[], cursor: number): number {
  const geq = cands.filter((c) => c >= cursor).sort((a, b) => a - b);
  return geq.length ? geq[0] : Math.max(...cands);
}

const TIME_RANGE_RE =
  /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)\s*(?:–|—|-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight)/gi;

/**
 * Parse every time range in a fragment into ordered slots, threading a cursor so
 * bare hours resolve sensibly ("11–3 and 5–10" → 11:00–15:00, 17:00–22:00). The
 * cursor starts at 06:00: bare 6–11 read as am, 12 as noon, 1–5 as pm, and each
 * subsequent endpoint rolls to the next plausible time after the previous one.
 */
function parseTimeSlots(text: string): DaySlot[] | null {
  const re = new RegExp(TIME_RANGE_RE.source, "gi");
  const slots: DaySlot[] = [];
  let cursor = 6 * 60;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const oc = clockCandidates(m[1]);
    const cc = clockCandidates(m[2]);
    if (!oc || !cc) return slots.length ? slots : null;
    const openMin = resolveEndpoint(oc, cursor);
    const closeMin = resolveEndpoint(cc, openMin);
    slots.push({ open: minToHHMM(openMin), close: minToHHMM(closeMin) });
    cursor = closeMin;
  }
  return slots.length ? slots : null;
}

interface PieceParse {
  days: DayKey[] | null;
  valueType: "time" | "closed" | "allday" | null;
  slots: DaySlot[];
}

const ALLDAY_RE = /\b(24\s*h(?:ours)?|open\s*24\s*hours|all\s*day)\b/i;

function parsePiece(piece: string): PieceParse {
  const text = piece.trim();
  let valueType: PieceParse["valueType"] = null;
  let slots: DaySlot[] = [];
  let dayText = text;

  if (/\bclosed\b/i.test(text)) {
    valueType = "closed";
    dayText = text.replace(/\bclosed\b/gi, " ");
  } else if (ALLDAY_RE.test(text)) {
    valueType = "allday";
    dayText = text.replace(new RegExp(ALLDAY_RE.source, "gi"), " ");
  } else {
    const parsed = parseTimeSlots(text);
    if (parsed) {
      valueType = "time";
      slots = parsed;
      dayText = text
        .replace(new RegExp(TIME_RANGE_RE.source, "gi"), " ")
        .replace(/\b(and|&)\b/gi, " ");
    }
  }

  const days = parseDaySpec(dayText.replace(/,/g, " ").trim());
  return { days, valueType, slots };
}

/**
 * Natural-language opening-hours parser. Returns the canonical day→string map
 * plus the exact source fragments it could not parse (so the UI can surface
 * them). Conservative: ambiguous fragments go to `unparsed` rather than guessed.
 */
export function parseHoursText(text: string): {
  hours: Record<string, string>;
  unparsed: string[];
} {
  const hours: Record<string, string> = {};
  const unparsed: string[] = [];
  if (!text || !text.trim()) return { hours, unparsed };

  const assign = (days: DayKey[], vt: "time" | "closed" | "allday", slots: DaySlot[]) => {
    const dh: DayHours = {
      closed: vt === "closed",
      allDay: vt === "allday",
      slots: vt === "time" ? slots : [],
    };
    const canonical = serializeDayValue(dh);
    if (!canonical) return;
    for (const d of days) hours[d] = canonical;
  };

  for (const line of text.split(/[\n;]+/)) {
    if (!line.trim()) continue;
    let pendingDays: DayKey[] = [];
    let pendingRaw: string[] = [];
    let lastGroupDays: DayKey[] | null = null;

    for (const rawPiece of line.split(",")) {
      const piece = rawPiece.trim();
      if (!piece) continue;
      const p = parsePiece(piece);

      if (!p.days && !p.valueType) {
        unparsed.push(piece);
        continue;
      }
      if (p.days && !p.valueType) {
        // Day-only fragment ("Mon", "Wed") — hold until a value arrives.
        pendingDays.push(...p.days);
        pendingRaw.push(piece);
        continue;
      }
      if (p.valueType && (!p.days || p.days.length === 0)) {
        // Value-only fragment — a split-shift continuation of the previous group.
        if (p.valueType === "time" && lastGroupDays && p.slots.length) {
          const prev = parseDayValue(hours[lastGroupDays[0]] ?? "");
          const merged = serializeDayValue({
            closed: false,
            allDay: false,
            slots: [...prev.slots, ...p.slots],
          });
          for (const d of lastGroupDays) hours[d] = merged;
        } else {
          unparsed.push(piece);
        }
        continue;
      }

      const days = [...pendingDays, ...(p.days ?? [])];
      pendingDays = [];
      pendingRaw = [];
      assign(days, p.valueType!, p.slots);
      lastGroupDays = days;
    }

    if (pendingRaw.length) unparsed.push(...pendingRaw);
  }

  return { hours, unparsed };
}
