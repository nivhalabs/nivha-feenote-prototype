/* Server-side pricing — the single source of truth for what a fee note costs.
 * Recomputes totals from the raw basket using the shared catalogue, so the
 * amount charged never depends on figures supplied by the browser. */
'use strict';

const { CATALOGUE, COMBINED_RATES, BLOCK_RULES, INCLUSION_RULES, VAT_RATE, FAST_TRACK_FEE, DERRY_COLLECTION_FEE,
  FAST_TRACK_PER_SEGMENT, normSegs, segmentUnitPrice } = require('../js/catalogue');

const byCode = Object.fromEntries(CATALOGUE.map(p => [p.code, p]));
const round2 = n => Math.round(n * 100) / 100;

/* basket: [{ code, variant, qty, segs }] — raw codes as stored in the wizard state.
 * Returns { net, vat, total, panels, saving, fastTrack, collection } or null
 * if any line cannot be priced from the catalogue. */
function computeTotals({ basket, fastTrack, location }) {
  if (!Array.isArray(basket) || basket.length === 0) return null;
  let panels = 0;
  let ftCount = 0;
  const codes = new Set();
  for (const line of basket) {
    const p = byCode[line && line.code];
    if (!p) return null;
    if (codes.has(p.code)) return null; // duplicate lines are never valid
    codes.add(p.code);
    let unit;
    if (p.variants) {
      const v = p.variants[Number(line.variant) || 0];
      if (!v || typeof v.price !== 'number') return null;
      unit = v.price;
    } else {
      if (typeof p.price !== 'number') return null;
      unit = p.price;
    }
    const qty = Math.min(Math.max(Number(line.qty) || 1, 1), 10);
    const segs = normSegs(p, line.segs);
    if (segs === null) return null; // more segments than the panel allows
    panels += unit * qty + segs * segmentUnitPrice(p, unit);
    if (p.fastTrack) ftCount += FAST_TRACK_PER_SEGMENT ? 1 + segs : 1;
  }
  let saving = 0;
  for (const rule of COMBINED_RATES) {
    if (rule.codes.every(c => codes.has(c))) saving += rule.saving;
  }
  const ft = fastTrack ? ftCount * FAST_TRACK_FEE : 0;
  const collection = location === 'derry' ? DERRY_COLLECTION_FEE : 0;
  const net = round2(panels - saving + ft + collection);
  const vat = round2(net * VAT_RATE);
  return { panels, saving, fastTrack: ft, collection, net, vat, total: round2(net + vat) };
}

/* Returns a plain-English message when the basket holds panels that cannot go together, else null. */
function basketConflict(basket) {
  const codes = new Set((Array.isArray(basket) ? basket : []).map(l => l && l.code));
  for (const r of BLOCK_RULES) if (r.codes.every(c => codes.has(c))) return r.reason;
  for (const r of INCLUSION_RULES) {
    if (codes.has(r.superset) && codes.has(r.subset)) return `${r.superset} already includes ${r.subset}; order one or the other.`;
  }
  return null;
}

module.exports = { computeTotals, basketConflict };
