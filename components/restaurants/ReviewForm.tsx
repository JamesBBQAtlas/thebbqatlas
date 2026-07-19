"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ReviewForm({ restaurantId }: { restaurantId: string }) {
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("reviews").insert({
      restaurant_id: restaurantId,
      user_id: user.id,
      rating: 5,
      body,
      status: "approved",
    });
    setMessage(error ? error.message : "Review submitted! Refresh to see it.");
    if (!error) setBody("");
    setLoading(false);
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-white/10 bg-black/40 p-6">
      <h3 className="font-bold text-lg">Write a Review</h3>
      <p className="text-xs text-white/50">
        Reviews are user-generated opinions. The BBQ Atlas does not endorse establishments.
      </p>
      <div>
        <Label htmlFor="review-body">Your Review</Label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
          className="mt-1"
        />
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "Submitting..." : "Submit Review"}
      </Button>
      {message && <p className="text-sm text-brand-gold">{message}</p>}
    </form>
  );
}