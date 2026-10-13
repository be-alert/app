import { useEffect, useRef } from 'react';
import { ENV } from '@/config/env';

/**
 * Cloudflare Turnstile bot check, used by Supabase "CAPTCHA protection".
 * Renders nothing unless VITE_TURNSTILE_SITE_KEY is set, so sign-in keeps
 * working until CAPTCHA is switched on in both places (app + Supabase).
 */

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const captchaEnabled = Boolean(ENV.turnstileSiteKey);

let scriptPromise: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile failed to load')));
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Turnstile failed to load'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Calls `onToken` with a fresh single-use token (or null when it expires). Change `resetKey` to get a new token. */
export function Turnstile({ onToken, resetKey = 0, className }: { onToken(token: string | null): void; resetKey?: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (!ENV.turnstileSiteKey || !box.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((ts) => {
        if (cancelled || !box.current) return;
        widget.current = ts.render(box.current, {
          sitekey: ENV.turnstileSiteKey,
          appearance: 'interaction-only',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => {
            cb.current(null);
            // Network hiccup or blocked challenge: try again shortly instead of staying stuck.
            setTimeout(() => widget.current && window.turnstile?.reset(widget.current), 2500);
            return true;
          },
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widget.current) {
      cb.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  if (!ENV.turnstileSiteKey) return null;
  return <div ref={box} className={className} />;
}
