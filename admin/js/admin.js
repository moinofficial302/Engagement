'use strict';

let allRsvps = [];
let currentFilter = 'all';

requireAuth(() => {
  listenToRsvps();
  loadContentIntoEditor();
});

/* ═══════════════════════════════
   TABS
═══════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.dash-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
}

/* ═══════════════════════════════
   MESSAGES TAB
═══════════════════════════════ */
function listenToRsvps() {
  db.collection('rsvps').orderBy('sentAt', 'desc')
    .onSnapshot(snapshot => {
      allRsvps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      renderSummary();
      renderRsvpList();
    }, err => {
      console.error('[Admin] Failed to load RSVPs:', err);
      document.getElementById('rsvp-list').innerHTML =
        `<div class="empty-state"><span class="emoji">⚠️</span>Could not load messages. Check your connection.</div>`;
    });
}

function renderSummary() {
  const total = allRsvps.length;
  const yes   = allRsvps.filter(r => r.attending === 'yes').length;
  const no    = allRsvps.filter(r => r.attending === 'no').length;
  const maybe = allRsvps.filter(r => r.attending === 'maybe').length;

  document.getElementById('sum-total').textContent = total;
  document.getElementById('sum-yes').textContent   = yes;
  document.getElementById('sum-no').textContent    = no;
  document.getElementById('sum-maybe').textContent = maybe;
}

function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(el => el.classList.toggle('active', el.dataset.filter === filter));
  renderRsvpList();
}

function renderRsvpList() {
  const list = document.getElementById('rsvp-list');
  const filtered = currentFilter === 'all' ? allRsvps : allRsvps.filter(r => r.attending === currentFilter);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><span class="emoji">📭</span>No messages here yet.</div>`;
    return;
  }

  const statusLabel = { yes: "I'll be there", no: "Can't make it", maybe: 'Maybe' };

  list.innerHTML = filtered.map(r => `
    <div class="rsvp-card">
      <div class="rsvp-top">
        <div>
          <div class="rsvp-name">${escapeHTML(r.name)}</div>
          <a class="rsvp-phone" href="tel:${escapeHTML(r.phone)}">${escapeHTML(r.phone)}</a>
        </div>
        <span class="rsvp-badge ${r.attending}">${statusLabel[r.attending] || r.attending}</span>
      </div>
      <p class="rsvp-message">${escapeHTML(r.message)}</p>
      <div class="rsvp-bottom">
        <span class="rsvp-time">${formatTimestamp(r.sentAt)}</span>
        <button class="btn-danger" onclick="deleteRsvp('${r.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function deleteRsvp(id) {
  if (!confirm('Delete this message? This can\'t be undone.')) return;
  db.collection('rsvps').doc(id).delete()
    .catch(err => alert('Could not delete: ' + err.message));
}

