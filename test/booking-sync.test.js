'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createBookingSync } = require('../lib/booking-sync');

function harness(records, appts) {
  const patches = [];
  const acuity = { SIMULATED: false, TYPE_BELFAST: '1', FIELD_FEENOTE: '99', getAppointments: async () => appts };
  const at = async (method, path, body) => {
    if (method === 'PATCH') { patches.push(body.records[0]); return {}; }
    const q = decodeURIComponent(path.replace(/\+/g, ' '));
    const ref = /\{Reference\}='([^']+)'/.exec(q);
    const em = /\{Contact email\}\)='([^']+)'/.exec(q);
    return { records: records.filter(r => ref ? r.fields.Reference === ref[1]
      : em ? (r.fields['Contact email'] || '').toLowerCase() === em[1] : false) };
  };
  const log = { log() {}, error() {} };
  return { patches, sync: createBookingSync({ acuity, at, feeTable: 't', escapeFormula: s => s, log }) };
}
const fn = (id, ref, status, extra = {}) => ({ id, fields: { Reference: ref, Status: status, Route: 'Solicitor', Location: 'Belfast', 'Contact email': 'a@example.com', ...extra } });
const appt = (id, value, email = 'x@example.com') => ({ id, email, datetime: '2026-11-02T09:30:00+0000', forms: [{ values: [{ fieldID: 99, name: 'Fee Note Details', value }] }] });

test('matches by reference and marks Booked', async () => {
  const h = harness([fn('rec1', 'CCN-1042', 'New')], [appt(7, 'ccn-1042')]);
  const out = await h.sync.run();
  assert.deepStrictEqual(out.matched, ['CCN-1042']);
  assert.strictEqual(h.patches[0].fields.Status, 'Booked');
  assert.strictEqual(h.patches[0].fields['Acuity appointment ID'], '7');
  assert.strictEqual(h.patches[0].fields['Appointment at'], '2026-11-02T09:30:00');
});

test('falls back to a unique open fee note for the same email', async () => {
  const h = harness([fn('rec1', 'CCN-1', 'New')], [appt(8, '', 'A@Example.com')]);
  const out = await h.sync.run();
  assert.deepStrictEqual(out.matched, ['CCN-1']);
});

test('ambiguous email is left for a person', async () => {
  const h = harness([fn('rec1', 'CCN-1', 'New'), fn('rec2', 'CCN-2', 'New')], [appt(9, '', 'a@example.com')]);
  const out = await h.sync.run();
  assert.strictEqual(h.patches.length, 0);
  assert.deepStrictEqual(out.unmatched, [9]);
});

test('already booked, already linked and unpaid private fee notes are not touched', async () => {
  const h = harness([
    fn('r1', 'CCN-1', 'Booked'),
    fn('r2', 'CCN-2', 'New', { 'Acuity appointment ID': '12' }),
    fn('r3', 'PCN-1000', 'Awaiting payment', { Route: 'Private' })
  ], [appt(11, 'CCN-1'), appt(12, 'CCN-2'), appt(13, 'PCN-1000')]);
  await h.sync.run();
  assert.strictEqual(h.patches.length, 0);
});

test('Derry fee notes are never matched by email', async () => {
  const h = harness([fn('r1', 'CCN-5', 'New', { Location: 'Derry~Londonderry' })], [appt(14, '', 'a@example.com')]);
  await h.sync.run();
  assert.strictEqual(h.patches.length, 0);
});

test('simulated Acuity is skipped', async () => {
  const sync = createBookingSync({ acuity: { SIMULATED: true }, at: async () => ({}), feeTable: 't', escapeFormula: s => s });
  assert.deepStrictEqual(await sync.run(), { skipped: true });
});
