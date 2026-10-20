// GitHub Pages has no SPA rewrites: serve index.html for unknown paths via 404.html,
// and disable Jekyll so files/folders starting with "_" are published.
// Public pages that outside services check (Google Play privacy policy link) also get
// a real copy so they answer 200 instead of the 404 fallback.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

copyFileSync('dist/index.html', 'dist/404.html');
for (const page of ['privacy', 'terms', 'delete-account', 'child-safety']) {
  mkdirSync(`dist/${page}`, { recursive: true });
  copyFileSync('dist/index.html', `dist/${page}/index.html`);
}
writeFileSync('dist/.nojekyll', '');
console.log('✔ dist/404.html, privacy/, terms/, delete-account/, child-safety/ + .nojekyll written for GitHub Pages');
