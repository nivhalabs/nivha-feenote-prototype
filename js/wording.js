/* Wording that follows the audience.
   Solicitors know the document as a fee note. Trusts and private clients know it as a quote.
   The pages are written once as "quote and fee note"; once the booker chooses who is instructing,
   this script shows each audience the word they use. The PDF and emails say the same (see lib/). */
(function () {
  var SOLICITOR = 'solicitor';
  var originals = new WeakMap();   /* text node -> { orig, out } */

  function convert(text, route) {
    if (text.indexOf('uote and fee note') === -1 && text.indexOf('ee note') === -1) return text;
    if (route === SOLICITOR) {
      return text.replace(/quote and fee note/g, 'fee note').replace(/Quote and fee note/g, 'Fee note');
    }
    if (route !== 'trust' && route !== 'private') return text;
    var keep = [];
    /* The PDF itself is titled "Fee note" with the subtitle "Itemised quote and fee note", so name it in full. */
    var out = text.replace(/([Qq]uote and fee note)( \(PDF\)| PDF)/g, function (m, a, b) { keep.push(a + b); return '\u0001' + (keep.length - 1) + '\u0002'; });
    out = out
      .replace(/on payment of (the|this|your) quote and fee note/g, 'on payment of the invoice')
      .replace(/Payment received (\u2014|—) quote and fee note submitted/g, 'Payment received')
      .replace(/Submit quote and fee note/g, 'Submit and get your quote')
      .replace(/Review quote and fee note/g, 'Review your quote')
      .replace(/Review your quote and fee note/g, 'Review your quote')
      .replace(/Build your quote and fee note/g, 'Build your quote')
      .replace(/Quote and fee note/g, 'Quote')
      .replace(/quote and fee note/g, 'quote')
      .replace(/\bFee note\b/g, 'Quote')
      .replace(/\bfee notes\b/g, 'quotes')
      .replace(/\bfee note\b/g, 'quote');
    return out.replace(/\u0001(\d+)\u0002/g, function (m, i) { return keep[+i]; });
  }

  function route() { return document.body.getAttribute('data-route') || ''; }

  function processNode(node) {
    /* The three "who is instructing" cards describe each audience in its own words, whatever is chosen. */
    if (node.parentElement && node.parentElement.closest('#route-grid')) return;
    var rec = originals.get(node);
    if (rec && node.data !== rec.out) rec = null;        /* the app rewrote this text: take the new text as the original */
    var orig = rec ? rec.orig : node.data;
    var out = convert(orig, route());
    originals.set(node, { orig: orig, out: out });
    if (out !== node.data) node.data = out;
  }

  function walk(root) {
    if (root.nodeType === 3) { processNode(root); return; }
    if (root.nodeType !== 1) return;
    var tag = root.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT') return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = w.nextNode())) processNode(n);
  }

  var busy = false;
  var observer = new MutationObserver(function (list) {
    if (busy) return;
    busy = true;
    try {
      list.forEach(function (m) {
        if (m.type === 'attributes') { walk(document.body); return; }
        if (m.type === 'characterData') { processNode(m.target); return; }
        m.addedNodes.forEach(walk);
      });
    } finally { busy = false; observer.takeRecords(); }
  });

  function start() {
    walk(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-route'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
