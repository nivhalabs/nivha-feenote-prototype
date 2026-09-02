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
    return { ok: true, dryRun: true, messageId: 'dry-run' };
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
  const body = await res.json().catch(() => ({}));
  return { ok: true, dryRun: false, messageId: body.MessageID || '' };
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

/* ---------- policy builder ---------- */

const gbp = pennies => '\u00a3' + (pennies / 100).toFixed(2);
const escHtml = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* Order summary as a table for the HTML part and aligned rows for the text. */
function orderRows(order) {
  const rows = order.lines.map(l => [l.name, l.netPence === 0 ? 'included' : gbp(l.netPence)]);
  if (order.clientDiscountPence) rows.push(['NIVHA client rate (40% off)', '\u2212' + gbp(order.clientDiscountPence)]);
  if (order.promptDiscountPence) rows.push(['Pay-now card discount (10%)', '\u2212' + gbp(order.promptDiscountPence)]);
  rows.push(['Subtotal excluding VAT', gbp(order.subtotalPence)]);
  rows.push([order.reverseCharge ? 'VAT \u2014 reverse charge' : 'VAT at 20%', gbp(order.vatPence)]);
  rows.push(['Total', gbp(order.totalPence)]);
  return rows;
}

const rowsHtml = rows => `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 18px;font-size:14px;">
  ${rows.map((r, i) => `<tr>
    <td style="padding:7px 0;border-bottom:1px solid ${BRAND.border};color:${i === rows.length - 1 ? BRAND.text : BRAND.muted};font-weight:${i === rows.length - 1 ? 700 : 400};">${escHtml(r[0])}</td>
    <td align="right" style="padding:7px 0;border-bottom:1px solid ${BRAND.border};white-space:nowrap;font-weight:${i === rows.length - 1 ? 700 : 400};">${escHtml(r[1])}</td>
  </tr>`).join('')}
</table>`;

const rowsText = rows => rows.map(r => `  ${r[0]}: ${r[1]}`).join('\n');

/* Order confirmation — card paid or invoice confirmed. The human check is the
   promise here, not a delivery time we cannot keep. */
function policyOrderEmail({ baseUrl, to, orderRef, organisation, order, invoice, bcc }) {
  const rows = orderRows(order);
  const subject = `Your policy order ${orderRef} \u2014 confirmed`;
  const opening = invoice
    ? `Thank you \u2014 your order is confirmed. An invoice with 14-day terms follows from our office.`
    : `Thank you \u2014 your payment has been received and your order is confirmed.`;
  const vatLine = order.reverseCharge
    ? 'VAT reverse charge \u2014 VAT to be accounted for by the recipient under Article 196 of Council Directive 2006/112/EC.'
    : 'All figures are shown excluding VAT, with VAT at 20% added in the total.';
  const checks = 'Your documents follow once our team completes final checks \u2014 usually within one working day. Every policy is read by a person here before it is sent, so what arrives has been looked at rather than only generated.';
  const reviewLine = order.hasReview
    ? 'Your annual review service runs for twelve months from today. About 30 days before your review date we will email a payment link to renew for the following year \u2014 nothing is charged automatically.'
    : '';
  const textBody = [
    'Hello,',
    '',
    opening,
    '',
    `Order ${orderRef}${organisation ? ' \u2014 ' + organisation : ''}`,
    rowsText(rows),
    '',
    vatLine,
    '',
    checks,
    ...(reviewLine ? ['', reviewLine] : []),
    '',
    FOOTER_TEXT
  ].join('\n');
  const htmlBody = layout(baseUrl, `
    <p style="margin:0 0 14px;">Hello,</p>
    <p style="margin:0 0 14px;">${escHtml(opening)}</p>
    <p style="margin:0 0 4px;font-weight:600;">Order ${escHtml(orderRef)}${organisation ? ' \u2014 ' + escHtml(organisation) : ''}</p>
    ${rowsHtml(rows)}
    <p style="margin:0 0 14px;color:${BRAND.muted};font-size:13px;">${escHtml(vatLine)}</p>
    <p style="margin:0 0 14px;">${escHtml(checks)}</p>
    ${reviewLine ? `<p style="margin:0;color:${BRAND.muted};font-size:13px;">${escHtml(reviewLine)}</p>` : ''}`);
  return send({ to, subject, textBody, htmlBody, tag: 'policy-order', bcc });
}

