/* NIVHA email sender — Postmark HTTP API with a dry-run fallback.
   Set POSTMARK_TOKEN (server API token) and optionally POSTMARK_FROM
   (defaults to info@nivha.net, must be a verified sender signature). */

'use strict';

const TOKEN = process.env.POSTMARK_TOKEN || '';
const FROM = process.env.POSTMARK_FROM || 'info@nivha.net';
const EMAIL_DRY_RUN = !TOKEN;

const BRAND = {
  primary: '#2a8ba3',
  deep: '#1d6478',
  text: '#2c2d2f',
  muted: '#5d6467',
  border: '#dfe6e9',
  callout: '#eaf4f7'
};

const FOOTER_TEXT = [
  'NIVHA Laboratory Services Limited',
  'Unit 1B Concourse 1 Catalyst, Queens Road, Belfast, Antrim, BT3 9DT',
  '02890 737942 · info@nivha.net'
].join('\n');

function layout(baseUrl, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:94%;background:#ffffff;border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">
        <tr><td style="height:6px;background:${BRAND.primary};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:28px 36px 8px;">
          <img src="${baseUrl}/assets/nivha-logo.png" alt="NIVHA" width="110" style="display:block;border:0;">
        </td></tr>
        <tr><td style="padding:8px 36px 28px;font-family:'Open Sans',Arial,sans-serif;color:${BRAND.text};font-size:15px;line-height:1.55;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 36px 24px;border-top:1px solid ${BRAND.border};font-family:'Open Sans',Arial,sans-serif;color:#8a9194;font-size:12px;line-height:1.6;">
          NIVHA Laboratory Services Limited<br>
          Unit 1B Concourse 1 Catalyst, Queens Road, Belfast, Antrim, BT3 9DT<br>
          02890 737942 · info@nivha.net
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

const button = (href, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
    <td style="background:${BRAND.primary};border-radius:6px;">
      <a href="${href}" style="display:inline-block;padding:12px 26px;font-family:'Open Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${label}</a>
    </td></tr></table>`;

async function send({ to, subject, textBody, htmlBody, tag }) {
  if (EMAIL_DRY_RUN) {
    console.log(`[email dry-run] to=${to} tag=${tag} subject="${subject}"\n${textBody}`);
    return { ok: true, dryRun: true };
  }
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Postmark-Server-Token': TOKEN
    },
    body: JSON.stringify({
      From: `NIVHA Laboratory Services <${FROM}>`,
      To: to,
      Subject: subject,
      TextBody: textBody,
      HtmlBody: htmlBody,
      Tag: tag,
      MessageStream: 'outbound'
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Postmark ${res.status}: ${detail.slice(0, 300)}`);
  }
  return { ok: true, dryRun: false };
}

/* ---------- messages ---------- */

function gateEmail({ baseUrl, to, code, link }) {
  const subject = 'Your secure fee note link';
  const textBody = [
    'Hello,',
    '',
    'Use the link below to open the NIVHA fee note tool, or enter the code on the page you requested it from.',
    '',
    `Sign-in code: ${code}`,
    `Link: ${link}`,
    '',
    'The link and code stay valid for 24 hours. If you did not request this, you can ignore this email.',
    '',
    FOOTER_TEXT
  ].join('\n');
  const htmlBody = layout(baseUrl, `
    <p style="margin:0 0 14px;">Hello,</p>
    <p style="margin:0 0 14px;">Use the button below to open the NIVHA fee note tool, or enter this code on the page you requested it from.</p>
    <p style="margin:18px 0;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;color:${BRAND.deep};">${code}</p>
    ${button(link, 'Open the fee note tool')}
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">The link and code stay valid for 24 hours. If you did not request this, you can ignore this email.</p>`);
  return send({ to, subject, textBody, htmlBody, tag: 'gate-link' });
}

function bookLaterEmail({ baseUrl, to, reference, isPrivate, link }) {
  const subject = `Book your collection appointment — ${reference}`;
  const intro = isPrivate
    ? `Thank you for your payment. Fee note ${reference} is confirmed, but a collection appointment has not been booked yet.`
    : `Fee note ${reference} has been submitted, but a collection appointment has not been booked yet.`;
  const textBody = [
    'Hello,',
    '',
    intro,
    '',
    'Use the secure link below to return to the fee note tool and choose a time that suits.',
    link,
    '',
    'If you have already arranged an appointment with the team, you can ignore this email.',
    'Late cancellation or missed appointment within 24 hours: £50 + VAT.',
    '',
    FOOTER_TEXT
  ].join('\n');
  const htmlBody = layout(baseUrl, `
    <p style="margin:0 0 14px;">Hello,</p>
    <p style="margin:0 0 14px;">${intro}</p>
    <p style="margin:0 0 14px;">Use the secure link below to return to the fee note tool and choose a time that suits.</p>
    ${button(link, 'Book your appointment')}
    <p style="margin:0 0 10px;color:${BRAND.muted};font-size:13px;">If you have already arranged an appointment with the team, you can ignore this email.</p>
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">Late cancellation or missed appointment within 24 hours: £50 + VAT.</p>`);
  return send({ to, subject, textBody, htmlBody, tag: 'book-later' });
}

module.exports = { gateEmail, bookLaterEmail, EMAIL_DRY_RUN };
