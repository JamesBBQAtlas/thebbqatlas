import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestMeta } from "@/lib/security/request-meta";

export const dynamic = "force-dynamic";

// A human filling out a venue submission takes longer than this; a bot posts
// instantly. Anything faster is treated as automated.
const MIN_ELAPSED_MS = 2500;
// Light per-IP throttle: no real person submits this many spots this fast.
const RATE_WINDOW_MIN = 10;
const RATE_MAX = 6;

const clip = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

// Simple, deliberately-lenient email check — reject obvious nonsense, don't try
// to out-clever real addresses. Server mirror of the client rule.
const looksLikeEmail = (v: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * CAPTCHA seam (Part 5). We deliberately ship NO CAPTCHA today — the honeypot,
 * time-trap and per-IP rate-limit are enough at this traffic level. This hook is
 * where a Turnstile/hCaptcha verification drops in later, behind a flag, with no
 * change to the form: set SUBMISSION_CAPTCHA_ENABLED and implement the verify.
 * Returns true when the request may proceed.
 */
async function passesCaptcha(_body: Record<string, unknown>, _meta: unknown): Promise<boolean> {
  if (process.env.SUBMISSION_CAPTCHA_ENABLED !== "true") return true; // off by default
  // Placeholder for a future token check (e.g. Cloudflare Turnstile):
  //   const token = clip(_body.captcha_token, 2000);
  //   return verifyTurnstile(token, (_meta as { ip?: string }).ip);
  return true;
}

/** Record a dropped/blocked attempt for future Cloudflare rule-building. */
async function logAbuse(
  db: SupabaseClient,
  reason: string,
  meta: ReturnType<typeof requestMeta>,
  attemptedName: string,
  extra: Record<string, unknown>
) {
  try {
    await db.from("submission_abuse_log").insert({
      reason,
      ip: meta.ip,
      country: meta.country,
      user_agent: meta.userAgent,
      cf_ray: meta.ray,
      asn: meta.asn,
      attempted_name: attemptedName || null,
      meta: extra,
    });
  } catch {
    /* telemetry is best-effort */
  }
}

/**
 * Public "Submit a Spot" endpoint. Guards the moderation queue against automated
 * junk BEFORE it lands: a hidden honeypot field, a form-fill time trap, a light
 * per-IP rate limit, and basic validation. Every accepted submission is stamped
 * with its IP / country / user-agent; every DROPPED attempt is logged to
 * submission_abuse_log so we can later build Cloudflare WAF rules to block the
 * offenders at the edge. Real submissions are unaffected — no CAPTCHA, no friction.
 */
export async function POST(request: Request) {
  const meta = requestMeta(request);
  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  const db: SupabaseClient = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : await createClient();

  const name = clip(body.name, 120);
  const attemptedName = name || clip(body.name, 40);

  // 1) Honeypot — a field a human never sees, so it must be empty. If it's
  //    filled, a bot did it: log the intel and return a FAKE success so the bot
  //    thinks it worked and moves on (never reveal the trap).
  const honeypot = clip((body as Record<string, unknown>).company, 200) || clip((body as Record<string, unknown>).hp, 200);
  if (honeypot) {
    await logAbuse(db, "honeypot", meta, attemptedName, { honeypot_len: honeypot.length });
    return NextResponse.json({ ok: true });
  }

  // 2) Time trap — the form stamps when it rendered; a near-instant submit is
  //    automated. Only "too fast" is suspicious (a slow human is fine).
  const renderedAt = Number((body as Record<string, unknown>).rt);
  const elapsedMs = Number.isFinite(renderedAt) && renderedAt > 0 ? Date.now() - renderedAt : null;
  if (elapsedMs !== null && elapsedMs >= 0 && elapsedMs < MIN_ELAPSED_MS) {
    await logAbuse(db, "too_fast", meta, attemptedName, { elapsed_ms: elapsedMs });
    return NextResponse.json({ ok: true }); // silent drop
  }

  // 3) Light per-IP rate limit (only when we actually have an IP).
  if (meta.ip) {
    const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
    const [{ count: subCount }, { count: abuseCount }] = await Promise.all([
      db.from("submissions").select("id", { count: "exact", head: true }).eq("submitter_ip", meta.ip).gte("created_at", since),
      db.from("submission_abuse_log").select("id", { count: "exact", head: true }).eq("ip", meta.ip).gte("created_at", since),
    ]);
    if ((subCount ?? 0) + (abuseCount ?? 0) >= RATE_MAX) {
      await logAbuse(db, "rate_limit", meta, attemptedName, { window_min: RATE_WINDOW_MIN });
      return NextResponse.json(
        { error: "You're submitting a little too quickly — please try again in a few minutes." },
        { status: 429 }
      );
    }
  }

  // 4) Basic validation — genuine-user errors, returned plainly (not logged as
  //    abuse). Length caps also stop a giant payload.
  const description = clip(body.description, 4000);
  const styles = Array.isArray(body.styles) ? (body.styles as unknown[]).map((s) => clip(s, 40)).filter(Boolean) : [];
  const style = clip(body.style, 40) || styles[0] || "";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const consent = Boolean(body.consent);
  if (!name || name.length < 2) return NextResponse.json({ error: "Please enter the venue name." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Please add a short description." }, { status: 400 });
  if (styles.length === 0 && !style) return NextResponse.json({ error: "Please select at least one BBQ style." }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return NextResponse.json({ error: "Please search for an address or drop a pin on the map." }, { status: 400 });
  }
  if (!consent) return NextResponse.json({ error: "Please agree to the submission terms." }, { status: 400 });

  // Trustworthy attribution: read the signed-in user server-side (ignore any
  // client-sent id). Best-effort — anonymous submissions are allowed. We also
  // take the account email as the fallback so a signed-in member never has to
  // retype it.
  let submittedBy: string | null = null;
  let accountEmail: string | null = null;
  try {
    const authed = await createClient();
    const { data } = await authed.auth.getUser();
    submittedBy = data.user?.id ?? null;
    accountEmail = data.user?.email ?? null;
  } catch {
    /* anonymous */
  }

  // Part 5 — email is now MANDATORY (anti-spam, no CAPTCHA yet). Prefer the
  // typed value; fall back to the signed-in member's account email. Enforced
  // server-side so the client can never bypass it.
  const contactEmail = clip(body.contact_email, 200) || accountEmail || "";
  if (!contactEmail) {
    return NextResponse.json({ error: "Please add an email so we can follow up on your submission." }, { status: 400 });
  }
  if (!looksLikeEmail(contactEmail)) {
    return NextResponse.json({ error: "That email doesn't look right — please check it." }, { status: 400 });
  }

  // CAPTCHA seam — a no-op today (see passesCaptcha). Structured so a Turnstile
  // step can be enabled later behind a flag without touching the form.
  if (!(await passesCaptcha(body as Record<string, unknown>, meta))) {
    await logAbuse(db, "captcha", meta, attemptedName, {});
    return NextResponse.json({ error: "Couldn't verify your submission — please try again." }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    name,
    description,
    style: style || styles[0],
    styles: styles.length ? styles : [style],
    address: clip(body.address, 300),
    city: clip(body.city, 120),
    country: clip(body.country, 80),
    lat,
    lng,
    website: clip(body.website, 300) || null,
    contact_email: contactEmail,
    instagram_handle: clip(body.instagram_handle, 80) || null,
    submitted_by: submittedBy,
    moderation_status: "pending",
    submitter_ip: meta.ip,
    submitter_country: meta.country,
    user_agent: meta.userAgent,
    spam_signals: { elapsed_ms: elapsedMs, ray: meta.ray, asn: meta.asn },
  };
  // Carry a soft duplicate flag through if the client's pre-check found one.
  const dupOf = clip(body.possible_duplicate_of, 60);
  if (dupOf) {
    payload.possible_duplicate_of = dupOf;
    payload.duplicate_reason = clip(body.duplicate_reason, 200) || null;
  }

  const { error } = await db.from("submissions").insert(payload);
  if (error) {
    console.error("[submissions] insert error:", error.message);
    return NextResponse.json({ error: "Could not submit your venue." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
