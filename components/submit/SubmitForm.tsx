"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BBQ_STYLES, STYLE_LABELS } from "@/lib/constants/styles";
import { createClient } from "@/lib/supabase/client";

export function SubmitForm() {
  const [form, setForm] = useState({
    name: "", description: "", style: "texas", address: "", city: "", country: "",
    lat: "", lng: "", website: "", hero_image_url: "", consent: false,
  });
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const update = (key: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.consent) {
      setMessage("Please agree to the submission terms.");
      return;
    }
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("submissions").insert({
      name: form.name,
      description: form.description,
      style: form.style,
      address: form.address,
      city: form.city,
      country: form.country,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      website: form.website || null,
      hero_image_url: form.hero_image_url || null,
      submitted_by: user?.id ?? null,
      moderation_status: "pending",
    });

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
    <form onSubmit={submit} className="space-y-6 rounded-xl border border-white/10 bg-black/60 p-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Restaurant Name *</Label>
          <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} required />
        </div>
        <div>
          <Label>BBQ Style *</Label>
          <Select value={form.style} onValueChange={(v) => update("style", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BBQ_STYLES.map((s) => (
                <SelectItem key={s} value={s}>{STYLE_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea id="description" value={form.description} onChange={(e) => update("description", e.target.value)} required rows={4} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="address">Address *</Label>
          <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="city">City *</Label>
          <Input id="city" value={form.city} onChange={(e) => update("city", e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="country">Country *</Label>
          <Input id="country" value={form.country} onChange={(e) => update("country", e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="lat">Latitude *</Label>
          <Input id="lat" type="number" step="any" value={form.lat} onChange={(e) => update("lat", e.target.value)} required placeholder="30.2672" />
        </div>
        <div>
          <Label htmlFor="lng">Longitude *</Label>
          <Input id="lng" type="number" step="any" value={form.lng} onChange={(e) => update("lng", e.target.value)} required placeholder="-97.7431" />
        </div>
        <div>
          <Label htmlFor="website">Website</Label>
          <Input id="website" type="url" value={form.website} onChange={(e) => update("website", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="hero">Photo URL</Label>
          <Input id="hero" type="url" value={form.hero_image_url} onChange={(e) => update("hero_image_url", e.target.value)} />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-white/70">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(e) => update("consent", e.target.checked)}
          className="mt-1"
        />
        I agree that my submission may be published after moderation. The BBQ Atlas maintains arms-length positioning and does not endorse submitted establishments.
      </label>

      <Button type="submit" disabled={loading} className="w-full md:w-auto">
        {loading ? "Submitting..." : "Submit a Spot"}
      </Button>
      {message && status === "error" && <p className="text-sm text-red-400">{message}</p>}
    </form>
  );
}