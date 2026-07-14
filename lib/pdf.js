/* NIVHA fee note PDF generator.
   One template, three variants (trust / solicitor / private) that differ
   only in the instructing-party and payment blocks. Page 2+ describes only
   the panels selected on this fee note, sourced from js/catalogue.js. */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PDFDocument = require('pdfkit');

const ROOT = path.join(__dirname, '..');

/* ---------- catalogue (single source of truth) ---------- */
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(ROOT, 'js', 'catalogue.js'), 'utf8') +
  ';this.__CAT = CATALOGUE; this.__RATES = COURT_RATES;',
  sandbox
);
const CATALOGUE = sandbox.__CAT;
const COURT_RATES = sandbox.__RATES;
const byCode = {};
CATALOGUE.forEach(p => { byCode[p.code] = p; });

/* ---------- brand ---------- */
const C = {
  primary: '#2a8ba3',
  text: '#2c2d2f',
  muted: '#5d6467',
  faint: '#8a9194',
  border: '#dfe6e9',
  callout: '#eaf4f7',
  white: '#ffffff'
};
const FONT = {
  regular: path.join(ROOT, 'assets', 'fonts', 'OpenSans-Regular.ttf'),
  semibold: path.join(ROOT, 'assets', 'fonts', 'OpenSans-SemiBold.ttf'),
  bold: path.join(ROOT, 'assets', 'fonts', 'OpenSans-Bold.ttf'),
  italic: path.join(ROOT, 'assets', 'fonts', 'OpenSans-Italic.ttf')
};
const LOGO = path.join(ROOT, 'assets', 'nivha-logo.png');

const PAGE = { w: 595.28, h: 841.89, margin: 48 };
const CONTENT_W = PAGE.w - PAGE.margin * 2;

const COMPANY_LINE_1 = 'NIVHA Laboratory Services Limited · Unit 1B Concourse 1 Catalyst, Queens Road, Belfast, Antrim, BT3 9DT';
const COMPANY_LINE_2 = '02890 737942 · info@nivha.net · VAT registration no. 843475315';
const CANCEL_LINE = 'Late cancellation or missed appointment within 24 hours: £50 + VAT.';

/* ---------- helpers ---------- */
const gbp = n => (n < 0 ? '−£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const longDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function apptText(appointment) {
  if (!appointment || !appointment.when) return null;
  const dt = new Date(appointment.when);
  const day = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const time = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return `${day}, ${time}`;
}

const LOCATION_LABEL = {
  belfast: 'NIVHA office — Belfast',
  derry: 'NIVHA office — Derry~Londonderry',
  onsite: 'At your location — on-site collection'
};

/* ---------- low-level drawing ---------- */
function label(doc, text, x, y, w) {
  doc.font('OS-SemiBold').fontSize(7.2).fillColor(C.primary)
    .text(text.toUpperCase(), x, y, { width: w, characterSpacing: 0.8 });
}

function kv(doc, x, w, rows) {
  rows.forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (k) {
      doc.font('OS-SemiBold').fontSize(8.6).fillColor(C.muted).text(k, x, doc.y, { width: w });
      doc.font('OS-Regular').fontSize(9.4).fillColor(C.text).text(v, x, doc.y, { width: w });
    } else {
      doc.font('OS-Regular').fontSize(9.4).fillColor(C.text).text(v, x, doc.y, { width: w });
    }
    doc.moveDown(0.28);
  });
}

function rule(doc, y, color, width) {
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.w - PAGE.margin, y)
    .lineWidth(width || 0.7).strokeColor(color || C.border).stroke();
}

