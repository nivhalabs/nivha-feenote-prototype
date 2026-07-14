/* NIVHA fee note PDF generator.
   One template, three variants (trust / solicitor / private) that differ
   only in the instructing-party and payment blocks. Page 2+ describes only
   the panels selected on this fee note, sourced from js/catalogue.js.
   References: CCN (trust / solicitor) and PCN (private), from 1000. */

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
  deep: '#1d6478',
  text: '#2c2d2f',
  muted: '#5d6467',
  faint: '#8a9194',
  border: '#dfe6e9',
  callout: '#eaf4f7',
  zebra: '#f5f9fa',
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
const RIGHT = PAGE.w - PAGE.margin;

const COMPANY_NAME = 'NIVHA Laboratory Services Limited';
const COMPANY_LINE_1 = 'Unit 1B Concourse 1 Catalyst, Queens Road, Belfast, Antrim, BT3 9DT';
const COMPANY_LINE_2 = '02890 737942 · info@nivha.net · VAT registration no. 843475315';
const CANCEL_LINE = 'Late cancellation or missed appointment within 24 hours: £50 + VAT.';

/* ---------- helpers ---------- */
const gbp = n => (n < 0 ? '−£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const gbp0 = n => '£' + n.toLocaleString('en-GB');

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
function brandBand(doc) {
  doc.rect(0, 0, PAGE.w, 8).fillColor(C.primary).fill();
  doc.rect(0, 8, PAGE.w, 1.6).fillColor(C.deep).fill();
}

function sectionLabel(doc, text, x, y, w) {
  doc.rect(x, y + 0.5, 2.6, 8).fillColor(C.primary).fill();
  doc.font('OS-SemiBold').fontSize(7.4).fillColor(C.deep)
    .text(text.toUpperCase(), x + 8, y, { width: w - 8, characterSpacing: 1 });
}

function kv(doc, x, w, rows) {
  rows.forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (k) {
      doc.font('OS-SemiBold').fontSize(8.4).fillColor(C.faint).text(k, x, doc.y, { width: w });
      doc.font('OS-Regular').fontSize(9.5).fillColor(C.text).text(v, x, doc.y, { width: w });
    } else {
      doc.font('OS-Regular').fontSize(9.5).fillColor(C.text).text(v, x, doc.y, { width: w });
    }
    doc.moveDown(0.32);
  });
}

function rule(doc, y, color, width) {
  doc.moveTo(PAGE.margin, y).lineTo(RIGHT, y)
    .lineWidth(width || 0.7).strokeColor(color || C.border).stroke();
}

/* ---------- page 1 blocks ---------- */
function header(doc, data) {
  brandBand(doc);
  const y = PAGE.margin - 4;
  doc.image(LOGO, PAGE.margin, y + 2, { width: 128 });

  doc.font('OS-SemiBold').fontSize(7.4).fillColor(C.primary)
    .text('FEE NOTE', PAGE.margin, y, { width: CONTENT_W, align: 'right', characterSpacing: 1.6 });
  doc.font('OS-Bold').fontSize(19).fillColor(C.text)
    .text(data.ref, PAGE.margin, doc.y + 1, { width: CONTENT_W, align: 'right' });
  doc.font('OS-Regular').fontSize(8.6).fillColor(C.muted)
    .text(`${data.route === 'private' ? 'Private case number' : 'Client case number'} · Issued ${longDate(data.issued)}`,
      PAGE.margin, doc.y + 1, { width: CONTENT_W, align: 'right' });

  doc.font('OS-Bold').fontSize(17).fillColor(C.text)
    .text('Drug and alcohol testing', PAGE.margin, y + 54);
  rule(doc, doc.y + 7, C.primary, 1.5);
  doc.y += 18;
}

