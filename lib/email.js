/* NIVHA email sender — Postmark HTTP API with a dry-run fallback.
   Set POSTMARK_TOKEN (server API token) and optionally POSTMARK_FROM
   (defaults to info@nivha.net, must be a verified sender signature). */

'use strict';

const TOKEN = process.env.POSTMARK_TOKEN || process.env.POSTMARK_SERVER_TOKEN || '';
const FROM = process.env.POSTMARK_FROM || process.env.EMAIL_FROM || 'info@nivha.net';
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

async function send({ to, subject, textBody, htmlBody, tag, attachments, bcc }) {
  if (EMAIL_DRY_RUN) {
    const att = attachments ? ` attachments=[${attachments.map(a => a.Name).join(', ')}]` : '';
    console.log(`[email dry-run] to=${to}${bcc ? ` bcc=${bcc}` : ''} tag=${tag}${att} subject="${subject}"\n${textBody}`);
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
      MessageStream: 'outbound',
      ...(bcc ? { Bcc: bcc } : {}),
      ...(attachments && attachments.length ? { Attachments: attachments } : {})
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

function feeNoteEmail({ baseUrl, to, reference, isPrivate, paid, pdfBuffer, downloadLink, bcc }) {
  const subject = isPrivate && paid
    ? `Fee note ${reference} — payment received`
    : `Fee note ${reference} — NIVHA drug and alcohol testing`;
  const intro = isPrivate && paid
    ? `Thank you — your payment has been received. Fee note ${reference} is attached as a PDF. It is marked paid and doubles as your receipt.`
    : `Fee note ${reference} is attached as a PDF — ready to file or present. No payment is taken now; the fee note is invoiced to your organisation.`;
  const pdfPassword = String(reference).replace('-', '_');
  const passwordNote = `The PDF is password protected. The password is the fee note reference with an underscore: ${pdfPassword}`;
  const nextSteps = isPrivate
    ? [
      'Book the collection appointment, if you have not already — a secure link is in this inbox.',
      'Attend the appointment with photo ID.',
      'Your sample travels to the laboratory under chain of custody.',
      'The report is released to you, or an authorised representative, and to no one else.'
    ]
    : [
      'Book the collection appointment, if you have not already — a secure link is in this inbox.',
      'The donor attends with photo ID.',
      'Samples travel to the laboratory under chain of custody.',
      'The expert report is released on payment of this fee note.'
    ];
  const textBody = [
    'Hello,',
    '',
    intro,
    '',
    passwordNote,
    '',
    `You can also download a copy at any time: ${downloadLink}`,
    '',
    'What happens next:',
    ...nextSteps.map((s, i) => `${i + 1}. ${s}`),
    '',
    FOOTER_TEXT
  ].join('\n');
  const htmlBody = layout(baseUrl, `
    <p style="margin:0 0 14px;">Hello,</p>
    <p style="margin:0 0 14px;">${intro}</p>
    <p style="margin:0 0 14px;">The PDF is password protected. The password is the fee note reference with an underscore: <strong>${pdfPassword}</strong></p>
    ${button(downloadLink, 'Download fee note (PDF)')}
    <p style="margin:0 0 8px;font-weight:600;">What happens next</p>
    <ol style="margin:0 0 14px;padding-left:20px;color:${BRAND.muted};font-size:14px;">
      ${nextSteps.map(s => `<li style="margin:0 0 6px;">${s}</li>`).join('')}
    </ol>`);
  const attachments = pdfBuffer ? [{
    Name: `NIVHA-fee-note-${reference}.pdf`,
    Content: pdfBuffer.toString('base64'),
    ContentType: 'application/pdf'
  }] : undefined;
  return send({ to, subject, textBody, htmlBody, tag: 'fee-note', attachments, bcc });
}

module.exports = { gateEmail, bookLaterEmail, feeNoteEmail, EMAIL_DRY_RUN };