/* ---------- page 1 blocks ---------- */
function header(doc, data) {
  const y = PAGE.margin;
  doc.image(LOGO, PAGE.margin, y, { width: 132 });
  doc.font('OS-Bold').fontSize(15).fillColor(C.text)
    .text(data.ref, PAGE.margin, y + 2, { width: CONTENT_W, align: 'right' });
  doc.font('OS-Regular').fontSize(9).fillColor(C.muted)
    .text('Issued ' + longDate(data.issued), PAGE.margin, doc.y + 1, { width: CONTENT_W, align: 'right' });
  doc.font('OS-Bold').fontSize(16.5).fillColor(C.text)
    .text('Drug and alcohol testing fee note', PAGE.margin, y + 52);
  rule(doc, doc.y + 8, C.primary, 1.4);
  doc.y += 20;
}

function partyBlocks(doc, data) {
  const d = data.details;
  const colW = (CONTENT_W - 24) / 2;
  const xL = PAGE.margin, xR = PAGE.margin + colW + 24;
  const yTop = doc.y;

  /* left column — instructing party (the variant block) */
  label(doc, 'Instructing party', xL, yTop, colW);
  doc.y = yTop + 14; doc.x = xL;
  const addr = [d.orgAddress, [d.orgTown, d.orgPostcode].filter(Boolean).join(' ')].filter(Boolean).join('\n');
  if (data.route === 'trust') {
    kv(doc, xL, colW, [
      ['', d.org], ['', addr],
      ['Cost centre / PO', d.costCentre],
      ['Approved by', d.approverName],
      ['Authorised by', d.authoriserName],
      ['Contact', [d.contactName, d.contactEmail, d.contactPhone].filter(Boolean).join('\n')]
    ]);
  } else if (data.route === 'solicitor') {
    kv(doc, xL, colW, [
      ['', d.org], ['', addr],
      ['Case / PO reference', d.caseref],
      ['Legal aid reference', d.legalAidRef],
      ['Contact', [d.contactName, d.contactEmail, d.contactPhone].filter(Boolean).join('\n')]
    ]);
  } else {
    kv(doc, xL, colW, [
      ['', d.contactName],
      ['Contact', [d.contactEmail, d.contactPhone].filter(Boolean).join('\n')]
    ]);
  }
  const leftEnd = doc.y;

  /* right column — donor, then collection */
  doc.y = yTop;
  label(doc, 'Donor', xR, yTop, colW);
  doc.y = yTop + 14; doc.x = xR;
  kv(doc, xR, colW, [
    ['', d.donorName],
    ['Date of birth', d.donorDob ? longDate(d.donorDob) : '']
  ]);
  doc.moveDown(0.5);
  const yCol = doc.y;
  label(doc, 'Collection', xR, yCol, colW);
  doc.y = yCol + 14; doc.x = xR;
  const appt = apptText(data.appointment);
  kv(doc, xR, colW, [
    ['', LOCATION_LABEL[data.location] || data.location],
    ['Turnaround', data.fastTrack ? 'Fast track' : 'Standard'],
    ['Appointment', appt || (data.location === 'onsite'
      ? 'Arranged by request — the team will confirm'
      : 'To be booked — a booking link has been emailed')]
  ]);
  doc.y = Math.max(leftEnd, doc.y) + 10;
  doc.x = PAGE.margin;
}

