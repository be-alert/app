import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js';
import { ENV, isSupabaseConfigured } from '@/config/env';
import { isNative } from './native';

/**
 * Android app: keep the sign-in session in the Android Keystore (encrypted, hardware-backed
 * where available) instead of WebView localStorage. A session saved by an older app version
 * is moved over once and deleted from localStorage.
 */
function keystoreStorage(): SupportedStorage {
  const timeout = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('keystore timeout')), 3000))]);
  const store = timeout(
    import('@aparajita/capacitor-secure-storage').then(async ({ SecureStorage }) => {
      await SecureStorage.setKeyPrefix('bealert_');
      return SecureStorage;
    })
  ).catch((e) => {
    console.warn('[Be Alert] Keystore unavailable, using app storage', e);
    return null;
  });
  return {
    async getItem(key) {
      const s = await store;
      if (!s) return window.localStorage.getItem(key);
      const saved = await s.getItem(key);
      if (saved !== null) return saved;
      const legacy = window.localStorage.getItem(key);
      if (legacy === null) return null;
      await s.setItem(key, legacy);
      window.localStorage.removeItem(key);
      return legacy;
    },
    async setItem(key, value) {
      const s = await store;
      if (!s) return window.localStorage.setItem(key, value);
      await s.setItem(key, value);
    },
    async removeItem(key) {
      const s = await store;
      if (s) await s.removeItem(key);
      window.localStorage.removeItem(key);
    },
  };
}

let client: SupabaseClient | null = null;

/**
 * Lazily-created Supabase client. It is only instantiated once live mode is
 * chosen, so demo mode never makes network calls (e.g. token refreshes) to an
 * unreachable project.
 */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(ENV.supabase.url!, ENV.supabase.anonKey!, {
      // PKCE: a sign-in link only works in the app/browser that asked for it, so a
      // crafted link can't silently log someone into another person's account.
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        ...(isNative ? { storage: keystoreStorage() } : {}),
      },
    });
  }
  return client;
}

export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error('Supabase is not configured.');
  return c;
}

/** Quick reachability probe so a dead/paused project falls back to demo mode instead of hanging. */
export async function pingSupabase(timeoutMs = 4500): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${ENV.supabase.url}/auth/v1/health`, {
      headers: { apikey: ENV.supabase.anonKey! },
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
