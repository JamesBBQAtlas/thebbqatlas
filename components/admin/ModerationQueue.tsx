"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { STYLE_LABELS } from "@/lib/constants/styles";
import type { Submission } from "@/lib/types/database";
import { restaurantSlug } from "@/lib/utils/slug";

export function ModerationQueue({ submissions: initial }: { submissions: Submission[] }) {
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState<string | null>(null);

  const moderate = async (id: string, action: "approve" | "reject") => {
    setLoading(id);
    const res = await fetch("/api/admin/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: id, action }),
    });
    if (res.ok) {
      setItems((prev) => prev.filter((s) => s.id !== id));
    }
    setLoading(null);
  };

  if (items.length === 0) {
    return <p className="text-white/50">No pending submissions. Queue is clear.</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((s) => (
        <div key={s.id} className="rounded-xl border border-white/10 bg-black/60 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold">{s.name}</h3>
              <p className="text-white/60 text-sm">{s.address}</p>
              <p className="text-white/60 text-sm">{s.city}, {s.country}</p>
              <Badge variant="style" className="mt-2">{STYLE_LABELS[s.style]}</Badge>
              <p className="mt-3 text-white/80 text-sm">{s.description}</p>
              <p className="text-xs text-white/40 mt-2">
                Slug preview: {restaurantSlug(s.name, s.city)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => moderate(s.id, "approve")}
                disabled={loading === s.id}
                size="sm"
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                onClick={() => moderate(s.id, "reject")}
                disabled={loading === s.id}
                size="sm"
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}