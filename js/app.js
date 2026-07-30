/* ═══════════════════════════════════════════════════
   WEDDING INVITATION — app.js
   Structure:
   1. Service Worker Registration
   1b. Install App Button
   2. Envelope / Door Open
   3. Congrats Overlay + Confetti
   4. Countdown Timer
   5. Scratch Card
   6. Photo Slideshow
   7. Contact Form + Toast (Firestore)
   8. WhatsApp / Creator Link
   8b. Background Music
   9. Site Content (Firestore)
═══════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════
   1. SERVICE WORKER REGISTRATION
═══════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Relative path (not '/sw.js') so this also works when the site is
    // hosted in a sub-folder, e.g. GitHub Pages project sites:
    // https://username.github.io/repo-name/
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('[App] Service worker registered:', reg.scope))
      .catch(err => console.warn('[App] Service worker registration failed:', err));
  });
}

/* ═══════════════════════════════
   1b. INSTALL APP BUTTON
   Browsers only fire 'beforeinstallprompt' when the site passes
   installability checks: HTTPS, valid manifest (start_url/scope
   reachable), icons, and an active service worker. Chrome/Edge/Brave
   on Android support this; iOS Safari does not expose it — those
   users install via Share → "Add to Home Screen" instead.
═══════════════════════════════ */
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-btn')?.classList.add('show');
});

function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.finally(() => {
    deferredInstallPrompt = null;
    document.getElementById('install-btn')?.classList.remove('show');
  });
}

window.addEventListener('appinstalled', () => {
  document.getElementById('install-btn')?.classList.remove('show');
  deferredInstallPrompt = null;
});

/* ═══════════════════════════════
   2. ENVELOPE / DOOR OPEN
═══════════════════════════════ */
function openEnvelope() {
  const cover = document.getElementById('envelope-cover');
  const main  = document.getElementById('main-content');

  if (cover.classList.contains('opening')) return; // prevent double-trigger

  cover.classList.add('opening');

  // Doors take 1.3s to swing open (see .door-left / .door-right transition)
  setTimeout(() => {
    cover.style.display = 'none';
    main.classList.add('visible');
    document.body.style.overflow = 'auto';

    // The scratch card wrapper was 0×0 while hidden behind the envelope —
    // repaint it now that it has real dimensions (see initScratchCard).
    requestAnimationFrame(() => { if (scratchResizeFn) scratchResizeFn(); });

    // Congrats popup now shows AFTER the scratch card is revealed
    // (see checkRevealProgress() in the Scratch Card section below)
    startSlideshow();
    playMusic(); // first genuine user gesture — browsers allow audio to start here
  }, 1300);
}

/* ═══════════════════════════════
   3. CONGRATS OVERLAY + CONFETTI
═══════════════════════════════ */
function showCongratsOverlay() {
  const overlay = document.getElementById('congrats-overlay');
  overlay.classList.add('show');
  playConfetti();
}

function closeCongratsOverlay() {
  const overlay = document.getElementById('congrats-overlay');
  overlay.classList.remove('show');
}

function playConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;

  container.innerHTML = ''; // clear any previous run

  const colors = ['#c5768a', '#c9a96e', '#e8b4be', '#8a4560', '#ffffff', '#f5d9df', '#a85870'];
  const pieceCount = 90;

  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const size = 6 + Math.random() * 6;
    piece.style.left = Math.random() * 100 + '%';
    piece.style.width = size + 'px';
    piece.style.height = size + 'px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.setProperty('--rot', Math.floor(Math.random() * 360) + 'deg');
    piece.style.setProperty('--drift', (Math.random() * 80 - 40) + 'px');
    piece.style.animationDuration = (2.4 + Math.random() * 1.8) + 's';
    piece.style.animationDelay = (Math.random() * 0.6) + 's';
    container.appendChild(piece);
  }

  // Clean up once the shower has finished falling
  setTimeout(() => { container.innerHTML = ''; }, 4800);
}

