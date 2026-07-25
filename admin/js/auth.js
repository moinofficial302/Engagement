'use strict';

/* Turns Firebase Auth error codes into plain-language messages */
function friendlyAuthError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address doesn\'t look right.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a bit and try again.';
    case 'auth/network-request-failed':
      return 'Network error — check your connection.';
    default:
      return 'Login failed. Please try again.';
  }
}

/* Guard for dashboard.html: redirect to login if not authenticated.
   Calls onReady(user) once we know the user is logged in. */
function requireAuth(onReady) {
  firebase.auth().onAuthStateChanged(user => {
    if (!user) {
      window.location.href = 'login.html';
    } else {
      onReady(user);
    }
  });
}

function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = 'login.html';
  });
}
