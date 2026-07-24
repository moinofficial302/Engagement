/* ═══════════════════════════════════════════════════
   WEDDING INVITATION — app.js
   Structure:
   1. Service Worker Registration
   2. Envelope / Door Open
   3. Congrats Overlay + Confetti
   4. Countdown Timer
   5. Scratch Card
   6. Photo Slideshow
   7. Contact Form + Toast
   8. WhatsApp / Creator Link
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

    // Congrats popup now shows AFTER the scratch card is revealed
    // (see checkRevealProgress() in the Scratch Card section below)
    startCountdown();
    startSlideshow();
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
   Wedding: 15 June 2026, 5:00 PM IST
═══════════════════════════════ */
let countdownInterval = null;

function startCountdown() {
  if (countdownInterval) return; // already running

  const WEDDING_DATE = new Date('2026-06-15T17:00:00+05:30');

  const daysEl  = document.getElementById('cd-days');
  const hoursEl = document.getElementById('cd-hours');
  const minsEl  = document.getElementById('cd-mins');
  const secsEl  = document.getElementById('cd-secs');

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
    canvas.width  = rect.width;
    canvas.height = rect.height;
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
  sizeCanvas();
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
   7. CONTACT FORM + TOAST
═══════════════════════════════ */
function sendMessage() {
  const nameEl   = document.getElementById('msg-name');
  const emailEl  = document.getElementById('msg-email');
  const attendEl = document.getElementById('msg-attend');
  const textEl   = document.getElementById('msg-text');

  [nameEl, emailEl, attendEl, textEl].forEach(el => el.classList.remove('error'));

  let valid = true;
  if (!nameEl.value.trim()) { nameEl.classList.add('error'); valid = false; }
  if (!emailEl.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailEl.value)) {
    emailEl.classList.add('error'); valid = false;
  }
  if (!attendEl.value) { attendEl.classList.add('error'); valid = false; }
  if (!textEl.value.trim()) { textEl.classList.add('error'); valid = false; }

  if (!valid) return;

  // Store RSVP locally (no backend wired up yet — see sw.js background sync stub)
  const rsvp = {
    name: nameEl.value.trim(),
    email: emailEl.value.trim(),
    attending: attendEl.value,
    message: textEl.value.trim(),
    sentAt: new Date().toISOString()
  };

  try {
    const existing = JSON.parse(localStorage.getItem('wedding-rsvps') || '[]');
    existing.push(rsvp);
    localStorage.setItem('wedding-rsvps', JSON.stringify(existing));
  } catch (err) {
    console.warn('[App] Could not save RSVP locally:', err);
  }

  showToast('✓ Message sent!');

  nameEl.value = '';
  emailEl.value = '';
  attendEl.value = '';
  textEl.value = '';
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
   INIT — things that don't depend
   on the envelope being opened
═══════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initScratchCard();
});
