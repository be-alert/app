import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, Mail, MailCheck, ShieldCheck, UserPlus } from 'lucide-react';
import { Sheet, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/data';
import type { EmailCodeKind } from '@/data/api';
import { Turnstile, captchaEnabled } from '@/components/Turnstile';
import { cn } from '@/lib/format';

type Mode = 'signin' | 'signup';
type Step = 'start' | 'code' | 'newPassword' | 'name';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
/** Supabase emails 6-digit codes by default (the project setting allows up to 10). */
const MIN_CODE = 6;
const MAX_CODE = 10;

/**
 * Sign in / create account with email + password (or Google). A 6-digit code is emailed to confirm a new account or reset a password.
 * Every email carries a code (never only a link), so the user can read it on any device
 * and type it here.
 */
export function AuthSheet() {
  const {
    authPrompt,
    closeAuthPrompt,
    sendEmailOtp,
    verifyEmailOtp,
    signUpWithPassword,
    signInWithPassword,
    resendSignupCode,
    sendPasswordReset,
    updatePassword,
    signInWithGoogle,
  } = useAuth();
  const api = useApi();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('signin');
  const [step, setStep] = useState<Step>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [target, setTarget] = useState(''); // normalised email the code was sent to
  const [codeKind, setCodeKind] = useState<EmailCodeKind>('email');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [name, setName] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  useEffect(() => {
    if (authPrompt.open) {
      setMode('signin');
      setStep('start');
      setPassword('');
      setCode('');
      setNewPassword('');
      setError(null);
      setDevCode(undefined);
    }
  }, [authPrompt.open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Validates the email; returns the normalised address or null after showing an error. */
  function checkEmail(): string | null {
    const to = email.trim().toLowerCase();
    if (!EMAIL_RE.test(to)) {
      setError('Enter a valid email address, e.g. yourname@gmail.com');
      return null;
    }
    return to;
  }

  /**
   * A fresh bot-check token for one request. Tokens are single-use and a new one takes a moment
   * to arrive after each use, so wait for it (up to 10 s) instead of failing a quick second tap.
   */
  async function takeCaptcha(): Promise<string | undefined> {
    if (!captchaEnabled) return undefined;
    for (let i = 0; i < 40 && !captchaRef.current; i++) await new Promise((r) => setTimeout(r, 250));
    const token = captchaRef.current ?? undefined;
    captchaRef.current = null;
    setCaptchaReset((n) => n + 1);
    return token;
  }

  function goToCode(to: string, kind: EmailCodeKind, dev?: string) {
    setTarget(to);
    setCodeKind(kind);
    setDevCode(dev);
    setCode('');
    setStep('code');
    setCooldown(60);
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  /** Signed in: ask for a name the first time, otherwise close. */
  async function finish() {
    const session = await api.auth.getSession();
    const profile = session ? await api.auth.getProfile(session.id) : null;
    setBusy(false);
    if (!profile?.display_name) {
      setError(null);
      setStep('name');
      return;
    }
    toast.success(`Welcome back, ${profile.display_name.split(' ')[0]}!`);
    closeAuthPrompt(true);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    try {
      await submitPasswordInner();
    } catch (err) {
      setBusy(false);
      setError(friendlyError((err as Error).message || 'Something went wrong. Please try again.'));
    }
  }

  async function submitPasswordInner() {
    const to = checkEmail();
    if (!to) return;
    if (mode === 'signup' && password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    if (!password) return setError('Enter your password.');
    setBusy(true);
    setError(null);
    const token = await takeCaptcha();

    if (mode === 'signup') {
      const res = await signUpWithPassword(to, password, token);
      if (res.error === 'ACCOUNT_EXISTS') {
        setBusy(false);
        setMode('signin');
        return setError('You already have an account with this email. Sign in below — or tap “Forgot password?” to set a new one.');
      }
      if (res.error) {
        setBusy(false);
        return setError(friendlyError(res.error));
      }
      if (res.needsCode) {
        setBusy(false);
        return goToCode(to, 'signup', res.devCode);
      }
      return finish();
    }

    const res = await signInWithPassword(to, password, token);
    if (res.unconfirmed) {
      // Account exists but the email isn't confirmed yet: ask for the code already sent
      // (re-sending right away is refused by the server and looked like "too many attempts").
      setBusy(false);
      toast.info('Please confirm your email first', 'Enter the code we emailed you, or tap “Send a new code”.');
      goToCode(to, 'signup');
      setCooldown(0);
      return;
    }
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    return finish();
  }

  /** Google's account chooser (pop-up on the web, native on Android) — always lists every account. */
  async function google() {
    setBusy(true);
    setError(null);
    const res = await signInWithGoogle(takeCaptcha);
    if (res.error || res.cancelled) {
      setBusy(false);
      if (res.error) setError(googleError(res.error));
      return;
    }
    return finish();
  }

  async function forgotPassword() {
    const to = checkEmail();
    if (!to) return;
    setBusy(true);
    setError(null);
    const res = await sendPasswordReset(to, await takeCaptcha());
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    goToCode(to, 'recovery', res.devCode);
  }

  async function resend() {
    setBusy(true);
    setError(null);
    const res =
      codeKind === 'signup'
        ? await resendSignupCode(target, await takeCaptcha())
        : codeKind === 'recovery'
          ? await sendPasswordReset(target, await takeCaptcha())
          : await sendEmailOtp(target, await takeCaptcha());
    setBusy(false);
    if (res.error) return setError(friendlyError(res.error));
    setDevCode(res.devCode);
    setCooldown(60);
    toast.success('New code sent.');
  }

  async function submitCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length < MIN_CODE) return;
    setBusy(true);
    setError(null);
    const res = await verifyEmailOtp(target, code, codeKind, await takeCaptcha());
    if (res.error) {
      setBusy(false);
      setError(friendlyError(res.error));
      setCode('');
      return;
    }
    if (codeKind === 'recovery') {
      setBusy(false);
      setStep('newPassword');
      return;
    }
    return finish();
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
    setBusy(true);
    setError(null);
    const res = await updatePassword(newPassword);
    if (res.error) {
      setBusy(false);
      return setError(friendlyError(res.error));
    }
    toast.success('Password changed. You’re signed in.');
    return finish();
  }

  async function submitName(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 2) return setError('Please enter at least 2 characters.');
    setBusy(true);
    const session = await api.auth.getSession();
    if (session) await api.auth.updateProfile(session.id, { display_name: n });
    setBusy(false);
    toast.success(`Welcome to Be Alert, ${n.split(' ')[0]}!`);
    closeAuthPrompt(true);
  }

  const Icon = step === 'start' ? (mode === 'signup' ? UserPlus : Mail) : step === 'code' ? MailCheck : step === 'newPassword' ? KeyRound : ShieldCheck;
  const codeTitle = codeKind === 'signup' ? 'Confirm your email' : codeKind === 'recovery' ? 'Reset your password' : 'Enter your code';

  return (
    <Sheet open={authPrompt.open} onClose={() => closeAuthPrompt(false)} size="sm" bare>
      <div className="px-6 pb-7 pt-4 lg:pt-7">
        {(step === 'code' || step === 'newPassword') && (
          <button onClick={() => { setStep('start'); setError(null); }} className="btn-ghost btn-sm -ml-2 mb-2 px-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        )}
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-glow">
          <Icon className="h-6 w-6" />
        </div>

        {step === 'start' && (
          <form onSubmit={submitPassword}>
            <h2 className="text-xl font-extrabold tracking-tight text-ink">{mode === 'signup' ? 'Create your Be Alert account' : 'Sign in to Be Alert'}</h2>
            <p className="mt-1.5 text-sm text-ink-2">{authPrompt.reason ?? 'Post, vote and connect with neighbours.'}</p>

            <button type="button" onClick={() => void google()} disabled={busy} className="btn-secondary mt-5 h-12 w-full gap-3 text-[15px]">
              <GoogleLogo /> Continue with Google
            </button>
            <div className="my-4 flex items-center gap-3 text-xs font-semibold text-ink-3">
              <span className="h-px flex-1 bg-line" /> or use your email <span className="h-px flex-1 bg-line" />
            </div>

            <div role="tablist" aria-label="Sign in or create account" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              {(['signin', 'signup'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => { setMode(m); setError(null); }}
                  className={cn(
                    'rounded-lg py-2 text-sm font-bold transition',
                    mode === m ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
                  )}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <label className="label mt-5" htmlFor="sr-email">Email address</label>
            <input
              id="sr-email"
              data-autofocus
              type="email"
              inputMode="email"
              autoComplete="email"
              className="input text-base"
              placeholder="yourname@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <div className="mt-4 flex items-baseline justify-between">
              <label className="label mb-0" htmlFor="sr-password">{mode === 'signup' ? 'Choose a password' : 'Password'}</label>
              {mode === 'signin' && (
                <button type="button" onClick={forgotPassword} disabled={busy} className="text-xs font-semibold text-primary-600 hover:underline">
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative mt-1.5">
              <input
                id="sr-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                className="input pr-11 text-base"
                placeholder={mode === 'signup' ? `At least ${MIN_PASSWORD} characters` : 'Your password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-3 hover:text-ink"
              >
                {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
              </button>
            </div>

            {error && <p className="mt-2 text-sm font-medium text-danger-600">{error}</p>}
            <button type="submit" className="btn-primary mt-5 w-full" disabled={busy || !email.includes('@') || !password}>
              {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>

            {mode === 'signup' && (
              <p className="mt-2 text-center text-xs text-ink-3">We’ll email you a 6-digit code to confirm it’s your address.</p>
            )}

            <p className="mt-4 flex items-start gap-2 text-xs text-ink-3">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your email is never shown publicly.
            </p>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={submitCode}>
            <h2 className="text-xl font-extrabold tracking-tight text-ink">{codeTitle}</h2>
            {codeKind === 'recovery' ? (
              <p className="mt-1.5 text-sm text-ink-2">
                If <span className="font-semibold text-ink">{target}</span> has a Be Alert account, we’ve emailed it a code. Type the code here —
                it can take a minute, so check your spam folder too.
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-ink-2">
                We emailed a code to <span className="font-semibold text-ink">{target}</span>. Open the email on any device — phone or computer —
                and type the code here. Check your spam folder too.
              </p>
            )}
            {devCode && (
              <div className="mt-4 rounded-xl border border-dashed border-warning-500/50 bg-warning-50 px-3.5 py-2.5 text-[13px] text-warning-700 dark:bg-warning-500/10 dark:text-warning-500">
                Demo mode — nothing is actually sent. Use code <b className="tracking-widest">{devCode}</b>
              </div>
            )}
            <input
              ref={codeRef}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={MAX_CODE}
              aria-label="Code from the email"
              className="input mt-5 h-14 text-center text-2xl font-bold tracking-[0.4em] placeholder:tracking-[0.3em]"
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, MAX_CODE))}
            />
            {error && <p className="mt-2 text-sm font-medium text-danger-600">{error}</p>}
            <button type="submit" className="btn-primary mt-5 w-full" disabled={busy || code.length < MIN_CODE}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
            <button type="button" className="btn-ghost mt-2 w-full" disabled={cooldown > 0 || busy} onClick={resend}>
              {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
            </button>
            {codeKind === 'recovery' && (
              <div className="mt-4 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px] text-ink-2">
                <p className="font-semibold text-ink">No email?</p>
                <p className="mt-1">
                  For your privacy we don’t say whether an email is registered. If you never created an account with this email, there’s no
                  password to reset. If you joined with “Continue with Google”, just sign in with Google.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => { setMode('signup'); setStep('start'); setError(null); }}>
                    Create an account
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {step === 'newPassword' && (
          <form onSubmit={submitNewPassword}>
            <h2 className="text-xl font-extrabold tracking-tight text-ink">Choose a new password</h2>
            <p className="mt-1.5 text-sm text-ink-2">You’ll use it to sign in to Be Alert on any device.</p>
            <input
              data-autofocus
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className="input mt-5 text-base"
              placeholder={`At least ${MIN_PASSWORD} characters`}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Show password
            </label>
            {error && <p className="mt-2 text-sm font-medium text-danger-600">{error}</p>}
            <button className="btn-primary mt-5 w-full" disabled={busy}>
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}

        {step === 'name' && (
          <form onSubmit={submitName}>
            <h2 className="text-xl font-extrabold tracking-tight text-ink">What should neighbours call you?</h2>
            <p className="mt-1.5 text-sm text-ink-2">This name appears on your posts and comments.</p>
            <input data-autofocus className="input mt-5" placeholder="e.g., Ayesha Khan" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            {error && <p className="mt-2 text-sm font-medium text-danger-600">{error}</p>}
            <button className="btn-primary mt-5 w-full" disabled={busy}>
              {busy ? 'Saving…' : 'Continue'}
            </button>
          </form>
        )}
        {(step === 'start' || step === 'code') && <Turnstile onToken={(t) => (captchaRef.current = t)} resetKey={captchaReset} className="mt-4 flex justify-center" />}
        <p className="mt-5 text-center text-xs text-ink-3">
          By continuing you agree to our{' '}
          <Link to="/terms" onClick={() => closeAuthPrompt(false)} className="font-semibold underline">Terms</Link> and{' '}
          <Link to="/privacy" onClick={() => closeAuthPrompt(false)} className="font-semibold underline">Privacy Policy</Link>.
        </p>
      </div>
    </Sheet>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Turn Supabase's technical auth errors into plain language. */
function googleError(msg: string): string {
  console.warn('[Be Alert] Google sign-in:', msg);
  if (/provider is not enabled|unsupported provider|not configured/i.test(msg)) return 'Google sign-in isn’t switched on yet. Please use your email for now.';
  if (/captcha/i.test(msg)) return 'Security check failed. Please wait a moment and try again.';
  if (/fetch|network|connection/i.test(msg)) return 'No internet connection. Check your connection and try again.';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  return 'Google sign-in didn’t work. Please try again, or use your email below.';
}

function friendlyError(msg: string): string {
  // Checked first: the bot-check error mentions a "token", which must not read as a wrong code.
  if (/captcha/i.test(msg)) return 'Security check didn’t finish. Please wait a few seconds and try again.';
  if (/invalid login credentials/i.test(msg))
    return 'Wrong email or password. Try again, tap “Forgot password?”, or use “Continue with Google” if that’s how you joined.';
  if (/already registered|already been registered|already exists/i.test(msg))
    return 'An account with this email already exists. Sign in instead — or tap “Forgot password?” if you don’t remember it.';
  if (/email address|invalid format|validate email/i.test(msg)) return 'Enter a valid email address, e.g. yourname@gmail.com';
  if (/not confirmed/i.test(msg)) return 'Please confirm your email first — use the code we sent you.';
  if (/sending.*email|smtp|error sending/i.test(msg)) return 'We couldn’t send the email just now. Please try again in a minute.';
  if (/rate limit|too many|seconds/i.test(msg)) return 'Too many attempts. Please wait a minute and try again.';
  if (/weak|pwned|password should/i.test(msg)) return 'Please choose a stronger password — mix letters, numbers and symbols.';
  if (/same.*password|different from the old/i.test(msg)) return 'Your new password must be different from the old one.';
  if (/expired|invalid|token/i.test(msg)) return 'That code is wrong or has expired. Tap “Send a new code”.';
  if (/signups? not allowed|disabled/i.test(msg)) return 'New accounts are paused right now. Please try again later.';
  if (/provider is not enabled|unsupported provider/i.test(msg)) return 'Google sign-in isn’t switched on yet. Please use your email for now.';
  if (/fetch|network/i.test(msg)) return 'No internet connection. Check your connection and try again.';
  return msg;
}
