import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApi, onDataChange, type SessionUser } from '@/data';
import type { AuthApi } from '@/data/api';
import type { Profile, ProfilePatch } from './types';

interface AuthContextValue {
  user: SessionUser | null;
  profile: Profile | null;
  /** True until the initial session check completes. */
  loading: boolean;
  /** Derived from the server-side profile only — never from local state. */
  isAdmin: boolean;
  /** App owner (super-admin). */
  isOwner: boolean;
  sendEmailOtp(email: string, captchaToken?: string): Promise<{ error: string | null; devCode?: string }>;
  verifyEmailOtp: AuthApi['verifyEmailOtp'];
  signUpWithPassword: AuthApi['signUpWithPassword'];
  signInWithPassword: AuthApi['signInWithPassword'];
  resendSignupCode: AuthApi['resendSignupCode'];
  sendPasswordReset: AuthApi['sendPasswordReset'];
  updatePassword: AuthApi['updatePassword'];
  adminSignIn(email: string, password: string, captchaToken?: string): Promise<{ error: string | null }>;
  signInWithGoogle: AuthApi['signInWithGoogle'];
  signInWithGoogleToken: AuthApi['signInWithGoogleToken'];
  signOut(): Promise<void>;
  deleteMyAccount(): Promise<{ error: string | null }>;
  refreshProfile(): Promise<void>;
  updateProfile(patch: ProfilePatch): Promise<void>;
  /** Opens the sign-in sheet; resolves true once the user is signed in. */
  requireAuth(reason?: string): Promise<boolean>;
  authPrompt: { open: boolean; reason?: string };
  closeAuthPrompt(signedIn: boolean): void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authPrompt, setAuthPrompt] = useState<{ open: boolean; reason?: string }>({ open: false });
  const waiters = useRef<((ok: boolean) => void)[]>([]);

  const loadProfile = useCallback(
    async (u: SessionUser | null) => {
      if (!u) {
        setProfile(null);
        return;
      }
      try {
        const p = await api.auth.getProfile(u.id);
        // First Google sign-in: use the Google account name instead of asking for one.
        if (p && !p.display_name && u.name) {
          await api.auth.updateProfile(u.id, { display_name: u.name.slice(0, 40) });
          p.display_name = u.name.slice(0, 40);
        }
        setProfile(p);
      } catch (e) {
        console.warn('[Be Alert] Could not load profile', e);
      }
    },
    [api]
  );

  useEffect(() => {
    let alive = true;
    api.auth.getSession().then(async (u) => {
      if (!alive) return;
      setUser(u);
      await loadProfile(u);
      if (alive) setLoading(false);
    });
    const off = api.auth.onChange((u) => {
      setUser(u);
      loadProfile(u);
    });
    return () => {
      alive = false;
      off();
    };
  }, [api, loadProfile]);

  // Keep profile fresh after verification submissions / admin reviews.
  useEffect(
    () =>
      onDataChange((scope) => {
        if (scope === 'profile' || scope === 'admin' || scope === 'sync') loadProfile(user);
      }),
    [user, loadProfile]
  );

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (!user) return;
      setProfile((p) => (p ? { ...p, ...patch } : p)); // optimistic
      try {
        await api.auth.updateProfile(user.id, patch);
      } catch (e) {
        await loadProfile(user);
        throw e;
      }
    },
    [api, user, loadProfile]
  );

  const requireAuth = useCallback(
    (reason?: string) => {
      if (user) return Promise.resolve(true);
      setAuthPrompt({ open: true, reason });
      return new Promise<boolean>((resolve) => waiters.current.push(resolve));
    },
    [user]
  );

  const closeAuthPrompt = useCallback((signedIn: boolean) => {
    setAuthPrompt({ open: false });
    waiters.current.splice(0).forEach((w) => w(signedIn));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      isAdmin: Boolean(user && (profile?.is_admin || profile?.is_owner)),
      isOwner: Boolean(user && profile?.is_owner),
      sendEmailOtp: (e, t) => api.auth.sendEmailOtp(e, t),
      verifyEmailOtp: (e, c, k, t) => api.auth.verifyEmailOtp(e, c, k, t),
      signUpWithPassword: (e, pw, t) => api.auth.signUpWithPassword(e, pw, t),
      signInWithPassword: (e, pw, t) => api.auth.signInWithPassword(e, pw, t),
      resendSignupCode: (e, t) => api.auth.resendSignupCode(e, t),
      sendPasswordReset: (e, t) => api.auth.sendPasswordReset(e, t),
      updatePassword: (pw) => api.auth.updatePassword(pw),
      adminSignIn: (e, pw, t) => api.auth.adminSignIn(e, pw, t),
      signInWithGoogle: (getCaptcha) => api.auth.signInWithGoogle(getCaptcha),
      signInWithGoogleToken: (t, n, c) => api.auth.signInWithGoogleToken(t, n, c),
      signOut: async () => {
        await api.auth.signOut();
        setUser(null);
        setProfile(null);
      },
      deleteMyAccount: async () => {
        const res = await api.auth.deleteMyAccount();
        if (!res.error) {
          setUser(null);
          setProfile(null);
        }
        return res;
      },
      refreshProfile: () => loadProfile(user),
      updateProfile,
      requireAuth,
      authPrompt,
      closeAuthPrompt,
    }),
    [api, user, profile, loading, loadProfile, updateProfile, requireAuth, authPrompt, closeAuthPrompt]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
