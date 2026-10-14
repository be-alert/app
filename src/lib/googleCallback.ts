/**
 * Google returns the sign-in result to /google-callback.html (see public/google-callback.html).
 * An older cached copy of the app (service worker) may answer that address with the app itself,
 * so the app performs the same hand-off: pass the result to the tab that started sign-in, then close.
 */
export function handleGoogleCallback(): boolean {
  if (!/\/google-callback\.html$/.test(window.location.pathname)) return false;
  const p = new URLSearchParams(window.location.hash.slice(1));
  history.replaceState(null, '', window.location.pathname);
  const msg = { type: 'be-alert-google', id_token: p.get('id_token'), state: p.get('state'), error: p.get('error') };
  try {
    new BroadcastChannel('be-alert-google').postMessage(msg);
  } catch {
    /* older browser: localStorage below */
  }
  try {
    window.localStorage.setItem('be-alert-google', JSON.stringify(msg));
  } catch {
    /* storage blocked */
  }
  document.body.textContent = 'Signing in to Be Alert…';
  setTimeout(() => window.close(), 400);
  return true;
}
