import { EMAIL_SITE_URL } from "./config";

/**
 * On-brand but email-safe layout. Deliberately LIGHT (not the dark site theme)
 * for inbox readability + deliverability; table-based, inline styles, a single
 * 600px column, web-safe serif heading, crest + burnt-sienna accent. Every
 * email renders through this, and every send ships BOTH html and text.
 */

const SIENNA = "#C4622D";
const INK = "#2b2118";
const MUTED = "#6f6152";
const PAPER = "#f6f1e8";
const CARD = "#ffffff";
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface ShellOptions {
  title: string;
  preheader?: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerHtml?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function emailShell({
  title,
  preheader,
  bodyHtml,
  cta,
  footerHtml,
}: ShellOptions): string {
  const logo = `${EMAIL_SITE_URL}/logos/crest-emblem.png`;
  const year = 2026;
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
         <tr><td style="border-radius:6px;background:${SIENNA};">
           <a href="${cta.url}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${esc(cta.label)}</a>
         </td></tr>
       </table>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
<span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${esc(preheader ?? title)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};">
  <tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
      <tr><td align="center" style="padding:8px 0 20px;">
        <img src="${logo}" width="56" height="56" alt="The BBQ Atlas" style="display:block;border:0;">
        <div style="font-family:${SERIF};font-size:15px;letter-spacing:2px;text-transform:uppercase;color:${INK};margin-top:10px;">The BBQ Atlas</div>
      </td></tr>
      <tr><td style="background:${CARD};border-radius:14px;border:1px solid #e7ddca;padding:32px;">
        <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:24px;line-height:1.25;color:${INK};">${esc(title)}</h1>
        <div style="font-family:${SANS};font-size:16px;line-height:1.65;color:${INK};">${bodyHtml}</div>
        ${ctaHtml}
      </td></tr>
      <tr><td style="padding:22px 8px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">
        <p style="margin:0 0 6px;">A global atlas of great barbecue — celebrated, not ranked.</p>
        <p style="margin:0 0 6px;"><a href="${EMAIL_SITE_URL}" style="color:${SIENNA};text-decoration:none;">thebbqatlas.com</a></p>
        ${footerHtml ?? ""}
        <p style="margin:10px 0 0;color:#a89a86;">© ${year} The BBQ Atlas</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export interface TextOptions {
  title: string;
  bodyText: string;
  cta?: { label: string; url: string };
  footerText?: string;
}

export function emailText({ title, bodyText, cta, footerText }: TextOptions): string {
  const lines = [
    "THE BBQ ATLAS",
    "",
    title,
    "",
    bodyText.trim(),
  ];
  if (cta) lines.push("", `${cta.label}: ${cta.url}`);
  lines.push("", "—", "A global atlas of great barbecue.", EMAIL_SITE_URL);
  if (footerText) lines.push("", footerText.trim());
  return lines.join("\n");
}
