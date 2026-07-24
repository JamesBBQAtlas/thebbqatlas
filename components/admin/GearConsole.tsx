"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Star, Pencil, Archive, RotateCcw, Trash2 } from "lucide-react";
import type { GearProduct, GearCategory } from "@/lib/types/database";
import { GEAR_CATEGORIES, GEAR_CATEGORY_LABELS } from "@/lib/constants/gear";

type Draft = Partial<GearProduct> & { style_tags_text?: string };

const EMPTY: Draft = {
  name: "",
  brand: "",
  category: "thermometers",
  affiliate_url: "",
  partner: "amazon",
  price_note: "",
  image_url: "",
  description: "",
  style_tags_text: "",
  sort_order: 0,
  is_featured: false,
  is_active: true,
};

const input =
  "w-full rounded-md border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold focus:outline-none focus:ring-2 focus:ring-brand-gold/20";

export function GearConsole({
  initialProducts,
}: {
  initialProducts: GearProduct[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function edit(p: GearProduct) {
    setError("");
    setDraft({ ...p, style_tags_text: (p.style_tags ?? []).join(", ") });
  }

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/gear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        setBusy(false);
        return false;
      }
      setBusy(false);
      return true;
    } catch {
      setError("Network error.");
      setBusy(false);
      return false;
    }
  }

  async function save() {
    if (!draft) return;
    if (!draft.name?.trim() || !draft.affiliate_url?.trim()) {
      setError("Name and affiliate URL are required.");
      return;
    }
    const style_tags = (draft.style_tags_text ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ok = await post({
      action: "save",
      product: {
        id: draft.id,
        name: draft.name,
        brand: draft.brand,
        category: draft.category,
        affiliate_url: draft.affiliate_url,
        partner: draft.partner,
        price_note: draft.price_note,
        image_url: draft.image_url,
        description: draft.description,
        style_tags,
        sort_order: Number(draft.sort_order) || 0,
        is_featured: Boolean(draft.is_featured),
        is_active: draft.is_active ?? true,
      },
    });
    if (ok) {
      setDraft(null);
      router.refresh();
    }
  }

  async function act(id: string, action: string) {
    if (action === "delete" && !confirm("Delete this product permanently?")) return;
    const ok = await post({ action, id });
    if (ok) router.refresh();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {initialProducts.length} product
          {initialProducts.length === 1 ? "" : "s"} in the catalogue
        </p>
        {!draft && (
          <button
            onClick={() => {
              setError("");
              setDraft({ ...EMPTY });
            }}
            className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-4 py-2 text-sm font-bold uppercase tracking-[0.05em] text-text-inverse hover:bg-brand-gold/90"
          >
            <Plus className="h-4 w-4" /> Add product
          </button>
        )}
      </div>

      {draft && (
        <div className="mb-8 rounded-2xl border border-brand-gold/30 bg-surface-0 p-5">
          <h3 className="mb-4 font-heading text-lg font-bold text-text-primary">
            {draft.id ? "Edit product" : "New product"}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <input
                className={input}
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Brand">
              <input
                className={input}
                value={draft.brand ?? ""}
                onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
              />
            </Field>
            <Field label="Category *">
              <select
                className={input}
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value as GearCategory })
                }
              >
                {GEAR_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Partner (amazon / thermoworks / traeger / bbqguys)">
              <input
                className={input}
                value={draft.partner ?? ""}
                onChange={(e) => setDraft({ ...draft, partner: e.target.value })}
              />
            </Field>
            <Field label="Affiliate URL *" full>
              <input
                className={input}
                placeholder="https://…"
                value={draft.affiliate_url ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, affiliate_url: e.target.value })
                }
              />
            </Field>
            <Field label="Image URL (official affiliate assets only)" full>
              <input
                className={input}
                placeholder="Amazon SiteStripe / PA-API or brand asset URL"
                value={draft.image_url ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, image_url: e.target.value })
                }
              />
            </Field>
            <Field label="Description" full>
              <textarea
                className={input}
                rows={2}
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <Field label="Price note (e.g. $99)">
              <input
                className={input}
                value={draft.price_note ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, price_note: e.target.value })
                }
              />
            </Field>
            <Field label="Style tags (comma-separated; blank = general)">
              <input
                className={input}
                placeholder="central_texas, korean"
                value={draft.style_tags_text ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, style_tags_text: e.target.value })
                }
              />
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                className={input}
                value={draft.sort_order ?? 0}
                onChange={(e) =>
                  setDraft({ ...draft, sort_order: Number(e.target.value) })
                }
              />
            </Field>
            <label className="flex items-center gap-2 self-end text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={Boolean(draft.is_featured)}
                onChange={(e) =>
                  setDraft({ ...draft, is_featured: e.target.checked })
                }
                className="h-4 w-4 rounded border-border-default"
              />
              Featured (surfaces on venue pages)
            </label>
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
        {GEAR_CATEGORIES.map((cat) => {
          const items = initialProducts.filter((p) => p.category === cat.key);
          if (!items.length) return null;
          return (
            <section key={cat.key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-muted">
                {GEAR_CATEGORY_LABELS[cat.key]} · {items.length}
              </h2>
              <div className="overflow-hidden rounded-xl border border-border-subtle">
                {items.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-0 ${
                      p.is_active ? "" : "opacity-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {p.is_featured && (
                          <Star className="h-3.5 w-3.5 shrink-0 text-brand-gold" />
                        )}
                        <span className="truncate text-sm font-semibold text-text-primary">
                          {p.brand ? `${p.brand} · ` : ""}
                          {p.name}
                        </span>
                        {!p.is_active && (
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.625rem] uppercase text-text-muted">
                            Retired
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-text-muted">
                        {p.affiliate_url}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <IconBtn title="Edit" onClick={() => edit(p)}>
                        <Pencil className="h-4 w-4" />
                      </IconBtn>
                      {p.is_active ? (
                        <IconBtn
                          title="Retire"
                          onClick={() => act(p.id, "retire")}
                        >
                          <Archive className="h-4 w-4" />
                        </IconBtn>
                      ) : (
                        <IconBtn
                          title="Restore"
                          onClick={() => act(p.id, "restore")}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </IconBtn>
                      )}
                      <IconBtn
                        title="Delete"
                        onClick={() => act(p.id, "delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
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

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="mb-1 block text-xs font-medium text-text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
    >
      {children}
    </button>
  );
}
