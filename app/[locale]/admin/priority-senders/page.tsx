import { redirect } from "next/navigation";
import { ShieldCheck, Download, Globe, Mail, Star } from "lucide-react";
import { requireAdmin } from "@/lib/auth/admin";
import { getPrioritySenders } from "@/lib/priority/senders";

export const dynamic = "force-dynamic";

interface Msg {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  created_at: string;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export default async function PrioritySendersPage() {
  const ctx = await requireAdmin();
  if (!ctx) redirect("/login?next=/admin/priority-senders");

  const { venueDomains, premiumEmails } = await getPrioritySenders();
  const { data } = await ctx.db
    .from("contact_messages")
    .select("id, name, email, subject, message, created_at")
    .eq("priority", true)
    .order("created_at", { ascending: false })
    .limit(50);
  const priorityMsgs = (data ?? []) as Msg[];

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <div className="mb-2 flex items-center gap-2 text-brand-gold">
        <ShieldCheck className="h-5 w-5" />
        <span className="text-xs font-bold uppercase tracking-[0.1em]">Priority senders</span>
      </div>
      <h1 className="font-heading text-3xl font-bold text-text-primary">Trusted inbound</h1>
      <p className="mt-2 max-w-2xl text-text-secondary">
        Live from the database — known-venue website domains and premium/owner account
        emails. Download the domain list to paste into a Gmail filter or Google Group so
        real venues and members jump the cold-spam queue.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Venue domains */}
        <section className="rounded-xl border border-border-subtle bg-surface-0 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
              <Globe className="h-4 w-4 text-brand-gold" /> Venue domains
              <span className="text-sm font-normal text-text-muted">({venueDomains.length})</span>
            </h2>
            <a
              href="/api/admin/priority-senders?download=domains"
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border-subtle bg-surface-1 p-3 font-mono text-xs text-text-secondary">
            {venueDomains.length ? venueDomains.map((d) => <div key={d}>{d}</div>) : <span className="text-text-muted">None yet.</span>}
          </div>
        </section>

        {/* Premium emails */}
        <section className="rounded-xl border border-border-subtle bg-surface-0 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
              <Mail className="h-4 w-4 text-brand-gold" /> Premium / owner emails
              <span className="text-sm font-normal text-text-muted">({premiumEmails.length})</span>
            </h2>
            <a
              href="/api/admin/priority-senders?download=emails"
              className="inline-flex items-center gap-1.5 rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-brand-gold/60 hover:text-brand-gold"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          </div>
          <div className="max-h-80 overflow-y-auto rounded-md border border-border-subtle bg-surface-1 p-3 font-mono text-xs text-text-secondary">
            {premiumEmails.length ? premiumEmails.map((e) => <div key={e}>{e}</div>) : <span className="text-text-muted">None yet.</span>}
          </div>
        </section>
      </div>

      {/* Priority inbound */}
      <section className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 font-heading text-lg font-bold text-text-primary">
          <Star className="h-4 w-4 text-brand-gold" /> Priority inbound
          <span className="text-sm font-normal text-text-muted">({priorityMsgs.length})</span>
        </h2>
        {priorityMsgs.length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-surface-0 p-6 text-text-muted">
            No priority contact messages yet — inbound from a signed-in venue owner or
            premium member will show here, flagged automatically.
          </p>
        ) : (
          <div className="space-y-3">
            {priorityMsgs.map((m) => (
              <div key={m.id} className="rounded-xl border border-brand-gold/30 bg-surface-0 p-5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-brand-gold">
                    <Star className="h-3 w-3" /> Priority
                  </span>
                  <span className="font-semibold text-text-primary">{m.name}</span>
                  <span className="text-text-muted">&lt;{m.email}&gt;</span>
                  <span className="ml-auto text-xs text-text-muted">{fmt(m.created_at)}</span>
                </div>
                {m.subject && <p className="mt-2 text-sm font-semibold text-text-secondary">{m.subject}</p>}
                <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{m.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
