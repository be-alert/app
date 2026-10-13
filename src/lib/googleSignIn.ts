/**
 * "Continue with Google" without leaving Be Alert.
 *
 * Google gives us an ID token directly (Google's own button on the web, the native account
 * picker on Android) and we hand it to Supabase with signInWithIdToken. Nothing goes through
 * the Supabase project address, so Google's screen names bealert.online / Be Alert.
 *
 * Replay protection: Google signs a SHA-256 hash of a one-time nonce into the token and
 * Supabase checks it against the raw nonce we send alongside.
 */
import { ENV } from '@/config/env';
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

// ── Web: Google Identity Services button ──

interface GisId {
  initialize(o: Record<string, unknown>): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  cancel(): void;
  disableAutoSelect?(): void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GisId } };
  }
}

let gisScript: Promise<GisId> | null = null;

function loadGis(): Promise<GisId> {
  gisScript ??= new Promise<GisId>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in failed to load.')));
    s.onerror = () => {
      gisScript = null;
      reject(new Error('Could not reach Google. Check your connection and try again.'));
    };
    document.head.appendChild(s);
  });
  return gisScript;
}

/**
 * Draws Google's official button into `el`. Each render uses a fresh nonce; `onCredential`
 * receives the token once the user picks an account.
 */
export async function renderGoogleButton(el: HTMLElement, onCredential: (c: GoogleCredential) => void, width: number): Promise<void> {
  if (!googleClientId) throw new Error('Google sign-in is not configured.');
  const [gis, nonce] = await Promise.all([loadGis(), makeNonce()]);
  gis.initialize({
    client_id: googleClientId,
    nonce: nonce.hashed,
    ux_mode: 'popup',
    use_fedcm_for_button: true,
    itp_support: true,
    callback: (r: { credential?: string }) => {
      if (r.credential) onCredential({ idToken: r.credential, nonce: nonce.raw });
    },
  });
  el.replaceChildren();
  gis.renderButton(el, {
    type: 'standard',
    theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'center',
    width: Math.max(200, Math.min(400, Math.round(width))),
  });
}

/** On sign-out: forget the chosen Google account so the next sign-in offers the account list again. */
export async function forgetGoogleAccount(): Promise<void> {
  try {
    if (isNative) {
      const { SocialLogin } = await import('@capgo/capacitor-social-login');
      await SocialLogin.logout({ provider: 'google' });
    } else {
      window.google?.accounts?.id?.disableAutoSelect?.();
    }
  } catch {
    /* not signed in with Google */
  }
}

