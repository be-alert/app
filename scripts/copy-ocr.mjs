// Self-host the OCR engine used to read the number on a CNIC photo (src/lib/cnicOcr.ts).
// Copied into public/ocr/ before each build instead of loading from a CDN: the files then come
// from our own domain (strict CSP) and nothing about the user's ID card touches a third party.
// Only the two LSTM cores we pick from are shipped (with/without SIMD) plus the compact English model.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';

const out = 'public/ocr';
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
  // Their licences travel with them (Apache-2.0 asks for this).
  ['node_modules/tesseract.js/LICENSE.md', 'LICENSE-tesseract.js.txt'],
  ['node_modules/tesseract.js-core/LICENSE', 'LICENSE-tesseract.js-core.txt'],
];

mkdirSync(out, { recursive: true });
for (const [from, to] of files) {
  const dest = `${out}/${to}`;
  if (existsSync(dest) && statSync(dest).size === statSync(from).size) continue;
  copyFileSync(from, dest);
}
console.log('✔ OCR engine copied to public/ocr/');
