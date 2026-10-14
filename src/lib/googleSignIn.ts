/**
 * "Continue with Google" without leaving Be Alert.
 *
 * Google gives us an ID token directly (an account-chooser pop-up on the web, the native account
 * chooser on Android) and we hand it to Supabase with signInWithIdToken. Nothing goes through
 * the Supabase project address, so Google's screen names bealert.online / Be Alert.
 *
 * Replay protection: Google signs a SHA-256 hash of a one-time nonce into the token and
 * Supabase checks it against the raw nonce we send alongside.
 */
import { BASE_PATH, ENV } from '@/config/env';
import { isNative } from './native';

export const googleClientId = ENV.googleClientId;

export interface GoogleCredential {
  idToken: string;
  /** The raw nonce; Google received only its hash. */
  nonce: string;
}

async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}

/** Thrown when the user closes the Google picker; not shown as an error. */
export class GoogleCancelled extends Error {}

// ── Android: native account picker (Credential Manager) ──

let nativeReady: Promise<void> | null = null;

async function nativePlugin() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  nativeReady ??= SocialLogin.initialize({ google: { webClientId: googleClientId, mode: 'online' } });
  await nativeReady;
  return SocialLogin;
}

export async function nativeGoogleSignIn(): Promise<GoogleCredential> {
  if (!isNative) throw new Error('Native Google sign-in is only available in the Android app.');
  if (!googleClientId) throw new Error('Google sign-in is not configured.');
  const SocialLogin = await nativePlugin();
  const nonce = await makeNonce();
  const attempt = async (style: 'bottom' | 'standard') => {
    const res = await SocialLogin.login({ provider: 'google', options: { nonce: nonce.hashed, style, filterByAuthorizedAccounts: false } });
    const r = res.result as { idToken?: string | null };
    if (!r.idToken) throw new Error('Google did not return a sign-in token.');
    return r.idToken;
  };
  const cancelled = (e: unknown) => /cancel/i.test(String((e as Error)?.message ?? e));
  try {
    // Google's full account chooser (all accounts + "Add another account"), so people can switch accounts.
    return { idToken: await attempt('standard'), nonce: nonce.raw };
  } catch (e) {
    if (cancelled(e)) throw new GoogleCancelled();
    // Fallback: the slide-up picker.
    try {
      return { idToken: await attempt('bottom'), nonce: nonce.raw };
    } catch (e2) {
      if (cancelled(e2)) throw new GoogleCancelled();
      throw e2;
    }
  }
}

// ── Web: Google's account chooser in a pop-up ──
//
// Always shows the full list of Google accounts (prompt=select_account) so people can switch
// accounts after signing out. Google returns an ID token to /google-callback.html on our own
// domain, which hands it back to this tab (BroadcastChannel, localStorage as a fallback).

const CHANNEL = 'be-alert-google';

/**
 * Must be called straight from a click (before any await) so the browser allows the pop-up.
 */
export function webGoogleSignIn(): Promise<GoogleCredential> {
  if (!googleClientId) return Promise.reject(new Error('Google sign-in is not configured.'));
  const popup = window.open('', CHANNEL, 'width=480,height=640,menubar=no,toolbar=no');
  if (!popup) return Promise.reject(new Error('Your browser blocked the Google window. Allow pop-ups for this site and try again.'));
  popup.document.title = 'Continue with Google';

  return (async () => {
    const nonce = await makeNonce();
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: `${window.location.origin}${BASE_PATH}google-callback.html`,
      response_type: 'id_token',
      scope: 'openid email profile',
      nonce: nonce.hashed,
      state,
      prompt: 'select_account',
    }).toString();
    popup.location.href = url.toString();

    return new Promise<GoogleCredential>((resolve, reject) => {
      const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
      let settled = false;
      let focusTimer: ReturnType<typeof setTimeout> | undefined;
      const finish = (m: { state?: string | null; id_token?: string | null; error?: string | null } | null) => {
        if (settled || !m || m.state !== state) return;
        settled = true;
        cleanup();
        if (m.id_token) resolve({ idToken: m.id_token, nonce: nonce.raw });
        else if (!m.error || m.error === 'access_denied' || m.error === 'user_cancelled') reject(new GoogleCancelled());
        else reject(new Error('Google sign-in didn’t finish. Please try again.'));
      };
      const onStorage = (e: StorageEvent) => {
        if (e.key !== CHANNEL || !e.newValue) return;
        try {
          finish(JSON.parse(e.newValue));
        } catch {
          /* ignore */
        }
      };
      // Back on this window without a result (pop-up closed): treat as cancelled after a short grace.
      const onFocus = () => {
        clearTimeout(focusTimer);
        focusTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new GoogleCancelled());
        }, 2500);
      };
      const cleanup = () => {
        channel?.close();
        window.removeEventListener('storage', onStorage);
        window.removeEventListener('focus', onFocus);
        clearTimeout(focusTimer);
        try {
          window.localStorage.removeItem(CHANNEL);
        } catch {
          /* ignore */
        }
      };
      if (channel) channel.onmessage = (e) => finish(e.data);
      window.addEventListener('storage', onStorage);
      window.addEventListener('focus', onFocus);
    });
  })().catch((e) => {
    if (!popup.closed) popup.close();
    throw e;
  });
}

/** On sign-out: forget the chosen Google account so the next sign-in offers the account list again. */
export async function forgetGoogleAccount(): Promise<void> {
  try {
    if (isNative) {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.logout({ provider: 'google' });
    }
  } catch {
    /* not signed in with Google */
  }
}

