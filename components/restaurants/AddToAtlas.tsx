"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [error, setError] = useState("");

  const toggle = async () => {
    if (!isLoggedIn) {
      window.location.href = "/login";
      return;
    }

    setLoading(true);
    setError("");

    const action = saved ? "unsave" : "save";
    const res = await fetch("/api/saved-spots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, action }),
    });

    if (res.ok) {
      const data = await res.json();
      setSaved(data.saved);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update saved spot.");
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={saved ? "default" : "outline"}
        onClick={toggle}
        disabled={loading}
        className="gap-2"
      >
        <Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
        {loading ? "Saving..." : saved ? "In My Atlas" : "Add to My Atlas"}
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}