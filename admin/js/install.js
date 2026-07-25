'use strict';

/* ═══════════════════════════════
   ADMIN PWA INSTALL
   Registers the site's service worker (its scope already covers
   /admin/ since it's a sub-path) and wires up the visible
   "Install App" button using the beforeinstallprompt event.
═══════════════════════════════ */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // '../sw.js' -> registered scope defaults to its own folder (site root),
    // which covers /admin/ too since it's a sub-path.
    navigator.serviceWorker.register('../sw.js')
      .then(reg => console.log('[Admin] Service worker registered:', reg.scope))
      .catch(err => console.warn('[Admin] Service worker registration failed:', err));
  });
}

let deferredAdminInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredAdminInstallPrompt = e;
  document.getElementById('admin-install-btn')?.classList.add('show');
});

function installAdminApp() {
  if (!deferredAdminInstallPrompt) return;
  deferredAdminInstallPrompt.prompt();
  deferredAdminInstallPrompt.userChoice.finally(() => {
    deferredAdminInstallPrompt = null;
    document.getElementById('admin-install-btn')?.classList.remove('show');
  });
}

window.addEventListener('appinstalled', () => {
  document.getElementById('admin-install-btn')?.classList.remove('show');
  deferredAdminInstallPrompt = null;
});
