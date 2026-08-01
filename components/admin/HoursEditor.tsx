"use client";

import { useState } from "react";
import { Plus, Trash2, Wand2, Copy } from "lucide-react";
import {
  DAY_KEYS,
  type DayHours,
  parseDayValue,
  serializeDayValue,
  parseHoursText,
} from "@/lib/restaurants/hours";

const DAY_LABEL: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const emptyDay = (): DayHours => ({ closed: false, allDay: false, slots: [] });
const cloneDay = (d: DayHours): DayHours => ({
  closed: d.closed,
  allDay: d.allDay,
  slots: d.slots.map((s) => ({ ...s })),
});

function deriveDays(value: Record<string, string> | null): DayHours[] {
  return DAY_KEYS.map((k) => {
    const v = value?.[k];
    return v != null ? parseDayValue(v) : emptyDay();
  });
}

function buildHours(days: DayHours[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  days.forEach((d, i) => {
    const s = serializeDayValue(d);
    if (s) out[DAY_KEYS[i]] = s;
  });
  return Object.keys(out).length ? out : null;
}

const timeInput =
  "rounded-md border border-border-default bg-surface-0 px-2 py-1 text-xs text-text-primary focus:border-brand-gold/60 focus:outline-none";

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
        active
          ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
          : "border-border-default text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
      }`}
    >
      {children}
    </button>
  );
}

export function HoursEditor({
  value,
  onChange,
}: {
  value: Record<string, string> | null;
  onChange: (hours: Record<string, string> | null) => void;
}) {
  const [days, setDays] = useState<DayHours[]>(() => deriveDays(value));
  const [text, setText] = useState("");
  const [unparsed, setUnparsed] = useState<string[]>([]);

  const commit = (next: DayHours[]) => {
    setDays(next);
    onChange(buildHours(next));
  };
  const patchDay = (i: number, next: DayHours) =>
    commit(days.map((d, idx) => (idx === i ? next : d)));

  const setClosed = (i: number, on: boolean) =>
    patchDay(i, on ? { closed: true, allDay: false, slots: [] } : { ...days[i], closed: false });
  const setAllDay = (i: number, on: boolean) =>
    patchDay(i, on ? { closed: false, allDay: true, slots: [] } : { ...days[i], allDay: false });

  const addSlot = (i: number) =>
    patchDay(i, {
      closed: false,
      allDay: false,
      slots: [...days[i].slots, { open: "", close: "" }],
    });
  const removeSlot = (i: number, si: number) =>
    patchDay(i, { ...days[i], slots: days[i].slots.filter((_, idx) => idx !== si) });
  const setSlot = (i: number, si: number, field: "open" | "close", val: string) =>
    patchDay(i, {
      ...days[i],
      slots: days[i].slots.map((s, idx) => (idx === si ? { ...s, [field]: val } : s)),
    });

  const copyMonday = (upto: number) => {
    const src = days[0];
    commit(days.map((d, idx) => (idx >= 1 && idx <= upto ? cloneDay(src) : d)));
  };

  const onParse = () => {
    const res = parseHoursText(text);
    // Fill only the days the parser recognised; leave the rest as the operator
    // left them. This is the CONFIRM step — nothing is saved until the outer Save.
    commit(
      days.map((d, i) => {
        const v = res.hours[DAY_KEYS[i]];
        return v != null ? parseDayValue(v) : d;
      })
    );
    setUnparsed(res.unparsed);
  };

  return (
    <div className="space-y-3 rounded-md border border-border-default bg-surface-0 p-3">
      {/* Natural-text parser */}
      <div className="space-y-2">
        <p className="text-xs text-text-muted">
          Type hours in plain English, then Parse to fill the rows below — e.g.{" "}
          <span className="text-text-secondary">
            &ldquo;Mon&ndash;Fri 11&ndash;3 and 5&ndash;10, Sat 12&ndash;11, Sun closed&rdquo;
          </span>
          .
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Tue–Sun 11am–9pm, closed Mondays"
          className="w-full resize-y rounded-md border border-border-default bg-surface-0 px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onParse}
            disabled={!text.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
          >
            <Wand2 className="h-3.5 w-3.5" />
            Parse into rows
          </button>
        </div>
        {unparsed.length > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-400">
            Couldn&apos;t read {unparsed.length === 1 ? "this bit" : "these bits"} — enter{" "}
            {unparsed.length === 1 ? "it" : "them"} manually below:{" "}
            <span className="font-semibold">{unparsed.join(" · ")}</span>
          </p>
        )}
      </div>

      {/* Helper buttons */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
        <button
          type="button"
          onClick={() => copyMonday(6)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-2 py-1 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
        >
          <Copy className="h-3 w-3" />
          Copy Monday to all days
        </button>
        <button
          type="button"
          onClick={() => copyMonday(4)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-2 py-1 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
        >
          <Copy className="h-3 w-3" />
          Copy Monday to weekdays (Mon–Fri)
        </button>
      </div>

      {/* Day rows */}
      <div className="space-y-2 border-t border-border-subtle pt-2">
        {DAY_KEYS.map((k, i) => {
          const d = days[i];
          return (
            <div
              key={k}
              className="flex flex-col gap-2 rounded-md border border-border-subtle p-2 sm:flex-row sm:items-start"
            >
              <div className="w-24 shrink-0 pt-1 text-xs font-semibold text-text-primary">
                {DAY_LABEL[k]}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ToggleChip active={d.closed} onClick={() => setClosed(i, !d.closed)}>
                    Closed
                  </ToggleChip>
                  <ToggleChip active={d.allDay} onClick={() => setAllDay(i, !d.allDay)}>
                    Open 24h
                  </ToggleChip>
                  {!d.closed && !d.allDay && (
                    <button
                      type="button"
                      onClick={() => addSlot(i)}
                      className="inline-flex items-center gap-1 rounded-md border border-border-default px-2 py-1 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
                    >
                      <Plus className="h-3 w-3" />
                      add hours
                    </button>
                  )}
                  {!d.closed && !d.allDay && d.slots.length === 0 && (
                    <span className="text-xs text-text-muted">— unknown / not set</span>
                  )}
                </div>
                {!d.closed &&
                  !d.allDay &&
                  d.slots.map((s, si) => (
                    <div key={si} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={s.open}
                        onChange={(e) => setSlot(i, si, "open", e.target.value)}
                        className={timeInput}
                        aria-label={`${DAY_LABEL[k]} opening time`}
                      />
                      <span className="text-xs text-text-muted">to</span>
                      <input
                        type="time"
                        value={s.close}
                        onChange={(e) => setSlot(i, si, "close", e.target.value)}
                        className={timeInput}
                        aria-label={`${DAY_LABEL[k]} closing time`}
                      />
                      <button
                        type="button"
                        onClick={() => removeSlot(i, si)}
                        aria-label="Remove hours slot"
                        className="rounded-md border border-border-default p-1 text-text-muted hover:border-destructive/60 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
