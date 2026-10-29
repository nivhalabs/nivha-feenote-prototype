const assert = require('assert');
const { computeTotals } = require('../lib/pricing');
const cat = require('../js/catalogue');
const t = (basket, o = {}) => computeTotals({ basket, fastTrack: !!o.ft, location: 'belfast' });
const P = c => cat.CATALOGUE.find(p => p.code === c);

/* default: 3 months, one result, panel price. Period alone does not change the price. */
assert.strictEqual(t([{ code: 'H-DP1' }]).panels, 330);
assert.strictEqual(t([{ code: 'H-DP1', cm: 1 }]).panels, 330);
assert.strictEqual(t([{ code: 'H-DP1', cm: 6, cuts: [] }]).panels, 330);
/* each extra segment is the panel price again */
assert.strictEqual(t([{ code: 'H-DP1', cm: 3, cuts: [1, 2] }]).panels, 990);
assert.strictEqual(t([{ code: 'H-DP1', cm: 6, cuts: [3] }]).panels, 660);
assert.strictEqual(t([{ code: 'H-DP1', cm: 6, cuts: [1, 2, 3, 4, 5] }]).panels, 1980); // month by month: initial plus 5
assert.strictEqual(t([{ code: 'H-DP1', cm: 6, cuts: [1, 2, 3] }]).panels, 1320);      // 1, 1, 1 then 3 cm
assert.strictEqual(t([{ code: 'H-DP2', cm: 6, cuts: [3] }]).panels, 900);
/* limits: 6 cm at most, cuts inside the period, no repeats */
assert.strictEqual(t([{ code: 'H-DP1', cm: 7 }]), null);
assert.strictEqual(t([{ code: 'H-DP1', cm: 0 }]), null);
assert.strictEqual(t([{ code: 'H-DP1', cm: 2.5 }]), null);
assert.strictEqual(t([{ code: 'H-DP1', cm: 3, cuts: [3] }]), null);
assert.strictEqual(t([{ code: 'H-DP1', cm: 3, cuts: [0] }]), null);
assert.strictEqual(t([{ code: 'H-DP1', cm: 6, cuts: [2, 2] }]), null);
/* alcohol online: 3 or 6 months, one result, one price, never split */
assert.strictEqual(t([{ code: 'H-EtG', cm: 3 }]).panels, 330);
assert.strictEqual(t([{ code: 'H-EtG', cm: 6 }]).panels, 330);
assert.strictEqual(t([{ code: 'H-EtG-FAEE', cm: 6 }]).panels, 500);
assert.strictEqual(t([{ code: 'H-EtG', cm: 4 }]), null);
assert.strictEqual(t([{ code: 'H-EtG', cm: 6, cuts: [3] }]), null);
/* urine and nail cannot be cut */
assert.strictEqual(t([{ code: 'U-MUI-1', cuts: [1] }]), null);
assert.strictEqual(t([{ code: 'N-DP1', cuts: [1] }]), null);
assert.strictEqual(t([{ code: 'U-MUI-1' }]).panels, t([{ code: 'U-MUI-1', cm: 6 }]).panels);
/* fast track is charged on every segment */
assert.strictEqual(t([{ code: 'H-DP1', cm: 6, cuts: [3] }], { ft: true }).fastTrack, 160);
assert.strictEqual(t([{ code: 'H-DP1', cm: 6, cuts: [1, 2, 3, 4, 5] }], { ft: true }).fastTrack, 480);
assert.strictEqual(t([{ code: 'H-DP1' }], { ft: true }).fastTrack, 80);
/* layout helper and presets */
const l = cat.hairLayout(P('H-DP1'), 6, [1, 2, 3]);
assert.deepStrictEqual(l.segments, [[0, 1], [1, 2], [2, 3], [3, 6]]);
assert.deepStrictEqual(cat.presetCuts('monthly', 6), [1, 2, 3, 4, 5]);
assert.deepStrictEqual(cat.presetCuts('blocks', 6), [3]);
assert.deepStrictEqual(cat.presetCuts('blocks', 3), []);
console.log('segments: ok');
