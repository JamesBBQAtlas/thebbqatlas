"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BBQ_STYLES, STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { LocationPicker, type LocationData } from "@/components/submit/LocationPicker";
import { normalizeWebsite, normalizeInstagram } from "@/lib/utils/normalize";
import { cn } from "@/lib/utils/cn";

// Server mirrors this exact check — keep them in sync (see /api/submissions).
const looksLikeEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function SubmitForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [styles, setStyles] = useState<BbqStyle[]>([]);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [website, setWebsite] = useState("");
  // Email is required (anti-spam). Pre-filled for signed-in members.
  const [contactEmail, setContactEmail] = useState(defaultEmail);
  const [instagram, setInstagram] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  // Global dedupe guard (soft): possible existing matches + whether the user
  // has chosen to submit anyway.
  const [dupMatches, setDupMatches] = useState<
    { id: string; name: string; city: string | null; slug: string | null; reason: string }[]
  >([]);
  const [dupAck, setDupAck] = useState(false);
  // Anti-spam: a honeypot field (must stay empty) + the moment the form rendered
  // (a near-instant submit is a bot). Both are checked server-side.
  const [hp, setHp] = useState("");
  const [renderedAt] = useState(() => Date.now());

  const toggleStyle = (style: BbqStyle) => {
    setStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setMessage("Please agree to the submission terms.");
      setStatus("error");
      return;
    }
    if (styles.length === 0) {
      setMessage("Please select at least one BBQ style.");
      setStatus("error");
      return;
    }
    if (!location) {
      setMessage("Please search for an address or drop a pin on the map.");
      setStatus("error");
      return;
    }
    const email = contactEmail.trim();
    if (!email) {
      setMessage("Please add your email so we can follow up.");
      setStatus("error");
      return;
    }
    if (!looksLikeEmail(email)) {
      setMessage("That email doesn't look right — please check it.");
      setStatus("error");
      return;
    }

    // Normalize the website leniently — accept "willsbbq.de", www/http/https,
    // with/without a path — and only reject genuine nonsense.
    const normalizedWebsite = normalizeWebsite(website);
    if (website.trim() && !normalizedWebsite) {
      setMessage("That website doesn't look right — try something like willsbbq.de");
      setStatus("error");
      return;
    }
    const normalizedInstagram = normalizeInstagram(instagram);

    // Soft duplicate check (§ global dedupe guard) — warn once, never block. If
    // there's a likely match and the user hasn't acknowledged it, show the
    // notice and let them "Submit anyway".
    if (!dupAck) {
      try {
        const res = await fetch("/api/venues/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            address: location.address,
            city: location.city,
            lat: location.lat,
            lng: location.lng,
          }),
        });
        const data = await res.json().catch(() => ({ matches: [] }));
        if (Array.isArray(data.matches) && data.matches.length > 0) {
          setDupMatches(data.matches.slice(0, 3));
          setDupAck(true); // next click submits anyway
          return;
        }
      } catch {
        /* dedupe is best-effort — never block submission */
      }
    }

    setLoading(true);
    setStatus("idle");

    // Submit through the guarded server endpoint (honeypot + time-trap + rate
    // limit + validation, and it stamps the IP/country for us). No direct DB
    // insert from the browser anymore.
    const res = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        style: styles[0],
        styles,
        address: location.address || `${location.city}, ${location.country}`,
        city: location.city,
        country: location.country,
        lat: location.lat,
        lng: location.lng,
        website: normalizedWebsite,
        contact_email: contactEmail || null,
        instagram_handle: normalizedInstagram,
        consent,
        company: hp, // honeypot — must be empty
        rt: renderedAt, // form-render timestamp (time trap)
        ...(dupMatches.length
          ? { possible_duplicate_of: dupMatches[0].id, duplicate_reason: dupMatches[0].reason }
          : {}),
      }),
    }).catch(() => null);

    const data = res ? await res.json().catch(() => ({})) : null;
    if (!res || !res.ok) {
      setStatus("error");
      setMessage((data && data.error) || "Something went wrong — please try again.");
    } else {
      setStatus("success");
      setMessage("Thanks — our team will review your submission within 48 hours.");
      // Fire the confirmation email (server verifies a real recent submission).
      fetch("/api/email/submission-received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contactEmail || undefined, venueName: name }),
      }).catch(() => {});
    }
    setLoading(false);
  };

  if (status === "success") {
    return (
      <div className="rounded-xl border border-brand-gold/30 bg-black/60 p-8 text-center">
        <h2 className="text-xl font-bold text-brand-gold">Submission Received</h2>
        <p className="mt-2 text-white/70">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-8 rounded-xl border border-white/10 bg-black/60 p-8">
      {/* Honeypot — invisible to people, catches form-stuffing bots. Must stay
          empty; a filled value is dropped server-side. Not type=hidden (bots
          skip those) — visually removed instead, and kept out of the tab order. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="company">Company (leave this blank)</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
        />
      </div>
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Restaurant Name *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={4}
            className="mt-1"
            placeholder="What makes this spot special? Signature dishes, vibe, pitmaster story..."
          />
        </div>
      </div>

      <div>
        <Label>BBQ Styles *</Label>
        <p className="text-xs text-white/50 mb-3">Select all styles that apply.</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BBQ_STYLES.map((style) => (
            <label
              key={style}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors text-sm",
                styles.includes(style)
                  ? "border-brand-gold bg-brand-gold/10 text-brand-gold"
                  : "border-white/20 hover:border-white/40"
              )}
            >
              <input
                type="checkbox"
                checked={styles.includes(style)}
                onChange={() => toggleStyle(style)}
                className="accent-brand-gold"
              />
              {STYLE_LABELS[style]}
            </label>
          ))}
        </div>
      </div>

      <LocationPicker value={location} onChange={setLocation} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            type="text"
            inputMode="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="willsbbq.de"
            className="mt-1"
          />
        </div>
        <div className="rounded-lg border border-border-subtle bg-surface-1/50 px-3 py-2.5 text-xs text-text-muted">
          Photos are added after a venue is approved, through our moderated
          upload — so every image is either the venue&apos;s own or properly
          credited. No need to paste a link here.
        </div>
        <div>
          <Label htmlFor="email">Your Email *</Label>
          <Input
            id="email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
            placeholder="you@example.com — for follow-up"
            className="mt-1"
          />
          <p className="mt-1 text-xs text-white/40">
            We&apos;ll only use this to follow up on your submission. Never shown publicly.
          </p>
        </div>
        <div>
          <Label htmlFor="instagram">Instagram Handle</Label>
          <Input
            id="instagram"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="@restaurant or @yours"
            className="mt-1"
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 accent-brand-gold"
        />
        I agree that my submission may be published after moderation. The BBQ Atlas maintains
        arms-length positioning and does not endorse submitted establishments.
      </label>

      {/* Soft duplicate notice — never blocks; "Submit anyway" proceeds. */}
      {dupMatches.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-semibold text-amber-300">
            This looks like it may already be on the Atlas:
          </p>
          <ul className="mt-2 space-y-1">
            {dupMatches.map((m) => (
              <li key={m.id} className="text-amber-200/90">
                {m.name}
                {m.city ? `, ${m.city}` : ""}{" "}
                <span className="text-amber-200/60">({m.reason})</span>
                {m.slug && (
                  <>
                    {" — "}
                    <a
                      href={`/restaurants/${m.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-brand-gold underline"
                    >
                      View
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-amber-200/70">
            If yours is a different place, go ahead and submit — a moderator will double-check.
          </p>
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full md:w-auto">
        {loading
          ? "Submitting..."
          : dupMatches.length > 0
            ? "Submit anyway"
            : "Submit a Spot"}
      </Button>
      {message && status === "error" && (
        <p className="text-sm text-red-400">{message}</p>
      )}
    </form>
  );
}