"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Pencil, Archive, RotateCcw, Trash2 } from "lucide-react";
import type { VoiceLine, VoiceSlot } from "@/lib/types/database";

const SLOTS: { key: VoiceSlot; label: string }[] = [
  { key: "homepage_subline", label: "Homepage sub-line" },
  { key: "footer", label: "Footer" },
  { key: "empty_state", label: "Empty states" },
  { key: "loading", label: "Loading" },
  { key: "not_found", label: "404" },
  { key: "newsletter_confirm", label: "Newsletter confirm" },
  { key: "success_toast", label: "Success toasts" },
];
const LABEL = Object.fromEntries(SLOTS.map((s) => [s.key, s.label])) as Record<
  VoiceSlot,
  string
>;

type Draft = Partial<VoiceLine>;
const input =
  "w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20";

export function VoiceConsole({ initialLines }: { initialLines: VoiceLine[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return false;
      }
      return true;
    } catch {
      setBusy(false);
      setError("Network error.");
      return false;
    }
  }

  async function save() {
    if (!draft?.text?.trim() || !draft.slot) {
      setError("Slot and text are required.");
      return;
    }
    const ok = await post({
      action: "save",
      line: {
        id: draft.id,
        slot: draft.slot,
        text: draft.text,
        tag: draft.tag,
        sort_order: Number(draft.sort_order) || 0,
        is_active: draft.is_active ?? true,
      },
    });
    if (ok) {
      setDraft(null);
      router.refresh();
    }
  }

  async function act(id: string, action: string) {
    if (action === "delete" && !confirm("Delete this line permanently?")) return;
    if (await post({ action, id })) router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-text-muted">{initialLines.length} lines</p>
        {!draft && (
          <button
            onClick={() =>
              setDraft({ slot: "footer", sort_order: 0, is_active: true })
            }
            className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.05em] text-text-inverse hover:bg-brand-gold/90"
          >
            <Plus className="h-4 w-4" /> Add line
          </button>
        )}
      </div>

      {draft && (
        <div className="mb-8 rounded-2xl border border-brand-gold/30 bg-surface-0 p-5">
          <h3 className="mb-4 font-heading text-lg font-bold text-text-primary">
            {draft.id ? "Edit line" : "New line"}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-text-muted">Slot *</label>
              <select
                className={input}
                value={draft.slot}
                onChange={(e) =>
                  setDraft({ ...draft, slot: e.target.value as VoiceSlot })
                }
              >
                {SLOTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                Tag (optional — e.g. ron, save, checkin)
              </label>
              <input
                className={input}
                value={draft.tag ?? ""}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-text-muted">Text *</label>
              <textarea
                className={input}
                rows={2}
                value={draft.text ?? ""}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-text-muted">
                Sort order
              </label>
              <input
                type="number"
                className={input}
                value={draft.sort_order ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, sort_order: Number(e.target.value) })
                }
              />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          <div className="mt-5 flex gap-3">
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-5 py-2 text-sm font-bold uppercase tracking-[0.05em] text-text-inverse hover:bg-brand-gold/90 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
            <button
              onClick={() => {
                setDraft(null);
                setError("");
              }}
              className="rounded-md border border-border-default px-5 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {SLOTS.map((slot) => {
          const items = initialLines.filter((l) => l.slot === slot.key);
          if (!items.length) return null;
          return (
            <section key={slot.key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
                {slot.label} · {items.length}
              </h2>
              <div className="overflow-hidden rounded-xl border border-border-subtle">
                {items.map((l) => (
                  <div
                    key={l.id}
                    className={`flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0 ${
                      l.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">
                        {l.text}
                      </p>
                      {(l.tag || !l.is_active) && (
                        <p className="text-[0.6875rem] uppercase tracking-wide text-text-muted">
                          {l.tag ? `tag: ${l.tag}` : ""}
                          {l.tag && !l.is_active ? " · " : ""}
                          {!l.is_active ? "retired" : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        title="Edit"
                        onClick={() => {
                          setError("");
                          setDraft({ ...l });
                        }}
                        className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-primary"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        title={l.is_active ? "Retire" : "Restore"}
                        onClick={() =>
                          act(l.id, l.is_active ? "retire" : "restore")
                        }
                        className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-primary"
                      >
                        {l.is_active ? (
                          <Archive className="h-4 w-4" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        title="Delete"
                        onClick={() => act(l.id, "delete")}
                        className="grid h-8 w-8 place-items-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-primary"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
