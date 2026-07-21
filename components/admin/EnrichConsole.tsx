"use client";

import { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Loader2,
  Search,
  Check,
  ExternalLink,
  Newspaper,
  Store,
} from "lucide-react";

type Tab = "venue" | "chain" | "news";

interface EnrichedVenue {
  name: string | null;
  description: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  style: string | null;
  offerings: string[];
  price_level: number | null;
  hours: Record<string, string> | null;
  permanently_closed: boolean | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  brand_name: string | null;
  location_label: string | null;
  is_multi_location: boolean;
  instagram_posts: string[];
  confidence: number;
  reviewer_notes: string | null;
  citations: string[];
}

interface NewsDraft {
  title: string;
  excerpt: string;
  content_md: string;
  category: "news" | "missive";
  citations: string[];
  reviewer_notes: string | null;
}

const inputClass =
  "w-full rounded-lg border border-border-default bg-surface-1 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none";
const labelClass =
  "mb-1 block text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-text-muted";

function Citations({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="mt-4">
      <p className={labelClass}>Sources Grok used</p>
      <ul className="space-y-1">
        {urls.map((u) => (
          <li key={u}>
            <a
              href={u}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-gold hover:underline"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{u}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VenueTool({
  onFindAllLocations,
  initialSlug,
}: {
  onFindAllLocations: (lead: {
    name?: string;
    instagram?: string;
    website?: string;
    city?: string;
    country?: string;
  }) => void;
  initialSlug?: string;
}) {
  const [lead, setLead] = useState({
    name: "",
    instagram: "",
    website: "",
    address: "",
    city: "",
    country: "",
    phone: "",
  });
  const [slug, setSlug] = useState("");
  const [venueId, setVenueId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "load" | "hunt" | "apply">(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<EnrichedVenue | null>(null);
  // Which fields to apply, plus their (editable) values.
  const [fields, setFields] = useState<Record<string, string>>({});
  const [include, setInclude] = useState<Record<string, boolean>>({});
  // Multi-location grouping.
  const [brandName, setBrandName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [isChain, setIsChain] = useState(false);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandStatus, setBrandStatus] = useState("");
  // New-venue creation.
  const [isNewVenue, setIsNewVenue] = useState(false);
  const [createBusy, setCreateBusy] = useState<null | "publish" | "queue">(null);
  const [createStatus, setCreateStatus] = useState("");
  const [category, setCategory] = useState("restaurant");
  const [eventStart, setEventStart] = useState("");
  const [eventEnd, setEventEnd] = useState("");
  const isEvent = category === "event" || category === "festival";

  const SCALARS = [
    "name",
    "description",
    "website",
    "phone",
    "address",
    "city",
    "country",
    "style",
    "price_level",
  ] as const;
  const SOCIALS = [
    "instagram_url",
    "x_url",
    "facebook_url",
    "tiktok_url",
    "youtube_url",
  ] as const;

  // Deep-link: /admin/enrich?slug=xxx auto-loads that venue on open.
  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (initialSlug && !didAutoLoad.current) {
      didAutoLoad.current = true;
      loadVenue(initialSlug);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSlug]);

  async function loadVenue(override?: string) {
    const useSlug = (override ?? slug).trim();
    if (!useSlug) return;
    if (override) setSlug(override);
    setBusy("load");
    setError("");
    setStatus("");
    const res = await fetch(`/api/admin/enrich/venue?slug=${encodeURIComponent(useSlug)}`);
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Could not load venue.");
      return;
    }
    const r = data.restaurant;
    setVenueId(r.id);
    setLead((l) => ({
      ...l,
      name: r.name ?? "",
      website: r.website ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      country: r.country ?? "",
      phone: r.phone ?? "",
    }));
    setStatus(`Loaded “${r.name}”. Now send Grok hunting to fill the gaps.`);
  }

  async function hunt() {
    setBusy("hunt");
    setError("");
    setStatus("");
    setResult(null);
    const res = await fetch("/api/admin/enrich/venue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead, restaurantId: venueId ?? undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Enrichment failed.");
      return;
    }
    const e: EnrichedVenue = data.enriched;
    setResult(e);
    const f: Record<string, string> = {
      name: e.name ?? lead.name ?? "",
      description: e.description ?? "",
      website: e.website ?? "",
      phone: e.phone ?? "",
      address: e.address ?? "",
      city: e.city ?? "",
      country: e.country ?? "",
      style: e.style ?? "",
      price_level: e.price_level != null ? String(e.price_level) : "",
      offerings: e.offerings.join(", "),
      hours: e.hours ? JSON.stringify(e.hours, null, 2) : "",
      instagram_url: e.instagram_url ?? "",
      x_url: e.x_url ?? "",
      facebook_url: e.facebook_url ?? "",
      tiktok_url: e.tiktok_url ?? "",
      youtube_url: e.youtube_url ?? "",
    };
    setFields(f);
    const inc: Record<string, boolean> = {};
    for (const k of Object.keys(f)) inc[k] = Boolean(f[k]);
    setInclude(inc);
    // Prefill brand grouping if Grok spotted a chain.
    setIsChain(Boolean(e.is_multi_location));
    setBrandName(e.brand_name ?? "");
    setLocationLabel(e.location_label ?? "");
  }

  async function groupUnderBrand() {
    if (!venueId) {
      setBrandStatus("Load a venue first.");
      return;
    }
    if (!brandName.trim()) {
      setBrandStatus("Enter a brand name.");
      return;
    }
    setBrandBusy(true);
    setBrandStatus("");
    // 1) resolve-or-create the brand
    const bRes = await fetch("/api/admin/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: brandName.trim() }),
    });
    const bData = await bRes.json().catch(() => ({}));
    if (!bRes.ok) {
      setBrandBusy(false);
      setBrandStatus(bData.error || "Could not create brand.");
      return;
    }
    // 2) attach this venue to it
    const aRes = await fetch("/api/admin/enrich/venue", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: venueId,
        fields: {
          brand_id: bData.id,
          location_label: locationLabel.trim() || null,
        },
      }),
    });
    setBrandBusy(false);
    if (!aRes.ok) {
      const aData = await aRes.json().catch(() => ({}));
      setBrandStatus(aData.error || "Could not attach venue to brand.");
      return;
    }
    setBrandStatus(
      `Grouped under “${brandName.trim()}”${locationLabel.trim() ? ` as “${locationLabel.trim()}”` : ""}. ✓`
    );
  }

  function buildVenuePayload() {
    let hours: unknown = null;
    if (fields.hours) {
      try {
        hours = JSON.parse(fields.hours);
      } catch {
        hours = null;
      }
    }
    const price = parseInt(fields.price_level ?? "", 10);
    return {
      name: fields.name?.trim() || result?.name || lead.name || "",
      description: fields.description ?? "",
      website: fields.website || null,
      phone: fields.phone || null,
      address: fields.address || null,
      city: fields.city || null,
      country: fields.country || null,
      style: fields.style || null,
      price_level: Number.isNaN(price) ? null : price,
      offerings: (fields.offerings ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      hours,
      permanently_closed: result?.permanently_closed ?? false,
      instagram_url: fields.instagram_url || null,
      x_url: fields.x_url || null,
      facebook_url: fields.facebook_url || null,
      tiktok_url: fields.tiktok_url || null,
      youtube_url: fields.youtube_url || null,
      instagram_posts: result?.instagram_posts ?? [],
      location_label: locationLabel.trim() || null,
      category,
      event_starts_at: isEvent && eventStart ? eventStart : null,
      event_ends_at: isEvent && eventEnd ? eventEnd : null,
    };
  }

  async function createVenue(publish: boolean) {
    setCreateBusy(publish ? "publish" : "queue");
    setError("");
    setCreateStatus("");
    const res = await fetch("/api/admin/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venue: buildVenuePayload(),
        publish,
        brand: brandName.trim() ? { name: brandName.trim() } : undefined,
        lead,
        citations: result?.citations ?? [],
      }),
    });
    const data = await res.json().catch(() => ({}));
    setCreateBusy(null);
    if (!res.ok) {
      setError(data.error || "Could not create venue.");
      return;
    }
    setCreateStatus(
      publish
        ? `Published “${buildVenuePayload().name}” — it's live at /restaurants/${data.slug}. ✓`
        : `Added “${buildVenuePayload().name}” to the review queue for polishing. ✓`
    );
  }

  async function apply() {
    if (!venueId) {
      setError("Load a venue by slug first — enrichment can only be applied to an existing venue.");
      return;
    }
    setBusy("apply");
    setError("");
    setStatus("");
    const payload: Record<string, unknown> = {};
    for (const [k, on] of Object.entries(include)) {
      if (!on) continue;
      const v = fields[k];
      if (k === "offerings") {
        payload.offerings = v.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (k === "hours") {
        try {
          payload.hours = v ? JSON.parse(v) : null;
        } catch {
          setBusy(null);
          setError("Hours isn't valid JSON — fix it or untick it.");
          return;
        }
      } else if (k === "price_level") {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n)) payload.price_level = n;
      } else if (v) {
        payload[k] = v;
      }
    }
    const res = await fetch("/api/admin/enrich/venue", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: venueId, fields: payload }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Could not apply.");
      return;
    }
    setStatus(`Applied ${data.applied?.length ?? 0} field(s) to the venue. ✓`);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Left: inputs */}
      <div>
        <div className="mb-5 rounded-lg border border-border-subtle bg-surface-1 p-4">
          <p className={labelClass}>Apply to an existing venue (optional)</p>
          <div className="flex gap-2">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="venue-slug"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => loadVenue()}
              disabled={busy !== null}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-default px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/50 hover:text-brand-gold disabled:opacity-40"
            >
              {busy === "load" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Load
            </button>
          </div>
          {venueId && (
            <p className="mt-2 flex items-center gap-1 text-xs text-brand-gold">
              <Check className="h-3.5 w-3.5" /> Venue loaded — enrichment can be applied.
            </p>
          )}
        </div>

        <label className="mb-4 flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-4 py-3">
          <input
            type="checkbox"
            checked={isNewVenue}
            onChange={(e) => setIsNewVenue(e.target.checked)}
            className="h-4 w-4 accent-brand-gold"
          />
          <span className="text-sm font-semibold text-text-primary">
            This is a new venue
          </span>
          <span className="text-xs text-text-muted">
            — create it from what Grok finds
          </span>
        </label>

        {isNewVenue && (
          <div className="mb-4 rounded-lg border border-border-subtle bg-surface-1 p-3">
            <label className={labelClass}>Item type</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={inputClass}
            >
              <option value="restaurant">Restaurant</option>
              <option value="food_truck">Food Truck</option>
              <option value="caterer">Caterer</option>
              <option value="retailer">Shop / Retailer</option>
              <option value="market">Market</option>
              <option value="event">Event</option>
              <option value="festival">Festival</option>
              <option value="school">Cooking School</option>
            </select>
            {isEvent && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className={labelClass}>Starts</label>
                  <input
                    type="date"
                    value={eventStart}
                    onChange={(e) => setEventStart(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Ends</label>
                  <input
                    type="date"
                    value={eventEnd}
                    onChange={(e) => setEventEnd(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <p className={labelClass}>What we know</p>
        <div className="space-y-2">
          {(
            [
              ["name", "Name"],
              ["instagram", "Instagram handle or URL"],
              ["website", "Website"],
              ["address", "Address"],
              ["city", "City"],
              ["country", "Country"],
              ["phone", "Phone"],
            ] as const
          ).map(([k, ph]) => (
            <input
              key={k}
              value={lead[k]}
              onChange={(e) => setLead((l) => ({ ...l, [k]: e.target.value }))}
              placeholder={ph}
              className={inputClass}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={hunt}
          disabled={busy !== null}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy === "hunt" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {busy === "hunt" ? "Grok is hunting…" : "Send Grok hunting"}
        </button>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {status && <p className="mt-3 text-sm text-brand-gold">{status}</p>}
      </div>

      {/* Right: results */}
      <div>
        {!result ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border-default p-8 text-center text-sm text-text-muted">
            Grok&apos;s findings will appear here for you to review, edit, and apply.
          </div>
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface-1 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="u-eyebrow text-text-muted">Grok findings</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  result.confidence >= 0.66
                    ? "bg-brand-gold/15 text-brand-gold"
                    : result.confidence >= 0.33
                      ? "bg-brand-sienna/15 text-brand-sienna-light"
                      : "bg-destructive/15 text-destructive"
                }`}
              >
                {Math.round(result.confidence * 100)}% confident
              </span>
            </div>

            {result.reviewer_notes && (
              <p className="mb-4 rounded-md border border-brand-sienna/30 bg-brand-sienna/5 px-3 py-2 text-xs text-brand-sienna-light">
                ⚠ {result.reviewer_notes}
              </p>
            )}

            <div className="space-y-3">
              {[...SCALARS, "offerings", "hours", ...SOCIALS].map((k) => (
                <div key={k}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(include[k])}
                      onChange={(e) =>
                        setInclude((i) => ({ ...i, [k]: e.target.checked }))
                      }
                      className="h-3.5 w-3.5 accent-brand-gold"
                    />
                    <span className={labelClass + " mb-0"}>{k.replace("_", " ")}</span>
                  </label>
                  {k === "description" || k === "hours" ? (
                    <textarea
                      value={fields[k] ?? ""}
                      onChange={(e) =>
                        setFields((f) => ({ ...f, [k]: e.target.value }))
                      }
                      rows={k === "hours" ? 4 : 3}
                      className={inputClass + " mt-1 font-mono text-xs"}
                    />
                  ) : (
                    <input
                      value={fields[k] ?? ""}
                      onChange={(e) =>
                        setFields((f) => ({ ...f, [k]: e.target.value }))
                      }
                      className={inputClass + " mt-1"}
                    />
                  )}
                </div>
              ))}
            </div>

            <Citations urls={result.citations} />

            {/* Multi-location grouping */}
            <div className="mt-5 rounded-lg border border-border-subtle bg-surface-0 p-4">
              <p className={labelClass}>
                Brand / multi-location
                {isChain && (
                  <span className="ml-2 rounded-full bg-brand-sienna/15 px-2 py-0.5 text-[0.625rem] font-bold text-brand-sienna-light">
                    chain detected
                  </span>
                )}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Brand name (e.g. Third Wave BBQ)"
                  className={inputClass}
                />
                <input
                  value={locationLabel}
                  onChange={(e) => setLocationLabel(e.target.value)}
                  placeholder="This branch (e.g. Albert Park)"
                  className={inputClass}
                />
              </div>

              {isChain && (
                <button
                  type="button"
                  onClick={() =>
                    onFindAllLocations({
                      name: brandName || result?.brand_name || fields.name || lead.name,
                      instagram: lead.instagram,
                      website: fields.website || lead.website,
                      city: fields.city || lead.city,
                      country: fields.country || lead.country,
                    })
                  }
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-sienna px-4 py-2.5 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-sienna/90"
                >
                  <Store className="h-4 w-4" />
                  Find all locations of this chain →
                </button>
              )}

              {!isNewVenue && (
                <button
                  type="button"
                  onClick={groupUnderBrand}
                  disabled={brandBusy || !venueId}
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-border-default px-4 py-2 text-sm font-semibold text-text-secondary transition-colors hover:border-brand-gold/60 hover:text-brand-gold disabled:opacity-40"
                >
                  {brandBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Store className="h-4 w-4" />
                  )}
                  Group this venue under the brand
                </button>
              )}
              {brandStatus && (
                <p className="mt-2 text-xs text-brand-gold">{brandStatus}</p>
              )}
              <p className="mt-2 text-[0.6875rem] text-text-muted">
                {isNewVenue
                  ? "Fill the brand name to create this new venue under a brand (e.g. one location of a chain)."
                  : "Creates the brand if new, then links this location to it. Add each other location as its own venue and group it the same way."}
              </p>
            </div>

            {isNewVenue ? (
              <div className="mt-5 space-y-2">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => createVenue(true)}
                    disabled={createBusy !== null}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.04em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
                  >
                    {createBusy === "publish" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Create &amp; publish
                  </button>
                  <button
                    type="button"
                    onClick={() => createVenue(false)}
                    disabled={createBusy !== null}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border-[1.5px] border-brand-gold px-4 py-2.5 text-sm font-bold uppercase tracking-[0.04em] text-brand-gold transition-colors hover:bg-brand-gold hover:text-text-inverse disabled:opacity-40"
                  >
                    {createBusy === "queue" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Store className="h-4 w-4" />
                    )}
                    Add to queue
                  </button>
                </div>
                <p className="text-[0.6875rem] text-text-muted">
                  We geocode the address to place it on the map. Missing address?
                  Add one above or the create will ask for it.
                </p>
                {createStatus && (
                  <p className="text-sm text-brand-gold">{createStatus}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={apply}
                disabled={busy !== null || !venueId}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border-[1.5px] border-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-brand-gold transition-colors hover:bg-brand-gold hover:text-text-inverse disabled:opacity-40"
              >
                {busy === "apply" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {venueId ? "Apply ticked fields to venue" : "Load a venue to apply"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ChainLoc {
  name: string | null;
  location_label: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  hours: Record<string, string> | null;
  instagram_url: string | null;
}
interface ChainResult {
  is_chain: boolean;
  brand_name: string | null;
  description: string | null;
  website: string | null;
  style: string | null;
  instagram_url: string | null;
  x_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  locations: ChainLoc[];
  confidence: number;
  reviewer_notes: string | null;
  citations: string[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ChainTool({
  seed,
}: {
  seed: { lead: ChainSeedLead; nonce: number } | null;
}) {
  const [lead, setLead] = useState({
    name: "",
    instagram: "",
    website: "",
    city: "",
    country: "",
  });
  const [busy, setBusy] = useState<null | "hunt" | "create">(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ChainResult | null>(null);
  const [include, setInclude] = useState<boolean[]>([]);
  const [publish, setPublish] = useState(false);
  const [progress, setProgress] = useState("");

  // When the Venue tab hands us a chain to find, prefill and auto-run.
  const seenSeed = useRef<number | null>(null);
  useEffect(() => {
    if (!seed || seed.nonce === seenSeed.current) return;
    seenSeed.current = seed.nonce;
    const next = {
      name: seed.lead.name ?? "",
      instagram: seed.lead.instagram ?? "",
      website: seed.lead.website ?? "",
      city: seed.lead.city ?? "",
      country: seed.lead.country ?? "",
    };
    setLead(next);
    hunt(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  async function hunt(override?: Partial<typeof lead>) {
    const useLead = { ...lead, ...(override ?? {}) };
    setBusy("hunt");
    setError("");
    setProgress("");
    setResult(null);
    const res = await fetch("/api/admin/enrich/chain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead: useLead }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Discovery failed.");
      return;
    }
    const c: ChainResult = data.chain;
    setResult(c);
    setInclude(c.locations.map(() => true));
  }

  async function createAll() {
    if (!result) return;
    setBusy("create");
    setError("");
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < result.locations.length; i++) {
      if (!include[i]) continue;
      const loc = result.locations[i];
      setProgress(`Creating ${loc.location_label || loc.city || loc.name || "location"}…`);
      const res = await fetch("/api/admin/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue: {
            name: loc.name || result.brand_name,
            description: result.description ?? "",
            website: result.website,
            phone: loc.phone,
            address: loc.address,
            city: loc.city,
            country: loc.country,
            style: result.style,
            hours: loc.hours,
            // Branch's own Instagram if it has one, else the brand's; the rest
            // inherit the brand (enrich a location individually for its full
            // own socials/photos).
            instagram_url: loc.instagram_url || result.instagram_url,
            x_url: result.x_url,
            facebook_url: result.facebook_url,
            tiktok_url: result.tiktok_url,
            youtube_url: result.youtube_url,
            location_label: loc.location_label,
          },
          publish,
          // Brand-level identity (brand's own accounts) stays on the brand.
          brand: result.brand_name
            ? {
                name: result.brand_name,
                description: result.description,
                website: result.website,
                instagram_url: result.instagram_url,
                x_url: result.x_url,
                facebook_url: result.facebook_url,
                tiktok_url: result.tiktok_url,
                youtube_url: result.youtube_url,
              }
            : undefined,
          lead,
          citations: result.citations,
        }),
      });
      if (res.ok) ok++;
      else failed++;
      // Respect Nominatim's ~1 req/sec geocoding limit.
      await sleep(1200);
    }
    setBusy(null);
    setProgress(
      `Done — ${ok} location${ok === 1 ? "" : "s"} ${publish ? "published" : "queued"}${failed ? `, ${failed} failed (check addresses)` : ""}. ✓`
    );
  }

  const selectedCount = include.filter(Boolean).length;

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <p className="mb-4 text-sm text-text-muted">
          Give Grok a business and it finds <em>every</em> location, then creates
          one map pin per venue, all grouped under a shared brand.
        </p>
        <div className="space-y-2">
          {(
            [
              ["name", "Business / brand name"],
              ["instagram", "Instagram handle or URL"],
              ["website", "Website"],
              ["city", "A city you know they're in"],
              ["country", "Country"],
            ] as const
          ).map(([k, ph]) => (
            <input
              key={k}
              value={lead[k]}
              onChange={(e) => setLead((l) => ({ ...l, [k]: e.target.value }))}
              placeholder={ph}
              className={inputClass}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => hunt()}
          disabled={busy !== null}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy === "hunt" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {busy === "hunt" ? "Finding all locations…" : "Discover all locations"}
        </button>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>

      <div>
        {!result ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border-default p-8 text-center text-sm text-text-muted">
            Every location Grok finds will appear here to review and create.
          </div>
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface-1 p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-heading text-lg font-bold text-text-primary">
                {result.brand_name || "Business"}
              </span>
              <span className="rounded-full bg-brand-gold/15 px-2.5 py-0.5 text-xs font-bold text-brand-gold">
                {result.locations.length} location
                {result.locations.length === 1 ? "" : "s"}
              </span>
            </div>
            {!result.is_chain && (
              <p className="mb-3 rounded-md border border-border-default bg-surface-0 px-3 py-2 text-xs text-text-muted">
                Grok thinks this is a single-location business — use the Venue
                enrichment tab instead.
              </p>
            )}
            {result.reviewer_notes && (
              <p className="mb-3 rounded-md border border-brand-sienna/30 bg-brand-sienna/5 px-3 py-2 text-xs text-brand-sienna-light">
                ⚠ {result.reviewer_notes}
              </p>
            )}

            <ul className="space-y-2">
              {result.locations.map((loc, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-0 p-3"
                >
                  <input
                    type="checkbox"
                    checked={include[i] ?? false}
                    onChange={(e) =>
                      setInclude((arr) => arr.map((v, j) => (j === i ? e.target.checked : v)))
                    }
                    className="mt-1 h-3.5 w-3.5 accent-brand-gold"
                  />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-text-primary">
                      {loc.location_label || loc.name || "Location"}
                    </p>
                    <p className="text-text-muted">
                      {[loc.address, loc.city, loc.country].filter(Boolean).join(", ") ||
                        "no address — will fail geocoding"}
                    </p>
                    {loc.instagram_url && (
                      <p className="mt-1 text-[0.6875rem] text-brand-gold">
                        own Instagram found
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <label className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                className="h-3.5 w-3.5 accent-brand-gold"
              />
              Publish immediately (otherwise added to the review queue)
            </label>

            <Citations urls={result.citations} />

            <button
              type="button"
              onClick={createAll}
              disabled={busy !== null || selectedCount === 0}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md border-[1.5px] border-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.04em] text-brand-gold transition-colors hover:bg-brand-gold hover:text-text-inverse disabled:opacity-40"
            >
              {busy === "create" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Create {selectedCount} selected location{selectedCount === 1 ? "" : "s"}
            </button>
            {progress && <p className="mt-2 text-sm text-brand-gold">{progress}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function NewsTool() {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<"news" | "missive">("news");
  const [busy, setBusy] = useState<null | "hunt" | "save">(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<NewsDraft | null>(null);
  const [edit, setEdit] = useState({ title: "", excerpt: "", content_md: "", hero: "" });

  async function hunt() {
    setBusy("hunt");
    setError("");
    setStatus("");
    setDraft(null);
    const res = await fetch("/api/admin/enrich/news", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, category }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Research failed.");
      return;
    }
    const d: NewsDraft = data.draft;
    setDraft(d);
    setEdit({ title: d.title, excerpt: d.excerpt, content_md: d.content_md, hero: "" });
  }

  async function save() {
    setBusy("save");
    setError("");
    setStatus("");
    const res = await fetch("/api/admin/enrich/news", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: edit.title,
        excerpt: edit.excerpt,
        content_md: edit.content_md,
        hero_image_url: edit.hero,
        category: draft?.category ?? category,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(data.error || "Could not save draft.");
      return;
    }
    setStatus(`Saved as an unpublished draft (/news/${data.slug}). Publish it in Supabase when ready.`);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div>
        <p className={labelClass}>Type</p>
        <div className="mb-4 flex gap-2">
          {(["news", "missive"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition-colors ${
                category === c
                  ? "border-brand-gold/60 bg-brand-gold/10 text-brand-gold"
                  : "border-border-default text-text-secondary hover:border-border-strong"
              }`}
            >
              {c === "news" ? "Dispatch (researched)" : "Missive (voice)"}
            </button>
          ))}
        </div>
        <p className={labelClass}>Topic / brief</p>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={4}
          placeholder="e.g. New Central Texas smokehouses opening in 2026, or a missive on the ethics of competition BBQ"
          className={inputClass}
        />
        <button
          type="button"
          onClick={hunt}
          disabled={busy !== null || topic.trim().length < 4}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
        >
          {busy === "hunt" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {busy === "hunt" ? "Grok is researching…" : "Send Grok researching"}
        </button>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {status && <p className="mt-3 text-sm text-brand-gold">{status}</p>}
      </div>

      <div>
        {!draft ? (
          <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border-default p-8 text-center text-sm text-text-muted">
            Grok&apos;s draft will appear here to edit and save (as an unpublished
            draft).
          </div>
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface-1 p-5">
            {draft.reviewer_notes && (
              <p className="mb-4 rounded-md border border-brand-sienna/30 bg-brand-sienna/5 px-3 py-2 text-xs text-brand-sienna-light">
                ⚠ {draft.reviewer_notes}
              </p>
            )}
            <label className={labelClass}>Title</label>
            <input
              value={edit.title}
              onChange={(e) => setEdit((x) => ({ ...x, title: e.target.value }))}
              className={inputClass}
            />
            <label className={labelClass + " mt-3"}>Excerpt</label>
            <input
              value={edit.excerpt}
              onChange={(e) => setEdit((x) => ({ ...x, excerpt: e.target.value }))}
              className={inputClass}
            />
            <label className={labelClass + " mt-3"}>Hero image URL (optional)</label>
            <input
              value={edit.hero}
              onChange={(e) => setEdit((x) => ({ ...x, hero: e.target.value }))}
              placeholder="https://…"
              className={inputClass}
            />
            <label className={labelClass + " mt-3"}>Body (Markdown)</label>
            <textarea
              value={edit.content_md}
              onChange={(e) => setEdit((x) => ({ ...x, content_md: e.target.value }))}
              rows={12}
              className={inputClass + " font-mono text-xs"}
            />
            <Citations urls={draft.citations} />
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border-[1.5px] border-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-[0.06em] text-brand-gold transition-colors hover:bg-brand-gold hover:text-text-inverse disabled:opacity-40"
            >
              {busy === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save as unpublished draft
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface ChainSeedLead {
  name?: string;
  instagram?: string;
  website?: string;
  city?: string;
  country?: string;
}

export function EnrichConsole({
  enabled,
  initialSlug,
}: {
  enabled: boolean;
  initialSlug?: string;
}) {
  const [tab, setTab] = useState<Tab>("venue");
  const [chainSeed, setChainSeed] = useState<{
    lead: ChainSeedLead;
    nonce: number;
  } | null>(null);

  const goFindChain = (lead: ChainSeedLead) => {
    setChainSeed((prev) => ({ lead, nonce: (prev?.nonce ?? 0) + 1 }));
    setTab("chain");
  };

  if (!enabled) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-0 p-8 text-center">
        <Sparkles className="mx-auto mb-3 h-8 w-8 text-text-muted" />
        <h2 className="font-heading text-lg font-bold text-text-primary">
          AI enrichment is switched off
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
          Set <code className="text-brand-gold">XAI_API_KEY</code> in the
          environment (and redeploy) to switch on Grok-powered venue enrichment
          and News &amp; Missives research.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("venue")}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "venue"
              ? "bg-brand-gold text-text-inverse"
              : "border border-border-default text-text-secondary hover:text-text-primary"
          }`}
        >
          <Store className="h-4 w-4" /> Venue enrichment
        </button>
        <button
          type="button"
          onClick={() => setTab("chain")}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "chain"
              ? "bg-brand-gold text-text-inverse"
              : "border border-border-default text-text-secondary hover:text-text-primary"
          }`}
        >
          <Store className="h-4 w-4" /> Chain / locations
        </button>
        <button
          type="button"
          onClick={() => setTab("news")}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            tab === "news"
              ? "bg-brand-gold text-text-inverse"
              : "border border-border-default text-text-secondary hover:text-text-primary"
          }`}
        >
          <Newspaper className="h-4 w-4" /> News &amp; Missives
        </button>
      </div>
      {tab === "venue" ? (
        <VenueTool onFindAllLocations={goFindChain} initialSlug={initialSlug} />
      ) : tab === "chain" ? (
        <ChainTool seed={chainSeed} />
      ) : (
        <NewsTool />
      )}
    </div>
  );
}