/* Delivery — the documents themselves, once a person has approved them. */
function policyDeliveryEmail({ baseUrl, to, orderRef, organisation, files, hasReview, bcc }) {
  const subject = `Your drug and alcohol policy documents \u2014 ${orderRef}`;
  const list = (files || []).map(f => `${f.Name}${f.Note ? ' \u2014 ' + f.Note : ''}`);
  const reviewLine = hasReview
    ? 'Your annual review service is active. About 30 days before your review date we will email a payment link to renew for the following year \u2014 nothing is charged automatically, and if you choose not to renew the service simply lapses.'
    : '';
  const adopt = 'Before the policy takes effect, have it reviewed by your own legal or HR adviser, check it fits your contracts and procedures, and complete the adoption record inside the document.';
  const help = 'If any file will not open, or something is missing from the pack, email info@nivha.net and we will put it right.';
  const textBody = [
    'Hello,',
    '',
    `Your documents for order ${orderRef}${organisation ? ' \u2014 ' + organisation : ''} are attached.`,
    '',
    'What is in this email:',
    ...list.map(l => `  \u00b7 ${l}`),
    '',
    adopt,
    ...(reviewLine ? ['', reviewLine] : []),
    '',
    help,
    '',
    FOOTER_TEXT
  ].join('\n');
  const htmlBody = layout(baseUrl, `
    <p style="margin:0 0 14px;">Hello,</p>
    <p style="margin:0 0 14px;">Your documents for order <strong>${escHtml(orderRef)}</strong>${organisation ? ' \u2014 ' + escHtml(organisation) : ''} are attached.</p>
    <p style="margin:0 0 8px;font-weight:600;">What is in this email</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:${BRAND.muted};font-size:14px;">
      ${list.map(l => `<li style="margin:0 0 6px;">${escHtml(l)}</li>`).join('')}
    </ul>
    <p style="margin:0 0 14px;">${escHtml(adopt)}</p>
    ${reviewLine ? `<p style="margin:0 0 14px;color:${BRAND.muted};font-size:13px;">${escHtml(reviewLine)}</p>` : ''}
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">${escHtml(help)}</p>`);
  const attachments = (files || []).map(f => ({ Name: f.Name, Content: f.Content, ContentType: f.ContentType }));
  return send({ to, subject, textBody, htmlBody, tag: 'policy-delivery', attachments, bcc });
}

/* Renewal — the payment link the office sends about 30 days before a review
   falls due. Client-initiated payment: the buyer clicks and pays, or does
   nothing and the service lapses at the review date. */
