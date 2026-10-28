const assert = require('assert');
const { computeTotals } = require('../lib/pricing');
const t = (basket, o = {}) => computeTotals({ basket, fastTrack: !!o.ft, location: 'belfast' });

/* each additional segment adds the same price again */
assert.strictEqual(t([{ code: 'H-DP1', segs: 0 }]).panels, 330);
assert.strictEqual(t([{ code: 'H-DP1', segs: 3 }]).panels, 1320);
assert.strictEqual(t([{ code: 'H-DP2', segs: 2 }]).panels, 1350);
/* the combined alcohol test adds an EtG-only segment */
assert.strictEqual(t([{ code: 'H-EtG-FAEE', segs: 1 }]).panels, 830);
assert.strictEqual(t([{ code: 'H-EtG', segs: 1 }]).panels, 660);
/* limits: four drug segments in all, two alcohol, none on urine or nail */
assert.strictEqual(t([{ code: 'H-DP1', segs: 4 }]), null);
assert.strictEqual(t([{ code: 'H-EtG', segs: 2 }]), null);
assert.strictEqual(t([{ code: 'U-MUI-1', segs: 1 }]), null);
assert.strictEqual(t([{ code: 'N-DP1', segs: 1 }]), null);
assert.strictEqual(t([{ code: 'H-DP1', segs: -1 }]), null);
/* fast track is charged on every segment */
assert.strictEqual(t([{ code: 'H-DP1', segs: 2 }], { ft: true }).fastTrack, 240);
console.log('segments: ok');