function formatTimestamp(ts) {
  if (!ts || !ts.toDate) return '';
  return ts.toDate().toLocaleString('en-US', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* ═══════════════════════════════
   EDIT CONTENT TAB
═══════════════════════════════ */
function loadContentIntoEditor() {
  db.collection('siteContent').doc('main').get()
    .then(doc => {
      const data = doc.exists ? doc.data() : {};
      const c = data.coupleNames || {};

      document.getElementById('c-groom-name').value      = c.groomName || 'Sam';
      document.getElementById('c-bride-name').value       = c.brideName || 'Sofía';
      document.getElementById('c-groom-fullname').value   = c.groomFullName || 'Sam Kumar';
      document.getElementById('c-bride-fullname').value   = c.brideFullName || 'Sofía Sharma';
      document.getElementById('c-groom-parent').value     = c.groomParent || 'S/o Mr. Ramesh Kumar';
      document.getElementById('c-bride-parent').value     = c.brideParent || 'D/o Mr. Suresh Sharma';

      document.getElementById('c-wedding-date').value = toDatetimeLocal(data.weddingDateISO || '2026-06-15T17:00:00+05:30');

      const venue = data.venue || {};
      document.getElementById('c-venue-name').value = venue.name || 'The Grand Palace';
      document.getElementById('c-venue-addr').value = venue.address || '123 Royal Avenue, London';

      const timeline = (data.timeline && data.timeline.length) ? data.timeline : [
        { title: 'Guest Arrival', time: '15 Jun 2026 · 4:00 PM' },
        { title: 'Wedding Ceremony', time: '15 Jun 2026 · 5:00 PM' },
        { title: 'Cocktail Hour', time: '15 Jun 2026 · 6:30 PM' },
        { title: 'Dinner Reception', time: '15 Jun 2026 · 7:30 PM' }
      ];
      timeline.forEach(item => addTimelineRow(item.title, item.time));

      const preWedding = (data.preWeddingEvents && data.preWeddingEvents.length) ? data.preWeddingEvents : [
        { name: 'Mehendi', detail: "13 Jun 2026 · 3:00 PM at Bride's Home" },
        { name: 'Haldi', detail: "14 Jun 2026 · 10:00 AM at Groom's Home" },
        { name: 'Sangeet', detail: '14 Jun 2026 · 7:00 PM at Grand Palace Hall' }
      ];
      preWedding.forEach(item => addPreweddingRow(item.name, item.detail));

      document.getElementById('c-invitation-text').value = data.invitationText ||
        "With hearts full of love and joy, we warmly invite you to share in the celebration of our union. Your presence would mean the world to us as we begin this beautiful journey together.";
      document.getElementById('c-footer-message').value = data.footerMessage || "We can't wait to celebrate with you!";

      initLivePreviews();
    })
    .catch(err => {
      console.error('[Admin] Failed to load content:', err);
      document.getElementById('save-status').textContent = 'Could not load current content.';
    });
}

function toDatetimeLocal(isoString) {
  const d = new Date(isoString);
  if (isNaN(d)) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── Timeline repeatable rows ── */
function addTimelineRow(title = '', time = '') {
  const wrap = document.createElement('div');
  wrap.className = 'repeat-item';
  wrap.innerHTML = `
    <button type="button" class="repeat-remove" onclick="this.parentElement.remove(); renderTimelinePreview();">✕</button>
    <div class="form-group">
      <label class="form-label">Event Title</label>
      <input type="text" class="form-input tl-title-input" placeholder="Wedding Ceremony" value="${escapeAttr(title)}">
    </div>
    <div class="form-group" style="margin-bottom:0">
      <label class="form-label">Date &amp; Time Text</label>
      <input type="text" class="form-input tl-time-input" placeholder="15 Jun 2026 · 5:00 PM" value="${escapeAttr(time)}">
    </div>
  `;
  document.getElementById('timeline-editor').appendChild(wrap);
  renderTimelinePreview();
}

/* ── Pre-wedding repeatable rows ── */
function addPreweddingRow(name = '', detail = '') {
  const wrap = document.createElement('div');
  wrap.className = 'repeat-item';
  wrap.innerHTML = `
    <button type="button" class="repeat-remove" onclick="this.parentElement.remove(); renderPreweddingPreview();">✕</button>
    <div class="form-group">
      <label class="form-label">Event Name</label>
      <input type="text" class="form-input pw-name-input" placeholder="Mehendi" value="${escapeAttr(name)}">
    </div>
    <div class="form-group" style="margin-bottom:0">
      <label class="form-label">Details</label>
      <input type="text" class="form-input pw-detail-input" placeholder="13 Jun 2026 · 3:00 PM at Bride's Home" value="${escapeAttr(detail)}">
    </div>
  `;
  document.getElementById('prewedding-editor').appendChild(wrap);
  renderPreweddingPreview();
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}

/* ═══════════════════════════════
   LIVE PREVIEWS
   Mirrors exactly what the real site does with this data, so editing
   a field shows its effect immediately — no guessing what will change.
═══════════════════════════════ */
function initLivePreviews() {
  const bind = (id, cb) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', cb);
  };

  function updateHeroPreview() {
    document.getElementById('prev-hero-groom').textContent =
      document.getElementById('c-groom-name').value.trim() || 'Sam';
    document.getElementById('prev-hero-bride').textContent =
      document.getElementById('c-bride-name').value.trim() || 'Sofía';
  }

  function updateNamesPreview() {
    document.getElementById('prev-groom-fullname').textContent =
      document.getElementById('c-groom-fullname').value.trim() || 'Sam Kumar';
    document.getElementById('prev-groom-parent').textContent =
      document.getElementById('c-groom-parent').value.trim();
    document.getElementById('prev-bride-fullname').textContent =
      document.getElementById('c-bride-fullname').value.trim() || 'Sofía Sharma';
    document.getElementById('prev-bride-parent').textContent =
      document.getElementById('c-bride-parent').value.trim();
  }

  function updateDatePreview() {
    const val = document.getElementById('c-wedding-date').value;
    if (!val) return;
    const d = new Date(val);
    if (isNaN(d)) return;
    document.getElementById('prev-date-text').textContent =
      d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    document.getElementById('prev-date-sub').textContent = `${dayName} · ${time}`;
  }

  function updateVenuePreview() {
    document.getElementById('prev-venue-name').textContent =
      document.getElementById('c-venue-name').value.trim() || 'The Grand Palace';
    document.getElementById('prev-venue-addr').textContent =
      document.getElementById('c-venue-addr').value.trim();
  }

  function updateInvitePreview() {
    document.getElementById('prev-invitation-text').textContent =
      document.getElementById('c-invitation-text').value.trim();
  }

  function updateFooterPreview() {
    document.getElementById('prev-footer-message').textContent =
      document.getElementById('c-footer-message').value.trim() || "We can't wait to celebrate with you!";
  }

  ['c-groom-name', 'c-bride-name'].forEach(id => bind(id, updateHeroPreview));
  ['c-groom-fullname', 'c-groom-parent', 'c-bride-fullname', 'c-bride-parent'].forEach(id => bind(id, updateNamesPreview));
  bind('c-wedding-date', updateDatePreview);
  ['c-venue-name', 'c-venue-addr'].forEach(id => bind(id, updateVenuePreview));
  bind('c-invitation-text', updateInvitePreview);
  bind('c-footer-message', updateFooterPreview);

  const timelineEditor = document.getElementById('timeline-editor');
  if (timelineEditor) timelineEditor.addEventListener('input', renderTimelinePreview);

  const preweddingEditor = document.getElementById('prewedding-editor');
  if (preweddingEditor) preweddingEditor.addEventListener('input', renderPreweddingPreview);

  // Sync previews once with whatever values just got loaded
  updateHeroPreview();
  updateNamesPreview();
  updateDatePreview();
  updateVenuePreview();
  updateInvitePreview();
  updateFooterPreview();
  renderTimelinePreview();
  renderPreweddingPreview();
}

function renderTimelinePreview() {
  const preview = document.getElementById('timeline-preview');
  if (!preview) return;
  const rows = Array.from(document.querySelectorAll('#timeline-editor .repeat-item'));

  if (!rows.length) {
    preview.innerHTML = `<p style="font-size:11px;color:var(--text-light);">Koi item nahi hai abhi</p>`;
    return;
  }

  preview.innerHTML = rows.map(row => {
    const title = row.querySelector('.tl-title-input').value.trim() || '(untitled)';
    const time  = row.querySelector('.tl-time-input').value.trim();
    return `
      <div class="preview-timeline-item">
        <div class="dot"></div>
        <div>
          <div class="p-title">${escapeHTML(title)}</div>
          <div class="p-time">${escapeHTML(time)}</div>
        </div>
      </div>`;
  }).join('');
}

function renderPreweddingPreview() {
  const preview = document.getElementById('prewedding-preview');
  if (!preview) return;
  const rows = Array.from(document.querySelectorAll('#prewedding-editor .repeat-item'));

  if (!rows.length) {
    preview.innerHTML = `<p style="font-size:11px;color:var(--text-light);">Koi event nahi hai abhi</p>`;
    return;
  }

  preview.innerHTML = rows.map(row => {
    const name   = row.querySelector('.pw-name-input').value.trim() || '(untitled)';
    const detail = row.querySelector('.pw-detail-input').value.trim();
    return `
      <div class="preview-prewedding-item">
        <div class="p-pwname">${escapeHTML(name)}</div>
        <div class="p-pwdetail">${escapeHTML(detail)}</div>
      </div>`;
  }).join('');
}

/* ── Save everything to Firestore ── */
function saveContent() {
  const btn    = document.getElementById('save-btn');
  const status = document.getElementById('save-status');

  const timeline = Array.from(document.querySelectorAll('#timeline-editor .repeat-item')).map(row => ({
    title: row.querySelector('.tl-title-input').value.trim(),
    time:  row.querySelector('.tl-time-input').value.trim()
  })).filter(item => item.title || item.time);

  const preWeddingEvents = Array.from(document.querySelectorAll('#prewedding-editor .repeat-item')).map(row => ({
    name:   row.querySelector('.pw-name-input').value.trim(),
    detail: row.querySelector('.pw-detail-input').value.trim()
  })).filter(item => item.name || item.detail);

  const dateLocal = document.getElementById('c-wedding-date').value; // "2026-06-15T17:00"
  // Wedding is IST — append the offset so the countdown is correct everywhere
  const weddingDateISO = dateLocal ? `${dateLocal}:00+05:30` : '';

  const data = {
    coupleNames: {
      groomName:     document.getElementById('c-groom-name').value.trim(),
      brideName:     document.getElementById('c-bride-name').value.trim(),
      groomFullName: document.getElementById('c-groom-fullname').value.trim(),
      brideFullName: document.getElementById('c-bride-fullname').value.trim(),
      groomParent:   document.getElementById('c-groom-parent').value.trim(),
      brideParent:   document.getElementById('c-bride-parent').value.trim()
    },
    weddingDateISO,
    venue: {
      name:    document.getElementById('c-venue-name').value.trim(),
      address: document.getElementById('c-venue-addr').value.trim()
    },
    timeline,
    preWeddingEvents,
    invitationText: document.getElementById('c-invitation-text').value.trim(),
    footerMessage:  document.getElementById('c-footer-message').value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  btn.disabled = true;
  btn.textContent = 'Saving...';
  status.textContent = '';
  status.style.color = 'var(--ok)';

  db.collection('siteContent').doc('main').set(data, { merge: true })
    .then(() => {
      status.textContent = '✓ Saved — the site now reflects these changes.';
    })
    .catch(err => {
      status.style.color = 'var(--no)';
      status.textContent = '✗ Could not save: ' + err.message;
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    });
}