/* ═══════════════════════════════
   4. COUNTDOWN TIMER
   Default falls back to 15 June 2026, 5:00 PM IST if
   Firestore content hasn't loaded yet (see loadSiteContent below,
   which calls this again once the real date is known).
═══════════════════════════════ */
let countdownInterval = null;

function startCountdown(isoDateString) {
  const WEDDING_DATE = new Date(isoDateString || '2026-06-15T17:00:00+05:30');

  const daysEl  = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl  = document.getElementById('cd-mins');
  const secsEl  = document.getElementById('cd-secs');
  if (!daysEl) return;

  if (countdownInterval) clearInterval(countdownInterval); // restart with new date

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const now  = new Date();
    const diff = WEDDING_DATE - now;

    if (diff <= 0) {
      daysEl.textContent  = '00';
      hoursEl.textContent = '00';
      minsEl.textContent  = '00';
      secsEl.textContent  = '00';
      clearInterval(countdownInterval);
      return;
    }

    const days  = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins  = Math.floor((diff / (1000 * 60)) % 60);
    const secs  = Math.floor((diff / 1000) % 60);

    daysEl.textContent  = pad(days);
    hoursEl.textContent = pad(hours);
    minsEl.textContent  = pad(mins);
    secsEl.textContent  = pad(secs);
  }

  tick();
  countdownInterval = setInterval(tick, 1000);
}

/* ═══════════════════════════════
   5. SCRATCH CARD
═══════════════════════════════ */
let scratchResizeFn = null; // exposed so openEnvelope() can trigger a repaint once visible

