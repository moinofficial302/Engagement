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

  const player = document.createElement('lottie-player');
  player.setAttribute('src', 'lottie/confetti-burst.json');
  player.setAttribute('autoplay', '');
  player.setAttribute('background', 'transparent');
  player.setAttribute('speed', '1');
  container.appendChild(player);

  // Remove once the animation completes so it doesn't block clicks/scroll
  player.addEventListener('complete', () => {
    container.innerHTML = '';
  });

  // Safety fallback in case 'complete' never fires
  setTimeout(() => { container.innerHTML = ''; }, 4000);
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
    canvas.width  = rect.width;
    canvas.height = rect.height;
    canvas.style.opacity = '1';
    canvas.style.pointerEvents = 'auto';
    hasRevealed = false;
    paintScratchLayer();
  }

  function paintScratchLayer() {
    // Solid gold/rose "scratch" foil covering the revealed message
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#d9c08f');
    gradient.addColorStop(1, '#c9a96e');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '600 15px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦ Scratch Here ✦', canvas.width / 2, canvas.height / 2);
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return {
      x: (point.clientX - rect.left) * (canvas.width / rect.width),
      y: (point.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function scratch(e) {
    const { x, y } = getPos(e);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, 28, 0, Math.PI * 2);
    ctx.fill();
    vibrateTick();
    checkRevealProgress();
  }

  function checkRevealProgress() {
    if (hasRevealed) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparentPixels = 0;
    const totalPixels = imageData.length / 4;

    // Sample every 4th pixel for performance
    for (let i = 3; i < imageData.length; i += 16) {
      if (imageData[i] === 0) transparentPixels++;
    }

    const scratchedRatio = transparentPixels / (totalPixels / 4);

    if (scratchedRatio > 0.5) {
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
    const mapBtn = document.getElementById('venue-map-btn');
    if (mapBtn && data.venue.mapLink) mapBtn.href = data.venue.mapLink;
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
  if (embed)   embed.src   = `https://www.google.com/maps?q=${query}&output=embed`;
  if (openBtn) openBtn.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
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
