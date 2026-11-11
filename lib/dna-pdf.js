/* NIVHA DNA relationship testing fee note (PDF).
   Same look as the drug and alcohol fee note, built from the shared drawing kit.
   Not password protected. Page 1 is the fee note; the participant checklist
   and the notes on the day follow. */
'use strict';

const fs = require('fs');
const PDFDocument = require('pdfkit');
const { kit } = require('./pdf');

const { C, FONT, LOGO, PAGE, CONTENT_W, RIGHT, COMPANY_NAME, COMPANY_LINE_1, COMPANY_LINE_2, brandBand, sectionLabel, rule } = kit;

const gbp = n => '\u00a3' + (n % 1 === 0 ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const longDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const ROLE = { father: 'Potential father', mother: 'Mother', child: 'Child', sibling: 'Sibling', auntuncle: 'Aunt or uncle', niecenephew: 'Niece or nephew', grandparent: 'Grandparent', grandchild: 'Grandchild' };
const METHOD = { belfast: 'NIVHA office, Belfast', derry: 'NIVHA office, Derry~Londonderry', gp: 'Own GP surgery' };

function generateDnaFeeNote(data, outPath) {
  return new Promise((resolve, reject) => {
    const { cat: CAT, pricing: pr, test, participants, details: d } = data;
    const isPrivate = data.route === 'private';
    const doc = new PDFDocument({ size: 'A4', margin: PAGE.margin, bufferPages: true, info: { Title: `${data.ref} - DNA relationship testing fee note`, Author: COMPANY_NAME } });
    doc.registerFont('OS-Regular', FONT.regular);
    doc.registerFont('OS-SemiBold', FONT.semibold);
    doc.registerFont('OS-Bold', FONT.bold);
    doc.registerFont('OS-Italic', FONT.italic);
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const footY = PAGE.h - PAGE.margin - 54;
    const ensure = h => { if (doc.y + h > footY) { doc.addPage(); brandBand(doc); doc.y = PAGE.margin; doc.x = PAGE.margin; } };
    const para = (text, o = {}) => {
      doc.font(o.font || 'OS-Regular').fontSize(o.size || 9).fillColor(o.color || C.text);
      const h = doc.heightOfString(text, { width: CONTENT_W });
      ensure(h + 4);
      doc.text(text, PAGE.margin, doc.y, { width: CONTENT_W });
      doc.moveDown(o.gap == null ? 0.5 : o.gap);
    };
    const callout = (label, text, o = {}) => {
      const pad = 12;
      doc.font('OS-Regular').fontSize(9);
      const h = doc.heightOfString(text, { width: CONTENT_W - pad * 2 - 4 }) + pad * 2 + 8;
      ensure(h + 6);
      const y = doc.y;
      doc.roundedRect(PAGE.margin, y, CONTENT_W, h, 4).fillColor(o.bg || C.callout).fill();
      doc.rect(PAGE.margin, y, 3, h).fillColor(o.bar || C.primary).fill();
      doc.font('OS-SemiBold').fontSize(7.4).fillColor(o.labelColor || C.deep).text(label.toUpperCase(), PAGE.margin + pad + 2, y + pad - 2, { characterSpacing: 1 });
      doc.font(o.font || 'OS-Regular').fontSize(9).fillColor(o.color || C.text).text(text, PAGE.margin + pad + 2, doc.y + 3, { width: CONTENT_W - pad * 2 - 4 });
      doc.y = y + h + 10;
      doc.x = PAGE.margin;
    };

    /* ---- header ---- */
    brandBand(doc);
    const y0 = PAGE.margin - 4;
    doc.image(LOGO, PAGE.margin, y0 + 2, { width: 128 });
    doc.font('OS-SemiBold').fontSize(7.4).fillColor(C.primary).text(pr.poa ? 'QUOTE REQUEST' : 'FEE NOTE', PAGE.margin, y0, { width: CONTENT_W, align: 'right', characterSpacing: 1.6 });
    doc.font('OS-Bold').fontSize(19).fillColor(C.text).text(data.ref, PAGE.margin, doc.y + 1, { width: CONTENT_W, align: 'right' });
    doc.font('OS-Regular').fontSize(8.6).fillColor(C.muted).text(`Issued ${longDate(data.issued)}`, PAGE.margin, doc.y + 1, { width: CONTENT_W, align: 'right' });
    doc.font('OS-Bold').fontSize(17).fillColor(C.text).text('DNA relationship testing', PAGE.margin, y0 + 54);
    doc.font('OS-Regular').fontSize(9).fillColor(C.muted).text(pr.poa ? 'Quote request' : 'Itemised quote and fee note', PAGE.margin, doc.y + 1);
    rule(doc, doc.y + 7, C.primary, 1.5);
    doc.y += 18;

    /* ---- parties ---- */
    const colW = (CONTENT_W - 28) / 2;
    const xL = PAGE.margin, xR = PAGE.margin + colW + 28;
    const top = doc.y;
    sectionLabel(doc, 'Prepared for', xL, top, colW);
    doc.y = top + 15;
    const left = [];
    if (d.org) left.push([d.org, true]);
    if (d.orgAddress) left.push([d.orgAddress]);
    if (d.orgTown || d.orgPostcode) left.push([[d.orgTown, d.orgPostcode].filter(Boolean).join(', ')]);
    left.push([`Contact: ${d.contactName}`]);
    if (d.caseref) left.push([`Case reference: ${d.caseref}`]);
    if (d.costCentre) left.push([`Cost centre: ${d.costCentre}`]);
    if (d.legalAidRef) left.push([`Legal Aid reference: ${d.legalAidRef}`]);
    if (d.approverName) left.push([`Approving officer: ${d.approverName}`]);
    left.forEach(([t, bold]) => {
      doc.font(bold ? 'OS-Bold' : 'OS-Regular').fontSize(9.4).fillColor(C.text).text(t, xL, doc.y, { width: colW });
    });
    const endL = doc.y;
    doc.y = top;
    sectionLabel(doc, 'Test instructed', xR, top, colW);
    doc.y = top + 15;
    doc.font('OS-Bold').fontSize(9.4).fillColor(C.text).text(test.name, xR, doc.y, { width: colW });
    doc.font('OS-Regular').fontSize(9.4).fillColor(C.text)
      .text(`${pr.people} ${pr.people === 1 ? 'participant' : 'participants'}, mouth swabs under chain of custody`, xR, doc.y, { width: colW })
      .text('Analysed at up to 68 genetic markers', xR, doc.y, { width: colW });
    doc.y = Math.max(endL, doc.y) + 14;
    doc.x = PAGE.margin;

    /* ---- pricing table ---- */
    const xAmt = RIGHT - 110;
    const descW = xAmt - PAGE.margin - 22;
    let y = doc.y;
    sectionLabel(doc, 'Participants and pricing', PAGE.margin, y, CONTENT_W);
    y += 18;
    doc.rect(PAGE.margin, y, CONTENT_W, 21).fillColor(C.primary).fill();
    doc.font('OS-SemiBold').fontSize(8.6).fillColor(C.white);
    doc.text('Description', PAGE.margin + 11, y + 5.5, { width: descW });
    doc.text('Amount', xAmt, y + 5.5, { width: 99, align: 'right' });
    y += 21;
    const rows = [];
    participants.forEach((p, idx) => {
      const extra = !pr.poa && idx >= CAT.DNA_INCLUDED_PEOPLE;
      const label = idx === 0
        ? `${test.code} \u00b7 ${test.name}, covers up to ${CAT.DNA_INCLUDED_PEOPLE} people\n${p.name} (${ROLE[p.role]})`
        : `${p.name} (${ROLE[p.role]})${p.minor ? ', under 18' : ''}${extra ? ', additional person' : ''}`;
      rows.push({ label, amount: pr.poa ? 'On request' : idx === 0 ? gbp(pr.base) : extra ? gbp(CAT.DNA_ADDITIONAL_PERSON_FEE) : 'Included' });
    });
    pr.collections.forEach(c => {
      const kits = c.kits ? ` \u00b7 ${c.kits} ${c.kits === 1 ? 'kit' : 'kits'} at ${gbp(c.unit)}` : '';
      rows.push({ label: `Collection: ${c.label}${kits}${c.detail ? '\n' + c.detail : ''}`, amount: pr.poa ? 'On request' : c.fee === 0 ? 'Included' : gbp(c.fee) });
    });
    rows.forEach((r, i) => {
      doc.font('OS-Regular').fontSize(9.5);
      const h = doc.heightOfString(r.label, { width: descW }) + 11;
      if (y + h > footY - 70) { doc.addPage(); brandBand(doc); y = PAGE.margin; }
      if (i % 2 === 1) doc.rect(PAGE.margin, y, CONTENT_W, h).fillColor(C.zebra).fill();
      doc.fillColor(C.text).text(r.label, PAGE.margin + 11, y + 5.5, { width: descW });
      doc.fillColor(C.text).text(r.amount, xAmt, y + 5.5, { width: 99, align: 'right' });
      y += h;
    });
    doc.moveTo(PAGE.margin, y).lineTo(RIGHT, y).lineWidth(0.8).strokeColor(C.border).stroke();
    y += 8;
    if (pr.poa) {
      doc.y = y; doc.x = PAGE.margin;
      para('Extended family combinations are priced case by case. A case manager confirms the full quote, including collection, before anything proceeds.', { color: C.muted, size: 8.8 });
    } else {
      const sub = (k, v) => {
        doc.font('OS-Regular').fontSize(9.2).fillColor(C.muted).text(k, PAGE.margin, y, { width: xAmt - PAGE.margin - 22, align: 'right' });
        doc.font('OS-Regular').fontSize(9.2).fillColor(C.text).text(v, xAmt, y, { width: 99, align: 'right' });
        y += 15;
      };
      sub('Subtotal', gbp(pr.net));
      sub('VAT (20%)', gbp(pr.vat));
      y += 3;
      doc.rect(PAGE.margin, y, CONTENT_W, 30).fillColor(C.callout).fill();
      doc.rect(PAGE.margin, y, 2.6, 30).fillColor(C.primary).fill();
      doc.font('OS-SemiBold').fontSize(8).fillColor(C.deep).text('TOTAL, INCLUDING VAT', PAGE.margin + 12, y + 10, { characterSpacing: 1, lineBreak: false });
      doc.font('OS-Bold').fontSize(13.5).fillColor(C.deep).text(gbp(pr.total), xAmt, y + 7, { width: 99, align: 'right' });
      doc.y = y + 42; doc.x = PAGE.margin;
    }

    /* ---- payment, turnaround, report ---- */
    const payText = pr.poa
      ? 'Nothing is payable now. A case manager confirms the quote and payment terms with you before the case proceeds.'
      : isPrivate
        ? (data.payment ? `Paid. This fee note is a receipt for a card payment received${data.payment.paidAt ? ' on ' + longDate(data.payment.paidAt) : ''}.${data.payment.cardRef ? ' Payment reference ' + data.payment.cardRef + '.' : ''}` : 'Payment is taken securely by card in advance. Results are released to you on completion of analysis.')
        : 'Payment by invoice. Analysis proceeds on booking; results are released on payment of this fee note.' + (data.route === 'solicitor' ? ' Where the case is legally aided, this fee note may be submitted to the Legal Aid Authority for approval.' : '');
    callout('Payment', payText);
    callout('Please note', CAT.DNA_ADDITIONAL_SAMPLES, { bg: '#faf3e3', bar: '#8a5a14', labelColor: '#8a5a14', color: '#6b4510', font: 'OS-SemiBold' });
    callout('Turnaround and report', CAT.DNA_TURNAROUND + '\n' + CAT.DNA_LEGAL_REPORT + ' ' + CAT.DNA_MARKER_CLAIM);

    /* ---- checklist ---- */
    doc.y += 10; ensure(170); doc.x = PAGE.margin;
    doc.font('OS-Bold').fontSize(15).fillColor(C.text).text('Participant checklist', PAGE.margin, doc.y);
    doc.font('OS-Regular').fontSize(9).fillColor(C.muted).text(`Fee note ${data.ref}. One copy for each participant.`, PAGE.margin, doc.y + 2);
    rule(doc, doc.y + 8, C.primary, 1.2);
    doc.y += 18;
    const fatherRule = test.id === 'paternity' ? 'They cannot be the potential father.' : 'They must not be one of the people being tested.';
    participants.forEach(p => {
      const items = p.minor
        ? [
          'Birth certificate',
          '2 passport photographs',
          `Someone legally able to sign on the child\u2019s behalf must attend with the child${p.guardianName ? ': ' + p.guardianName : ' (this may be the social worker or someone else)'}. They bring their own photographic ID. ${fatherRule} We cannot take the child\u2019s sample without them.`,
          'Where a care order is in place: a copy of the order'
        ]
        : ['Photographic ID: passport or driving licence', '2 passport photographs'];
      const where = p.collection === 'gp' ? `Own GP surgery${p.gpName ? ', ' + p.gpName : ''}${p.gpAddress ? ', ' + p.gpAddress : ''}` : METHOD[p.collection];
      doc.font('OS-Regular').fontSize(9.2);
      let need = 16 + 14;
      items.forEach(t => { need += doc.heightOfString(t, { width: CONTENT_W - 22 }) + 4; });
      ensure(need + 10);
      doc.font('OS-Bold').fontSize(10).fillColor(C.text).text(p.name, PAGE.margin, doc.y, { continued: true })
        .font('OS-Regular').fillColor(C.muted).text(`  \u00b7 ${ROLE[p.role]} \u00b7 ${where}`);
      doc.moveDown(0.3);
      items.forEach(t => {
        const yy = doc.y;
        doc.lineWidth(0.8).strokeColor(C.primary).rect(PAGE.margin + 2, yy + 1.5, 7, 7).stroke();
        doc.font('OS-Regular').fontSize(9.2).fillColor(C.text).text(t, PAGE.margin + 18, yy, { width: CONTENT_W - 22 });
        doc.moveDown(0.15);
      });
      doc.moveDown(0.6);
    });
    doc.y += 4;
    const F = CAT.DNA_FEES;
    callout('Fees to be aware of', `Late cancellation (less than 24 hours before the appointment): ${gbp(F.lateCancellation)} + VAT. Non-attendance: ${gbp(F.nonAttendance)} + VAT. Passport photos taken by NIVHA: ${gbp(F.nivhaPhotos)} + VAT per donor.`);
    callout('On the day', 'Samples are simple mouth swabs, taken under chain of custody by a registered practitioner.');
    callout('Please note', CAT.DNA_ADDITIONAL_SAMPLES, { bg: '#faf3e3', bar: '#8a5a14', labelColor: '#8a5a14', color: '#6b4510', font: 'OS-SemiBold' });
    if (participants.some(p => p.collection !== 'gp')) {
      callout('Arranging your collection', 'Appointments at our offices are arranged by request. Email info@nivha.net quoting ' + data.ref + ' with your preferred date and time of day, and we confirm availability.');
    }
    if (participants.some(p => p.collection === 'gp')) {
      callout('GP surgery collection', 'We post a kit to the surgery for each person collected there. The GP takes the sample and the surgery posts it direct to the laboratory. Please make sure the surgery name and address are correct.');
    }

    /* ---- footers and page numbers ---- */
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const fy = PAGE.h - PAGE.margin - 44;
      rule(doc, fy, C.primary, 1);
      doc.font('OS-SemiBold').fontSize(7.6).fillColor(C.deep).text(COMPANY_NAME.toUpperCase(), PAGE.margin, fy + 9, { width: CONTENT_W, characterSpacing: 0.8, lineBreak: false });
      doc.font('OS-Regular').fontSize(7.8).fillColor(C.faint)
        .text(COMPANY_LINE_1 + ' \u00b7 ' + COMPANY_LINE_2, PAGE.margin, fy + 21, { width: CONTENT_W, lineBreak: false })
        .text(`${data.ref} \u00b7 page ${i + 1} of ${range.count}`, PAGE.margin, fy + 32, { width: CONTENT_W, lineBreak: false });
    }

    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

module.exports = { generateDnaFeeNote };