function initScratchCard() {
  const canvas  = document.getElementById('scratch-canvas');
  const wrapper = document.querySelector('.scratch-wrapper');
  if (!canvas || !wrapper) return;

  const ctx = canvas.getContext('2d');
  let isDrawing    = false;
  let hasRevealed  = false;
  let lastVibrateAt = 0;
  let cssWidth = 0, cssHeight = 0; // logical (CSS) size — what we draw in

  // Short, evenly-spaced vibration pulses while scratching feel smoother
  // on a phone than one long buzz. 40ms gap keeps it fluid without
  // hammering the vibration motor.
  function vibrateTick() {
    if (!('vibrate' in navigator)) return; // not supported (e.g. iOS Safari)
    const now = Date.now();
    if (now - lastVibrateAt < 40) return;
    lastVibrateAt = now;
    navigator.vibrate(8);
  }

  function sizeCanvas() {
    const rect = wrapper.getBoundingClientRect();
    // #main-content is display:none behind the envelope, so the very first
    // call (on page load) sees a 0×0 wrapper. Skip painting until we have
    // real dimensions — openEnvelope() calls this again once it's visible.
    if (rect.width === 0 || rect.height === 0) return;

    // Once revealed, never repaint again (a scroll-triggered resize on
    // mobile — e.g. the address bar showing/hiding — used to wipe out
    // the player's scratch progress by repainting mid-scratch).
    if (hasRevealed) return;

    // Only a real size change (like a rotation) should trigger a repaint —
    // ignore the tiny height wobbles mobile browsers fire while scrolling.
    if (cssWidth > 0 && Math.abs(rect.width - cssWidth) < 2) return;

    cssWidth  = rect.width;
    cssHeight = rect.height;

    // Render at native pixel density (retina/high-DPI phones) so the
    // texture and text come out crisp instead of blurry/pixelated.
    // Setting canvas.width/height resets ALL context state, so the
    // scale transform must be (re)applied right after.
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = cssWidth  * dpr;
    canvas.height = cssHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    canvas.style.opacity = '1';
    canvas.style.pointerEvents = 'auto';
    paintScratchLayer();
  }

  function paintScratchLayer() {
    const w = cssWidth, h = cssHeight; // always draw in logical pixels

    // ── Holographic Gold-Rose — iridescent shifting bands ──
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0,    '#f5d98a');
    gradient.addColorStop(0.3,  '#e0a5b8');
    gradient.addColorStop(0.55, '#d8c46a');
    gradient.addColorStop(0.8,  '#c98bc4');
    gradient.addColorStop(1,    '#f0d98a');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Glowing sparkle scattered across the surface
    const sparkleCount = Math.round((w * h) / 900);
    for (let i = 0; i < sparkleCount; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = Math.random() * 1.6 + 0.4;
      const bright = Math.random() > 0.45;
      ctx.save();
      ctx.shadowColor = bright ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)';
      ctx.shadowBlur = r * 3.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = bright
        ? `rgba(255,255,255,${(Math.random() * 0.6 + 0.35).toFixed(2)})`
        : 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.restore();
    }

    // Soft vignette so the edges feel like a real card, not a flat fill
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(70,30,50,0.18)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // Thin inset frame — reads as a premium card edge
    const inset = Math.max(6, Math.min(w, h) * 0.035);
    ctx.strokeStyle = 'rgba(255,250,235,0.45)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);

    // ── Label: serif italic with flanking ornaments ──
    ctx.save();
    const fontSize = Math.max(15, Math.min(w * 0.058, 22));
    ctx.font = `italic 600 ${fontSize}px 'Cormorant Garamond', serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(60,30,40,0.5)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = '#fffaf0';
    ctx.fillText('Scratch to Reveal', w / 2, h / 2);
    ctx.restore();

    ctx.save();
    const ornSize = fontSize * 0.55;
    ctx.font = `${ornSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,250,240,0.85)';
    const textHalfWidth = (fontSize * 0.29 * 'Scratch to Reveal'.length) / 2;
    ctx.fillText('✦', w / 2 - textHalfWidth - ornSize * 1.6, h / 2);
    ctx.fillText('✦', w / 2 + textHalfWidth + ornSize * 1.6, h / 2);
    ctx.restore();
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    // Logical (CSS) pixels — the context's own DPR transform (see
    // sizeCanvas) handles converting these to the real pixel buffer.
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top
    };
  }

  function scratch(e) {
    const { x, y } = getPos(e);
    ctx.globalCompositeOperation = 'destination-out';
    // Must be a fully-opaque fillStyle — destination-out removes alpha
    // proportional to the shape's OWN alpha. Without this, a leftover
    // fillStyle (e.g. the ornament text's 0.85 alpha) meant every scratch
    // stroke only ever faded the card instead of fully clearing it.
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();
    vibrateTick();
    checkRevealProgress();
  }

  function checkRevealProgress() {
    if (hasRevealed) return;

    // getImageData reads the REAL pixel buffer (canvas.width/height are
    // DPR-scaled) — that's fine, we only need a ratio, not absolute counts.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentPixels = 0;
    const totalPixels = imageData.length / 4;

    // Sample every 4th pixel for performance. Allow a small tolerance
    // (<10) instead of requiring exactly 0 — canvas alpha blending can
    // leave a rounding residue of 1-2 even on a fully-erased pixel.
    for (let i = 3; i < imageData.length; i += 16) {
      if (imageData[i] < 10) transparentPixels++;
    }

    const scratchedRatio = transparentPixels / (totalPixels / 4);

    if (scratchedRatio > 0.75) {
      hasRevealed = true;
      canvas.style.transition = 'opacity 0.6s ease';
      canvas.style.opacity = '0';
      setTimeout(() => { canvas.style.pointerEvents = 'none'; }, 600);

      // Distinct pattern (buzz-pause-buzz) so it feels like a "reward",
      // different from the light scratching ticks
      if ('vibrate' in navigator) navigator.vibrate([30, 40, 30]);

      // Reveal complete — now show the congrats popup + confetti
      setTimeout(showCongratsOverlay, 400);
    }
  }

  function startDrawing(e) {
    isDrawing = true;
    scratch(e);
  }
  function stopDrawing() { isDrawing = false; }
  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    scratch(e);
  }

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);
  canvas.addEventListener('mousemove', draw);

  canvas.addEventListener('touchstart', startDrawing, { passive: true });
  canvas.addEventListener('touchend', stopDrawing);
  canvas.addEventListener('touchmove', draw, { passive: false });

  window.addEventListener('resize', sizeCanvas);
  scratchResizeFn = sizeCanvas; // openEnvelope() calls this once the card is actually visible
  sizeCanvas(); // no-op right now (wrapper is 0×0 behind the closed envelope)

  // Cormorant Garamond may still be downloading on first paint — once it's
  // ready, repaint so the label never gets stuck in a fallback font.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (!hasRevealed && cssWidth > 0) paintScratchLayer();
    });
  }
}

