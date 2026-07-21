import { emailShell, emailText } from "./layout";
import { sendEmail } from "./send";
import { EMAIL_FROM, EMAIL_SITE_URL } from "./config";

const T = EMAIL_FROM.transactional;
const M = EMAIL_FROM.marketing;

/** 1. Welcome on signup. */
export function sendWelcome(opts: { to: string; name?: string; userId?: string }) {
  const name = opts.name?.trim() || "there";
  const bodyHtml = `<p style="margin:0 0 14px;">Hi ${name}, and welcome — you're in.</p>
    <p style="margin:0 0 14px;">The BBQ Atlas is a living map of the world's great barbecue: Texas brisket, Argentine asado, Korean grills, Carolina whole hog and everything in between. Save the spots you love, add ones we're missing, and check in when you've been.</p>
    <p style="margin:0 0 14px;">Pull up a chair — the fire's already going.</p>`;
  const bodyText = `Hi ${name}, and welcome — you're in.

The BBQ Atlas is a living map of the world's great barbecue. Save spots you love, add ones we're missing, and check in when you've been.

Pull up a chair — the fire's already going.`;
  return sendEmail({
    to: opts.to,
    from: T,
    stream: "transactional",
    type: "welcome",
    userId: opts.userId,
    subject: "Welcome to The BBQ Atlas 🔥",
    html: emailShell({
      title: "Welcome to The BBQ Atlas",
      preheader: "You're in — pull up a chair.",
      bodyHtml,
      cta: { label: "Explore the map", url: `${EMAIL_SITE_URL}/map` },
    }),
    text: emailText({
      title: "Welcome to The BBQ Atlas",
      bodyText,
      cta: { label: "Explore the map", url: `${EMAIL_SITE_URL}/map` },
    }),
  });
}

/** 2. Submission received. */
export function sendSubmissionReceived(opts: { to: string; venueName?: string; name?: string }) {
  const venue = opts.venueName?.trim();
  const bodyHtml = `<p style="margin:0 0 14px;">Thanks for the submission${venue ? ` for <strong>${venue}</strong>` : ""} — we've received it.</p>
    <p style="margin:0 0 14px;">Our team reviews every spot by hand to keep the Atlas honest. We'll be in touch once it's been looked at. Good barbecue deserves the care.</p>`;
  const bodyText = `Thanks for the submission${venue ? ` for ${venue}` : ""} — we've received it.

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
}) {
  const venue = opts.venueName?.trim() || "your submission";
  if (opts.approved) {
    const bodyHtml = `<p style="margin:0 0 14px;">Good news — <strong>${venue}</strong> has been approved and is now on The BBQ Atlas. Thank you for helping the map grow.</p>`;
    const bodyText = `Good news — ${venue} has been approved and is now on The BBQ Atlas. Thank you for helping the map grow.`;
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
  const bodyHtml = `<p style="margin:0 0 14px;">Thanks for taking the time to submit ${venue === "your submission" ? "a spot" : `<strong>${venue}</strong>`}. After a look, we haven't been able to add it this time.</p>
    ${reason ? `<p style="margin:0 0 14px;color:#6f6152;">Note from our team: ${reason}</p>` : ""}
    <p style="margin:0 0 14px;">Please don't let it put you off — if anything changes, or you know another spot, we'd love to hear from you.</p>`;
  const bodyText = `Thanks for taking the time to submit ${venue}. After a look, we haven't been able to add it this time.${reason ? `\n\nNote from our team: ${reason}` : ""}\n\nIf anything changes, or you know another spot, we'd love to hear from you.`;
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
export function sendCorrectionAck(opts: { to: string; venueName?: string }) {
  const venue = opts.venueName?.trim();
  const bodyHtml = `<p style="margin:0 0 14px;">Thanks for flagging ${venue ? `an update for <strong>${venue}</strong>` : "a correction"} — we've received it.</p>
    <p style="margin:0 0 14px;">Keeping listings accurate is a big part of what makes the Atlas trustworthy. We'll review it and make any changes needed.</p>`;
  const bodyText = `Thanks for flagging ${venue ? `an update for ${venue}` : "a correction"} — we've received it. We'll review it and make any changes needed.`;
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
