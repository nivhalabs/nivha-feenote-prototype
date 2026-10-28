/* Booking sync — keeps fee notes in step with bookings made on the embedded
 * Acuity scheduler (nivha.net/book).
 *
 * A client who books on the embedded page never passes through
 * /api/booking/confirm, so the fee note would stay unbooked and the chase
 * email would still go out. This looks at upcoming appointments of the fee
 * note type, matches each to a fee note, and marks it Booked.
 *
 * Matching, in order:
 *   1. the fee note reference (CCN-1042 / PCN-1000) in the "Fee Note Details"
 *      intake field;
 *   2. otherwise the booking email, if exactly one open fee note uses it.
 * Anything ambiguous is left alone for a person to match. */
'use strict';

const REF_RE = /\b(?:CCN|PCN)-\d{3,6}\b/i;
const CLOSED = ['Booked', 'On-site requested', 'Booking requested'];

function createBookingSync({ acuity, at, feeTable, escapeFormula, log = console }) {
  const esc = escapeFormula;

  function isoDate(d) { return d.toISOString().slice(0, 10); }

  function apptRef(appt, fieldId) {
    for (const form of appt.forms || []) {
      for (const v of form.values || []) {
        if (String(v.fieldID) === String(fieldId) || /fee note/i.test(v.name || '')) {
          const m = REF_RE.exec(String(v.value || ''));
          if (m) return m[0].toUpperCase();
        }
      }
    }
    return null;
  }

  /* An open fee note is one that still needs a collection appointment. */
  function openFor(f) {
    if (CLOSED.includes(f['Status'] || '')) return false;
    if (f['Route'] === 'Private' && f['Status'] !== 'Paid') return false;
    return true;
  }

  async function findByReference(ref) {
    const q = new URLSearchParams({ filterByFormula: `{Reference}='${esc(ref)}'`, pageSize: '1' });
    const r = await at('GET', `${feeTable}?${q}`);
    return r.records[0] || null;
  }

  async function findByEmail(email) {
    const q = new URLSearchParams({
      filterByFormula: `LOWER({Contact email})='${esc(email.toLowerCase())}'`,
      pageSize: '20'
    });
    const r = await at('GET', `${feeTable}?${q}`);
    return r.records.filter(rec => openFor(rec.fields || {}) && (rec.fields || {})['Location'] !== 'Derry~Londonderry'
      && (rec.fields || {})['Location'] !== 'On-site');
  }

  async function markBooked(rec, appt) {
    await at('PATCH', feeTable, {
      records: [{ id: rec.id, fields: {
        'Status': 'Booked',
        'Acuity appointment ID': String(appt.id),
        'Appointment at': String(appt.datetime || '').slice(0, 19)
      } }],
      typecast: true
    });
  }

  /* Returns { checked, matched, unmatched }. */
  async function run() {
    if (acuity.SIMULATED || !acuity.TYPE_BELFAST) return { skipped: true };
    const min = new Date(); min.setDate(min.getDate() - 1);
    const appts = await acuity.getAppointments({ typeId: acuity.TYPE_BELFAST, minDate: isoDate(min) });
    const out = { checked: appts.length, matched: [], unmatched: [] };
    for (const appt of appts) {
      try {
        const ref = apptRef(appt, acuity.FIELD_FEENOTE);
        let rec = null;
        if (ref) rec = await findByReference(ref);
        if (!rec && appt.email) {
          const cands = await findByEmail(String(appt.email));
          if (cands.length === 1) rec = cands[0];
        }
        if (!rec) { out.unmatched.push(appt.id); continue; }
        const f = rec.fields || {};
        if (String(f['Acuity appointment ID'] || '') === String(appt.id)) continue; // already linked
        if (!openFor(f)) continue;
        await markBooked(rec, appt);
        out.matched.push(f['Reference'] || rec.id);
        log.log(`booking sync: ${f['Reference']} marked Booked from Acuity appointment ${appt.id}`);
      } catch (err) {
        log.error(`booking sync: appointment ${appt.id} failed: ${err.message}`);
      }
    }
    return out;
  }

  return { run, apptRef, openFor };
}

module.exports = { createBookingSync, REF_RE, CLOSED };
