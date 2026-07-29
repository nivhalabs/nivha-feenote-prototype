/* NIVHA policy builder — staff review page renderer + comments. */
'use strict';

(function () {

  /* ---------------- text helpers ---------------- */

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Escape first, then decorate tokens ⟨…⟩ and **bold**. */
  function fmt(s) {
    return esc(s)
      .replace(/⟨([^⟩]+)⟩/g, '<span class="rv-token">⟨$1⟩</span>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  /* ---------------- block renderers ---------------- */

  function renderBlock(b) {
    const kind = b[0];
    if (kind === 'p')      return '<p class="rv-p">' + fmt(b[1]) + '</p>';
    if (kind === 'hint')   return '<p class="rv-hint">' + fmt(b[1]) + '</p>';
    if (kind === 'copy')   return '<div class="rv-copy">' + fmt(b[1]) + '</div>';
    if (kind === 'note')   return '<p class="rv-note">' + fmt(b[1]) + '</p>';
    if (kind === 'flag')   return '<div class="rv-flag"><span class="rv-flag-label">For review</span><p>' + fmt(b[1]) + '</p></div>';
    if (kind === 'opts') {
      return '<div class="rv-opts">' + b[1].map(o =>
        '<div class="rv-opt"><span class="rv-opt-title">' + fmt(o[0]) + '</span>' +
        (o[1] ? '<span class="rv-opt-sub">' + fmt(o[1]) + '</span>' : '') + '</div>'
      ).join('') + '</div>';
    }
    if (kind === 'bullets') {
      return '<ul class="rv-bullets">' + b[1].map(t => '<li>' + fmt(t) + '</li>').join('') + '</ul>';
    }
    if (kind === 'table') {
      const rows = b[1], hasHead = !!b[2];
      let html = '<table class="rv-table">';
      rows.forEach((r, i) => {
        const tag = (hasHead && i === 0) ? 'th' : 'td';
        html += '<tr>' + r.map(c => '<' + tag + '>' + fmt(c) + '</' + tag + '>').join('') + '</tr>';
      });
      return html + '</table>';
    }
    if (kind === 'variant') {
      return '<div class="rv-variant"><span class="rv-variant-label">' + fmt(b[1]) + '</span>' +
        b[2].map(renderBlock).join('') + '</div>';
    }
    return '';
  }

  /* ---------------- item / group / part ---------------- */

  function renderItem(it) {
    const badges = (it.badges || []).map(x => '<span class="rv-badge">' + esc(x) + '</span>').join('');
    return (
      '<article class="rv-item" id="item-' + esc(it.ref) + '" data-ref="' + esc(it.ref) + '" data-title="' + esc(it.title) + '">' +
        '<div class="rv-item-head">' +
          '<span class="rv-ref">' + esc(it.ref) + '</span>' +
          '<h4>' + fmt(it.title) + '</h4>' + badges +
        '</div>' +
        it.blocks.map(renderBlock).join('') +
        '<div class="rv-comments" data-ref="' + esc(it.ref) + '">' +
          '<button type="button" class="rv-comments-toggle" aria-expanded="false">Comments (0)</button>' +
          '<div class="rv-comments-body" hidden>' +
            '<div class="rv-comments-list"></div>' +
            '<form class="rv-comment-form">' +
              '<label>Your name<input type="text" name="name" maxlength="80" required autocomplete="name"></label>' +
              '<label>Comment<textarea name="comment" rows="3" maxlength="4000" required></textarea></label>' +
              '<div class="rv-comment-actions">' +
                '<button type="submit" class="btn primary small">Add comment</button>' +
                '<span class="rv-comment-status" role="status"></span>' +
              '</div>' +
            '</form>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderGroup(g) {
    return (
      '<section class="rv-group" id="' + esc(g.id) + '">' +
        '<h3>' + fmt(g.title) + '</h3>' +
        (g.intro ? '<p class="rv-group-intro">' + fmt(g.intro) + '</p>' : '') +
        g.items.map(renderItem).join('') +
      '</section>'
    );
  }

  function renderPart(p) {
    return (
      '<section class="rv-part" id="' + esc(p.id) + '">' +
        '<h2>' + fmt(p.title) + '</h2>' +
        (p.intro ? '<p class="rv-part-intro">' + fmt(p.intro) + '</p>' : '') +
        p.groups.map(renderGroup).join('') +
      '</section>'
    );
  }

  function renderNav() {
    return (
      '<nav class="rv-nav" aria-label="Contents">' +
        REVIEW_PARTS.map(p =>
          '<div class="rv-nav-part">' +
            '<a class="rv-nav-title" href="#' + esc(p.id) + '">' + fmt(p.title) + '</a>' +
            '<div class="rv-nav-links">' +
              p.groups.map(g => '<a href="#' + esc(g.id) + '">' + fmt(g.title) + '</a>').join('') +
            '</div>' +
          '</div>'
        ).join('') +
      '</nav>'
    );
  }

  /* ---------------- comments ---------------- */

  const NAME_KEY = 'nivha-review-name';

  function fmtWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  function commentHtml(c) {
    return '<div class="rv-comment"><div class="rv-comment-meta"><strong>' + esc(c.name || 'Anonymous') +
      '</strong><span>' + fmtWhen(c.submitted) + '</span></div><p>' + esc(c.comment || '') + '</p></div>';
  }

  function setCount(box, n) {
    box.querySelector('.rv-comments-toggle').textContent = 'Comments (' + n + ')';
    box.dataset.count = String(n);
  }

  function loadComments() {
    fetch('/api/policy-review/comments')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then(data => {
        const byRef = {};
        (data.comments || []).forEach(c => {
          (byRef[c.ref] = byRef[c.ref] || []).push(c);
        });
        document.querySelectorAll('.rv-comments').forEach(box => {
          const list = byRef[box.dataset.ref] || [];
          box.querySelector('.rv-comments-list').innerHTML = list.map(commentHtml).join('');
          setCount(box, list.length);
        });
      })
      .catch(() => { /* page still works read-only */ });
  }

  function wireComments(root) {
    root.addEventListener('click', e => {
      const btn = e.target.closest('.rv-comments-toggle');
      if (!btn) return;
      const body = btn.parentElement.querySelector('.rv-comments-body');
      const open = body.hidden;
      body.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) {
        const nameInput = body.querySelector('input[name="name"]');
        if (!nameInput.value) nameInput.value = localStorage.getItem(NAME_KEY) || '';
      }
    });

    root.addEventListener('submit', e => {
      const form = e.target.closest('.rv-comment-form');
      if (!form) return;
      e.preventDefault();
      const box = form.closest('.rv-comments');
      const item = form.closest('.rv-item');
      const status = form.querySelector('.rv-comment-status');
      const submitBtn = form.querySelector('button[type="submit"]');
      const name = form.name.value.trim();
      const comment = form.comment.value.trim();
      if (!name || !comment) return;

      submitBtn.disabled = true;
      status.textContent = 'Saving…';

      fetch('/api/policy-review/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: item.dataset.ref, title: item.dataset.title, name: name, comment: comment })
      })
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
        .then(() => {
          localStorage.setItem(NAME_KEY, name);
          box.querySelector('.rv-comments-list').insertAdjacentHTML('beforeend',
            commentHtml({ name: name, comment: comment, submitted: new Date().toISOString() }));
          setCount(box, (parseInt(box.dataset.count || '0', 10) || 0) + 1);
          form.comment.value = '';
          status.textContent = 'Saved.';
          setTimeout(() => { status.textContent = ''; }, 2500);
        })
        .catch(() => {
          status.textContent = 'Could not save — please try again.';
        })
        .then(() => { submitBtn.disabled = false; });
    });
  }

  /* ---------------- boot ---------------- */

  const root = document.getElementById('review-root');
  root.innerHTML = renderNav() + REVIEW_PARTS.map(renderPart).join('');
  wireComments(root);
  loadComments();

})();
