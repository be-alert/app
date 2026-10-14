import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';

/** Refuse to build if a server secret is exposed through a VITE_ variable. */
function guardSecrets(mode: string): Plugin {
  return {
    name: 'be-alert-guard-secrets',
    configResolved(config) {
      const env = loadEnv(mode, config.envDir || config.root, 'VITE_');
      const leaked = Object.entries(env)
        .filter(([k, v]) => /TWILIO|JAZZCASH|SERVICE_ROLE|SECRET|PASSWORD|SMTP|PRIVATE/i.test(k) && v.trim())
        .map(([k]) => k);
      if (leaked.length) {
        throw new Error(
          `[Smart Radar] ${leaked.join(', ')} would be shipped to every browser. ` +
            'Remove it from .env and store it as a Supabase Edge Function secret instead.'
        );
      }
    },
  };
}

/**
 * Production builds get a strict Content Security Policy: scripts only from this
 * app (+ Cloudflare Turnstile), network calls only to our Supabase project and the
 * map/geocoding services. Blocks injected scripts and data exfiltration.
 */
function contentSecurityPolicy(mode: string): Plugin {
  let enabled = false;
  let supabase = '';
  return {
    name: 'be-alert-csp',
    configResolved(config) {
      // Not for the Android build: Capacitor injects its own inline bridge script at runtime.
      enabled = config.command === 'build' && mode !== 'android';
      const env = loadEnv(mode, config.envDir || config.root, 'VITE_');
      supabase = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!enabled) return html;
        const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          (m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64')}'`
        );
        const sb = supabase ? [supabase, supabase.replace(/^https:/, 'wss:')] : [];
        const policy = [
          "default-src 'self'",
          // 'wasm-unsafe-eval' lets the on-device CNIC reader (WebAssembly OCR) run; it does not allow JS eval.
          `script-src 'self' 'wasm-unsafe-eval' ${inline.join(' ')} https://challenges.cloudflare.com`,
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' data: https://fonts.gstatic.com",
          `img-src 'self' data: blob: https://*.tile.openstreetmap.org ${supabase}`.trim(),
          `connect-src 'self' ${sb.join(' ')} https://nominatim.openstreetmap.org https://*.googleapis.com https://challenges.cloudflare.com`,
          'frame-src https://challenges.cloudflare.com',
          "worker-src 'self' blob:",
          "manifest-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        return html.replace('<head>', `<head>
    <meta http-equiv="Content-Security-Policy" content="${policy}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />`);
      },
    },
  };
}

/**
 * Service worker for the website: instant loading, offline app shell and smart caching.
 * Not used in the Android build (Capacitor ships the files inside the APK).
 */
function webApp(mode: string) {
  return VitePWA({
    disable: mode === 'android',
    registerType: 'prompt',
    injectRegister: null, // registered from src/components/PwaManager.tsx
    // No web app manifest: the website is a normal site (not installable). The installable
    // app is the Android app on Google Play.
    manifest: false,
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      globIgnores: ['**/screenshots/**', '**/ocr/**', '**/google-callback.html', '**/icon-512.png', '**/maskable-512.png', '**/firebase-messaging-sw.js'],
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/firebase-messaging-sw\.js$/, /google-callback\.html$/],
      cleanupOutdatedCaches: true,
      // A new version takes over the cache straight away (no reload): pages already open keep
      // running, but every new page load — and the Google sign-in return page — gets the latest files.
      skipWaiting: true,
      clientsClaim: true,
      // Personal data (Supabase API) is never cached — only public, shared resources.
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\//,
          handler: 'CacheFirst',
          options: { cacheName: 'map-tiles', expiration: { maxEntries: 400, maxAgeSeconds: 14 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
        },
        {
          urlPattern: /^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//,
          handler: 'CacheFirst',
          options: { cacheName: 'post-images', expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
        },
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
          handler: 'StaleWhileRevalidate',
          options: { cacheName: 'font-css' },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
          handler: 'CacheFirst',
          options: { cacheName: 'font-files', expiration: { maxEntries: 20, maxAgeSeconds: 365 * 24 * 3600 }, cacheableResponse: { statuses: [0, 200] } },
        },
      ],
    },
  });
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // GitHub Pages serves the site from /<repo-name>/; everything else from /.
  const base = '/';
  return {
  base,
  plugins: [react(), guardSecrets(mode), contentSecurityPolicy(mode), webApp(mode)],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          leaflet: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
};
});
