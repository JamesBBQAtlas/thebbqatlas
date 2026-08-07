import { emailShell, emailText } from "./layout";
import { sendEmail } from "./send";
import { EMAIL_FROM, EMAIL_SITE_URL, EMAIL_REPLY_TO } from "./config";

const T = EMAIL_FROM.transactional;
const M = EMAIL_FROM.marketing;

/**
 * First token of a name for greetings. Every transactional email greets by
 * FIRST name (house voice) and must render cleanly when there's no name — the
 * greeting drops the name entirely rather than showing "Welcome, ." (policy).
 */
const firstName = (name?: string | null): string | null => {
  const t = (name ?? "").trim().split(/\s+/)[0];
  return t || null;
};

/**
 * 1. Welcome on signup — approved house-voice copy (WELCOME-EMAIL.md, verbatim).
 * Transactional/functional: sent once on signup. Keeps the "what we'll never do"
 * block. Real one-click unsubscribe when a token is provided.
 */
export function sendWelcome(opts: {
  to: string;
  name?: string;
  userId?: string;
  unsubscribeToken?: string;
}) {
  const u = EMAIL_SITE_URL;
  const first = firstName(opts.name);
  // No-name greeting reads cleanly in-voice (the next line already says "we'll
  // keep this short", so we don't repeat it here).
  const opener = first ? `Welcome, ${first}.` : "Welcome in.";

  const bodyHtml = `<p style="margin:0 0 14px;">${opener}</p>
    <p style="margin:0 0 14px;">We'll keep this short. Your time is better spent eating barbecue than reading email.</p>
    <p style="margin:0 0 14px;">Here's what this is: a map of the world's great barbecue — smokehouses, asados, roadside pits, the lot — plus guides worth reading and gear worth owning. We find it, we plot it, you go. We don't rank it. Ranking barbecue is like ranking your children: technically possible, deeply unwise.</p>
    <p style="margin:0 0 10px;">And here's what we will <strong>never</strong> do:</p>
    <ul style="margin:0 0 14px;padding-left:20px;color:#2b2118;">
      <li style="margin:0 0 7px;">Email you to ask <em>"how did we do?"</em> You'll know how we did. You'll be looking at brisket.</li>
      <li style="margin:0 0 7px;">Ask you to rate us out of five. We are not a scale.</li>
      <li style="margin:0 0 7px;">Sell your details. They're yours. Keep them.</li>
      <li style="margin:0 0 7px;">Waste your time. When we write, it'll be because there's barbecue worth driving for.</li>
    </ul>
    <p style="margin:0 0 14px;">That's the arrangement. One click unsubscribes you — no hard feelings, and no exit survey asking why.</p>
    <p style="margin:0 0 18px;">Now go find something with a bark on it.</p>
    <p style="margin:0;color:#6f6152;">— The BBQ Atlas<br><em>We map barbecue. That's the whole website.</em></p>`;

  const bodyText = `${opener}

We'll keep this short. Your time is better spent eating barbecue than reading email.

Here's what this is: a map of the world's great barbecue — smokehouses, asados, roadside pits, the lot — plus guides worth reading and gear worth owning. We find it, we plot it, you go. We don't rank it. Ranking barbecue is like ranking your children: technically possible, deeply unwise.

And here's what we will never do:
- Email you to ask "how did we do?" You'll know how we did. You'll be looking at brisket.
- Ask you to rate us out of five. We are not a scale.
- Sell your details. They're yours. Keep them.
- Waste your time. When we write, it'll be because there's barbecue worth driving for.

That's the arrangement. One click unsubscribes you — no hard feelings, and no exit survey asking why.

Now go find something with a bark on it.

— The BBQ Atlas
We map barbecue. That's the whole website.`;

  const token = opts.unsubscribeToken;
  const pageUrl = `${u}/unsubscribe${token ? `?token=${token}` : ""}`;
  const footerHtml = `<p style="margin:10px 0 0;"><a href="${pageUrl}" style="color:#C4622D;">Unsubscribe</a> — one click, no exit survey.</p>`;
  const footerText = `Unsubscribe (one click, no exit survey): ${pageUrl}`;

  return sendEmail({
    to: opts.to,
    from: T,
    stream: "transactional",
    type: "welcome",
    userId: opts.userId,
    subject: "You're in. Here's what that means.",
    html: emailShell({
      title: "You're in.",
      preheader: "No surveys. No stars. Just barbecue, mapped.",
      bodyHtml,
      footerHtml,
    }),
    text: emailText({ title: "You're in.", bodyText, footerText }),
    ...(token
      ? {
          headers: {
            "List-Unsubscribe": `<${u}/api/unsubscribe?token=${token}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      : {}),
  });
}

/** 2. Submission received. */
export function sendSubmissionReceived(opts: { to: string; venueName?: string; name?: string }) {
  const venue = opts.venueName?.trim();
  const first = firstName(opts.name);
  const thanks = first ? `Thanks, ${first} —` : "Thanks —";
  const bodyHtml = `<p style="margin:0 0 14px;">${thanks} we've received your submission${venue ? ` for <strong>${venue}</strong>` : ""}.</p>
    <p style="margin:0 0 14px;">Our team reviews every spot by hand to keep the Atlas honest. We'll be in touch once it's been looked at. Good barbecue deserves the care.</p>`;
  const bodyText = `${thanks} we've received your submission${venue ? ` for ${venue}` : ""}.

Our team reviews every spot by hand to keep the Atlas honest. We'll be in touch once it's been looked at.`;
  return sendEmail({
    to: opts.to,
    from: T,
    stream: "transactional",
    type: "submission_received",
    subject: venue ? `We got your submission — ${venue}` : "We got your submission",
    html: emailShell({ title: "Submission received", preheader: "We've got it — thank you.", bodyHtml }),
    text: emailText({ title: "Submission received", bodyText }),
  });
}

/** 3. Moderation outcome (approved / declined). */
export function sendModerationOutcome(opts: {
  to: string;
  venueName?: string;
  approved: boolean;
  kind?: string;
  notes?: string;
  name?: string;
}) {
  const venue = opts.venueName?.trim() || "your submission";
  const first = firstName(opts.name);
  if (opts.approved) {
    const goodNews = first ? `Good news, ${first} —` : "Good news —";
    const bodyHtml = `<p style="margin:0 0 14px;">${goodNews} <strong>${venue}</strong> has been approved and is now on The BBQ Atlas. Thank you for helping the map grow.</p>`;
    const bodyText = `${goodNews} ${venue} has been approved and is now on The BBQ Atlas. Thank you for helping the map grow.`;
    return sendEmail({
      to: opts.to,
      from: T,
      stream: "transactional",
      type: "moderation_approved",
      subject: `Approved — ${venue} is on the Atlas`,
      html: emailShell({
        title: "It's on the map",
        preheader: `${venue} has been approved.`,
        bodyHtml,
        cta: { label: "See the directory", url: `${EMAIL_SITE_URL}/directory` },
      }),
      text: emailText({
        title: "It's on the map",
        bodyText,
        cta: { label: "See the directory", url: `${EMAIL_SITE_URL}/directory` },
      }),
    });
  }
  const reason = opts.notes?.trim();
  const thanks = first ? `Thanks, ${first}, for taking the time` : "Thanks for taking the time";
  const bodyHtml = `<p style="margin:0 0 14px;">${thanks} to submit ${venue === "your submission" ? "a spot" : `<strong>${venue}</strong>`}. After a look, we haven't been able to add it this time.</p>
    ${reason ? `<p style="margin:0 0 14px;color:#6f6152;">Note from our team: ${reason}</p>` : ""}
    <p style="margin:0 0 14px;">Please don't let it put you off — if anything changes, or you know another spot, we'd love to hear from you.</p>`;
  const bodyText = `${thanks} to submit ${venue}. After a look, we haven't been able to add it this time.${reason ? `\n\nNote from our team: ${reason}` : ""}\n\nIf anything changes, or you know another spot, we'd love to hear from you.`;
  return sendEmail({
    to: opts.to,
    from: T,
    stream: "transactional",
    type: "moderation_declined",
    subject: `An update on ${venue}`,
    html: emailShell({ title: "An update on your submission", preheader: "A note from the Atlas team.", bodyHtml }),
    text: emailText({ title: "An update on your submission", bodyText }),
  });
}

/** 4. Correction acknowledged. */
export function sendCorrectionAck(opts: { to: string; venueName?: string; name?: string }) {
  const venue = opts.venueName?.trim();
  const first = firstName(opts.name);
  const opener = first ? `Thanks, ${first}. You flagged` : "Thanks for flagging";
  const bodyHtml = `<p style="margin:0 0 14px;">${opener} ${venue ? `an update for <strong>${venue}</strong>` : "a correction"} — we've received it.</p>
    <p style="margin:0 0 14px;">Keeping listings accurate is a big part of what makes the Atlas trustworthy. We'll review it and make any changes needed.</p>`;
  const bodyText = `${opener} ${venue ? `an update for ${venue}` : "a correction"} — we've received it. We'll review it and make any changes needed.`;
  return sendEmail({
    to: opts.to,
    from: T,
    stream: "transactional",
    type: "correction_ack",
    subject: "Thanks — we've got your correction",
    html: emailShell({ title: "Correction received", preheader: "Thanks for keeping the Atlas honest.", bodyHtml }),
    text: emailText({ title: "Correction received", bodyText }),
  });
}

/**
 * 5. Order / receipt — SCAFFOLD ONLY. Dormant until Stripe activates. Not wired
 * to any live trigger; here so the hook exists when billing goes on.
 */
export function sendOrderReceipt(opts: {
  to: string;
  description: string;
  amount: string;
}) {
  const bodyHtml = `<p style="margin:0 0 14px;">Thanks for your purchase — here's your receipt.</p>
    <p style="margin:0 0 14px;"><strong>${opts.description}</strong><br>${opts.amount}</p>`;
  const bodyText = `Thanks for your purchase — here's your receipt.\n\n${opts.description}\n${opts.amount}`;
  return sendEmail({
    to: opts.to,
    from: T,
    stream: "transactional",
    type: "order_receipt",
    subject: "Your BBQ Atlas receipt",
    html: emailShell({ title: "Your receipt", bodyHtml }),
    text: emailText({ title: "Your receipt", bodyText }),
  });
}

/**
 * Marketing send (e.g. a Missive). ONLY call for opted-in recipients. Carries a
 * working one-click unsubscribe + List-Unsubscribe headers.
 */
export function sendMissive(opts: {
  to: string;
  subject: string;
  title: string;
  bodyHtml: string;
  bodyText: string;
  unsubscribeToken: string;
  userId?: string;
}) {
  const pageUrl = `${EMAIL_SITE_URL}/unsubscribe?token=${opts.unsubscribeToken}`;
  const apiUrl = `${EMAIL_SITE_URL}/api/unsubscribe?token=${opts.unsubscribeToken}`;
  const footerHtml = `<p style="margin:10px 0 0;">You're receiving this because you opted in to The BBQ Atlas Missives. <a href="${pageUrl}" style="color:#C4622D;">Unsubscribe</a> anytime.</p>`;
  const footerText = `You're receiving this because you opted in to The BBQ Atlas Missives. Unsubscribe: ${pageUrl}`;
  return sendEmail({
    to: opts.to,
    from: M,
    stream: "marketing",
    type: "missive",
    userId: opts.userId,
    subject: opts.subject,
    html: emailShell({ title: opts.title, bodyHtml: opts.bodyHtml, footerHtml }),
    text: emailText({ title: opts.title, bodyText: opts.bodyText, footerText }),
    headers: {
      "List-Unsubscribe": `<${apiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// Social destinations for lifecycle marketing — kept in sync with the footer.
const WHATSAPP_CHANNEL = "https://whatsapp.com/channel/0029Vb73kIa3gvWix7CwZh2m";
const SOCIAL_INSTAGRAM = "https://instagram.com/bbqatlas";
const SOCIAL_THREADS = "https://threads.net/@bbqatlas";
const SOCIAL_X = "https://x.com/TheBBQAtlas";

/**
 * 6. Day-3 lifecycle "social drip" — MARKETING (SOCIAL-DRIP-EMAIL.md, verbatim
 * voice). Sent once, ~3 days after signup, ONLY to marketing-opted-in users.
 * WhatsApp channel is the hero CTA; Instagram/Threads/X sit below. Real
 * one-click unsubscribe via the recipient's own token.
 */
export function sendDay3(opts: {
  to: string;
  unsubscribeToken: string;
  userId?: string;
}) {
  const pageUrl = `${EMAIL_SITE_URL}/unsubscribe?token=${opts.unsubscribeToken}`;
  const apiUrl = `${EMAIL_SITE_URL}/api/unsubscribe?token=${opts.unsubscribeToken}`;

  // Hero CTA button (table-based, inline styled — same treatment as the shell's
  // own CTA, but built inline so the social links can sit BELOW it).
  const heroButton = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 20px;">
      <tr><td style="border-radius:6px;background:#C4622D;">
        <a href="${WHATSAPP_CHANNEL}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">Follow the WhatsApp channel →</a>
      </td></tr>
    </table>`;

  const bodyHtml = `<p style="margin:0 0 14px;">You've been with The BBQ Atlas for three days now. Long enough for a good rest. Not nearly long enough for a brisket.</p>
    <p style="margin:0 0 14px;">We mostly keep to ourselves — we told you we wouldn't clutter your inbox, and we meant it. But we do turn up in a few other places, and a couple of them are worth your time.</p>
    <p style="margin:0 0 4px;"><strong>The WhatsApp channel</strong> — this is the one. New pits, quiet tips, the odd strong opinion, delivered where you'll actually see it. No noise, no nonsense.</p>
    ${heroButton}
    <p style="margin:0 0 10px;color:#6f6152;">And the rest, if they suit you:</p>
    <ul style="margin:0 0 14px;padding-left:20px;color:#2b2118;">
      <li style="margin:0 0 7px;"><a href="${SOCIAL_INSTAGRAM}" style="color:#C4622D;">Instagram</a> — the good-looking end of barbecue. Bark, smoke rings, the occasional perfect slice.</li>
      <li style="margin:0 0 7px;"><a href="${SOCIAL_THREADS}" style="color:#C4622D;">Threads</a> &amp; <a href="${SOCIAL_X}" style="color:#C4622D;">X</a> — where we say things about barbecue. Some of them defensible.</li>
    </ul>
    <p style="margin:0 0 14px;">Pick the ones that suit you. Ignore the rest. We won't take it personally, and we still won't ask you to rate us out of five.</p>
    <p style="margin:0 0 18px;">Now — back to the barbecue.</p>
    <p style="margin:0;color:#6f6152;">— The BBQ Atlas<br><em>We map barbecue. We're just a little easier to find these days.</em></p>`;

  const bodyText = `You've been with The BBQ Atlas for three days now. Long enough for a good rest. Not nearly long enough for a brisket.

We mostly keep to ourselves — we told you we wouldn't clutter your inbox, and we meant it. But we do turn up in a few other places, and a couple of them are worth your time.

The WhatsApp channel — this is the one. New pits, quiet tips, the odd strong opinion, delivered where you'll actually see it. No noise, no nonsense.
Follow the channel: ${WHATSAPP_CHANNEL}

And the rest, if they suit you:
- Instagram — the good-looking end of barbecue: ${SOCIAL_INSTAGRAM}
- Threads & X — where we say things about barbecue, some of them defensible: ${SOCIAL_THREADS} · ${SOCIAL_X}

Pick the ones that suit you. Ignore the rest. We won't take it personally, and we still won't ask you to rate us out of five.

Now — back to the barbecue.

— The BBQ Atlas
We map barbecue. We're just a little easier to find these days.`;

  const footerHtml = `<p style="margin:10px 0 0;">You're receiving this because you opted in to The BBQ Atlas Missives. <a href="${pageUrl}" style="color:#C4622D;">Unsubscribe</a> — one click, no exit survey.</p>`;
  const footerText = `You're receiving this because you opted in to The BBQ Atlas Missives. Unsubscribe (one click, no exit survey): ${pageUrl}`;

  return sendEmail({
    to: opts.to,
    from: M,
    stream: "marketing",
    type: "day3_social",
    userId: opts.userId,
    subject: "Three days in. Come find us out there.",
    html: emailShell({
      title: "Three days in.",
      preheader: "Instagram, Threads, X — and a WhatsApp channel worth your while.",
      bodyHtml,
      footerHtml,
    }),
    text: emailText({ title: "Three days in.", bodyText, footerText }),
    headers: {
      "List-Unsubscribe": `<${apiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// ============================================================================
// FOOTER-NEWSLETTER LIFECYCLE (email_subscribers list) — separate from the
// account/profile lifecycle above. Copy is verbatim from the PM's build prompt
// (Appendix A/B/C). Three sends, all marketing stream, each with a real
// one-click unsubscribe via the subscriber's own token:
//   welcome (immediate, on subscribe) → drip_3 (>=3 days) → drip_7 (>=7 days).
// ============================================================================

const SIENNA_BTN = "#C4622D";
const SANS_BTN =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Inline, email-safe CTA button (table-based) so body copy can sit below it. */
function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;">
      <tr><td style="border-radius:6px;background:${SIENNA_BTN};">
        <a href="${url}" style="display:inline-block;padding:13px 26px;font-family:${SANS_BTN};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${label}</a>
      </td></tr>
    </table>`;
}

/** Subscriber unsubscribe links (page + one-click API) from the row's token. */
function subUnsub(token: string) {
  return {
    pageUrl: `${EMAIL_SITE_URL}/unsubscribe?token=${token}`,
    apiUrl: `${EMAIL_SITE_URL}/api/unsubscribe?token=${token}`,
  };
}

/** Shared "become a member" CTA threaded through the subscriber conversion drip. */
function signupUrl(to: string): string {
  return `${EMAIL_SITE_URL}/signup?ref=newsletter&email=${encodeURIComponent(to)}`;
}
function memberInviteHtml(to: string): string {
  return `<p style="margin:0 0 14px;">Want your own corner of the Atlas? Becoming a member is free — save spots to your own map, check in where you've been, and keep your finds in one place.</p>${ctaButton("Become a member →", signupUrl(to))}`;
}
function memberInviteText(to: string): string {
  return `Want your own corner of the Atlas? Becoming a member is free — save spots to your own map, check in where you've been, and keep your finds in one place.\n\nBecome a member: ${signupUrl(to)}`;
}

/** Newsletter DAY-1 drip — nudge to join, feature spotlight: My Atlas / save spots. */
export function sendSubscriberDrip1(opts: { to: string; unsubscribeToken: string }) {
  const { pageUrl, apiUrl } = subUnsub(opts.unsubscribeToken);
  const map = `${EMAIL_SITE_URL}/map`;

  const bodyHtml = `<p style="margin:0 0 14px;">One day in — here's the single best thing the Atlas does for you.</p>
    <p style="margin:0 0 14px;">Every pin is a real barbecue place worth knowing about. When one catches your eye, save it to <strong>your</strong> Atlas — a personal map of the spots you want to hit, waiting for you wherever you land next. That's what a membership unlocks, and it's free.</p>
    ${memberInviteHtml(opts.to)}
    <p style="margin:0 0 14px;">Or just wander the map for now — no account needed to look.</p>
    ${ctaButton("Open the map →", map)}
    <p style="margin:0 0 18px;">More soon.</p>
    <p style="margin:0;color:#6f6152;">— The BBQ Atlas</p>`;

  const bodyText = `One day in — here's the single best thing the Atlas does for you.

Every pin is a real barbecue place worth knowing about. When one catches your eye, save it to YOUR Atlas — a personal map of the spots you want to hit, waiting for you wherever you land next. That's what a membership unlocks, and it's free.

${memberInviteText(opts.to)}

Or just wander the map for now — no account needed to look: ${map}

More soon.

— The BBQ Atlas`;

  const footerHtml = `<p style="margin:10px 0 0;">You're receiving this because you subscribed to The BBQ Atlas. <a href="${pageUrl}" style="color:#C4622D;">Unsubscribe</a> anytime.</p>`;
  const footerText = `You're receiving this because you subscribed to The BBQ Atlas. Unsubscribe: ${pageUrl}`;

  return sendEmail({
    to: opts.to,
    from: M,
    stream: "marketing",
    type: "drip_1",
    subject: "Make it your map.",
    html: emailShell({
      title: "Make it your map.",
      preheader: "Save spots to your own Atlas — free.",
      bodyHtml,
      footerHtml,
    }),
    text: emailText({ title: "Make it your map.", bodyText, footerText }),
    headers: {
      "List-Unsubscribe": `<${apiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

/**
 * Newsletter WELCOME — sent immediately when someone subscribes via the footer
 * (single opt-in, no confirmation). Appendix A copy + a "become a member" CTA.
 */
export function sendSubscriberWelcome(opts: { to: string; unsubscribeToken: string }) {
  const { pageUrl, apiUrl } = subUnsub(opts.unsubscribeToken);
  const map = `${EMAIL_SITE_URL}/map`;

  const bodyHtml = `<p style="margin:0 0 14px;">Welcome to The BBQ Atlas.</p>
    <p style="margin:0 0 14px;">You've just joined a small but growing number of people who take barbecue seriously enough to want a map of it — the real places, the pits worth the drive, wherever in the world they happen to be.</p>
    <p style="margin:0 0 14px;">Here's what we're about: we don't rank barbecue. We celebrate it. No stars, no leaderboards, no "best of" bait. Just honest places, honestly described, on one map you can actually use.</p>
    ${ctaButton("Explore the map →", map)}
    <p style="margin:0 0 14px;">We'll send you a couple of short notes over the next week — where to start, and how to add a place we've missed. After that, we only write when there's something genuinely worth your time.</p>
    ${memberInviteHtml(opts.to)}
    <p style="margin:0 0 18px;">Glad you're here. Go find something worth the drive.</p>
    <p style="margin:0;color:#6f6152;">— The BBQ Atlas</p>`;

  const bodyText = `Welcome to The BBQ Atlas.

You've just joined a small but growing number of people who take barbecue seriously enough to want a map of it — the real places, the pits worth the drive, wherever in the world they happen to be.

Here's what we're about: we don't rank barbecue. We celebrate it. No stars, no leaderboards, no "best of" bait. Just honest places, honestly described, on one map you can actually use.

Explore the map: ${map}

We'll send you a couple of short notes over the next week — where to start, and how to add a place we've missed. After that, we only write when there's something genuinely worth your time.

${memberInviteText(opts.to)}

Glad you're here. Go find something worth the drive.

— The BBQ Atlas`;

  const footerHtml = `<p style="margin:10px 0 0;">Didn't mean to sign up? <a href="${pageUrl}" style="color:#C4622D;">Unsubscribe</a> — no hard feelings.</p>`;
  const footerText = `Didn't mean to sign up? Unsubscribe — no hard feelings: ${pageUrl}`;

  return sendEmail({
    to: opts.to,
    from: M,
    stream: "marketing",
    type: "welcome",
    subject: "You're on the map.",
    html: emailShell({
      title: "You're on the map.",
      preheader: "No stars, no leaderboards — just barbecue, mapped.",
      bodyHtml,
      footerHtml,
    }),
    text: emailText({ title: "You're on the map.", bodyText, footerText }),
    headers: {
      "List-Unsubscribe": `<${apiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

/** Newsletter DAY-3 drip — "Find a place. Save it. Go." Appendix B, verbatim. */
export function sendSubscriberDrip3(opts: { to: string; unsubscribeToken: string }) {
  const { pageUrl, apiUrl } = subUnsub(opts.unsubscribeToken);
  const map = `${EMAIL_SITE_URL}/map`;
  const guides = `${EMAIL_SITE_URL}/guides`;

  const bodyHtml = `<p style="margin:0 0 14px;">A quick note now you've had a few days with the Atlas.</p>
    <p style="margin:0 0 14px;">The whole thing runs on one simple loop: find a place, save it, go. Every pin is a real barbecue joint someone thought was worth putting on the map — a Texas smokehouse in Kendal, a Korean grill in Melbourne, brisket in Austin. Open the map, wander, and when something catches your eye, save it to your own atlas so it's waiting when you're next in town.</p>
    ${ctaButton("Open the map →", map)}
    <p style="margin:0 0 14px;">Not sure where to start? The guides are a good way in — plain-spoken pieces on fire, smoke, wood, and the craft behind the plate. No gatekeeping, just the good stuff.</p>
    ${ctaButton("Read the guides →", guides)}
    ${memberInviteHtml(opts.to)}
    <p style="margin:0 0 18px;">More soon.</p>
    <p style="margin:0;color:#6f6152;">— The BBQ Atlas</p>`;

  const bodyText = `A quick note now you've had a few days with the Atlas.

The whole thing runs on one simple loop: find a place, save it, go. Every pin is a real barbecue joint someone thought was worth putting on the map — a Texas smokehouse in Kendal, a Korean grill in Melbourne, brisket in Austin. Open the map, wander, and when something catches your eye, save it to your own atlas so it's waiting when you're next in town.

Open the map: ${map}

Not sure where to start? The guides are a good way in — plain-spoken pieces on fire, smoke, wood, and the craft behind the plate. No gatekeeping, just the good stuff.

Read the guides: ${guides}

${memberInviteText(opts.to)}

More soon.

— The BBQ Atlas`;

  const footerHtml = `<p style="margin:10px 0 0;">You're receiving this because you subscribed to The BBQ Atlas. <a href="${pageUrl}" style="color:#C4622D;">Unsubscribe</a> anytime.</p>`;
  const footerText = `You're receiving this because you subscribed to The BBQ Atlas. Unsubscribe: ${pageUrl}`;

  return sendEmail({
    to: opts.to,
    from: M,
    stream: "marketing",
    type: "drip_3",
    subject: "Find a place. Save it. Go.",
    html: emailShell({
      title: "Find a place. Save it. Go.",
      preheader: "The Atlas runs on one simple loop.",
      bodyHtml,
      footerHtml,
    }),
    text: emailText({ title: "Find a place. Save it. Go.", bodyText, footerText }),
    headers: {
      "List-Unsubscribe": `<${apiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

/** Newsletter DAY-7 drip — "Know a great one we've missed?" Appendix C, verbatim. */
export function sendSubscriberDrip7(opts: { to: string; unsubscribeToken: string }) {
  const { pageUrl, apiUrl } = subUnsub(opts.unsubscribeToken);
  const submit = `${EMAIL_SITE_URL}/submit`;

  const bodyHtml = `<p style="margin:0 0 14px;">Here's the thing about a map of the world's barbecue: it's never finished. There's always a backstreet joint, a roadside smoker, a place only the locals know — and we want them all.</p>
    <p style="margin:0 0 14px;">So, a small ask. If you know a great barbecue place we haven't got yet, tell us. We'll go find it, make sure it's real, and add it. That's how the Atlas grows — not from a marketing team, but from people who actually eat this food.</p>
    ${ctaButton("Submit a place →", submit)}
    <p style="margin:0 0 14px;">No survey, no feedback form, no "how did we do." Good barbecue doesn't ask how it did — it already knows. We just want the next great place on the map.</p>
    ${memberInviteHtml(opts.to)}
    <p style="margin:0 0 18px;">Thanks for being here early.</p>
    <p style="margin:0;color:#6f6152;">— The BBQ Atlas</p>`;

  const bodyText = `Here's the thing about a map of the world's barbecue: it's never finished. There's always a backstreet joint, a roadside smoker, a place only the locals know — and we want them all.

So, a small ask. If you know a great barbecue place we haven't got yet, tell us. We'll go find it, make sure it's real, and add it. That's how the Atlas grows — not from a marketing team, but from people who actually eat this food.

Submit a place: ${submit}

No survey, no feedback form, no "how did we do." Good barbecue doesn't ask how it did — it already knows. We just want the next great place on the map.

${memberInviteText(opts.to)}

Thanks for being here early.

— The BBQ Atlas`;

  const footerHtml = `<p style="margin:10px 0 0;">You're receiving this because you subscribed to The BBQ Atlas. <a href="${pageUrl}" style="color:#C4622D;">Unsubscribe</a> anytime.</p>`;
  const footerText = `You're receiving this because you subscribed to The BBQ Atlas. Unsubscribe: ${pageUrl}`;

  return sendEmail({
    to: opts.to,
    from: M,
    stream: "marketing",
    type: "drip_7",
    subject: "Know a great one we've missed?",
    html: emailShell({
      title: "Know a great one we've missed?",
      preheader: "A small ask — the Atlas is never finished.",
      bodyHtml,
      footerHtml,
    }),
    text: emailText({ title: "Know a great one we've missed?", bodyText, footerText }),
    headers: {
      "List-Unsubscribe": `<${apiUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

// ============================================================================
// CONTACT-FORM NOTIFICATION — there is no admin inbox page, so a new contact
// message would otherwise sit unseen in the table. This pings the team so they
// actually read it. Best-effort: the message is already stored regardless.
// ============================================================================

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Notify the team of a new contact-form message. reply_to = the sender. */
export function sendContactNotification(opts: {
  name: string;
  email: string;
  subject?: string | null;
  message: string;
}) {
  const subj = opts.subject?.trim();
  const bodyHtml = `<p style="margin:0 0 14px;">New message via the contact form.</p>
    <p style="margin:0 0 6px;"><strong>From:</strong> ${esc(opts.name)} &lt;${esc(opts.email)}&gt;</p>
    ${subj ? `<p style="margin:0 0 6px;"><strong>Subject:</strong> ${esc(subj)}</p>` : ""}
    <p style="margin:14px 0 6px;color:#6f6152;">Message:</p>
    <p style="margin:0;white-space:pre-wrap;">${esc(opts.message)}</p>`;
  const bodyText = `New message via the contact form.

From: ${opts.name} <${opts.email}>${subj ? `\nSubject: ${subj}` : ""}

${opts.message}`;

  return sendEmail({
    to: EMAIL_REPLY_TO,
    from: T,
    stream: "transactional",
    type: "contact_notify",
    replyTo: opts.email,
    subject: subj ? `Contact form: ${subj}` : `Contact form message from ${opts.name}`,
    html: emailShell({ title: "New contact message", bodyHtml }),
    text: emailText({ title: "New contact message", bodyText }),
  });
}