function partyBlocks(doc, data) {
  const d = data.details;
  const colW = (CONTENT_W - 28) / 2;
  const xL = PAGE.margin, xR = PAGE.margin + colW + 28;
  const yTop = doc.y;

  /* left column — instructing party (the variant block) */
  sectionLabel(doc, 'Instructing party', xL, yTop, colW);
  doc.y = yTop + 17; doc.x = xL;
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
  sectionLabel(doc, 'Donor', xR, yTop, colW);
  doc.y = yTop + 17; doc.x = xR;
  kv(doc, xR, colW, [
    ['', d.donorName],
    ['Date of birth', d.donorDob ? longDate(d.donorDob) : '']
  ]);
  doc.moveDown(0.55);
  const yCol = doc.y;
  sectionLabel(doc, 'Collection', xR, yCol, colW);
  doc.y = yCol + 17; doc.x = xR;
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
  const xAmt = RIGHT - 110;
  const descW = xAmt - PAGE.margin - 22;
  let y = doc.y + 2;

  sectionLabel(doc, 'Tests and pricing', PAGE.margin, y, CONTENT_W);
  y += 18;

  /* header band */
  doc.rect(PAGE.margin, y, CONTENT_W, 21).fillColor(C.primary).fill();
  doc.font('OS-SemiBold').fontSize(8.6).fillColor(C.white);
  doc.text('Description', PAGE.margin + 11, y + 5.5, { width: descW });
  doc.text('Amount', xAmt, y + 5.5, { width: 110 - 11, align: 'right' });
  y += 21;

  /* rows with zebra tint */
  data.panels.forEach((line, i) => {
    const isPOA = /priced on request/i.test(line.label);
    const desc = line.code ? `${line.code} · ${line.label}` : line.label;
    doc.font('OS-Regular').fontSize(9.5);
    const h = doc.heightOfString(desc, { width: descW }) + 11;
    if (i % 2 === 1) doc.rect(PAGE.margin, y, CONTENT_W, h).fillColor(C.zebra).fill();
    doc.fillColor(C.text).text(desc, PAGE.margin + 11, y + 5.5, { width: descW });
    doc.fillColor(line.amount < 0 ? C.primary : C.text)
      .text(isPOA ? 'On request' : gbp(line.amount), xAmt, y + 5.5, { width: 110 - 11, align: 'right' });
    y += h;
  });
  doc.moveTo(PAGE.margin, y).lineTo(RIGHT, y).lineWidth(0.8).strokeColor(C.border).stroke();
  y += 8;

  /* subtotal + VAT */
  const sub = (k, v) => {
    doc.font('OS-Regular').fontSize(9.2).fillColor(C.muted)
      .text(k, PAGE.margin, y, { width: xAmt - PAGE.margin - 22, align: 'right' });
    doc.font('OS-Regular').fontSize(9.2).fillColor(C.text)
      .text(v, xAmt, y, { width: 110 - 11, align: 'right' });
    y += 15;
  };
  sub('Subtotal', gbp(data.totals.net));
  sub('VAT (20%)', gbp(data.totals.vat));
  y += 3;

  /* total band */
  doc.rect(PAGE.margin, y, CONTENT_W, 30).fillColor(C.callout).fill();
  doc.rect(PAGE.margin, y, 2.6, 30).fillColor(C.primary).fill();
  doc.font('OS-SemiBold').fontSize(8).fillColor(C.deep)
    .text('TOTAL, INCLUDING VAT', PAGE.margin + 12, y + 10, { characterSpacing: 1, lineBreak: false });
  doc.font('OS-Bold').fontSize(13.5).fillColor(C.deep)
    .text(gbp(data.totals.total), xAmt, y + 7, { width: 110 - 11, align: 'right' });
  doc.y = y + 30 + 12;
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
  const w = CONTENT_W, x = PAGE.margin, y = doc.y;
  doc.font('OS-Regular').fontSize(9);
  const h = doc.heightOfString(text, { width: w - pad * 2 - 4 }) + pad * 2 + 4;
  doc.roundedRect(x, y, w, h, 4).fillColor(C.callout).fill();
  doc.rect(x, y, 2.6, h).fillColor(C.primary).fill();
  doc.font('OS-SemiBold').fontSize(7.4).fillColor(C.deep)
    .text('PAYMENT', x + pad + 2, y + pad - 2, { characterSpacing: 1 });
  doc.font('OS-Regular').fontSize(9).fillColor(C.text)
    .text(text, x + pad + 2, doc.y + 3, { width: w - pad * 2 - 4 });
  doc.y = y + h + 12;
  doc.x = PAGE.margin;
}

