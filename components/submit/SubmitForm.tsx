"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BBQ_STYLES, STYLE_LABELS, type BbqStyle } from "@/lib/constants/styles";
import { createClient } from "@/lib/supabase/client";
import { LocationPicker, type LocationData } from "@/components/submit/LocationPicker";
import { cn } from "@/lib/utils/cn";

export function SubmitForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [styles, setStyles] = useState<BbqStyle[]>([]);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [website, setWebsite] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [instagram, setInstagram] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

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

    setLoading(true);
    setStatus("idle");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload: Record<string, unknown> = {
      name,
      description,
      style: styles[0],
      styles,
      address: location.address || `${location.city}, ${location.country}`,
      city: location.city,
      country: location.country,
      lat: location.lat,
      lng: location.lng,
      website: website || null,
      hero_image_url: heroImageUrl || null,
      contact_email: contactEmail || null,
      instagram_handle: instagram || null,
      submitted_by: user?.id ?? null,
      moderation_status: "pending",
    };

    let { error } = await supabase.from("submissions").insert(payload);

    if (error?.message?.includes("styles") || error?.message?.includes("contact_email")) {
      const { styles: _s, contact_email, instagram_handle, ...fallback } = payload;
      const styleNote = `Styles: ${styles.map((s) => STYLE_LABELS[s]).join(", ")}`;
      const contactNote = [
        contact_email ? `Email: ${contact_email}` : null,
        instagram_handle ? `Instagram: ${instagram_handle}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      fallback.description = [description, styleNote, contactNote].filter(Boolean).join("\n\n");
      ({ error } = await supabase.from("submissions").insert(fallback));
    }

    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("success");
      setMessage("Thanks — our team will review your submission within 48 hours.");
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
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="hero">Photo URL</Label>
          <Input
            id="hero"
            type="url"
            value={heroImageUrl}
            onChange={(e) => setHeroImageUrl(e.target.value)}
            placeholder="Link to a photo of the spot"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="email">Your Email</Label>
          <Input
            id="email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Optional — for follow-up"
            className="mt-1"
          />
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

      <Button type="submit" disabled={loading} className="w-full md:w-auto">
        {loading ? "Submitting..." : "Submit a Spot"}
      </Button>
      {message && status === "error" && (
        <p className="text-sm text-red-400">{message}</p>
      )}
    </form>
  );
}