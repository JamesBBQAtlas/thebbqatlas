"use client";

import { useState } from "react";
import { Loader2, Send, CircleCheck } from "lucide-react";

const inputClass =
  "w-full rounded-lg border border-border-default bg-surface-0 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand-gold/60 focus:outline-none";

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", company: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(data.error || "Something went wrong.");
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand-gold/40 bg-brand-gold/10 p-6 text-brand-gold">
        <CircleCheck className="h-5 w-5 shrink-0" />
        <p>Thanks — your message is in. We&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Your name"
          className={inputClass}
        />
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="Your email"
          className={inputClass}
        />
      </div>
      <input
        value={form.subject}
        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
        placeholder="Subject (optional)"
        className={inputClass}
      />
      <textarea
        required
        rows={6}
        value={form.message}
        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
        placeholder="How can we help? Suggest a venue, report a fix, or just say hello."
        className={inputClass + " resize-none"}
      />
      {/* Honeypot */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={form.company}
        onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
        className="hidden"
        aria-hidden="true"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-brand-gold px-6 py-3 text-sm font-bold uppercase tracking-[0.06em] text-text-inverse transition-colors hover:bg-brand-gold/90 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