function courtRatesBlock(doc) {
  sectionLabel(doc, 'Court and reporting, where required', PAGE.margin, doc.y, CONTENT_W);
  doc.y += 15;
  COURT_RATES.lines.forEach(l => {
    const y = doc.y;
    doc.font('OS-Regular').fontSize(8.6).fillColor(C.muted)
      .text(l.label, PAGE.margin, y, { width: CONTENT_W - 170, lineBreak: false });
    doc.font('OS-SemiBold').fontSize(8.6).fillColor(C.text)
      .text(l.price !== undefined ? `${gbp0(l.price)} + VAT` : l.text,
        RIGHT - 170, y, { width: 170, align: 'right', lineBreak: false });
    doc.y = y + 12.5;
  });
  doc.font('OS-Italic').fontSize(8.4).fillColor(C.muted)
    .text(COURT_RATES.note, PAGE.margin, doc.y + 3, { width: CONTENT_W });
  doc.x = PAGE.margin;
}

function pageOneFooter(doc) {
  const y = PAGE.h - PAGE.margin - 44;
  rule(doc, y, C.primary, 1);
  doc.font('OS-SemiBold').fontSize(7.6).fillColor(C.deep)
    .text(COMPANY_NAME.toUpperCase(), PAGE.margin, y + 9, { width: CONTENT_W, characterSpacing: 0.8, lineBreak: false });
  doc.font('OS-Regular').fontSize(7.8).fillColor(C.faint)
    .text(COMPANY_LINE_1 + ' · ' + COMPANY_LINE_2, PAGE.margin, y + 21, { width: CONTENT_W, lineBreak: false })
    .text(CANCEL_LINE, PAGE.margin, y + 32, { width: CONTENT_W, lineBreak: false });
}

/* ---------- page 2+ — about the selected tests ---------- */
function panelPages(doc, data) {
  const selected = data.panels.map(l => byCode[l.code]).filter(Boolean);
  if (!selected.length) return;

  doc.addPage();
  brandBand(doc);
  doc.font('OS-Bold').fontSize(14.5).fillColor(C.text)
    .text('About the tests on this fee note', PAGE.margin, PAGE.margin);
  doc.font('OS-Regular').fontSize(9).fillColor(C.muted)
    .text('This page describes only the tests selected on fee note ' + data.ref + '.',
      PAGE.margin, doc.y + 3, { width: CONTENT_W });
  rule(doc, doc.y + 10, C.primary, 1.5);
  doc.y += 24;

  const PAD = 13, LBL = 106;
  selected.forEach(p => {
    const rows = [];
    if (p.detects) rows.push(['Detects', p.detects]);
    if (p.code === 'H-DSD' && data.details.dsdDrug) rows.push(['Specified drug', data.details.dsdDrug]);
    if (p.window) rows.push(['Detection window', p.window]);
    if (p.turnaround) rows.push(['Turnaround', p.turnaround + (data.fastTrack && p.fastTrack ? ' Fast track has been requested for this fee note.' : '')]);
    if (p.help) rows.push(['Notes', p.help]);

    /* measure card height, break page if needed */
    doc.font('OS-Regular').fontSize(9.2);
    let cardH = PAD + 19;
    rows.forEach(([, v]) => { cardH += doc.heightOfString(v, { width: CONTENT_W - PAD * 2 - LBL - 10 }) + 6; });
    cardH += PAD - 6;
    if (doc.y + cardH > PAGE.h - PAGE.margin - 26) { doc.addPage(); brandBand(doc); doc.y = PAGE.margin; }

    const yCard = doc.y;
    doc.roundedRect(PAGE.margin, yCard, CONTENT_W, cardH, 4).lineWidth(0.8).strokeColor(C.border).stroke();
    doc.rect(PAGE.margin, yCard, 2.6, cardH).fillColor(C.primary).fill();

    doc.font('OS-SemiBold').fontSize(10.8).fillColor(C.deep)
      .text(`${p.code} — ${p.name}`, PAGE.margin + PAD + 2, yCard + PAD - 2);
    doc.y += 5;
    rows.forEach(([k, v]) => {
      const yRow = doc.y;
      doc.font('OS-SemiBold').fontSize(8.4).fillColor(C.faint)
        .text(k, PAGE.margin + PAD + 2, yRow, { width: LBL });
      doc.font('OS-Regular').fontSize(9.2).fillColor(C.text)
        .text(v, PAGE.margin + PAD + LBL + 10, yRow, { width: CONTENT_W - PAD * 2 - LBL - 10 });
      doc.y += 2;
    });
    doc.y = yCard + cardH + 14;
    doc.x = PAGE.margin;
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
      Author: COMPANY_NAME
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
    pageOneFooter(doc);
    panelPages(doc, data);
    pageNumbers(doc, data);

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

module.exports = { generateFeeNote, CATALOGUE, COURT_RATES };
