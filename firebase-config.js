/* ═══════════════════════════════════════════════════
   FIREBASE CONFIG — shared by the site (js/app.js) and
   the admin panel (admin/js/*.js)
═══════════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: "AIzaSyCeKZoiuIlEd8esHv3RpEmXuMwM5Hg7gb0",
  authDomain: "engagement-6c8d3.firebaseapp.com",
  projectId: "engagement-6c8d3",
  storageBucket: "engagement-6c8d3.firebasestorage.app",
  messagingSenderId: "372263382215",
  appId: "1:372263382215:web:05eaed2402320a0a88a2e2"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