function policyReviewRenewalEmail({ baseUrl, to, orderRef, organisation, dueDate, amountLine, payUrl, policyOwner, dpContact, bcc }) {
  const subject = `Your annual policy review \u2014 renewal for ${orderRef}`;
  const intro = `The annual review service on your drug and alcohol policy${organisation ? ` for ${organisation}` : ''} falls due on ${dueDate}.`;
  const what = 'Renewing keeps your policy on the latest NIVHA master for another twelve months \u2014 a full annual refresh, re-issues when the law materially changes, and a plain-English change note with every update.';
  const how = `To renew, pay through the secure link below \u2014 ${amountLine}. Nothing is charged automatically.`;
  const checksHead = 'Before we run your refresh, please check three things:';
  const checks = [
    `The policy owner${policyOwner ? ` \u2014 we hold \u201c${policyOwner}\u201d` : ''} \u2014 still correct?`,
    `The data protection contact${dpContact ? ` \u2014 we hold \u201c${dpContact}\u201d` : ''} \u2014 still correct?`,
    'Has anything material changed \u2014 new locations, jurisdictions or testing arrangements? Changes like these sit outside the refresh and are handled as a separate order, so tell us before we re-issue.'
  ];
  const checksTail = 'If everything is unchanged, no reply is needed \u2014 just pay through the link and the refresh goes ahead on the details we hold. Otherwise, reply to this email with the corrections.';
  const lapse = 'If you choose not to renew, no payment is taken and the service ends on the review date. Your existing documents remain licensed and yours to keep \u2014 they just stop receiving updates.';
  const textBody = [
    'Hello,',
    '',
    intro,
    '',
    what,
    '',
    checksHead,
    ...checks.map(c => `  \u2022 ${c}`),
    checksTail,
    '',
    how,
    `Renew now: ${payUrl}`,
    '',
    lapse,
    '',
    FOOTER_TEXT
  ].join('\n');
  const htmlBody = layout(baseUrl, `
    <p style="margin:0 0 14px;">Hello,</p>
    <p style="margin:0 0 14px;">${escHtml(intro)}</p>
    <p style="margin:0 0 14px;">${escHtml(what)}</p>
    <p style="margin:0 0 6px;">${escHtml(checksHead)}</p>
    <ul style="margin:0 0 10px;padding-left:20px;">${checks.map(c => `<li style="margin:0 0 6px;">${escHtml(c)}</li>`).join('')}</ul>
    <p style="margin:0 0 14px;color:${BRAND.muted};font-size:13px;">${escHtml(checksTail)}</p>
    <p style="margin:0 0 14px;">${escHtml(how)}</p>
    ${button(payUrl, 'Renew the annual review')}
    <p style="margin:0;color:${BRAND.muted};font-size:13px;">${escHtml(lapse)}</p>`);
  return send({ to, subject, textBody, htmlBody, tag: 'policy-review-renewal', bcc });
}

/* Receipt once a renewal payment clears — confirms the new review date. */
function policyReviewRenewedEmail({ baseUrl, to, orderRef, organisation, newDueDate, bcc }) {
  const subject = `Annual policy review renewed \u2014 ${orderRef}`;
  const bodyText = `Thank you \u2014 your payment has been received and the annual review service on your drug and alcohol policy${organisation ? ` for ${organisation}` : ''} now runs to ${newDueDate}. We will email a payment link about 30 days before then if you wish to renew again.`;
  const nextText = 'We will now carry out your annual refresh \u2014 the re-issued policy and its change note follow by email once complete. If you have not already told us about changes to the policy owner or data protection contact, reply to this email now so the re-issue carries the right details.';
  const textBody = ['Hello,', '', bodyText, '', nextText, '', FOOTER_TEXT].join('\n');
  const htmlBody = layout(baseUrl, `
    <p style="margin:0 0 14px;">Hello,</p>
    <p style="margin:0 0 14px;">${escHtml(bodyText)}</p>
    <p style="margin:0;">${escHtml(nextText)}</p>`);
  return send({ to, subject, textBody, htmlBody, tag: 'policy-review-renewed', bcc });
}

/* Internal notification — order received, or an order waiting on approval. */
function policyAdminEmail({ baseUrl, to, subject, heading, rows, note, link, linkLabel }) {
  const lines = (rows || []).map(r => `  ${r[0]}: ${r[1]}`);
  const textBody = [
    heading,
    '',
    ...lines,
    ...(note ? ['', note] : []),
    ...(link ? ['', `${linkLabel || 'Open'}: ${link}`] : []),
    '',
    FOOTER_TEXT
  ].join('\n');
  const htmlBody = layout(baseUrl, `
    <p style="margin:0 0 14px;">${escHtml(heading)}</p>
    ${rowsHtml(rows || [])}
    ${note ? `<p style="margin:0 0 14px;color:${BRAND.muted};font-size:13px;">${escHtml(note)}</p>` : ''}
    ${link ? button(link, linkLabel || 'Open') : ''}`);
  return send({ to, subject, textBody, htmlBody, tag: 'policy-admin' });
}

module.exports = {
  gateEmail, bookLaterEmail, feeNoteEmail, EMAIL_DRY_RUN,
  policyOrderEmail, policyDeliveryEmail, policyAdminEmail, orderRows,
  policyReviewRenewalEmail, policyReviewRenewedEmail
};
