'use strict';
const assert = require('assert');
const pricing = require('../lib/pricing');
const T = (basket) => pricing.computeTotals({ basket, fastTrack: false, location: 'belfast' });
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok  ' + name); };

t('standard urine panel alone is £130', () => assert.strictEqual(T([{ code: 'U-MUI-1' }]).panels, 130));
t('each added drug is £50', () => assert.strictEqual(T([{ code: 'U-MUI-1', addons: ['pregabalin', 'gabapentin'] }]).panels, 230));
t('added drugs apply to every collection in a series', () => assert.strictEqual(T([{ code: 'U-MUI-1', qty: 2, addons: ['pregabalin'] }]).panels, 360));
t('duplicate add-on ids are counted once', () => assert.strictEqual(T([{ code: 'U-MUI-1', addons: ['pregabalin', 'pregabalin'] }]).panels, 180));
t('an unknown add-on is never priced', () => assert.strictEqual(T([{ code: 'U-MUI-1', addons: ['cocaine'] }]), null));
t('add-ons are ignored on any other panel (never standalone)', () => assert.strictEqual(T([{ code: 'U-MUI-2', addons: ['pregabalin'] }]).panels, 130));
t('add-ons do not stack on top of the cathinones and analgesics panel', () => assert.strictEqual(T([{ code: 'U-MUI-1', addons: ['pregabalin'] }, { code: 'U-MUI-2' }]).panels, 260));
t('VAT is charged on add-ons', () => assert.strictEqual(T([{ code: 'U-MUI-1', addons: ['pregabalin'] }]).total, 216));
console.log(`\n${n}/${n} tests passed`);
