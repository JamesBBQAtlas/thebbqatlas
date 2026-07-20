"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";

/** Inline editor for the signed-in user's display name. */
export function DisplayNameForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: value }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-text-muted">{initial}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit name"
          className="text-text-muted transition-colors hover:text-brand-gold"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        maxLength={80}
        className="rounded-md border border-border-default bg-surface-1 px-2 py-1 text-sm text-text-primary focus:border-border-strong focus:outline-none"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        aria-label="Save"
        className="text-brand-gold hover:opacity-80 disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(initial);
          setEditing(false);
        }}
        aria-label="Cancel"
        className="text-text-muted hover:text-text-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </span>
  );
}