/* ═══════════════════════════════
   6. PHOTO SLIDESHOW
═══════════════════════════════ */
let slideshowInterval = null;

function startSlideshow() {
  if (slideshowInterval) return;

  const slides = document.querySelectorAll('.slide');
  const dots   = document.querySelectorAll('.slide-dot');
  if (!slides.length) return;

  let current = 0;

  function goTo(index) {
    slides[current].classList.remove('active');
    dots[current]?.classList.remove('active');
    current = index;
    slides[current].classList.add('active');
    dots[current]?.classList.add('active');
  }

  slideshowInterval = setInterval(() => {
    goTo((current + 1) % slides.length);
  }, 4000);

  dots.forEach((dot, i) => {
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => {
      clearInterval(slideshowInterval);
      goTo(i);
      slideshowInterval = setInterval(() => goTo((current + 1) % slides.length), 4000);
    });
  });
}

/* ═══════════════════════════════
   7. CONTACT FORM + TOAST (Firestore)
═══════════════════════════════ */
function sendMessage() {
  const nameEl   = document.getElementById('msg-name');
  const phoneEl  = document.getElementById('msg-phone');
  const attendEl = document.getElementById('msg-attend');
  const textEl   = document.getElementById('msg-text');
  const btn      = document.querySelector('.send-btn');

  [nameEl, phoneEl, attendEl, textEl].forEach(el => el.classList.remove('error'));

  let valid = true;
  if (!nameEl.value.trim()) { nameEl.classList.add('error'); valid = false; }
  if (!phoneEl.value.trim() || !/^[0-9+\-\s()]{7,16}$/.test(phoneEl.value.trim())) {
    phoneEl.classList.add('error'); valid = false;
  }
  if (!attendEl.value) { attendEl.classList.add('error'); valid = false; }
  if (!textEl.value.trim()) { textEl.classList.add('error'); valid = false; }

  if (!valid) return;

  const rsvp = {
    name: nameEl.value.trim(),
    phone: phoneEl.value.trim(),
    attending: attendEl.value,
    message: textEl.value.trim(),
    sentAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  btn.disabled = true;
  btn.textContent = 'Sending...';

  db.collection('rsvps').add(rsvp)
    .then(() => {
      showToast('✓ Message sent!');
      nameEl.value = '';
      phoneEl.value = '';
      attendEl.value = '';
      textEl.value = '';
    })
    .catch(err => {
      console.error('[App] Could not save RSVP:', err);
      showToast('✗ Could not send — check your connection');
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Send Message';
    });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ═══════════════════════════════
   8. WHATSAPP / CREATOR LINK
═══════════════════════════════ */
function openWhatsApp() {
  const message = encodeURIComponent("Hi! I'd like to create my own wedding invitation like this one.");
  window.open(`https://wa.me/?text=${message}`, '_blank');
}

/* ═══════════════════════════════
   8b. BACKGROUND MUSIC
   Upload a file named "wedding-music.mp3" into an "audio" folder
   at the site root (audio/wedding-music.mp3) for this to work.
   Autoplay-with-sound is blocked by browsers until the visitor
   interacts with the page, so playback starts on the envelope tap
   (see openEnvelope above) rather than on page load.
═══════════════════════════════ */
function playMusic() {
  const audio = document.getElementById('bg-music');
  const btn   = document.getElementById('music-toggle');
  if (!audio) return;
  audio.play()
    .then(() => { btn?.classList.remove('muted'); if (btn) btn.textContent = '🔊'; })
    .catch(err => console.warn('[App] Music autoplay blocked, use the toggle button:', err));
}

function toggleMusic() {
  const audio = document.getElementById('bg-music');
  const btn   = document.getElementById('music-toggle');
  if (!audio) return;

  if (audio.paused) {
    audio.play()
      .then(() => { btn?.classList.remove('muted'); if (btn) btn.textContent = '🔊'; })
      .catch(err => console.warn('[App] Could not play music:', err));
  } else {
    audio.pause();
    btn?.classList.add('muted');
    if (btn) btn.textContent = '🔇';
  }
}

/* ═══════════════════════════════
   9. SITE CONTENT (Firestore)
   Pulls editable text from siteContent/main, written by the admin
   panel. If the doc doesn't exist yet, or the device is offline, the
   hardcoded HTML already on the page stays as-is (graceful fallback).
═══════════════════════════════ */
function loadSiteContent() {
  db.collection('siteContent').doc('main').get()
    .then(doc => {
      if (!doc.exists) return; // admin hasn't saved anything yet — keep static content
      const data = doc.data();
      applySiteContent(data);
    })
    .catch(err => {
      console.warn('[App] Could not load site content, using defaults:', err);
    });
}

function setText(id, value) {
  if (value === undefined || value === null || value === '') return;
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function applySiteContent(data) {
  // Hero + Names
  if (data.coupleNames) {
    const c = data.coupleNames;
    setText('hero-groom-name', c.groomName);
    setText('hero-bride-name', c.brideName);
    setText('names-groom-name', c.groomFullName || c.groomName);
    setText('names-bride-name', c.brideFullName || c.brideName);
    setText('names-groom-parent', c.groomParent);
    setText('names-bride-parent', c.brideParent);
    if (c.groomName && c.brideName) {
      setText('footer-couple-names', `${c.groomName} & ${c.brideName}`);
    }
  }

  // Wedding date/time — drives countdown + scratch card text
  if (data.weddingDateISO) {
    startCountdown(data.weddingDateISO);
    const d = new Date(data.weddingDateISO);
    if (!isNaN(d)) {
      setText('scratch-date-text', d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      setText('scratch-date-sub', `${dayName}  ·  ${time}`);
    }
  }

  // Venue
  if (data.venue) {
    setText('venue-name', data.venue.name);
    setText('venue-addr', data.venue.address);
    updateVenueMapEmbed(data.venue.name, data.venue.address);
  }

  // Timeline (array of { title, time })
  if (Array.isArray(data.timeline) && data.timeline.length) {
    const list = document.getElementById('timeline-list');
    if (list) {
      list.innerHTML = data.timeline.map(item => `
        <div class="timeline-item">
          <div class="tl-dot"></div>
          <div>
            <div class="tl-title">${escapeHTML(item.title)}</div>
            <div class="tl-time">${escapeHTML(item.time)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  // Pre-wedding events (array of { name, detail })
  if (Array.isArray(data.preWeddingEvents) && data.preWeddingEvents.length) {
    const list = document.getElementById('prewedding-list');
    if (list) {
      list.innerHTML = data.preWeddingEvents.map(item => `
        <div class="prewedding-item">
          <div class="pw-name">${escapeHTML(item.name)}</div>
          <div class="pw-detail">${escapeHTML(item.detail)}</div>
        </div>
      `).join('');
    }
  }

  // Invitation + footer text
  setText('invitation-text', data.invitationText);
  setText('footer-message', data.footerMessage);
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function updateVenueMapEmbed(name, address) {
  const query = encodeURIComponent(`${name || ''} ${address || ''}`.trim());
  if (!query) return;
  const embed   = document.getElementById('venue-map-embed');
  const openBtn = document.getElementById('venue-map-open-btn');
  const mainBtn = document.getElementById('venue-map-btn');
  const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  if (embed)   embed.src   = `https://www.google.com/maps?q=${query}&output=embed`;
  if (openBtn) openBtn.href = url;
  if (mainBtn) mainBtn.href = url;
}

/* ═══════════════════════════════
   INIT — things that don't depend
   on the envelope being opened
═══════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initScratchCard();
  startCountdown(); // fallback date; upgraded by loadSiteContent() below once Firestore responds
  loadSiteContent();
});