function pricingTable(doc, data) {
  const xAmt = PAGE.w - PAGE.margin - 110;
  let y = doc.y + 4;

  label(doc, 'Tests and pricing', PAGE.margin, y, CONTENT_W);
  y += 16;

  doc.font('OS-SemiBold').fontSize(8.6).fillColor(C.muted);
  doc.text('Description', PAGE.margin, y, { width: xAmt - PAGE.margin - 10 });
  doc.text('Amount', xAmt, y, { width: 110, align: 'right' });
  y += 14;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.w - PAGE.margin, y).lineWidth(0.9).strokeColor(C.text).stroke();
  y += 7;

  data.panels.forEach(line => {
    const isPOA = /priced on request/i.test(line.label);
    const desc = line.code ? `${line.code} · ${line.label}` : line.label;
    doc.font('OS-Regular').fontSize(9.4).fillColor(C.text);
    const h = doc.heightOfString(desc, { width: xAmt - PAGE.margin - 10 });
    doc.text(desc, PAGE.margin, y, { width: xAmt - PAGE.margin - 10 });
    doc.font(line.amount < 0 ? 'OS-Regular' : 'OS-Regular').fontSize(9.4)
      .fillColor(line.amount < 0 ? C.primary : C.text)
      .text(isPOA ? 'On request' : gbp(line.amount), xAmt, y, { width: 110, align: 'right' });
    y += h + 6;
  });

  y += 2;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.w - PAGE.margin, y).lineWidth(0.7).strokeColor(C.border).stroke();
  y += 7;

  const totalRow = (k, v, bold) => {
    doc.font(bold ? 'OS-Bold' : 'OS-Regular').fontSize(bold ? 10.5 : 9.4)
      .fillColor(bold ? C.text : C.muted)
      .text(k, PAGE.margin, y, { width: xAmt - PAGE.margin - 10, align: 'right' });
    doc.font(bold ? 'OS-Bold' : 'OS-Regular').fontSize(bold ? 10.5 : 9.4).fillColor(C.text)
      .text(v, xAmt, y, { width: 110, align: 'right' });
    y += bold ? 17 : 14;
  };
  totalRow('Subtotal', gbp(data.totals.net));
  totalRow('VAT (20%)', gbp(data.totals.vat));
  doc.moveTo(xAmt - 60, y).lineTo(PAGE.w - PAGE.margin, y).lineWidth(1.2).strokeColor(C.text).stroke();
  y += 5;
  totalRow('Total', gbp(data.totals.total), true);
  doc.y = y + 2;
  doc.x = PAGE.margin;
}

function paymentBlock(doc, data) {
  const pad = 12;
  let text;
  if (data.route === 'private') {
    const p = data.payment || {};
    text = 'Paid — this fee note is a receipt for a card payment received'
      + (p.paidAt ? ' on ' + longDate(p.paidAt) : '') + '.'
      + (p.cardRef ? ` Payment reference ${p.cardRef}.` : '');
  } else if (data.route === 'solicitor') {
    text = 'Payment by invoice. Analysis proceeds on booking; results are released on payment of this fee note. '
      + 'Where the case is legally aided, this fee note may be submitted to the legal aid authority, court or admin office as presented.';
  } else {
    text = 'Payment by invoice. Analysis proceeds on booking; results are released on payment of this fee note.';
  }
  const w = CONTENT_W, x = PAGE.margin, y = doc.y + 6;
  doc.font('OS-Regular').fontSize(9);
  const h = doc.heightOfString(text, { width: w - pad * 2 }) + pad * 2 - 4;
  doc.roundedRect(x, y, w, h, 5).fillColor(C.callout).fill();
  label(doc, 'Payment', x + pad, y + pad - 3, w - pad * 2);
  doc.font('OS-Regular').fontSize(9).fillColor(C.text)
    .text(text, x + pad, y + pad + 9, { width: w - pad * 2 });
  doc.y = y + h + 12;
  doc.x = PAGE.margin;
}

function courtRatesBlock(doc) {
  label(doc, 'Court and reporting, where required', PAGE.margin, doc.y, CONTENT_W);
  doc.y += 13;
  const gbp0 = n => '£' + n.toLocaleString('en-GB');
  const items = COURT_RATES.lines.map(l =>
    l.price !== undefined ? `${l.label} — ${gbp0(l.price)} + VAT` : `${l.label} — ${l.text}`);
  doc.font('OS-Regular').fontSize(8.4).fillColor(C.muted)
    .text(items.join('\n'), PAGE.margin, doc.y, { width: CONTENT_W, lineGap: 1.5 });
  doc.font('OS-Italic').fontSize(8.4).fillColor(C.muted)
    .text(COURT_RATES.note, PAGE.margin, doc.y + 2, { width: CONTENT_W });
  doc.x = PAGE.margin;
}

