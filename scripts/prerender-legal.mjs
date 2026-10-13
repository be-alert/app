// Bake the Privacy Policy and Terms text into dist/privacy/ and dist/terms/.
// Reviewers (Google brand verification, Play Console) read the raw HTML without running
// JavaScript, so these two pages must contain their full text, not an empty app shell.
// The app still takes over as usual once its script loads.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const mode = process.argv[2] ?? 'pages';
const vite = await createServer({
  mode,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  // These pages only need plain links: swap the router for a tiny stub (scripts/router-stub.mjs).
  resolve: { alias: [{ find: /^react-router-dom$/, replacement: fileURLToPath(new URL('./router-stub.mjs', import.meta.url)) }] },
});

try {
  const legal = await vite.ssrLoadModule('/src/screens/Legal.tsx');
  const pages = [
    { dir: 'privacy', component: legal.PrivacyPolicy, title: 'Privacy Policy', description: 'How Be Alert collects, uses and protects your information.' },
    { dir: 'terms', component: legal.TermsOfUse, title: 'Terms of Use', description: 'The rules for using Be Alert.' },
    { dir: 'delete-account', component: legal.DeleteAccount, title: 'Delete your account', description: 'How to permanently delete your Be Alert account and data.' },
  ];
  for (const p of pages) {
    const body = renderToStaticMarkup(createElement(p.component));
    if (body.length < 2000) throw new Error(`${p.dir}: rendered text looks too short (${body.length} chars)`);
    const file = `dist/${p.dir}/index.html`;
    const html = readFileSync(file, 'utf8')
      .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
      .replace(/<title>[^<]*<\/title>/, `<title>${p.title} — Be Alert</title>`)
      .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${p.description}"`);
    if (!html.includes(body)) throw new Error(`${file}: could not find the empty #root to fill`);
    writeFileSync(file, html);
  }
  console.log('✔ privacy/, terms/ and delete-account/ prerendered with their full text');
} finally {
  await vite.close();
}
