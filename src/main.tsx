import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { validateEnv } from '@/config/validate-env';
import { handleGoogleCallback } from '@/lib/googleCallback';

// Never run inside another site's frame (clickjacking): GitHub Pages can't send frame-ancestors.
const framed = window.self !== window.top;
if (framed) {
  document.documentElement.style.display = 'none';
  try {
    window.top!.location.replace(window.location.href);
  } catch {
    /* sandboxed frame: stay blank */
  }
}

// Logs warnings for missing configuration — never crashes.
validateEnv();

if (!framed && !handleGoogleCallback()) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