function pageOneFooter(doc, data) {
  const y = PAGE.h - PAGE.margin - 46;
  rule(doc, y, C.border, 0.7);
  doc.font('OS-Regular').fontSize(7.8).fillColor(C.faint)
    .text(CANCEL_LINE, PAGE.margin, y + 8, { width: CONTENT_W })
    .text(COMPANY_LINE_1, PAGE.margin, doc.y + 2, { width: CONTENT_W })
    .text(COMPANY_LINE_2, PAGE.margin, doc.y + 1, { width: CONTENT_W });
}

/* ---------- page 2+ — about the selected tests ---------- */
function panelPages(doc, data) {
  const selected = data.panels.map(l => byCode[l.code]).filter(Boolean);
  if (!selected.length) return;

  doc.addPage();
  doc.font('OS-Bold').fontSize(14).fillColor(C.text)
    .text('About the tests on this fee note', PAGE.margin, PAGE.margin);
  doc.font('OS-Regular').fontSize(9).fillColor(C.muted)
    .text('This page describes only the tests selected on fee note ' + data.ref + '.',
      PAGE.margin, doc.y + 3, { width: CONTENT_W });
  rule(doc, doc.y + 10, C.primary, 1.4);
  doc.y += 22;

  selected.forEach(p => {
    const rows = [];
    if (p.detects) rows.push(['Detects', p.detects]);
    if (p.code === 'H-DSD' && data.details.dsdDrug) rows.push(['Specified drug', data.details.dsdDrug]);
    if (p.window) rows.push(['Detection window', p.window]);
    if (p.turnaround) rows.push(['Turnaround', p.turnaround + (data.fastTrack && p.fastTrack ? ' Fast track has been requested for this fee note.' : '')]);
    if (p.help) rows.push(['Notes', p.help]);

    /* measure block height, break page if needed */
    doc.font('OS-Regular').fontSize(9.2);
    let need = 26;
    rows.forEach(([, v]) => { need += doc.heightOfString(v, { width: CONTENT_W - 118 }) + 7; });
    if (doc.y + need > PAGE.h - PAGE.margin - 30) { doc.addPage(); doc.y = PAGE.margin; }

    doc.font('OS-SemiBold').fontSize(10.6).fillColor(C.primary)
      .text(`${p.code} — ${p.name}`, PAGE.margin, doc.y);
    doc.y += 4;
    rows.forEach(([k, v]) => {
      const yRow = doc.y;
      doc.font('OS-SemiBold').fontSize(8.6).fillColor(C.muted).text(k, PAGE.margin, yRow, { width: 108 });
      doc.font('OS-Regular').fontSize(9.2).fillColor(C.text).text(v, PAGE.margin + 118, yRow, { width: CONTENT_W - 118 });
      doc.y += 3;
    });
    doc.y += 14;
  });
}

/* ---------- footer page numbers (pages 2+) ---------- */
function pageNumbers(doc, data) {
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    doc.font('OS-Regular').fontSize(7.8).fillColor(C.faint)
      .text(`${data.ref} · page ${i + 1} of ${range.count}`,
        PAGE.margin, PAGE.h - PAGE.margin - 16, { width: CONTENT_W, align: 'right', lineBreak: false });
  }
}

/* ---------- entry point ---------- */
function generateFeeNote(data, outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true, info: {
      Title: `${data.ref} — drug and alcohol testing fee note`,
      Author: 'NIVHA Laboratory Services Limited'
    } });
    doc.registerFont('OS-Regular', FONT.regular);
    doc.registerFont('OS-SemiBold', FONT.semibold);
    doc.registerFont('OS-Bold', FONT.bold);
    doc.registerFont('OS-Italic', FONT.italic);

    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    header(doc, data);
    partyBlocks(doc, data);
    pricingTable(doc, data);
    paymentBlock(doc, data);
    if (data.route !== 'private') courtRatesBlock(doc);
    pageOneFooter(doc, data);
    panelPages(doc, data);
    pageNumbers(doc, data);

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

module.exports = { generateFeeNote, CATALOGUE, COURT_RATES };
