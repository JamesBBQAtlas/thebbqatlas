"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function AddToAtlas({
  restaurantId,
  initialSaved = false,
  isLoggedIn = false,
}: {
  restaurantId: string;
  initialSaved?: boolean;
  isLoggedIn?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const toggle = async () => {
    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }
    setLoading(true);
    if (saved) {
      await supabase.from("saved_spots").delete().eq("restaurant_id", restaurantId);
      setSaved(false);
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("saved_spots").insert({ user_id: user.id, restaurant_id: restaurantId });
        setSaved(true);
      }
    }
    setLoading(false);
  };

  return (
    <Button variant={saved ? "default" : "outline"} onClick={toggle} disabled={loading} className="gap-2">
      <Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
      {saved ? "In My Atlas" : "Add to My Atlas"}
    </Button>
  );
}