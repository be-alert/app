/**
 * Reads the CNIC number printed on a photo of the card, on the user's own device
 * (Tesseract OCR, self-hosted under /ocr/). The photo is never sent anywhere for this.
 *
 * Used to compare the number the user typed with the number on the card:
 *   match       → submitted for review, marked "number matches" for moderators
 *   near        → 1–2 digits differ (usually a blurry photo or a typo): user is asked to check
 *   unreadable  → no CNIC-shaped number found: user is asked to retake the photo
 *   mismatch    → 3+ digits differ: rejected automatically (server records it)
 * The server recomputes the result from `read`, so the client can't simply claim "match";
 * a moderator still compares the photo by eye before approving.
 */
import { BASE_PATH } from '@/config/env';
import { isNative } from './native';

export type CnicCheck = 'match' | 'near' | 'unreadable' | 'mismatch';

export interface CnicRead {
  /** Best 13-digit candidate found on the card, or null. */
  read: string | null;
  /** All CNIC-shaped numbers found (a card can show more than one, e.g. a family number). */
  candidates: string[];
}

/** Where the OCR files live. The Android app loads them from the website (keeps the APK small). */
const OCR_BASE = isNative ? 'https://app.bealert.online/ocr/' : `${BASE_PATH}ocr/`;

// The smallest valid WebAssembly module that uses a SIMD instruction (same probe as wasm-feature-detect).
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

type OcrWorker = Awaited<ReturnType<typeof import('tesseract.js')['createWorker']>>;
let workerPromise: Promise<OcrWorker> | null = null;

function getWorker(): Promise<OcrWorker> {
  workerPromise ??= (async () => {
    const { createWorker, OEM, PSM } = await import('tesseract.js');
    const simd = typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE);
    const worker = await createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${OCR_BASE}worker.min.js`,
      corePath: `${OCR_BASE}${simd ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'}`,
      langPath: OCR_BASE.replace(/\/$/, ''),
      gzip: true,
    });
    // Phone photos carry no DPI; a fixed value avoids guessing (and its console noise).
    await worker.setParameters({ tessedit_char_whitelist: '0123456789-', tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: '300' });
    return worker;
  })().catch((e) => {
    workerPromise = null;
    throw e;
  });
  return workerPromise;
}

/** Start downloading the OCR engine early (e.g. when the verification form opens). */
export function warmUpCnicOcr(): void {
  void getWorker().catch(() => {});
}

/** Number of positions where two 13-digit numbers differ. */
export function digitDiff(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length);
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

/** Compare what the user typed with what was read from the card. */
export function checkCnic(typed: string, r: CnicRead): { check: CnicCheck; read: string | null } {
  if (!r.candidates.length) return { check: 'unreadable', read: null };
  if (r.candidates.includes(typed)) return { check: 'match', read: typed };
  const best = [...r.candidates].sort((x, y) => digitDiff(x, typed) - digitDiff(y, typed))[0];
  return { check: digitDiff(best, typed) <= 2 ? 'near' : 'mismatch', read: best };
}

/**
 * Pull CNIC numbers out of OCR text. The card prints #####-#######-#, but OCR often drops or
 * moves a hyphen ("42101-12345671", "42101-1 2345671"). So: start at a token that begins with the
 * 5-digit area code followed by a separator (or a token of exactly 13 digits), join it with up to
 * two following tokens on the same line, and keep it if that adds up to exactly 13 digits.
 * Dates (12.05.1990) and other numbers can't start such a run.
 */
function extract(text: string): string[] {
  const found = new Set<string>();
  for (const line of text.replace(/[–—]/g, '-').split('\n')) {
    const tokens = line.split(/\s+/).filter(Boolean);
    tokens.forEach((tok, i) => {
      const lone = tok.replace(/\D/g, '');
      if (/^\d{13}$/.test(tok.replace(/[-.]/g, '')) && lone.length === 13) found.add(lone);
      if (!/^\d{5}[-.]/.test(tok)) return;
      let digits = '';
      for (let j = i; j < Math.min(tokens.length, i + 3); j++) {
        digits += tokens[j].replace(/\D/g, '');
        if (digits.length === 13) found.add(digits);
        if (digits.length >= 13) break;
      }
    });
  }
  return [...found].filter((n) => /^[1-7]\d{12}$/.test(n));
}

/** Grayscale + contrast stretch (optionally black-and-white), rotated, scaled so the card text is large enough. */
async function prepare(image: Blob, rotate: 0 | 90 | 180 | 270, binarize = false): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(image);
  const scale = Math.min(2, 2000 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  const side = rotate === 90 || rotate === 270;
  c.width = side ? h : w;
  c.height = side ? w : h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(bmp, -w / 2, -h / 2, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let lo = 255;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    sum += g;
    if (g < lo) lo = g;
    if (g > hi) hi = g;
  }
  const range = Math.max(1, hi - lo);
  const cut = (sum / (d.length / 4)) * 0.75; // ink is clearly darker than the card's average
  for (let i = 0; i < d.length; i += 4) {
    const v = binarize ? (d[i] < cut ? 0 : 255) : ((d[i] - lo) * 255) / range;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Read the CNIC number on a card photo. Upright first, in three ways (grey, black-and-white, block
 * layout), then rotated (cards are often photographed sideways). Stops as soon as it finds the
 * number the user typed, or any number once the upright passes have found one.
 */
export async function readCnicNumber(image: Blob, typed?: string): Promise<CnicRead> {
  const worker = await getWorker();
  const { PSM } = await import('tesseract.js');
  const all: string[] = [];
  const passes: { rotate: 0 | 90 | 180 | 270; bin: boolean; psm: string }[] = [
    { rotate: 0, bin: false, psm: PSM.SPARSE_TEXT },
    { rotate: 0, bin: true, psm: PSM.SPARSE_TEXT },
    { rotate: 0, bin: false, psm: PSM.SINGLE_BLOCK },
    { rotate: 90, bin: false, psm: PSM.SPARSE_TEXT },
    { rotate: 270, bin: false, psm: PSM.SPARSE_TEXT },
    { rotate: 180, bin: false, psm: PSM.SPARSE_TEXT },
  ];
  for (const p of passes) {
    await worker.setParameters({ tessedit_pageseg_mode: p.psm as never });
    const { data } = await worker.recognize(await prepare(image, p.rotate, p.bin));
    for (const n of extract(data.text)) if (!all.includes(n)) all.push(n);
    if (typed && all.includes(typed)) break;
    // Without a typed number, the first upright reading is enough. With one, try every upright
    // treatment first (a misread digit often comes out right in another); rotate only if nothing was found.
    if (all.length && (!typed || p.psm === PSM.SINGLE_BLOCK)) break;
  }
  const best = typed && all.includes(typed) ? typed : (all[0] ?? null);
  return { read: best, candidates: all };
}
