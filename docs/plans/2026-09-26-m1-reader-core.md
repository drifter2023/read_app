# M1 · Reader Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a bundled book (*The Great Gatsby*) in the Spotlight reader on iOS and mobile web. The Reader 4a focus band must be exact, scroll at 60fps, fall back to a cheaper mode on slow devices, and restore the reading position after a restart or a font-size change.

**Architecture:**
- **Book import.** At build time, a script converts the bundled EPUBs to JSON. On first launch the app copies that JSON into SQLite `user.db`.
- **Reader engine.** A framework-free `ReaderEngine` in `src/core/reader/` owns the scroll container. It measures each chapter once into fixed-height line elements (the **line table**). On scroll it writes `filter` and `opacity` straight to the lines inside ±1 viewport.
- **React.** React renders only the static chrome (eyebrow, masks) and never the body lines.

**Tech Stack:** Vite 8, React 19, TypeScript 7 (strict), Vitest 5 (node + browser mode via Playwright), @playwright/test, Capacitor 8 (iOS only), @capacitor-community/sqlite 8 (jeep-sqlite on web), JSZip + linkedom, @fontsource.

**Spec:**
- `README.md` (the implementation spec; it wins over the design docs)
- `TASKS.md` M1 items 1–7
- `CLAUDE.md` (rules)
- `reference/reader-prototype.ts` (behaviour reference)
- `spec.mvp.json`
- `docs/research/english-chinese-dictionary.md` (only for storage decisions)

## Changes made during implementation (2026-09-26)

- **Web database:** jeep-sqlite was replaced by `src/core/db/web.ts`: sql.js 1.14 in memory, with the file saved to IndexedDB (debounced 300 ms, flushed when the page is hidden).
  - jeep-sqlite 2.8.0 (Aug 2024) ships sql.js glue that doesn't match the current `sql-wasm.wasm`.
  - Even with the versions pinned, its `initWebStore()` hung on every reload after the first.
  - `openCapacitorDb` is now native-only, and `boot()` picks the adapter with `Capacitor.isNativePlatform()`. `scripts/copy-wasm.ts` was dropped.
  - Revisit in M2 alongside `dict.db` (official sqlite-wasm + OPFS).
- **Engine:** `#setWindow` saves `scrollTop` before mutating the DOM, because removing a chapter above clamps `scrollTop` at the next layout. `.rd-scroll` also sets `overflow-anchor: none`.
- **linkedom:** `getElementsByTagName('*')` is empty for XML documents, so `tagText` uses `querySelectorAll('*')`.
- **Line breaking:** WebKit breaks at an em-dash even next to U+2060, so `breakLines` also checks inside words containing `- ‐ ‑ – — /`, not only words of 24+ characters. This was found on the simulator (Gatsby, “unsought—frequently”) and is now pinned by a browser test.
- **Standard Ebooks subtitles** keep their no-break space ("Spade\u00a0& Archer"), so the test expectation was adjusted.

## Global Constraints

- **Targets:** iOS (Capacitor) and mobile web. **No Android.** App name `Spotlight`, bundle ID `com.lin.spotlight`.
- **Zero network requests at runtime.** Fonts and books are bundled, and nothing may reference Google Fonts or a CDN.
- **TypeScript:**
  - `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly` (no enums, no constructor parameter properties).
  - Core modules import siblings with explicit `.ts` extensions, so Node can run them directly.
- **Layering:**
  - Domain code lives in `src/core/{library,ingest,reader,prefs,db}` and must not import React.
  - Views live in `src/views/` and call module APIs only.
- **Body lines:**
  - Never re-render body lines through React on scroll.
  - Never call `getBoundingClientRect`, `getClientRects` or `offsetTop` per line per frame.
  - Build the line table once per layout.
- **Easing:** one curve everywhere, `cubic-bezier(.42,0,.58,1)`.
- **Reader page:**
  - Background `#faf8f3`. Ink `#221f1b`. Side padding `34px`.
  - Body text Newsreader. Sizes S `17.5/30`, M `19.5/34` (default), L `22/38`.
  - Every line is exactly one line-height tall.
  - Paragraphs open with an em-space ` `.
- **Focus band (R-01):**
  - `half = H*focusPct/200`, with focusPct clamped to 10–90 at runtime
  - `ramp = max(1, H/2 - half)`
  - `t = clamp((|lineMid - viewMid| - half)/ramp, 0, 1)`
  - `blur = blurMax*t`, quantised to 0.5px
  - `opacity = 1 - 0.85*t`
  - sentence mode: `t = min(1, t + 0.18)` for lines outside the current sentence
  - Defaults: focusPct 30, blurMax 7. Only lines within ±1 viewport are processed.
  - Budget: ≤ 4ms per frame, 60fps, < 2% dropped frames.
- **Settings ranges:** focusPct 20–80 in steps of 5; blurMax 2–14; `tier` is `full`, `fallback` or unset. The first-launch probe sets `tier`.
- **Fallback tier:** no per-line blur. Two static `backdrop-filter` layers (top and bottom) plus per-line opacity.
- **Eyebrow:**
  - `top:58px`, IBM Plex Sans 11px, letter-spacing `.14em`, `rgba(34,31,27,.38)`.
  - Left: chapter name in uppercase. Right: live percentage, minimum 1%.
- **Fade masks:** top 150px `linear-gradient(#faf8f3 22%, transparent)`; bottom 130px `linear-gradient(transparent, #faf8f3 72%)`.
- **Position (R-07):**
  - The anchor is the first sentence inside the band. Save it with a 1s debounce.
  - After an app kill or a font-size change, the same paragraph must be back inside the band.
- **Tests:** every task cites an acceptance ID where one applies, and has a test or a measurable check.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions where the spec is silent or self-contradictory

These are deliberate; do not "fix" them back.

1. **Vertical padding is computed as `H/2 − lineHeight/2`, not the CSS `45%`.** In CSS, percentage padding is relative to the *width*: 45% of 402px is 181px, while the viewport centre is at about 437px. With `45%`, the first line could never reach the band, which contradicts the README's stated purpose. Horizontal padding stays `34px`.
2. **Reading percentage uses word counts:** `wordEnd(line at centre) ÷ book.wordCount`. `scrollHeight` can't be used because only chapter ±1 is mounted.
3. **Paragraph gap is one empty line of line-height**, as in the prototype, where paragraphs were separated by a ` ` line.
4. **Each chapter opens with three lines:** blank, a heading line (e.g. `Chapter I · Spade & Archer`, IBM Plex Sans 11px uppercase `.14em` at 62% ink, centred), blank. The heading line is in the line table, so it blurs like any other line.
5. **EPUB parsing uses `linkedom`, not the browser `DOMParser`.** `DOMParser` doesn't exist in Web Workers, and M3 must parse imports inside a worker. The same parser runs in the Node build script.
6. **Standard Ebooks puts U+FEFF next to em-dashes.** `normaliseText` turns it into U+2060 (word joiner) so line breaking and word counts behave.
7. **`Intl.Segmenter` splits sentences, followed by an abbreviation merge** (it wrongly splits after "Mr.", "St." and single initials).
8. **`will-change: filter, opacity` is set only on lines inside the paint window**, never on every line. Thousands of compositing layers would exhaust iOS memory.
9. **On web, `user.db` uses the plugin's jeep-sqlite backend in M1.** `dict.db` on web (sqlite-wasm) is an M2 decision.
10. **In M1 the app opens a book directly:** `?book=<id>`, else the most recently opened book, else `gatsby`. Home is M3.

## Review Focus

These are the failure modes most likely to bite a reader that no single happy-path test covers. Each one has a pinned test in the owning task.

1. **Viewport height changes while reading.** Examples: the iOS Safari toolbar collapsing, rotation, split view. The band must re-centre and the same sentence must stay in the band. *(Task 8, test "keeps the anchor when the viewport height changes")*
2. **A token wider than the column** (a URL, a long dash run). It must break inside the word, and no line may overflow or grow taller. *(Task 7, test "breaks inside a word wider than the column")*
3. **Laying out before the webfont is ready** gives wrong line breaks that never heal. `mount()` must await the fonts. *(Task 8, test "mount waits for the body font")*
4. **The very start and end of a book.** The first and last lines must be able to reach the band, and the percentage shows 1% at the start and 100% at the end. *(Task 8, test "first and last lines reach the band; pct is 1 then 100")*
5. **The app backgrounded or killed within the 1s debounce.** The position must still be saved. *(Task 10, test "flush saves immediately"; Task 11 wires `visibilitychange`/`pagehide`)*

---

## File structure

```
index.html                         viewport-fit=cover, no external links
package.json / tsconfig.json / vite.config.ts / vitest.config.ts / playwright.config.ts / capacitor.config.ts
scripts/build-books.ts             EPUB → public/books/<id>.json (runs before dev/build)
scripts/copy-wasm.ts               postinstall: sql-wasm.wasm → public/assets/ (jeep-sqlite)
src/main.tsx, src/App.tsx
src/styles/fonts.css tokens.css reader.css
src/core/types.ts                  shared data types
src/core/motion.ts                 EASE + durations
src/core/ingest/text.ts            normalise, sentences, word count, paragraph text
src/core/ingest/epub.ts            parseEpub (JSZip + linkedom)
src/core/library/bundled.ts        the 3 bundled books
src/core/library/library.ts        Book/Chapter rows, seeding
src/core/db/types.ts migrations.ts capacitor.ts
src/core/prefs/prefs.ts            subscribable settings store
src/core/reader/focus.ts           pure focus-band maths
src/core/reader/layout.ts          line breaking + chapter layout
src/core/reader/engine.ts          ReaderEngine
src/core/reader/probe.ts           first-launch performance probe
src/core/reader/position.ts        Position persistence + debounced saver
src/app/boot.ts devtools.ts        startup wiring, ?dev=1 handle
src/views/ReaderView.tsx FpsMeter.tsx DevPanel.tsx
tests/unit/** (node) · tests/browser/** (Vitest browser: WebKit + Chromium) · tests/e2e/** (Playwright) · tests/helpers/nodeDb.ts
ios/                               generated by Capacitor (Task 12)
```

---

### Task 1: Web scaffold, fonts, tokens and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/fonts.css`, `src/styles/tokens.css`, `src/core/motion.ts`
- Test: `tests/unit/motion.test.ts`, `tests/browser/fonts.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `EASE: string`, `MOTION: { drawerOpen, drawerClose, contentIn, contentOut, bookOut, bookExpand, coverFade, pageFade, bookBack, chrome }` (ms) from `src/core/motion.ts`
- Produces: CSS custom properties `--paper`, `--reader-ink`, `--home-bg`, `--ink`, `--accent`, `--ease`
- Produces: the font family names `'Newsreader Variable'` and `'IBM Plex Sans'`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "spotlight",
  "private": true,
  "type": "module",
  "scripts": {
    "books": "node scripts/build-books.ts",
    "predev": "npm run books",
    "dev": "vite",
    "prebuild": "npm run books",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --port 4173 --strictPort",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:browser": "vitest run --project browser",
    "e2e": "playwright test"
  }
}
```

`books` fails until Task 3. Until then, run `vite` and `vite build` directly.

- [ ] **Step 2: Install dependencies**

```bash
npm i react react-dom @fontsource-variable/newsreader @fontsource/ibm-plex-sans
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node vitest @vitest/browser-playwright playwright @playwright/test
npx playwright install webkit chromium
ls node_modules/@fontsource-variable/newsreader/*.css
```

The `ls` must list `opsz.css`. It is the optical-size variable face, which matches the prototype's `opsz` axis. If it isn't there, use the file whose name contains `opsz`, and update Step 5 to match.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src", "tests", "scripts", "*.config.ts"]
}
```

- [ ] **Step 4: Create `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works from capacitor://localhost and from any sub-path.
export default defineConfig({ plugins: [react()], base: './', build: { target: 'safari16' } });
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['tests/unit/**/*.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.ts'],
          browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'webkit' }, { browser: 'chromium' }] },
        },
      },
    ],
  },
});
```

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
  projects: [
    { name: 'webkit-phone', use: { browserName: 'webkit', viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
  ],
});
```

- [ ] **Step 5: Create the styles, the motion constants and the entry points**

```css
/* src/styles/fonts.css — bundled locally; the app makes no network requests */
@import '@fontsource-variable/newsreader/opsz.css';
@import '@fontsource/ibm-plex-sans/400.css';
@import '@fontsource/ibm-plex-sans/500.css';
```

```css
/* src/styles/tokens.css */
:root {
  --paper: #faf8f3;
  --reader-ink: #221f1b;
  --home-bg: #fbfaf8;
  --ink: #16150f;
  --accent: #c1452f;
  --ease: cubic-bezier(.42, 0, .58, 1);
}
html, body { margin: 0; height: 100%; background: var(--paper); -webkit-text-size-adjust: 100%; }
body { font-family: 'IBM Plex Sans', 'PingFang SC', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
```

```ts
// src/core/motion.ts
/** The single easing curve for the whole app. */
export const EASE = 'cubic-bezier(.42,0,.58,1)';

/** Durations in ms, from README → Motion. */
export const MOTION = {
  drawerOpen: 330, drawerClose: 250, contentIn: 250, contentOut: 138,
  bookOut: 220, bookExpand: 460, coverFade: 300, pageFade: 320, bookBack: 300, chrome: 220,
} as const;
```

```html
<!-- index.html -->
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#faf8f3" />
    <title>Spotlight</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```

```tsx
// src/App.tsx — placeholder until Task 11
export function App() {
  return <p style={{ fontFamily: "'Newsreader Variable', serif", padding: 34 }}>Spotlight</p>;
}
```

Append to `.gitignore`:
```
public/books/
public/assets/sql-wasm.wasm
test-results/
playwright-report/
```

- [ ] **Step 6: Write the tests**

```ts
// tests/unit/motion.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EASE, MOTION } from '../../src/core/motion.ts';

const spec = JSON.parse(readFileSync('spec.mvp.json', 'utf8')) as { ease: string; motion: Record<string, number> };

describe('motion constants match spec.mvp.json', () => {
  it('uses the single easing curve', () => expect(EASE).toBe(spec.ease));
  it('uses the spec durations', () => expect({ ...MOTION }).toEqual(spec.motion));
});
```

```ts
// tests/browser/fonts.test.ts
import '../../src/styles/fonts.css';
import { expect, it } from 'vitest';

it('loads the body and label fonts from the bundle', async () => {
  await document.fonts.load('19.5px "Newsreader Variable"');
  await document.fonts.load('11px "IBM Plex Sans"');
  expect(document.fonts.check('19.5px "Newsreader Variable"')).toBe(true);
  expect(document.fonts.check('11px "IBM Plex Sans"')).toBe(true);
});
```

- [ ] **Step 7: Run everything**

Run: `npx vitest run` → Expected: 4 tests passed (2 unit tests; 1 browser test × WebKit and Chromium).
Run: `npx tsc --noEmit && npx vite build` → Expected: build succeeds; `grep -r "googleapis" dist` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Scaffold Vite + React + TS strict app with bundled fonts and test harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Text utilities (normalise, sentences, words)

**Files:**
- Create: `src/core/types.ts`, `src/core/ingest/text.ts`
- Test: `tests/unit/text.test.ts`

**Interfaces:**
- Produces (`src/core/types.ts`):
```ts
export type Paragraph = string[];                  // sentences; paragraph text = INDENT + sentences.join(' ')
export interface ParsedChapter { title: string; paras: Paragraph[]; wordCount: number }
export interface ParsedBook { id: string; title: string; author: string; chapters: ParsedChapter[]; wordCount: number }
export interface ChapterData { idx: number; title: string; paras: Paragraph[]; wordStart: number }
export interface Anchor { chapter: number; para: number; sentence: number }
```
- Produces (`src/core/ingest/text.ts`):
  - `INDENT = ' '`
  - `normaliseText(s: string): string`
  - `splitSentences(para: string): string[]`
  - `countWords(s: string): number`
  - `paragraphText(p: Paragraph): string`
  - `sentenceStarts(p: Paragraph): number[]` (offsets into `paragraphText(p)`)

- [ ] **Step 1: Write `src/core/types.ts`** with exactly the interface block above, plus a one-line doc comment on each type.

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/text.test.ts
import { describe, expect, it } from 'vitest';
import { countWords, INDENT, normaliseText, paragraphText, sentenceStarts, splitSentences } from '../../src/core/ingest/text.ts';

describe('normaliseText', () => {
  it('collapses whitespace and trims', () => expect(normaliseText('  a\n\t b  ')).toBe('a b'));
  it('keeps no-break spaces', () => expect(normaliseText('Mr. Spade')).toBe('Mr. Spade'));
  it('turns Standard Ebooks U+FEFF into a word joiner', () => expect(normaliseText('down﻿—from')).toBe('down⁠—from'));
});

describe('splitSentences', () => {
  const p = '“Whenever you feel like criticizing anyone,” he told me, “just remember.” Mr. Gatsby said so. Then St. Louis was far. J. B. Smith came. He said: “Yes, sweetheart?” She left!';
  const s = splitSentences(p);
  it('merges splits after abbreviations and initials', () =>
    expect(s).toEqual([
      '“Whenever you feel like criticizing anyone,” he told me, “just remember.”',
      'Mr. Gatsby said so.',
      'Then St. Louis was far.',
      'J. B. Smith came.',
      'He said: “Yes, sweetheart?”',
      'She left!',
    ]));
  it('joins back to the input', () => expect(s.join(' ')).toBe(p));
  it('returns [] for empty text', () => expect(splitSentences('')).toEqual([]));
});

describe('countWords', () => {
  it('counts contractions and hyphenated words once', () => expect(countWords("I’ve a well-known v-shaped jaw, don't you?")).toBe(7));
  it('ignores punctuation-only tokens', () => expect(countWords('— … “ ”')).toBe(0));
});

describe('paragraph offsets', () => {
  it('opens with an em-space and records sentence starts', () => {
    const p = ['One two.', 'Three.'];
    expect(paragraphText(p)).toBe(`${INDENT}One two. Three.`);
    expect(sentenceStarts(p)).toEqual([1, 10]);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run --project unit tests/unit/text.test.ts` → Expected: FAIL, cannot find module `text.ts`.

- [ ] **Step 4: Implement `src/core/ingest/text.ts`**

```ts
import type { Paragraph } from '../types.ts';

export const INDENT = ' ';

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'mt', 'jr', 'sr', 'prof', 'capt', 'col', 'gen', 'lt', 'sgt',
  'rev', 'hon', 'vs', 'no', 'co', 'inc', 'ltd', 'messrs', 'mme', 'mlle', 'ave', 'etc',
]);

/** Collapses ASCII whitespace (keeps U+00A0) and maps Standard Ebooks' U+FEFF to a word joiner. */
export function normaliseText(s: string): string {
  return s.replace(/﻿/g, '⁠').replace(/[ \t\n\r\f]+/g, ' ').trim();
}

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

/** Sentences of one paragraph; `result.join(' ')` equals the normalised input. */
export function splitSentences(para: string): string[] {
  const out: string[] = [];
  for (const { segment } of segmenter.segment(para)) {
    const s = segment.trim();
    if (!s) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && endsWithAbbreviation(prev)) out[out.length - 1] = `${prev} ${s}`;
    else out.push(s);
  }
  return out;
}

function endsWithAbbreviation(s: string): boolean {
  const m = /(?:^|[\s“"'(])([A-Za-z]+)\.$/.exec(s);
  if (!m) return false;
  const w = m[1]!;
  return ABBREVIATIONS.has(w.toLowerCase()) || (w.length === 1 && w === w.toUpperCase());
}

const WORD = /[A-Za-z0-9]+(?:['’⁠-][A-Za-z0-9]+)*/g;

export function countWords(s: string): number {
  return s.match(WORD)?.length ?? 0;
}

export function paragraphText(p: Paragraph): string {
  return INDENT + p.join(' ');
}

/** Offset of each sentence inside `paragraphText(p)`. */
export function sentenceStarts(p: Paragraph): number[] {
  const out: number[] = [];
  let at = INDENT.length;
  for (const s of p) {
    out.push(at);
    at += s.length + 1;
  }
  return out;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project unit tests/unit/text.test.ts` → Expected: PASS.
If the `J. B. Smith` case fails because the Segmenter doesn't split there at all, the expected array is still correct; only a failing `join` indicates a real bug.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/ingest/text.ts tests/unit/text.test.ts
git commit -m "Add text utilities: normalise, sentence split, word count" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: EPUB parser and bundled-book build script

**Files:**
- Create: `src/core/ingest/epub.ts`, `src/core/library/bundled.ts`, `scripts/build-books.ts`
- Test: `tests/unit/epub.test.ts`

**Interfaces:**
- Consumes: `normaliseText`, `splitSentences`, `countWords` (Task 2); `ParsedBook`, `ParsedChapter` (Task 2)
- Produces:
  - `parseEpub(bytes: Uint8Array | ArrayBuffer, id: string): Promise<ParsedBook>`
  - `class EpubError extends Error`, whose message is plain Chinese for the user
  - `BUNDLED: readonly { id: 'gatsby' | 'farewell' | 'falcon'; epub: string }[]`
  - Files `public/books/<id>.json`, each a `ParsedBook`

- [ ] **Step 1: Install**

```bash
npm i jszip linkedom
```

- [ ] **Step 2: Write the failing test** (it uses the real EPUBs in `books/`)

```ts
// tests/unit/epub.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEpub } from '../../src/core/ingest/epub.ts';

const load = (f: string) => parseEpub(readFileSync(`books/${f}`), 'x');

describe('parseEpub (Standard Ebooks)', () => {
  it('reads The Great Gatsby body chapters only', async () => {
    const b = await load('f-scott-fitzgerald_the-great-gatsby.epub');
    expect(b.title).toBe('The Great Gatsby');
    expect(b.author).toBe('F. Scott Fitzgerald');
    expect(b.chapters).toHaveLength(9);
    expect(b.chapters[0]!.title).toBe('Chapter I');
    expect(b.chapters[0]!.paras[0]![0]).toMatch(/^In my younger and more vulnerable years/);
    expect(b.wordCount).toBeGreaterThan(45_000);
    expect(b.wordCount).toBeLessThan(50_000);
  });

  it('reads chapter subtitles (The Maltese Falcon)', async () => {
    const b = await load('dashiell-hammett_the-maltese-falcon.epub');
    expect(b.chapters).toHaveLength(20);
    expect(b.chapters[0]!.title).toBe('Chapter I · Spade & Archer');
  });

  it('skips part pages without paragraphs (A Farewell to Arms)', async () => {
    const b = await load('ernest-hemingway_a-farewell-to-arms.epub');
    expect(b.chapters).toHaveLength(41);
    expect(b.wordCount).toBeGreaterThan(80_000);
    expect(b.wordCount).toBeLessThan(92_000);
  });

  it('leaves no U+FEFF and no empty sentences', async () => {
    const b = await load('dashiell-hammett_the-maltese-falcon.epub');
    const json = JSON.stringify(b);
    expect(json).not.toContain('﻿');
    for (const c of b.chapters) for (const p of c.paras) for (const s of p) expect(s.trim().length).toBeGreaterThan(0);
  });

  it('rejects a file that is not an EPUB with a readable reason', async () => {
    await expect(parseEpub(new TextEncoder().encode('hello'), 'x')).rejects.toThrow(/EPUB/);
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run --project unit tests/unit/epub.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/core/ingest/epub.ts`**

```ts
import JSZip from 'jszip';
import { DOMParser } from 'linkedom';
import type { ParsedBook, ParsedChapter } from '../types.ts';
import { countWords, normaliseText, splitSentences } from './text.ts';

/** Thrown with a message that can be shown to the user as-is. */
export class EpubError extends Error {}

const SKIP = /\b(frontmatter|backmatter|titlepage|halftitlepage|imprint|colophon|copyright-page|toc|dedication|epigraph|loi|endnotes)\b/;
const ROMAN = /^[IVXLCDM]+$/;

export async function parseEpub(bytes: Uint8Array | ArrayBuffer, id: string): Promise<ParsedBook> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new EpubError('这不是有效的 EPUB 文件');
  }
  const container = await readText(zip, 'META-INF/container.xml');
  const opfPath = /full-path="([^"]+)"/.exec(container)?.[1];
  if (!opfPath) throw new EpubError('EPUB 缺少目录文件（container.xml）');
  if (await hasDrm(zip)) throw new EpubError('这本书有 DRM 加密，无法导入');

  const opf = parse(await readText(zip, opfPath), 'text/xml');
  const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const manifest = new Map<string, string>();
  for (const item of Array.from(opf.querySelectorAll('item'))) {
    const itemId = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (itemId && href) manifest.set(itemId, resolvePath(base, href));
  }

  const chapters: ParsedChapter[] = [];
  for (const ref of Array.from(opf.querySelectorAll('itemref'))) {
    const path = manifest.get(ref.getAttribute('idref') ?? '');
    if (!path || !zip.file(path)) continue;
    const ch = readChapter(parse(await readText(zip, path), 'text/html'));
    if (ch) chapters.push(ch);
  }
  if (chapters.length === 0) throw new EpubError('这本 EPUB 里没有找到正文');

  return {
    id,
    title: normaliseText(tagText(opf, 'dc:title')) || id,
    author: normaliseText(tagText(opf, 'dc:creator')),
    chapters,
    wordCount: chapters.reduce((n, c) => n + c.wordCount, 0),
  };
}

function readChapter(doc: Document): ParsedChapter | null {
  const body = doc.querySelector('body');
  if (!body) return null;
  const section = body.querySelector('section, article');
  const types = `${body.getAttribute('epub:type') ?? ''} ${section?.getAttribute('epub:type') ?? ''}`;
  if (SKIP.test(types)) return null;

  for (const br of Array.from(body.querySelectorAll('br'))) br.parentNode?.replaceChild(doc.createTextNode(' '), br);
  const paras = Array.from(body.querySelectorAll('p'))
    .filter((p) => !p.closest('hgroup, header, figcaption, nav'))
    .map((p) => normaliseText(p.textContent ?? ''))
    .filter((t) => t.length > 0)
    .map(splitSentences);
  if (paras.length === 0) return null;

  return { title: chapterTitle(doc), paras, wordCount: paras.reduce((n, p) => n + countWords(p.join(' ')), 0) };
}

function chapterTitle(doc: Document): string {
  const head = normaliseText(doc.querySelector('h1, h2, h3, h4, h5, h6')?.textContent ?? '');
  const sub = Array.from(doc.querySelectorAll('hgroup p'))
    .map((p) => normaliseText(p.textContent ?? ''))
    .filter(Boolean)
    .join(' ');
  const main = ROMAN.test(head) ? `Chapter ${head}` : head || normaliseText(doc.querySelector('title')?.textContent ?? '');
  return sub ? `${main} · ${sub}` : main;
}

async function hasDrm(zip: JSZip): Promise<boolean> {
  const f = zip.file('META-INF/encryption.xml');
  if (!f) return false;
  // Font obfuscation also uses encryption.xml; only encrypted text documents mean DRM.
  return /URI="[^"]+\.x?html?"/i.test(await f.async('string'));
}

async function readText(zip: JSZip, path: string): Promise<string> {
  const f = zip.file(path);
  if (!f) throw new EpubError(`EPUB 缺少文件：${path}`);
  return f.async('string');
}

function parse(src: string, type: 'text/xml' | 'text/html'): Document {
  return new DOMParser().parseFromString(src, type) as unknown as Document;
}

function tagText(doc: Document, qualifiedName: string): string {
  const local = qualifiedName.split(':')[1] ?? qualifiedName;
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.tagName === qualifiedName || el.localName === local) return el.textContent ?? '';
  }
  return '';
}

function resolvePath(base: string, href: string): string {
  const parts = (base + decodeURIComponent(href.split('#')[0] ?? '')).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project unit tests/unit/epub.test.ts` → Expected: PASS.
If `tagText` returns '' under linkedom, log `Array.from(opf.getElementsByTagName('*')).slice(0, 12).map((e) => e.tagName)` to see the names it produces, and match on those. Keep the fix inside `tagText`.

- [ ] **Step 6: Add the bundled list and the build script**

```ts
// src/core/library/bundled.ts
/** Books shipped with the app (README → Assets). Order is shelf order for first launch. */
export const BUNDLED = [
  { id: 'gatsby', epub: 'books/f-scott-fitzgerald_the-great-gatsby.epub' },
  { id: 'farewell', epub: 'books/ernest-hemingway_a-farewell-to-arms.epub' },
  { id: 'falcon', epub: 'books/dashiell-hammett_the-maltese-falcon.epub' },
] as const;
```

```ts
// scripts/build-books.ts — converts bundled EPUBs to public/books/<id>.json
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEpub } from '../src/core/ingest/epub.ts';
import { BUNDLED } from '../src/core/library/bundled.ts';

await mkdir('public/books', { recursive: true });
for (const b of BUNDLED) {
  const book = await parseEpub(await readFile(b.epub), b.id);
  await writeFile(`public/books/${b.id}.json`, JSON.stringify(book));
  console.log(`${b.id}: ${book.chapters.length} chapters, ${book.wordCount} words`);
}
```

- [ ] **Step 7: Run the script**

Run: `npm run books` → Expected: three lines (for example `gatsby: 9 chapters, 4xxxx words`) and three files in `public/books/`.

- [ ] **Step 8: Commit**

```bash
git add src/core/ingest/epub.ts src/core/library/bundled.ts scripts/build-books.ts tests/unit/epub.test.ts package.json package-lock.json
git commit -m "Parse EPUB 2/3 with JSZip + linkedom; build bundled books to JSON" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: SQLite layer with migrations

**Files:**
- Create: `src/core/db/types.ts`, `src/core/db/migrations.ts`, `src/core/db/capacitor.ts`, `scripts/copy-wasm.ts`, `tests/helpers/nodeDb.ts`
- Test: `tests/unit/migrations.test.ts`
- Modify: `package.json` (add a `postinstall` script)

**Interfaces:**
- Produces:
```ts
export type SqlValue = string | number | null;
export interface Db {
  exec(sql: string): Promise<void>;                              // one or more statements, no params
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  tx(fn: () => Promise<void>): Promise<void>;                    // not re-entrant
}
export const MIGRATIONS: readonly string[];
export function migrate(db: Db, migrations?: readonly string[]): Promise<number>;   // returns the schema version
export function openCapacitorDb(name: string): Promise<Db>;      // iOS: native plugin; web: jeep-sqlite + IndexedDB
export function nodeDb(): Db;                                     // tests only, node:sqlite in memory
```
- Schema v1 (column names are snake_case; row mappers alias them to camelCase):
  - `book(id, title, author, cover, color, format, word_count, status, pct, added_at, opened_at, finished_at)`
  - `chapter(book_id, idx, title, paras, word_start)`
  - `position(book_id, chapter, para, sentence, updated_at)`
  - `settings(key, value)`
  - `lookup` arrives in M2 as migration 2.

- [ ] **Step 1: Install**

```bash
npm i @capacitor/core @capacitor-community/sqlite jeep-sqlite
```

- [ ] **Step 2: Write `src/core/db/types.ts`** with the `SqlValue` and `Db` declarations above.

- [ ] **Step 3: Write the node test adapter**

```ts
// tests/helpers/nodeDb.ts
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlValue } from '../../src/core/db/types.ts';

export function nodeDb(): Db {
  const d = new DatabaseSync(':memory:');
  d.exec('PRAGMA foreign_keys = ON');
  return {
    async exec(sql) { d.exec(sql); },
    async run(sql, params: SqlValue[] = []) { d.prepare(sql).run(...params); },
    async all<T>(sql: string, params: SqlValue[] = []) { return d.prepare(sql).all(...params) as T[]; },
    async tx(fn) {
      d.exec('BEGIN');
      try { await fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; }
    },
  };
}
```

- [ ] **Step 4: Write the failing test**

```ts
// tests/unit/migrations.test.ts
import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from '../../src/core/db/migrations.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

describe('migrate', () => {
  it('creates schema v1 and records user_version', async () => {
    const db = nodeDb();
    expect(await migrate(db)).toBe(MIGRATIONS.length);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['book', 'chapter', 'position', 'settings']));
  });

  it('is idempotent', async () => {
    const db = nodeDb();
    await migrate(db);
    expect(await migrate(db)).toBe(MIGRATIONS.length);
  });

  it('rolls back a failing migration and keeps the old version', async () => {
    const db = nodeDb();
    await expect(migrate(db, ['CREATE TABLE a (x INTEGER);', 'CREATE TABLE broken ('])).rejects.toThrow();
    const [row] = await db.all<{ user_version: number }>('PRAGMA user_version');
    expect(row!.user_version).toBe(1);
    expect(await db.all("SELECT name FROM sqlite_master WHERE name='broken'")).toEqual([]);
  });
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `npx vitest run --project unit tests/unit/migrations.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 6: Implement `src/core/db/migrations.ts`**

```ts
import type { Db } from './types.ts';

/** Append-only. Never edit a shipped entry; add a new one. */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE book (
     id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, cover TEXT, color INTEGER NOT NULL,
     format TEXT NOT NULL, word_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'reading',
     pct REAL NOT NULL DEFAULT 0, added_at INTEGER NOT NULL, opened_at INTEGER, finished_at INTEGER);
   CREATE TABLE chapter (
     book_id TEXT NOT NULL REFERENCES book(id) ON DELETE CASCADE, idx INTEGER NOT NULL, title TEXT NOT NULL,
     paras TEXT NOT NULL, word_start INTEGER NOT NULL, PRIMARY KEY (book_id, idx));
   CREATE TABLE position (
     book_id TEXT PRIMARY KEY REFERENCES book(id) ON DELETE CASCADE, chapter INTEGER NOT NULL,
     para INTEGER NOT NULL, sentence INTEGER NOT NULL, updated_at INTEGER NOT NULL);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export async function migrate(db: Db, migrations: readonly string[] = MIGRATIONS): Promise<number> {
  const [row] = await db.all<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < migrations.length) {
    const sql = migrations[version]!;
    const next = version + 1;
    await db.tx(async () => {
      await db.exec(sql);
      await db.exec(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run --project unit tests/unit/migrations.test.ts` → Expected: PASS.

- [ ] **Step 8: Implement the Capacitor adapter and the wasm copy**

```ts
// src/core/db/capacitor.ts
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Db, SqlValue } from './types.ts';

/** Opens `name` with the native plugin on iOS, or jeep-sqlite (sql.js + IndexedDB) on web. */
export async function openCapacitorDb(name: string): Promise<Db> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const web = Capacitor.getPlatform() === 'web';
  if (web) await initWebStore(sqlite);
  await sqlite.checkConnectionsConsistency();
  const exists = (await sqlite.isConnection(name, false)).result === true;
  const conn = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open();
  await conn.execute('PRAGMA foreign_keys = ON;', false);

  let inTx = false;
  // On web, sql.js lives in memory; copy it to IndexedDB after every committed write.
  const persist = async (): Promise<void> => { if (web && !inTx) await sqlite.saveToStore(name); };

  return {
    async exec(sql) { await conn.execute(sql, false); await persist(); },
    async run(sql, params: SqlValue[] = []) { await conn.run(sql, params, false); await persist(); },
    async all<T>(sql: string, params: SqlValue[] = []) { return ((await conn.query(sql, params)).values ?? []) as T[]; },
    async tx(fn) {
      inTx = true;
      await conn.execute('BEGIN TRANSACTION;', false);
      try {
        await fn();
        await conn.execute('COMMIT;', false);
      } catch (e) {
        await conn.execute('ROLLBACK;', false);
        throw e;
      } finally {
        inTx = false;
      }
      await persist();
    },
  };
}

async function initWebStore(sqlite: SQLiteConnection): Promise<void> {
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  await defineCustomElements(window);
  if (!document.querySelector('jeep-sqlite')) document.body.append(document.createElement('jeep-sqlite'));
  await customElements.whenDefined('jeep-sqlite');
  await sqlite.initWebStore();
}
```

If a plugin method signature differs from this code, follow `node_modules/@capacitor-community/sqlite/dist/esm/definitions.d.ts`. Keep the `Db` interface unchanged.

```ts
// scripts/copy-wasm.ts — jeep-sqlite loads sql.js wasm from ./assets at runtime (no network)
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('public/assets', { recursive: true });
await copyFile('node_modules/sql.js/dist/sql-wasm.wasm', 'public/assets/sql-wasm.wasm');
```

Add `"postinstall": "node scripts/copy-wasm.ts"` to `package.json` scripts, then run `npm run postinstall`. Expected: `public/assets/sql-wasm.wasm` exists.

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit` → Expected: no errors.

```bash
git add -A
git commit -m "Add SQLite Db interface, schema v1 migrations, Capacitor/jeep-sqlite adapter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Library (books, chapters, seeding) and the Prefs store

**Files:**
- Create: `src/core/library/library.ts`, `src/core/prefs/prefs.ts`
- Test: `tests/unit/library.test.ts`, `tests/unit/prefs.test.ts`

**Interfaces:**
- Consumes: `Db`, `migrate`, `nodeDb` (Task 4); `ParsedBook`, `ChapterData` (Task 2)
- Produces (`library.ts`):
```ts
export interface BookRow { id: string; title: string; author: string; cover: string | null; color: number; format: 'epub' | 'txt';
  wordCount: number; status: 'reading' | 'done'; pct: number; addedAt: number; openedAt: number | null; finishedAt: number | null }
export function colorIndex(title: string): number;                                   // 0..7
export function saveParsedBook(db: Db, book: ParsedBook, format: 'epub' | 'txt', now: number): Promise<void>;
export function seedBundled(db: Db, ids: readonly string[], load: (id: string) => Promise<ParsedBook>, now?: number): Promise<string[]>;
export function getBook(db: Db, id: string): Promise<BookRow | null>;
export function listBooks(db: Db): Promise<BookRow[]>;                               // openedAt desc, never-opened last by addedAt
export function getChapters(db: Db, bookId: string): Promise<ChapterData[]>;
export function markOpened(db: Db, id: string, now: number): Promise<void>;
```
- Produces (`prefs.ts`):
```ts
export type FontSize = 'S' | 'M' | 'L';
export type Tier = 'full' | 'fallback';
export interface Prefs { fontSize: FontSize; focusPct: number; blurMax: number; sentenceMode: boolean; tier: Tier | null }
export type PrefsListener = (prefs: Prefs, changed: keyof Prefs) => void;
export const DEFAULT_PREFS: Prefs;                                                  // M, 30, 7, false, null
export const TYPE_SCALE: Record<FontSize, { size: number; line: number }>;          // S 17.5/30, M 19.5/34, L 22/38
export function sanitise(p: Prefs): Prefs;
export class PrefsStore { static load(db: Db): Promise<PrefsStore>; get(): Prefs; set<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void>; subscribe(fn: PrefsListener): () => void }
```

- [ ] **Step 1: Write the failing library test**

```ts
// tests/unit/library.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { colorIndex, getBook, getChapters, listBooks, markOpened, saveParsedBook, seedBundled } from '../../src/core/library/library.ts';
import type { ParsedBook } from '../../src/core/types.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

const book = (id: string, title = id): ParsedBook => ({
  id, title, author: 'A. Writer', wordCount: 7,
  chapters: [
    { title: 'Chapter I', paras: [['One two three.']], wordCount: 3 },
    { title: 'Chapter II', paras: [['Four five.', 'Six seven.']], wordCount: 4 },
  ],
});

let db: Db;
beforeEach(async () => { db = nodeDb(); await migrate(db); });

describe('library', () => {
  it('stores chapters with cumulative wordStart', async () => {
    await saveParsedBook(db, book('b1'), 'epub', 100);
    const chs = await getChapters(db, 'b1');
    expect(chs.map((c) => [c.idx, c.title, c.wordStart])).toEqual([[0, 'Chapter I', 0], [1, 'Chapter II', 3]]);
    expect(chs[1]!.paras).toEqual([['Four five.', 'Six seven.']]);
    expect(await getBook(db, 'b1')).toMatchObject({ id: 'b1', wordCount: 7, status: 'reading', pct: 0, addedAt: 100, openedAt: null });
  });

  it('seeds each bundled book once, even after the user deletes it', async () => {
    const loaded: string[] = [];
    const load = async (id: string) => { loaded.push(id); return book(id); };
    expect(await seedBundled(db, ['a', 'b'], load, 1)).toEqual(['a', 'b']);
    expect(await seedBundled(db, ['a', 'b'], load, 2)).toEqual([]);
    await db.run('DELETE FROM book WHERE id = ?', ['a']);
    expect(await seedBundled(db, ['a', 'b'], load, 3)).toEqual([]);
    expect(loaded).toEqual(['a', 'b']);
  });

  it('lists most recently opened first, never-opened last', async () => {
    await saveParsedBook(db, book('x'), 'epub', 1);
    await saveParsedBook(db, book('y'), 'epub', 2);
    await saveParsedBook(db, book('z'), 'epub', 3);
    await markOpened(db, 'x', 10);
    await markOpened(db, 'y', 20);
    expect((await listBooks(db)).map((b) => b.id)).toEqual(['y', 'x', 'z']);
  });

  it('colorIndex is stable and within the 8-colour palette', () => {
    expect(colorIndex('The Great Gatsby')).toBe(colorIndex('The Great Gatsby'));
    for (const t of ['a', 'b', 'The Maltese Falcon', '']) expect(colorIndex(t)).toBeGreaterThanOrEqual(0);
    for (const t of ['a', 'b', 'The Maltese Falcon', '']) expect(colorIndex(t)).toBeLessThan(8);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --project unit tests/unit/library.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/core/library/library.ts`**

```ts
import type { Db } from '../db/types.ts';
import type { ChapterData, ParsedBook } from '../types.ts';

export interface BookRow {
  id: string; title: string; author: string; cover: string | null; color: number; format: 'epub' | 'txt';
  wordCount: number; status: 'reading' | 'done'; pct: number; addedAt: number; openedAt: number | null; finishedAt: number | null;
}

const BOOK_COLS = `id, title, author, cover, color, format, word_count AS wordCount, status, pct,
  added_at AS addedAt, opened_at AS openedAt, finished_at AS finishedAt`;

/** FNV-1a over UTF-16 code units → index into the 8-colour cover palette. */
export function colorIndex(title: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < title.length; i++) {
    h ^= title.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 8;
}

export async function saveParsedBook(db: Db, book: ParsedBook, format: 'epub' | 'txt', now: number): Promise<void> {
  await db.tx(async () => {
    await db.run(
      'INSERT INTO book (id, title, author, cover, color, format, word_count, added_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
      [book.id, book.title, book.author, colorIndex(book.title), format, book.wordCount, now],
    );
    let wordStart = 0;
    for (const [idx, ch] of book.chapters.entries()) {
      await db.run('INSERT INTO chapter (book_id, idx, title, paras, word_start) VALUES (?, ?, ?, ?, ?)',
        [book.id, idx, ch.title, JSON.stringify(ch.paras), wordStart]);
      wordStart += ch.wordCount;
    }
  });
}

/** Inserts bundled books not seeded before. A `seeded:<id>` flag stops a deleted book from coming back. */
export async function seedBundled(db: Db, ids: readonly string[], load: (id: string) => Promise<ParsedBook>, now = Date.now()): Promise<string[]> {
  const added: string[] = [];
  for (const id of ids) {
    const [flag] = await db.all<{ key: string }>('SELECT key FROM settings WHERE key = ?', [`seeded:${id}`]);
    if (flag) continue;
    await saveParsedBook(db, await load(id), 'epub', now);
    await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [`seeded:${id}`, '1']);
    added.push(id);
  }
  return added;
}

export async function getBook(db: Db, id: string): Promise<BookRow | null> {
  const [row] = await db.all<BookRow>(`SELECT ${BOOK_COLS} FROM book WHERE id = ?`, [id]);
  return row ? { ...row } : null;
}

export async function listBooks(db: Db): Promise<BookRow[]> {
  const rows = await db.all<BookRow>(`SELECT ${BOOK_COLS} FROM book ORDER BY opened_at IS NULL, opened_at DESC, added_at ASC`);
  return rows.map((r) => ({ ...r }));
}

export async function getChapters(db: Db, bookId: string): Promise<ChapterData[]> {
  const rows = await db.all<{ idx: number; title: string; paras: string; wordStart: number }>(
    'SELECT idx, title, paras, word_start AS wordStart FROM chapter WHERE book_id = ? ORDER BY idx', [bookId]);
  return rows.map((r) => ({ idx: r.idx, title: r.title, paras: JSON.parse(r.paras) as string[][], wordStart: r.wordStart }));
}

export async function markOpened(db: Db, id: string, now: number): Promise<void> {
  await db.run('UPDATE book SET opened_at = ? WHERE id = ?', [now, id]);
}
```

- [ ] **Step 4: Run the library tests**

Run: `npx vitest run --project unit tests/unit/library.test.ts` → Expected: PASS.

- [ ] **Step 5: Write the failing prefs test**

```ts
// tests/unit/prefs.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { DEFAULT_PREFS, PrefsStore, sanitise } from '../../src/core/prefs/prefs.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

let db: Db;
beforeEach(async () => { db = nodeDb(); await migrate(db); });

describe('PrefsStore', () => {
  it('starts from the spec defaults', async () => {
    expect((await PrefsStore.load(db)).get()).toEqual({ fontSize: 'M', focusPct: 30, blurMax: 7, sentenceMode: false, tier: null });
  });

  it('S-01: persists changes across reloads', async () => {
    const a = await PrefsStore.load(db);
    await a.set('fontSize', 'L');
    await a.set('tier', 'fallback');
    expect((await PrefsStore.load(db)).get()).toMatchObject({ fontSize: 'L', tier: 'fallback' });
  });

  it('notifies subscribers with the changed key, and not for no-op sets', async () => {
    const s = await PrefsStore.load(db);
    const fn = vi.fn();
    const off = s.subscribe(fn);
    await s.set('focusPct', 40);
    await s.set('focusPct', 40);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ focusPct: 40 }), 'focusPct');
    off();
    await s.set('focusPct', 45);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clamps to the settings ranges', () => {
    expect(sanitise({ ...DEFAULT_PREFS, focusPct: 83, blurMax: 20 })).toMatchObject({ focusPct: 80, blurMax: 14 });
    expect(sanitise({ ...DEFAULT_PREFS, focusPct: 33, blurMax: 0 })).toMatchObject({ focusPct: 35, blurMax: 2 });
    expect(sanitise({ ...DEFAULT_PREFS, fontSize: 'XL' as never, tier: 'turbo' as never })).toMatchObject({ fontSize: 'M', tier: null });
  });

  it('ignores corrupt stored values', async () => {
    await db.run("INSERT INTO settings (key, value) VALUES ('focusPct', 'not json')");
    expect((await PrefsStore.load(db)).get().focusPct).toBe(30);
  });
});
```

- [ ] **Step 6: Run it to confirm it fails**

Run: `npx vitest run --project unit tests/unit/prefs.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 7: Implement `src/core/prefs/prefs.ts`**

```ts
import type { Db } from '../db/types.ts';

export type FontSize = 'S' | 'M' | 'L';
export type Tier = 'full' | 'fallback';
export interface Prefs { fontSize: FontSize; focusPct: number; blurMax: number; sentenceMode: boolean; tier: Tier | null }
export type PrefsListener = (prefs: Prefs, changed: keyof Prefs) => void;

export const DEFAULT_PREFS: Prefs = { fontSize: 'M', focusPct: 30, blurMax: 7, sentenceMode: false, tier: null };

export const TYPE_SCALE: Record<FontSize, { size: number; line: number }> = {
  S: { size: 17.5, line: 30 },
  M: { size: 19.5, line: 34 },
  L: { size: 22, line: 38 },
};

const KEYS = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];

export function sanitise(p: Prefs): Prefs {
  return {
    fontSize: p.fontSize === 'S' || p.fontSize === 'L' ? p.fontSize : 'M',
    focusPct: clampStep(p.focusPct, 20, 80, 5, DEFAULT_PREFS.focusPct),
    blurMax: clampStep(p.blurMax, 2, 14, 1, DEFAULT_PREFS.blurMax),
    sentenceMode: p.sentenceMode === true,
    tier: p.tier === 'full' || p.tier === 'fallback' ? p.tier : null,
  };
}

function clampStep(v: unknown, lo: number, hi: number, step: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(v / step) * step));
}

/** Settings store. Changes notify subscribers synchronously (live apply), then persist. */
export class PrefsStore {
  #db: Db;
  #value: Prefs;
  #subs = new Set<PrefsListener>();

  private constructor(db: Db, value: Prefs) {
    this.#db = db;
    this.#value = value;
  }

  static async load(db: Db): Promise<PrefsStore> {
    const rows = await db.all<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key IN (${KEYS.map(() => '?').join(',')})`, KEYS);
    const raw: Record<string, unknown> = { ...DEFAULT_PREFS };
    for (const r of rows) {
      try { raw[r.key] = JSON.parse(r.value); } catch { /* keep default */ }
    }
    return new PrefsStore(db, sanitise(raw as unknown as Prefs));
  }

  get(): Prefs {
    return this.#value;
  }

  async set<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
    const next = sanitise({ ...this.#value, [key]: value });
    if (next[key] === this.#value[key]) return;
    this.#value = next;
    for (const fn of this.#subs) fn(next, key);
    await this.#db.run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(next[key])],
    );
  }

  subscribe(fn: PrefsListener): () => void {
    this.#subs.add(fn);
    return () => { this.#subs.delete(fn); };
  }
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --project unit` → Expected: all unit tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/library/library.ts src/core/prefs/prefs.ts tests/unit/library.test.ts tests/unit/prefs.test.ts
git commit -m "Add library (seed, books, chapters) and subscribable prefs store (S-01 persistence)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Focus-band maths (R-01)

**Files:**
- Create: `src/core/reader/focus.ts`
- Test: `tests/unit/focus.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Band { half: number; ramp: number }
export const SENTENCE_PENALTY = 0.18;
export function bandFor(viewportH: number, focusPct: number): Band;   // clamps focusPct to 10..90
export function tFor(distance: number, band: Band): number;           // 0..1
export function withSentencePenalty(t: number): number;               // min(1, t + 0.18)
export function blurPx(t: number, blurMax: number): number;           // quantised to 0.5px
export function opacityFor(t: number): number;                        // 1 - 0.85t, rounded to 0.01
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/focus.test.ts
import { describe, expect, it } from 'vitest';
import { bandFor, blurPx, opacityFor, tFor, withSentencePenalty } from '../../src/core/reader/focus.ts';

describe('R-01 focus band formula', () => {
  it('half = H*pct/200 and ramp = H/2 - half', () => expect(bandFor(800, 30)).toEqual({ half: 120, ramp: 280 }));
  it('clamps focusPct to 10–90 at runtime', () => {
    expect(bandFor(800, 5).half).toBe(40);
    expect(bandFor(800, 95).half).toBe(360);
  });
  it('ramp is at least 1px', () => expect(bandFor(1, 90).ramp).toBe(1));
  it('t is 0 inside the band, linear on the ramp, 1 beyond', () => {
    const b = bandFor(800, 30);
    expect(tFor(0, b)).toBe(0);
    expect(tFor(120, b)).toBe(0);
    expect(tFor(260, b)).toBeCloseTo(0.5, 10);
    expect(tFor(400, b)).toBe(1);
    expect(tFor(2000, b)).toBe(1);
  });
  it('sentence mode adds 0.18, capped at 1', () => {
    expect(withSentencePenalty(0)).toBeCloseTo(0.18, 10);
    expect(withSentencePenalty(0.95)).toBe(1);
  });
  it('blur is blurMax*t quantised to 0.5px', () => {
    expect(blurPx(0, 7)).toBe(0);
    expect(blurPx(0.52, 7)).toBe(3.5);
    expect(blurPx(0.55, 7)).toBe(4);
    expect(blurPx(1, 7)).toBe(7);
  });
  it('opacity is 1 - 0.85t rounded to 0.01', () => {
    expect(opacityFor(0)).toBe(1);
    expect(opacityFor(0.2)).toBe(0.83);
    expect(opacityFor(1)).toBe(0.15);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --project unit tests/unit/focus.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/core/reader/focus.ts`**

```ts
/** Focus-band maths from README → Interactions → Focus band (R-01). Pure; no DOM. */
export interface Band { half: number; ramp: number }

export const SENTENCE_PENALTY = 0.18;

export function bandFor(viewportH: number, focusPct: number): Band {
  const pct = Math.min(90, Math.max(10, focusPct));
  const half = (viewportH * pct) / 200;
  return { half, ramp: Math.max(1, viewportH / 2 - half) };
}

export function tFor(distance: number, band: Band): number {
  return Math.min(1, Math.max(0, (distance - band.half) / band.ramp));
}

export function withSentencePenalty(t: number): number {
  return Math.min(1, t + SENTENCE_PENALTY);
}

export function blurPx(t: number, blurMax: number): number {
  return Math.round(blurMax * t * 2) / 2;
}

export function opacityFor(t: number): number {
  return Math.round((1 - 0.85 * t) * 100) / 100;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit tests/unit/focus.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/reader/focus.ts tests/unit/focus.test.ts
git commit -m "Add focus-band maths (R-01)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Line breaking and chapter layout

**Files:**
- Create: `src/core/reader/layout.ts`, `src/styles/reader.css`
- Test: `tests/browser/layout.test.ts`

**Interfaces:**
- Consumes: `paragraphText`, `sentenceStarts`, `countWords` (Task 2); `ChapterData` (Task 2)
- Produces:
```ts
export interface LineMeta {
  el: HTMLElement;
  chapter: number;
  para: number;       // -1 for the chapter heading line
  sFirst: number;     // first sentence index (within `para`) this line touches
  sLast: number;      // last sentence index this line touches
  wordEnd: number;    // book-level word count up to the end of this line
}
export function breakLines(probe: HTMLElement, text: string): number[];   // char offsets where visual lines start; [0, ...]
export function layoutChapter(probe: HTMLElement, ch: ChapterData): { block: HTMLElement; lines: LineMeta[] };
```
- DOM produced:
  - `div.rd-chapter[data-ch]` contains `div.rd-blank`, `div.rd-line.rd-head`, `div.rd-blank`
  - then, for each paragraph, `div.rd-line[data-p]`, with a `div.rd-blank` between paragraphs
  - then a trailing `div.rd-blank`
- CSS classes produced: `.rd-scroll`, `.rd-content`, `.rd-probe`, `.rd-line`, `.rd-blank`, `.rd-head`. Engine vars: `--fs` and `--lh`, set on `.rd-scroll`.

- [ ] **Step 1: Write `src/styles/reader.css`**

```css
.rd-page { position: fixed; inset: 0; overflow: hidden; background: var(--paper); }
.rd-scroll {
  position: absolute; inset: 0; box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain;
  padding: 0 34px; /* vertical padding is set by the engine: H/2 - lineHeight/2 */
}
.rd-content, .rd-probe {
  font-family: 'Newsreader Variable', 'Newsreader', Georgia, serif; font-optical-sizing: auto;
  font-size: var(--fs, 19.5px); line-height: var(--lh, 34px); color: var(--reader-ink);
  font-kerning: normal;
}
.rd-probe {
  position: absolute; top: 0; left: 34px; visibility: hidden; pointer-events: none;
  white-space: normal; overflow-wrap: anywhere;
}
.rd-line, .rd-blank { height: var(--lh, 34px); white-space: pre; position: relative; }
.rd-head {
  font: 400 11px/var(--lh, 34px) 'IBM Plex Sans', system-ui, sans-serif; letter-spacing: .14em;
  text-transform: uppercase; text-align: center; color: rgba(34, 31, 27, .62);
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/browser/layout.test.ts
import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { countWords, INDENT, paragraphText } from '../../src/core/ingest/text.ts';
import { breakLines, layoutChapter } from '../../src/core/reader/layout.ts';

const WIDTH = 334; // 402 - 2 × 34

function stage() {
  const scroll = document.createElement('div');
  scroll.className = 'rd-scroll';
  Object.assign(scroll.style, { position: 'relative', width: `${WIDTH + 68}px`, height: '874px' });
  const content = document.createElement('div');
  content.className = 'rd-content';
  const probe = document.createElement('div');
  probe.className = 'rd-probe';
  probe.style.width = `${WIDTH}px`;
  scroll.append(content, probe);
  document.body.append(scroll);
  return { content, probe };
}

function width(content: HTMLElement, text: string): number {
  const el = document.createElement('div');
  el.className = 'rd-line';
  el.style.display = 'inline-block';
  el.textContent = text;
  content.append(el);
  const w = el.getBoundingClientRect().width;
  el.remove();
  return w;
}

const LONG = [
  'In my younger and more vulnerable years my father gave me some advice that I’ve been turning over in my mind ever since.',
  '“Whenever you feel like criticizing anyone,” he told me, “just remember that all the people in this world haven’t had the advantages that you’ve had.”',
];

beforeAll(async () => { await document.fonts.load('19.5px "Newsreader Variable"'); });
afterEach(() => { document.body.innerHTML = ''; });

describe('breakLines', () => {
  it('splits into lines that re-join to the text and each fit the column', () => {
    const { content, probe } = stage();
    const text = paragraphText(LONG);
    const starts = breakLines(probe, text);
    expect(starts[0]).toBe(0);
    expect(starts.length).toBeGreaterThan(3);
    const pieces = starts.map((a, i) => text.slice(a, starts[i + 1] ?? text.length));
    expect(pieces.join('')).toBe(text);
    for (const p of pieces) expect(width(content, p.trimEnd())).toBeLessThanOrEqual(WIDTH + 0.5);
  });

  it('breaks inside a word wider than the column (Review Focus 2)', () => {
    const { content, probe } = stage();
    const text = `${INDENT}See https://example.com/${'x'.repeat(90)} now.`;
    const starts = breakLines(probe, text);
    const pieces = starts.map((a, i) => text.slice(a, starts[i + 1] ?? text.length));
    expect(pieces.join('')).toBe(text);
    for (const p of pieces) expect(width(content, p.trimEnd())).toBeLessThanOrEqual(WIDTH + 0.5);
  });
});

describe('layoutChapter', () => {
  it('emits fixed-height lines, a heading, and correct sentence and word bookkeeping', () => {
    const { content, probe } = stage();
    const ch = { idx: 2, title: 'Chapter III · The Party', paras: [LONG, ['Short one.'], ['A. Two.', 'B. Three.']], wordStart: 100 };
    const { block, lines } = layoutChapter(probe, ch);
    content.append(block);

    expect(block.dataset.ch).toBe('2');
    expect(lines[0]).toMatchObject({ chapter: 2, para: -1, wordEnd: 100 });
    expect(lines[0]!.el.textContent).toBe('Chapter III · The Party');
    for (const el of Array.from(block.children)) expect((el as HTMLElement).getBoundingClientRect().height).toBe(34);

    const body = lines.slice(1);
    expect(new Set(body.map((l) => l.para))).toEqual(new Set([0, 1, 2]));
    expect(body[0]!.el.textContent!.startsWith(INDENT)).toBe(true);
    expect(body[0]!.sFirst).toBe(0);
    const lastOfPara0 = body.filter((l) => l.para === 0).at(-1)!;
    expect(lastOfPara0.sLast).toBe(1);
    const allWords = [LONG, ['Short one.'], ['A. Two.', 'B. Three.']].flat().map(countWords).reduce((a, b) => a + b, 0);
    expect(lines.at(-1)!.wordEnd).toBe(100 + allWords);
    // Paragraphs are separated by exactly one blank line.
    const firstPara1 = body.find((l) => l.para === 1)!.el;
    expect(firstPara1.previousElementSibling!.className).toBe('rd-blank');
    expect(firstPara1.previousElementSibling!.previousElementSibling!.className).toBe('rd-line');
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run --project browser tests/browser/layout.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/core/reader/layout.ts`**

```ts
import { countWords, paragraphText, sentenceStarts } from '../ingest/text.ts';
import type { ChapterData } from '../types.ts';

export interface LineMeta {
  el: HTMLElement;
  chapter: number;
  para: number;
  sFirst: number;
  sLast: number;
  wordEnd: number;
}

/** Words at least this long are also checked for a break inside them (overflow-wrap:anywhere). */
const LONG_WORD = 24;

/**
 * Offsets where each visual line of `text` starts when laid out in `probe`
 * (same font and width as the column). One Range read per word, once per layout.
 */
export function breakLines(probe: HTMLElement, text: string): number[] {
  probe.textContent = text;
  const node = probe.firstChild;
  if (!(node instanceof Text) || text.length === 0) return [0];
  const range = probe.ownerDocument.createRange();
  const topAt = (i: number): number | null => {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    return range.getClientRects()[0]?.top ?? null;
  };

  const starts = [0];
  let lineTop = topAt(0) ?? 0;
  const word = /\S+/g;
  for (let m = word.exec(text); m; m = word.exec(text)) {
    const first = m.index;
    const t = topAt(first);
    if (t !== null && t > lineTop + 1) {
      if (first > 0) starts.push(first);
      lineTop = t;
    }
    if (m[0].length >= LONG_WORD) {
      const last = first + m[0].length - 1;
      const tl = topAt(last);
      if (tl !== null && tl > lineTop + 1) {
        for (let i = first + 1; i <= last; i++) {
          const ti = topAt(i);
          if (ti !== null && ti > lineTop + 1) {
            starts.push(i);
            lineTop = ti;
          }
        }
      }
    }
  }
  return starts;
}

/** Lays out one chapter into fixed-height line elements. Nothing is attached to the document. */
export function layoutChapter(probe: HTMLElement, ch: ChapterData): { block: HTMLElement; lines: LineMeta[] } {
  const doc = probe.ownerDocument;
  const block = doc.createElement('div');
  block.className = 'rd-chapter';
  block.dataset.ch = String(ch.idx);
  const add = (text: string, cls: string): HTMLElement => {
    const el = doc.createElement('div');
    el.className = cls;
    el.textContent = text;
    block.append(el);
    return el;
  };

  const lines: LineMeta[] = [];
  add('', 'rd-blank');
  lines.push({ el: add(ch.title, 'rd-line rd-head'), chapter: ch.idx, para: -1, sFirst: 0, sLast: 0, wordEnd: ch.wordStart });
  add('', 'rd-blank');

  let words = ch.wordStart;
  ch.paras.forEach((p, pi) => {
    if (pi > 0) add('', 'rd-blank');
    const text = paragraphText(p);
    const starts = breakLines(probe, text);
    const sStarts = sentenceStarts(p);
    let s = 0;
    starts.forEach((a, li) => {
      const b = starts[li + 1] ?? text.length;
      const slice = text.slice(a, b).trimEnd();
      while (s + 1 < sStarts.length && sStarts[s + 1]! <= a) s++;
      let sLast = s;
      while (sLast + 1 < sStarts.length && sStarts[sLast + 1]! < b) sLast++;
      words += countWords(slice);
      const el = add(slice, 'rd-line');
      el.dataset.p = String(pi);
      lines.push({ el, chapter: ch.idx, para: pi, sFirst: s, sLast, wordEnd: words });
    });
  });
  add('', 'rd-blank');
  probe.textContent = '';
  return { block, lines };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --project browser tests/browser/layout.test.ts` → Expected: PASS in WebKit and Chromium.

- [ ] **Step 6: Commit**

```bash
git add src/core/reader/layout.ts src/styles/reader.css tests/browser/layout.test.ts
git commit -m "Add line breaking and fixed-height chapter layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ReaderEngine (focus band, windowing, virtualisation, anchor)

**Files:**
- Create: `src/core/reader/engine.ts`, `tests/browser/helpers.ts`
- Test: `tests/browser/engine.test.ts`

**Interfaces:**
- Consumes: `layoutChapter`, `LineMeta` (Task 7); `bandFor`, `tFor`, `withSentencePenalty`, `blurPx`, `opacityFor` (Task 6); `Prefs`, `TYPE_SCALE` (Task 5); `Anchor`, `ChapterData` (Task 2)
- Produces:
```ts
export interface EngineBook { id: string; wordCount: number; chapters: ChapterData[] }
export interface Progress { chapterTitle: string; pct: number }
export interface EngineCallbacks { onProgress?: (p: Progress) => void; onAnchor?: (a: Anchor) => void }
export class ReaderEngine {
  constructor(scroller: HTMLElement, book: EngineBook, prefs: Prefs, cb?: EngineCallbacks);
  readonly stats: { paints: number; styleWrites: number; lastPaintMs: number };
  get scroller(): HTMLElement;
  mount(anchor: Anchor | null): Promise<void>;       // awaits fonts, lays out chapter ±1, scrolls to anchor, paints
  paintNow(): void;                                  // one focus-band paint from the current scrollTop
  setPrefs(p: Prefs): void;                          // font change → relayout keeping the anchor
  currentAnchor(): Anchor;                           // first sentence inside the band
  scrollToAnchor(a: Anchor): void;
  destroy(): void;
}
```
- `onAnchor` fires on scroll idle (180ms after the last scroll event). `onProgress` fires when the chapter title or percentage changes.

- [ ] **Step 1: Write the test helpers**

```ts
// tests/browser/helpers.ts
import type { EngineBook } from '../../src/core/reader/engine.ts';
import type { ChapterData } from '../../src/core/types.ts';

const WORDS = 'the quiet river ran past our house and the dust of the road settled on the leaves while soldiers marched toward the mountains in the late summer light'.split(' ');

/** Deterministic synthetic book: `chapters` × `paras` paragraphs of 1–4 sentences. */
export function makeBook(chapters = 3, paras = 30): EngineBook {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sentence = () => {
    const w = Array.from({ length: 6 + Math.floor(rnd() * 14) }, () => WORDS[Math.floor(rnd() * WORDS.length)]!);
    w[0] = w[0]!.charAt(0).toUpperCase() + w[0]!.slice(1);
    return `${w.join(' ')}.`;
  };
  const out: ChapterData[] = [];
  let wordStart = 0;
  for (let c = 0; c < chapters; c++) {
    const ps = Array.from({ length: paras }, () => Array.from({ length: 1 + Math.floor(rnd() * 4) }, sentence));
    out.push({ idx: c, title: `Chapter ${c + 1}`, paras: ps, wordStart });
    wordStart += ps.flat().join(' ').split(' ').length;
  }
  return { id: 'test', wordCount: wordStart, chapters: out };
}

export function host(w = 402, h = 874): HTMLElement {
  const page = document.createElement('div');
  Object.assign(page.style, { position: 'relative', width: `${w}px`, height: `${h}px`, overflow: 'hidden' });
  const el = document.createElement('div');
  page.append(el);
  document.body.append(page);
  return el;
}

export const frames = (n = 2) => new Promise<void>((r) => {
  const tick = (k: number) => (k === 0 ? r() : requestAnimationFrame(() => tick(k - 1)));
  tick(n);
});
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The body line whose centre is closest to viewport-y `y` (tests may read layout). */
export function lineAt(scroller: HTMLElement, y: number): HTMLElement {
  let best: HTMLElement | null = null;
  let bestD = Infinity;
  for (const el of Array.from(scroller.querySelectorAll<HTMLElement>('.rd-line'))) {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - y);
    if (d < bestD) { bestD = d; best = el; }
  }
  return best!;
}
```

- [ ] **Step 2: Write the failing engine tests**

```ts
// tests/browser/engine.test.ts
import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, type Prefs } from '../../src/core/prefs/prefs.ts';
import { ReaderEngine, type Progress } from '../../src/core/reader/engine.ts';
import { bandFor, blurPx, opacityFor, tFor } from '../../src/core/reader/focus.ts';
import { frames, host, lineAt, makeBook, sleep } from './helpers.ts';

let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); engine = null; document.body.innerHTML = ''; });

async function open(prefs: Partial<Prefs> = {}, opts: { chapters?: number; h?: number; progress?: Progress[] } = {}) {
  const el = host(402, opts.h ?? 874);
  const e = new ReaderEngine(el, makeBook(opts.chapters ?? 3), { ...DEFAULT_PREFS, tier: 'full', ...prefs }, {
    onProgress: (p) => opts.progress?.push(p),
  });
  engine = e;
  await e.mount(null);
  return { el, e };
}
const mid = (el: HTMLElement) => { const b = el.getBoundingClientRect(); return b.top + b.height / 2; };

describe('ReaderEngine', () => {
  it('mount waits for the body font (Review Focus 3)', async () => {
    await open();
    expect(document.fonts.check('19.5px "Newsreader Variable"')).toBe(true);
  });

  it('R-01: every line in the window gets blur and opacity from the formula', async () => {
    const { el, e } = await open();
    el.scrollTop = 1500;
    e.paintNow();
    const band = bandFor(el.clientHeight, 30);
    const m = mid(el);
    let checked = 0;
    for (const line of Array.from(el.querySelectorAll<HTMLElement>('.rd-line'))) {
      const r = line.getBoundingClientRect();
      if (r.bottom < el.getBoundingClientRect().top || r.top > el.getBoundingClientRect().bottom) continue;
      const t = tFor(Math.abs(r.top + r.height / 2 - m), band);
      const b = blurPx(t, 7);
      expect(line.style.filter).toBe(b > 0 ? `blur(${b}px)` : 'none');
      expect(Number(line.style.opacity)).toBeCloseTo(opacityFor(t), 2);
      checked++;
    }
    expect(checked).toBeGreaterThan(15);
    expect(lineAt(el, m).style.filter).toBe('none');
  });

  it('writes a style only when its value changed', async () => {
    const { e } = await open();
    const before = e.stats.styleWrites;
    e.paintNow();
    expect(e.stats.styleWrites).toBe(before);
  });

  it('reads no layout while painting', async () => {
    const { el, e } = await open();
    let reads = 0;
    const gbcr = Element.prototype.getBoundingClientRect;
    const gcr = Range.prototype.getClientRects;
    const ot = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')!;
    Element.prototype.getBoundingClientRect = function (this: Element) { reads++; return gbcr.call(this); };
    Range.prototype.getClientRects = function (this: Range) { reads++; return gcr.call(this); };
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get() { reads++; return ot.get!.call(this); } });
    try {
      for (let i = 0; i < 30; i++) { el.scrollTop += 17; e.paintNow(); }
    } finally {
      Element.prototype.getBoundingClientRect = gbcr;
      Range.prototype.getClientRects = gcr;
      Object.defineProperty(HTMLElement.prototype, 'offsetTop', ot);
    }
    expect(reads).toBe(0);
  });

  it('only touches lines within ±1 viewport, and sets will-change only there', async () => {
    const { el, e } = await open();
    e.paintNow();
    const lines = Array.from(el.querySelectorAll<HTMLElement>('.rd-line'));
    const far = lines.at(-1)!;
    expect(far.style.filter).toBe('');
    expect(far.style.willChange).toBe('');
    expect(lineAt(el, mid(el)).style.willChange).toBe('filter, opacity');
  });

  it('sentence mode fades lines outside the current sentence (t + 0.18)', async () => {
    const { el, e } = await open({ sentenceMode: true, focusPct: 80 });
    el.scrollTop = 1200;
    e.paintNow();
    const opacities = Array.from(el.querySelectorAll<HTMLElement>('.rd-line'))
      .filter((l) => Math.abs(l.getBoundingClientRect().top + 17 - mid(el)) < 100)
      .map((l) => Number(l.style.opacity));
    expect(opacities).toContain(1);
    expect(opacities).toContain(opacityFor(0.18));
  });

  it('R-07: a font-size change keeps the anchor paragraph inside the band', async () => {
    const { el, e } = await open();
    el.scrollTop = 2400;
    e.paintNow();
    const before = e.currentAnchor();
    e.setPrefs({ ...DEFAULT_PREFS, tier: 'full', fontSize: 'L' });
    expect(el.style.getPropertyValue('--lh')).toBe('38px');
    const after = e.currentAnchor();
    expect(after.chapter).toBe(before.chapter);
    expect(after.para).toBe(before.para);
  });

  it('keeps the anchor when the viewport height changes (Review Focus 1)', async () => {
    const { el, e } = await open();
    el.scrollTop = 2400;
    e.paintNow();
    const before = e.currentAnchor();
    el.parentElement!.style.height = '700px';
    await frames(3);
    const after = e.currentAnchor();
    expect([after.chapter, after.para]).toEqual([before.chapter, before.para]);
  });

  it('first and last lines reach the band; pct is 1 then 100 (Review Focus 4)', async () => {
    const progress: Progress[] = [];
    const { el, e } = await open({}, { progress });
    expect(progress.at(-1)).toMatchObject({ chapterTitle: 'Chapter 1', pct: 1 });
    const half = bandFor(el.clientHeight, 30).half;
    el.scrollTop = 0;
    e.paintNow();
    const first = el.querySelector<HTMLElement>('.rd-line[data-p]')!.getBoundingClientRect();
    expect(Math.abs(first.top + first.height / 2 - mid(el))).toBeLessThanOrEqual(half);

    e.scrollToAnchor({ chapter: 2, para: 29, sentence: 0 });
    await sleep(300);
    el.scrollTop = el.scrollHeight;
    e.paintNow();
    const lines = el.querySelectorAll<HTMLElement>('.rd-line[data-p]');
    const last = lines[lines.length - 1]!.getBoundingClientRect();
    expect(Math.abs(last.top + last.height / 2 - mid(el))).toBeLessThanOrEqual(half);
    expect(progress.at(-1)).toMatchObject({ chapterTitle: 'Chapter 3', pct: 100 });
  });

  it('virtualises to chapter ±1 without moving the text under the reader', async () => {
    const { el, e } = await open({}, { chapters: 6 });
    const mounted = () => Array.from(el.querySelectorAll<HTMLElement>('.rd-chapter')).map((b) => Number(b.dataset.ch));
    expect(mounted()).toEqual([0, 1]);
    e.scrollToAnchor({ chapter: 1, para: 0, sentence: 0 });
    await sleep(300);
    expect(mounted()).toEqual([0, 1, 2]);
    e.scrollToAnchor({ chapter: 2, para: 3, sentence: 0 });
    await sleep(300);
    expect(mounted()).toEqual([1, 2, 3]);
    expect(e.currentAnchor()).toMatchObject({ chapter: 2, para: 3 });
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx vitest run --project browser tests/browser/engine.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/core/reader/engine.ts`**

```ts
import type { Prefs } from '../prefs/prefs.ts';
import { TYPE_SCALE } from '../prefs/prefs.ts';
import type { Anchor, ChapterData } from '../types.ts';
import { bandFor, blurPx, opacityFor, tFor, withSentencePenalty } from './focus.ts';
import { layoutChapter, type LineMeta } from './layout.ts';

export interface EngineBook { id: string; wordCount: number; chapters: ChapterData[] }
export interface Progress { chapterTitle: string; pct: number }
export interface EngineCallbacks { onProgress?: (p: Progress) => void; onAnchor?: (a: Anchor) => void }

const SIDE = 34;
const IDLE_MS = 180;

/** First index i with arr[i] >= x. */
function lowerBound(arr: Float64Array, x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m]! < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * Owns the reader's scroll container. Lays chapters out once into fixed-height lines,
 * then on scroll writes filter/opacity directly to lines within ±1 viewport.
 */
export class ReaderEngine {
  readonly stats = { paints: 0, styleWrites: 0, lastPaintMs: 0 };
  #scroller: HTMLElement;
  #content: HTMLElement;
  #probe: HTMLElement;
  #book: EngineBook;
  #prefs: Prefs;
  #cb: EngineCallbacks;
  #blocks = new Map<number, { block: HTMLElement; lines: LineMeta[] }>();
  #lines: LineMeta[] = [];
  #top = new Float64Array(0);
  #blur = new Float64Array(0);
  #opa = new Float64Array(0);
  #win: [number, number] = [0, 0];
  #H = 0;
  #W = 0;
  #lh = 34;
  #raf = 0;
  #idle = 0;
  #progressKey = '';
  #mounted = false;
  #destroyed = false;
  #ro: ResizeObserver;

  constructor(scroller: HTMLElement, book: EngineBook, prefs: Prefs, cb: EngineCallbacks = {}) {
    this.#scroller = scroller;
    this.#book = book;
    this.#prefs = prefs;
    this.#cb = cb;
    scroller.classList.add('rd-scroll');
    this.#content = document.createElement('div');
    this.#content.className = 'rd-content';
    this.#probe = document.createElement('div');
    this.#probe.className = 'rd-probe';
    scroller.append(this.#content, this.#probe);
    scroller.addEventListener('scroll', this.#onScroll, { passive: true });
    this.#ro = new ResizeObserver(this.#onResize);
  }

  get scroller(): HTMLElement {
    return this.#scroller;
  }

  async mount(anchor: Anchor | null): Promise<void> {
    this.#applyTypography();
    const { size } = TYPE_SCALE[this.#prefs.fontSize];
    await Promise.all([
      document.fonts.load(`${size}px "Newsreader Variable"`),
      document.fonts.load('11px "IBM Plex Sans"'),
    ]);
    if (this.#destroyed) return; // destroyed while waiting for fonts (e.g. StrictMode remount)
    this.#measureViewport();
    const a = anchor ?? { chapter: 0, para: 0, sentence: 0 };
    this.#setWindow(this.#clampChapter(a.chapter));
    this.scrollToAnchor(a);
    this.#mounted = true;
    this.#ro.observe(this.#scroller);
    this.paintNow();
  }

  paintNow(): void {
    const n = this.#lines.length;
    if (!n) return;
    const t0 = performance.now();
    const st = this.#scroller.scrollTop;
    const H = this.#H;
    const lh = this.#lh;
    const band = bandFor(H, this.#prefs.focusPct);
    const mid = st + H / 2;
    const lo = lowerBound(this.#top, st - H);
    const hi = lowerBound(this.#top, st + 2 * H);
    this.#moveWindow(lo, hi);
    const full = this.#prefs.tier !== 'fallback';
    const bmax = this.#prefs.blurMax;
    const cur = this.#prefs.sentenceMode ? this.#lines[this.#lineAt(mid)] : undefined;

    for (let i = lo; i < hi; i++) {
      const line = this.#lines[i]!;
      let t = tFor(Math.abs(this.#top[i]! + lh / 2 - mid), band);
      if (cur && !(line.chapter === cur.chapter && line.para === cur.para && line.sFirst <= cur.sFirst && cur.sFirst <= line.sLast)) {
        t = withSentencePenalty(t);
      }
      const b = full ? blurPx(t, bmax) : 0;
      const o = opacityFor(t);
      if (b !== this.#blur[i]) {
        line.el.style.filter = b > 0 ? `blur(${b}px)` : 'none';
        this.#blur[i] = b;
        this.stats.styleWrites++;
      }
      if (o !== this.#opa[i]) {
        line.el.style.opacity = String(o);
        this.#opa[i] = o;
        this.stats.styleWrites++;
      }
    }
    this.#emitProgress(mid);
    this.stats.paints++;
    this.stats.lastPaintMs = performance.now() - t0;
  }

  setPrefs(p: Prefs): void {
    const prev = this.#prefs;
    this.#prefs = p;
    if (!this.#mounted) return;
    if (p.fontSize !== prev.fontSize) {
      const a = this.currentAnchor();
      this.#relayout(a);
      return;
    }
    if (p.tier !== prev.tier) {
      for (const l of this.#lines) l.el.style.filter = '';
      this.#blur.fill(Number.NaN);
      this.#win = [0, 0];
    }
    this.paintNow();
  }

  currentAnchor(): Anchor {
    const lines = this.#lines;
    if (!lines.length) return { chapter: 0, para: 0, sentence: 0 };
    const half = bandFor(this.#H, this.#prefs.focusPct).half;
    const bandTop = this.#scroller.scrollTop + this.#H / 2 - half;
    let i = lowerBound(this.#top, bandTop - this.#lh / 2);
    while (i < lines.length - 1 && lines[i]!.para < 0) i++;
    const l = lines[Math.min(i, lines.length - 1)]!;
    return { chapter: l.chapter, para: Math.max(0, l.para), sentence: l.sFirst };
  }

  scrollToAnchor(a: Anchor): void {
    if (!this.#blocks.has(a.chapter)) this.#setWindow(this.#clampChapter(a.chapter));
    const i = this.#findLine(a);
    if (i < 0) return;
    const half = bandFor(this.#H, this.#prefs.focusPct).half;
    // Put the anchor line at the top of the band (or at the centre if the band is thinner than a line).
    const centre = this.#H / 2 - Math.max(0, half - this.#lh / 2);
    this.#scroller.scrollTop = this.#top[i]! + this.#lh / 2 - centre;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#mounted = false;
    this.#scroller.removeEventListener('scroll', this.#onScroll);
    this.#ro.disconnect();
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#idle);
    this.#content.remove();
    this.#probe.remove();
    this.#blocks.clear();
    this.#lines = [];
  }

  // ---- internals ----

  #onScroll = (): void => {
    if (!this.#raf) this.#raf = requestAnimationFrame(() => { this.#raf = 0; this.paintNow(); });
    clearTimeout(this.#idle);
    this.#idle = window.setTimeout(this.#onIdle, IDLE_MS);
  };

  #onIdle = (): void => {
    const centreLine = this.#lines[this.#lineAt(this.#scroller.scrollTop + this.#H / 2)];
    if (centreLine) {
      const c = centreLine.chapter;
      const want = [c - 1, c, c + 1].filter((x) => x >= 0 && x < this.#book.chapters.length);
      if (want.some((x) => !this.#blocks.has(x)) || this.#blocks.size !== want.length) {
        this.#setWindow(c);
        this.paintNow();
      }
    }
    this.#cb.onAnchor?.(this.currentAnchor());
  };

  #onResize = (): void => {
    if (!this.#mounted) return;
    const w = this.#scroller.clientWidth;
    const h = this.#scroller.clientHeight;
    if (w === this.#W && h === this.#H) return;
    const a = this.currentAnchor();
    if (w !== this.#W) {
      this.#relayout(a);
      return;
    }
    this.#measureViewport();
    this.#rebuildTable();
    this.scrollToAnchor(a);
    this.paintNow();
  };

  #applyTypography(): void {
    const { size, line } = TYPE_SCALE[this.#prefs.fontSize];
    this.#lh = line;
    this.#scroller.style.setProperty('--fs', `${size}px`);
    this.#scroller.style.setProperty('--lh', `${line}px`);
  }

  #measureViewport(): void {
    this.#H = this.#scroller.clientHeight;
    this.#W = this.#scroller.clientWidth;
    const pad = Math.max(0, this.#H / 2 - this.#lh / 2);
    this.#scroller.style.paddingTop = `${pad}px`;
    this.#scroller.style.paddingBottom = `${pad}px`;
    this.#probe.style.width = `${this.#W - 2 * SIDE}px`;
  }

  #relayout(a: Anchor): void {
    this.#applyTypography();
    this.#measureViewport();
    for (const { block } of this.#blocks.values()) block.remove();
    this.#blocks.clear();
    this.#lines = [];
    this.#setWindow(this.#clampChapter(a.chapter));
    this.scrollToAnchor(a);
    this.paintNow();
  }

  /** Mounts chapters centre±1, removes the rest, and keeps the text under the reader still. */
  #setWindow(centre: number): void {
    const want = new Set([centre - 1, centre, centre + 1].filter((x) => x >= 0 && x < this.#book.chapters.length));
    const refIdx = this.#lines.length ? this.#lineAt(this.#scroller.scrollTop + this.#H / 2) : -1;
    const ref = refIdx >= 0 ? this.#lines[refIdx] : undefined;
    const refTop = ref ? this.#top[refIdx]! : 0;

    for (const [idx, { block }] of this.#blocks) {
      if (!want.has(idx) && block !== ref?.el.parentElement) {
        block.remove();
        this.#blocks.delete(idx);
      }
    }
    for (const idx of [...want].sort((x, y) => x - y)) {
      if (this.#blocks.has(idx)) continue;
      const laid = layoutChapter(this.#probe, this.#book.chapters[idx]!);
      const next = [...this.#blocks.keys()].sort((x, y) => x - y).find((k) => k > idx);
      this.#content.insertBefore(laid.block, next === undefined ? null : this.#blocks.get(next)!.block);
      this.#blocks.set(idx, laid);
    }
    this.#rebuildTable();
    if (ref?.el.isConnected) this.#scroller.scrollTop += ref.el.offsetTop - refTop;
  }

  /** The only place line positions are read: once per layout change. */
  #rebuildTable(): void {
    for (let i = this.#win[0]; i < this.#win[1]; i++) {
      const l = this.#lines[i];
      if (l) l.el.style.willChange = '';
    }
    this.#lines = [...this.#blocks.keys()].sort((x, y) => x - y).flatMap((k) => this.#blocks.get(k)!.lines);
    const n = this.#lines.length;
    this.#top = new Float64Array(n);
    for (let i = 0; i < n; i++) this.#top[i] = this.#lines[i]!.el.offsetTop;
    this.#blur = new Float64Array(n).fill(Number.NaN);
    this.#opa = new Float64Array(n).fill(Number.NaN);
    this.#win = [0, 0];
  }

  #moveWindow(lo: number, hi: number): void {
    const [plo, phi] = this.#win;
    if (lo === plo && hi === phi) return;
    const wc = this.#prefs.tier === 'fallback' ? 'opacity' : 'filter, opacity';
    for (let i = plo; i < phi; i++) if (i < lo || i >= hi) this.#lines[i]!.el.style.willChange = '';
    for (let i = lo; i < hi; i++) if (i < plo || i >= phi) this.#lines[i]!.el.style.willChange = wc;
    this.#win = [lo, hi];
  }

  /** Index of the line whose box contains content-y `y`, else the nearest one. */
  #lineAt(y: number): number {
    const i = lowerBound(this.#top, y - this.#lh + 0.001);
    return Math.min(Math.max(0, i), this.#lines.length - 1);
  }

  #findLine(a: Anchor): number {
    let firstOfPara = -1;
    let firstOfChapter = -1;
    for (let i = 0; i < this.#lines.length; i++) {
      const l = this.#lines[i]!;
      if (l.chapter !== a.chapter) continue;
      if (firstOfChapter < 0) firstOfChapter = i;
      if (l.para !== a.para) continue;
      if (firstOfPara < 0) firstOfPara = i;
      if (l.sFirst <= a.sentence && a.sentence <= l.sLast) return i;
    }
    return firstOfPara >= 0 ? firstOfPara : firstOfChapter;
  }

  #clampChapter(c: number): number {
    return Math.min(Math.max(0, c), this.#book.chapters.length - 1);
  }

  #emitProgress(mid: number): void {
    const line = this.#lines[this.#lineAt(mid)];
    if (!line || !this.#cb.onProgress) return;
    const pct = Math.max(1, Math.min(100, Math.round((100 * line.wordEnd) / Math.max(1, this.#book.wordCount))));
    const chapterTitle = this.#book.chapters[line.chapter]?.title ?? '';
    const key = `${chapterTitle}|${pct}`;
    if (key === this.#progressKey) return;
    this.#progressKey = key;
    this.#cb.onProgress({ chapterTitle, pct });
  }
}
```

- [ ] **Step 5: Run the tests and fix only the engine**

Run: `npx vitest run --project browser tests/browser/engine.test.ts` → Expected: PASS in WebKit and Chromium.
If "pct is 100" fails with 99, the synthetic book's `wordCount` (split on spaces) and `countWords` disagree. Fix `makeBook` to compute `wordStart` with `countWords` from `src/core/ingest/text.ts`, not the engine.

- [ ] **Step 6: Commit**

```bash
git add src/core/reader/engine.ts tests/browser/engine.test.ts tests/browser/helpers.ts
git commit -m "Add ReaderEngine: focus-band paint, ±1 viewport window, chapter virtualisation, anchor (R-01, R-07)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Performance probe and fallback tier (R-01)

**Files:**
- Create: `src/core/reader/probe.ts`
- Test: `tests/unit/probe.test.ts`, `tests/browser/probe.test.ts`

**Interfaces:**
- Consumes: `ReaderEngine` (`scroller`, `paintNow`, `stats`), `Tier`
- Produces:
```ts
export interface ProbeResult { frames: number; dropped: number; ratio: number; avgPaintMs: number }
export function summarise(frameDeltas: number[], paintMs: number[]): ProbeResult;   // dropped = delta > 1.5 × median
export function decideTier(r: ProbeResult): Tier;                                   // 'full' iff ratio < 0.02 and avgPaintMs ≤ 4
export function runProbe(engine: Pick<ReaderEngine, 'scroller' | 'paintNow' | 'stats'>, frames?: number): Promise<ProbeResult>;
```

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/probe.test.ts
import { describe, expect, it } from 'vitest';
import { decideTier, summarise } from '../../src/core/reader/probe.ts';

describe('probe decisions (R-01)', () => {
  it('counts frames longer than 1.5 × the median as dropped (works at 60 and 120 Hz)', () => {
    expect(summarise([16.7, 16.6, 16.7, 40, 16.7], [1, 1, 1, 1, 1])).toMatchObject({ frames: 5, dropped: 1, ratio: 0.2 });
    expect(summarise([8.3, 8.4, 8.3, 8.3], [])).toMatchObject({ dropped: 0, ratio: 0 });
  });
  it('keeps full blur only under 2% drops and a 4ms paint budget', () => {
    expect(decideTier({ frames: 100, dropped: 1, ratio: 0.01, avgPaintMs: 2 })).toBe('full');
    expect(decideTier({ frames: 100, dropped: 2, ratio: 0.02, avgPaintMs: 2 })).toBe('fallback');
    expect(decideTier({ frames: 100, dropped: 0, ratio: 0, avgPaintMs: 4.5 })).toBe('fallback');
  });
  it('treats an empty run as a failure', () => expect(decideTier(summarise([], []))).toBe('fallback'));
});
```

- [ ] **Step 2: Write the failing browser test**

```ts
// tests/browser/probe.test.ts
import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/reader.css';
import { afterEach, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../../src/core/prefs/prefs.ts';
import { ReaderEngine } from '../../src/core/reader/engine.ts';
import { runProbe } from '../../src/core/reader/probe.ts';
import { host, makeBook } from './helpers.ts';

let engine: ReaderEngine | null = null;
afterEach(() => { engine?.destroy(); document.body.innerHTML = ''; });

it('scrolls for N frames, measures, and restores the scroll position', async () => {
  const el = host();
  engine = new ReaderEngine(el, makeBook(), { ...DEFAULT_PREFS, tier: 'full' });
  await engine.mount(null);
  const start = el.scrollTop;
  const r = await runProbe(engine, 40);
  expect(r.frames).toBe(40);
  expect(r.ratio).toBeGreaterThanOrEqual(0);
  expect(r.ratio).toBeLessThanOrEqual(1);
  expect(el.scrollTop).toBe(start);
});

it('fallback tier paints opacity but no per-line blur', async () => {
  const el = host();
  engine = new ReaderEngine(el, makeBook(), { ...DEFAULT_PREFS, tier: 'fallback' });
  await engine.mount(null);
  el.scrollTop = 1500;
  engine.paintNow();
  const lines = Array.from(el.querySelectorAll<HTMLElement>('.rd-line')).filter((l) => l.style.opacity !== '');
  expect(lines.length).toBeGreaterThan(10);
  for (const l of lines) expect(l.style.filter === '' || l.style.filter === 'none').toBe(true);
  expect(new Set(lines.map((l) => l.style.opacity)).size).toBeGreaterThan(3);
});
```

- [ ] **Step 3: Run both to confirm they fail**

Run: `npx vitest run tests/unit/probe.test.ts tests/browser/probe.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/core/reader/probe.ts`**

```ts
import type { Tier } from '../prefs/prefs.ts';
import type { ReaderEngine } from './engine.ts';

export interface ProbeResult { frames: number; dropped: number; ratio: number; avgPaintMs: number }

export function summarise(frameDeltas: number[], paintMs: number[]): ProbeResult {
  const sorted = [...frameDeltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 16.7;
  const dropped = frameDeltas.filter((d) => d > median * 1.5).length;
  return {
    frames: frameDeltas.length,
    dropped,
    ratio: frameDeltas.length ? dropped / frameDeltas.length : 1,
    avgPaintMs: paintMs.length ? paintMs.reduce((a, b) => a + b, 0) / paintMs.length : 0,
  };
}

export function decideTier(r: ProbeResult): Tier {
  return r.ratio < 0.02 && r.avgPaintMs <= 4 ? 'full' : 'fallback';
}

/** First-launch probe: scrolls the real reader for `frames` frames with full blur and measures. */
export function runProbe(engine: Pick<ReaderEngine, 'scroller' | 'paintNow' | 'stats'>, frames = 120, warmup = 10): Promise<ProbeResult> {
  const el = engine.scroller;
  const start = el.scrollTop;
  const deltas: number[] = [];
  const paint: number[] = [];
  let dir = 1;
  let last = 0;
  let n = 0;
  return new Promise((resolve) => {
    const step = (ts: number): void => {
      if (last && n > warmup) deltas.push(ts - last);
      last = ts;
      n++;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) dir = -1;
      if (el.scrollTop <= 0) dir = 1;
      el.scrollTop += 6 * dir;
      engine.paintNow();
      if (n > warmup) paint.push(engine.stats.lastPaintMs);
      if (deltas.length < frames) {
        requestAnimationFrame(step);
      } else {
        el.scrollTop = start;
        engine.paintNow();
        resolve(summarise(deltas, paint));
      }
    };
    requestAnimationFrame(step);
  });
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/probe.test.ts tests/browser/probe.test.ts` → Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/reader/probe.ts tests/unit/probe.test.ts tests/browser/probe.test.ts
git commit -m "Add first-launch performance probe and fallback tier (R-01)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Position persistence (R-07)

**Files:**
- Create: `src/core/reader/position.ts`
- Test: `tests/unit/position.test.ts`

**Interfaces:**
- Consumes: `Db`, `migrate`, `nodeDb`, `saveParsedBook`, `getBook`; `Anchor`
- Produces:
```ts
export function loadPosition(db: Db, bookId: string): Promise<Anchor | null>;
export function savePosition(db: Db, bookId: string, a: Anchor, pct: number, now?: number): Promise<void>;  // also sets book.pct
export class PositionSaver {
  constructor(save: (a: Anchor, pct: number) => Promise<void>, delayMs?: number);  // default 1000
  push(a: Anchor, pct: number): void;
  flush(): Promise<void>;
}
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/position.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from '../../src/core/db/migrations.ts';
import type { Db } from '../../src/core/db/types.ts';
import { getBook, saveParsedBook } from '../../src/core/library/library.ts';
import { loadPosition, PositionSaver, savePosition } from '../../src/core/reader/position.ts';
import { nodeDb } from '../helpers/nodeDb.ts';

describe('position store', () => {
  let db: Db;
  beforeEach(async () => {
    db = nodeDb();
    await migrate(db);
    await saveParsedBook(db, { id: 'b', title: 'B', author: '', wordCount: 1, chapters: [{ title: 'C', paras: [['x.']], wordCount: 1 }] }, 'epub', 0);
  });

  it('R-07: saves and loads the anchor, and updates book.pct', async () => {
    expect(await loadPosition(db, 'b')).toBeNull();
    await savePosition(db, 'b', { chapter: 3, para: 12, sentence: 2 }, 41, 5);
    await savePosition(db, 'b', { chapter: 3, para: 14, sentence: 0 }, 42, 6);
    expect(await loadPosition(db, 'b')).toEqual({ chapter: 3, para: 14, sentence: 0 });
    expect((await getBook(db, 'b'))!.pct).toBe(42);
  });
});

describe('PositionSaver', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('debounces to one save of the latest anchor after 1s', async () => {
    const save = vi.fn(async () => {});
    const s = new PositionSaver(save);
    s.push({ chapter: 0, para: 1, sentence: 0 }, 1);
    await vi.advanceTimersByTimeAsync(500);
    s.push({ chapter: 0, para: 2, sentence: 0 }, 2);
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ chapter: 0, para: 2, sentence: 0 }, 2);
  });

  it('flush saves immediately (app backgrounded mid-debounce, Review Focus 5)', async () => {
    const save = vi.fn(async () => {});
    const s = new PositionSaver(save);
    s.push({ chapter: 1, para: 0, sentence: 0 }, 9);
    await s.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing pending does nothing', async () => {
    const save = vi.fn(async () => {});
    await new PositionSaver(save).flush();
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run --project unit tests/unit/position.test.ts` → Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/core/reader/position.ts`**

```ts
import type { Db } from '../db/types.ts';
import type { Anchor } from '../types.ts';

export async function loadPosition(db: Db, bookId: string): Promise<Anchor | null> {
  const [r] = await db.all<Anchor>('SELECT chapter, para, sentence FROM position WHERE book_id = ?', [bookId]);
  return r ? { chapter: r.chapter, para: r.para, sentence: r.sentence } : null;
}

export async function savePosition(db: Db, bookId: string, a: Anchor, pct: number, now = Date.now()): Promise<void> {
  await db.tx(async () => {
    await db.run(
      `INSERT INTO position (book_id, chapter, para, sentence, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(book_id) DO UPDATE SET chapter = excluded.chapter, para = excluded.para,
         sentence = excluded.sentence, updated_at = excluded.updated_at`,
      [bookId, a.chapter, a.para, a.sentence, now],
    );
    await db.run('UPDATE book SET pct = ? WHERE id = ?', [pct, bookId]);
  });
}

/** Debounces anchor saves (README: 1s). Call flush() when the app is hidden or the reader closes. */
export class PositionSaver {
  #save: (a: Anchor, pct: number) => Promise<void>;
  #delay: number;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending: { a: Anchor; pct: number } | null = null;

  constructor(save: (a: Anchor, pct: number) => Promise<void>, delayMs = 1000) {
    this.#save = save;
    this.#delay = delayMs;
  }

  push(a: Anchor, pct: number): void {
    this.#pending = { a, pct };
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => { void this.flush(); }, this.#delay);
  }

  async flush(): Promise<void> {
    clearTimeout(this.#timer);
    const p = this.#pending;
    this.#pending = null;
    if (p) await this.#save(p.a, p.pct);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --project unit tests/unit/position.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/reader/position.ts tests/unit/position.test.ts
git commit -m "Add position persistence with 1s debounced saver (R-07)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: ReaderView, app wiring, eyebrow, masks, dev tools and e2e

**Files:**
- Create: `src/app/boot.ts`, `src/app/devtools.ts`, `src/views/ReaderView.tsx`, `src/views/FpsMeter.tsx`, `src/views/DevPanel.tsx`
- Modify: `src/App.tsx`, `src/styles/reader.css`
- Test: `tests/e2e/reader.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
```ts
// src/app/boot.ts
export interface Session { db: Db; prefs: PrefsStore }
export function boot(): Promise<Session>;          // open user.db, migrate, seed bundled books, load prefs
// src/app/devtools.ts
export const devTools: boolean;                     // ?dev=1 or VITE_DEV_TOOLS=1
export function exposeDevHandle(h: { engine: ReaderEngine; prefs: PrefsStore }): void;   // window.__spotlight
```

- [ ] **Step 1: Write the e2e test first**

```ts
// tests/e2e/reader.spec.ts
import { expect, test, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.locator('.rd-line[data-p]').first().waitFor();
  await expect(page.locator('.rd-probing')).toHaveCount(0, { timeout: 20_000 });
}

test('makes no network requests outside the app origin', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
  });
  await page.goto('/?book=gatsby');
  await ready(page);
  expect(foreign).toEqual([]);
});

test('opens The Great Gatsby with the chapter eyebrow and 1%', async ({ page }) => {
  await page.goto('/?book=gatsby');
  await ready(page);
  await expect(page.locator('.rd-eyebrow-chapter')).toHaveText('Chapter I');
  await expect(page.locator('.rd-eyebrow-pct')).toHaveText('1%');
  await expect(page.locator('.rd-line[data-p="0"]').first()).toContainText('In my younger and more vulnerable years');
});

test('R-07: a reload restores the same paragraph into the band', async ({ page }) => {
  await page.goto('/?book=gatsby&dev=1');
  await ready(page);
  await page.evaluate(() => { document.querySelector('.rd-scroll')!.scrollTop += 6000; });
  await page.waitForTimeout(1800); // idle 180ms + save debounce 1000ms
  const before = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  await page.reload();
  await ready(page);
  const after = await page.evaluate(() => window.__spotlight!.engine.currentAnchor());
  expect([after.chapter, after.para]).toEqual([before.chapter, before.para]);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm run e2e` → Expected: FAIL (the placeholder app has no `.rd-line`).

- [ ] **Step 3: Write `src/app/boot.ts` and `src/app/devtools.ts`**

```ts
// src/app/boot.ts
import { openCapacitorDb } from '../core/db/capacitor.ts';
import { migrate } from '../core/db/migrations.ts';
import type { Db } from '../core/db/types.ts';
import { BUNDLED } from '../core/library/bundled.ts';
import { seedBundled } from '../core/library/library.ts';
import { PrefsStore } from '../core/prefs/prefs.ts';
import type { ParsedBook } from '../core/types.ts';

export interface Session { db: Db; prefs: PrefsStore }

let booting: Promise<Session> | null = null;

/** Idempotent: React StrictMode runs effects twice in dev, and seeding must not run concurrently. */
export function boot(): Promise<Session> {
  booting ??= start();
  return booting;
}

async function start(): Promise<Session> {
  const db = await openCapacitorDb('user');
  await migrate(db);
  await seedBundled(db, BUNDLED.map((b) => b.id), async (id) => {
    const res = await fetch(`${import.meta.env.BASE_URL}books/${id}.json`);
    if (!res.ok) throw new Error(`内置书籍缺失：${id}`);
    return (await res.json()) as ParsedBook;
  });
  return { db, prefs: await PrefsStore.load(db) };
}
```

```ts
// src/app/devtools.ts
import type { PrefsStore } from '../core/prefs/prefs.ts';
import type { ReaderEngine } from '../core/reader/engine.ts';

declare global {
  interface Window { __spotlight?: { engine: ReaderEngine; prefs: PrefsStore } }
}

export const devTools: boolean =
  import.meta.env.VITE_DEV_TOOLS === '1' || new URLSearchParams(location.search).has('dev');

export function exposeDevHandle(h: { engine: ReaderEngine; prefs: PrefsStore }): void {
  if (devTools) window.__spotlight = h;
}
```

- [ ] **Step 4: Write the views**

```tsx
// src/views/ReaderView.tsx
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Session } from '../app/boot.ts';
import { devTools, exposeDevHandle } from '../app/devtools.ts';
import { ReaderEngine, type EngineBook } from '../core/reader/engine.ts';
import { PositionSaver, savePosition } from '../core/reader/position.ts';
import { decideTier, runProbe } from '../core/reader/probe.ts';
import type { Anchor } from '../core/types.ts';
import { DevPanel } from './DevPanel.tsx';
import { FpsMeter } from './FpsMeter.tsx';

interface Props { session: Session; book: EngineBook; initialAnchor: Anchor | null }

export function ReaderView({ session, book, initialAnchor }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chapterRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const [prefs, setPrefs] = useState(session.prefs.get());
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const saver = new PositionSaver((a, pct) => savePosition(session.db, book.id, a, pct));
    let pct = 1;
    const engine = new ReaderEngine(scrollRef.current!, book, session.prefs.get(), {
      // Written straight to the DOM: no React render per scroll frame.
      onProgress: (p) => {
        chapterRef.current!.textContent = p.chapterTitle;
        pctRef.current!.textContent = `${p.pct}%`;
        pct = p.pct;
      },
      onAnchor: (a) => saver.push(a, pct),
    });
    engineRef.current = engine;
    exposeDevHandle({ engine, prefs: session.prefs });
    const unsubscribe = session.prefs.subscribe((p) => { engine.setPrefs(p); setPrefs(p); });
    const onHide = () => { if (document.visibilityState === 'hidden') void saver.flush(); };
    const onPageHide = () => { void saver.flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    let cancelled = false;
    void engine.mount(initialAnchor).then(async () => {
      if (cancelled || session.prefs.get().tier !== null) return;
      setProbing(true);
      const result = await runProbe(engine);
      if (cancelled) return;
      await session.prefs.set('tier', decideTier(result));
      setProbing(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void saver.flush();
      engine.destroy();
      engineRef.current = null;
    };
  }, [session, book, initialAnchor]);

  const vars = { '--focus-pct': prefs.focusPct, '--blur-max': `${prefs.blurMax}px` } as CSSProperties;
  return (
    <div className="rd-page" style={vars}>
      <div ref={scrollRef} />
      {prefs.tier === 'fallback' && (
        <>
          <div className="rd-bblur rd-bblur-top" />
          <div className="rd-bblur rd-bblur-bottom" />
        </>
      )}
      <div className="rd-mask rd-mask-top" />
      <div className="rd-mask rd-mask-bottom" />
      <div className="rd-eyebrow">
        <span ref={chapterRef} className="rd-eyebrow-chapter" />
        <span ref={pctRef} className="rd-eyebrow-pct">1%</span>
      </div>
      {probing && <p className="rd-probing">正在适配这台设备…</p>}
      {devTools && <FpsMeter engine={engineRef} />}
      {devTools && <DevPanel prefs={session.prefs} />}
    </div>
  );
}
```

```tsx
// src/views/FpsMeter.tsx
import { useEffect, useState, type RefObject } from 'react';
import type { ReaderEngine } from '../core/reader/engine.ts';
import { summarise } from '../core/reader/probe.ts';

/** Dev overlay: fps, dropped-frame ratio and last paint cost, refreshed twice a second. */
export function FpsMeter({ engine }: { engine: RefObject<ReaderEngine | null> }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let since = performance.now();
    const deltas: number[] = [];
    const loop = (ts: number) => {
      if (last) deltas.push(ts - last);
      last = ts;
      if (ts - since >= 500 && deltas.length) {
        const r = summarise(deltas.splice(0), []);
        const fps = Math.round((r.frames * 1000) / (ts - since));
        setText(`${fps} fps · drop ${(r.ratio * 100).toFixed(1)}% · paint ${(engine.current?.stats.lastPaintMs ?? 0).toFixed(2)}ms`);
        since = ts;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);
  return <div className="dev-fps">{text}</div>;
}
```

```tsx
// src/views/DevPanel.tsx
import { useEffect, useState } from 'react';
import type { FontSize, PrefsStore, Tier } from '../core/prefs/prefs.ts';

/** Temporary controls for M1 testing (the real SettingsSheet is M3). Shown only with ?dev=1. */
export function DevPanel({ prefs }: { prefs: PrefsStore }) {
  const [p, setP] = useState(prefs.get());
  useEffect(() => prefs.subscribe((next) => setP(next)), [prefs]);
  return (
    <div className="dev-panel">
      {(['S', 'M', 'L'] as FontSize[]).map((s) => (
        <button key={s} aria-pressed={p.fontSize === s} onClick={() => void prefs.set('fontSize', s)}>{s}</button>
      ))}
      <label>band {p.focusPct}%
        <input type="range" min={20} max={80} step={5} value={p.focusPct} onChange={(e) => void prefs.set('focusPct', Number(e.target.value))} />
      </label>
      <label>blur {p.blurMax}
        <input type="range" min={2} max={14} step={1} value={p.blurMax} onChange={(e) => void prefs.set('blurMax', Number(e.target.value))} />
      </label>
      <label><input type="checkbox" checked={p.sentenceMode} onChange={(e) => void prefs.set('sentenceMode', e.target.checked)} /> sentence</label>
      <select value={p.tier ?? ''} onChange={(e) => void prefs.set('tier', (e.target.value || null) as Tier | null)}>
        <option value="">probe</option><option value="full">full</option><option value="fallback">fallback</option>
      </select>
    </div>
  );
}
```

```tsx
// src/App.tsx
import { useEffect, useState } from 'react';
import { boot, type Session } from './app/boot.ts';
import { getBook, getChapters, listBooks, markOpened } from './core/library/library.ts';
import type { EngineBook } from './core/reader/engine.ts';
import { loadPosition } from './core/reader/position.ts';
import type { Anchor } from './core/types.ts';
import './styles/reader.css';
import { ReaderView } from './views/ReaderView.tsx';

interface Opened { session: Session; book: EngineBook; anchor: Anchor | null }

/** M1: opens a book directly (?book=<id>, else last opened, else gatsby). Home arrives in M3. */
export function App() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const session = await boot();
      const requested = new URLSearchParams(location.search).get('book');
      const recent = (await listBooks(session.db)).find((b) => b.openedAt !== null)?.id;
      const id = requested ?? recent ?? 'gatsby';
      const row = await getBook(session.db, id);
      if (!row) throw new Error(`没有找到这本书：${id}`);
      const chapters = await getChapters(session.db, id);
      await markOpened(session.db, id, Date.now());
      const anchor = await loadPosition(session.db, id);
      if (live) setOpened({ session, book: { id, wordCount: row.wordCount, chapters }, anchor });
    })().catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, []);

  if (error) return <p className="app-error">{error}</p>;
  if (!opened) return null;
  return <ReaderView session={opened.session} book={opened.book} initialAnchor={opened.anchor} />;
}
```

- [ ] **Step 5: Append the chrome styles to `src/styles/reader.css`**

```css
.rd-mask { position: absolute; left: 0; right: 0; pointer-events: none; z-index: 2; }
.rd-mask-top { top: 0; height: 150px; background: linear-gradient(var(--paper) 22%, transparent); }
.rd-mask-bottom { bottom: 0; height: 130px; background: linear-gradient(transparent, var(--paper) 72%); }
.rd-eyebrow {
  position: absolute; top: 58px; left: 0; right: 0; padding: 0 34px; z-index: 3; pointer-events: none;
  display: flex; justify-content: space-between;
  font: 400 11px/1 'IBM Plex Sans', system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase;
  color: rgba(34, 31, 27, .38);
}
/* Fallback tier (R-01): two static blur layers instead of per-line blur. */
.rd-bblur {
  position: absolute; left: 0; right: 0; z-index: 1; pointer-events: none;
  height: calc(50% - var(--focus-pct) * 0.5%);
  backdrop-filter: blur(var(--blur-max)); -webkit-backdrop-filter: blur(var(--blur-max));
}
.rd-bblur-top { top: 0; mask-image: linear-gradient(#000 30%, transparent); -webkit-mask-image: linear-gradient(#000 30%, transparent); }
.rd-bblur-bottom { bottom: 0; mask-image: linear-gradient(transparent, #000 70%); -webkit-mask-image: linear-gradient(transparent, #000 70%); }
.rd-probing {
  position: absolute; left: 0; right: 0; bottom: 48px; margin: 0; text-align: center; z-index: 3;
  font: 400 12px/1 'PingFang SC', 'IBM Plex Sans', system-ui, sans-serif; color: rgba(34, 31, 27, .62);
}
.app-error { padding: 80px 34px; font: 400 14px/1.6 'PingFang SC', system-ui, sans-serif; color: var(--reader-ink); }
.dev-fps {
  position: absolute; top: 8px; right: 8px; z-index: 10; padding: 4px 6px; border-radius: 4px;
  background: rgba(0, 0, 0, .7); color: #fff; font: 11px/1 ui-monospace, monospace; pointer-events: none;
}
.dev-panel {
  position: absolute; left: 8px; right: 8px; bottom: 8px; z-index: 10; display: flex; flex-wrap: wrap; gap: 6px;
  padding: 6px; border-radius: 6px; background: rgba(0, 0, 0, .75); color: #fff; font: 11px system-ui;
}
.dev-panel button { min-width: 44px; min-height: 44px; }
```

- [ ] **Step 6: Run the e2e tests and the whole suite**

Run: `npm run e2e` → Expected: 3 passed (webkit-phone).
Run: `npx vitest run && npx tsc --noEmit` → Expected: all pass, no type errors.

- [ ] **Step 7: Check it by eye**

Run: `npm run dev` and open `http://localhost:5173/?book=gatsby&dev=1`, using the Browser pane or Safari at a 402×874 viewport. Expected:
- sharp text in the middle third, fading and blurring towards the edges
- `CHAPTER I` on the left and a percentage on the right
- after the probe caption disappears, the FPS overlay shows about 60 fps
- tapping L keeps the same paragraph in the band

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Wire ReaderView: eyebrow, masks, fallback layers, probe, position save; e2e for zero network and R-07" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: iOS shell on the simulator, with a first performance reading

**Files:**
- Create: `capacitor.config.ts`, `ios/` (generated), `docs/perf/m1-simulator.md`
- Modify: `package.json` (add a `build:ios` script)

**Interfaces:**
- Consumes: the built `dist/`
- Produces: an iOS app `Spotlight` (`com.lin.spotlight`) that runs on the iOS 27 simulator

- [ ] **Step 1: Install and configure**

```bash
npm i @capacitor/ios
npm i -D @capacitor/cli
```

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lin.spotlight',
  appName: 'Spotlight',
  webDir: 'dist',
  // The reader's own container scrolls; the web view itself must not bounce or inset content.
  ios: { contentInset: 'never', scrollEnabled: false },
};

export default config;
```

Add this script: `"build:ios": "VITE_DEV_TOOLS=1 npm run build && npx cap sync ios"`.

- [ ] **Step 2: Generate the iOS project**

```bash
npm run build
npx cap add ios --packagemanager SPM
npx cap sync ios
```

Expected: an `ios/App` folder is created and sync reports the `@capacitor-community/sqlite` plugin.
If the plugin refuses SPM, do the following, then rerun the two `cap` commands with `--packagemanager CocoaPods`, and record the switch in the commit message:
```bash
brew install cocoapods
rm -rf ios
```

- [ ] **Step 3: Run on the simulator**

```bash
xcrun simctl list devices available | grep -E "iPhone" | head -5
npm run build:ios
npx cap run ios --target <UDID of an iPhone from the list>
```

Expected: the simulator shows *The Great Gatsby* chapter I with the focus band, the eyebrow and the FPS overlay. On first launch the caption 正在适配这台设备… appears for about 2s and then disappears.

- [ ] **Step 4: Capture evidence**

```bash
xcrun simctl io booted screenshot docs/perf/m1-simulator.png
```

Scroll for about 10 seconds in the simulator, then write `docs/perf/m1-simulator.md` containing:
- the device model and iOS version
- the tier the probe chose (from the dev panel's select)
- the fps / drop % / paint ms figures from the overlay while scrolling
- the note: "Simulator figures use the Mac GPU and are **not** evidence for R-01. R-01 must be re-measured on a real mid-range iPhone (M4)."

- [ ] **Step 5: Kill-and-restore check (R-07 on iOS)**

1. Scroll to a recognisable paragraph and wait 2s.
2. Kill the app: `xcrun simctl terminate booted com.lin.spotlight`.
3. Relaunch it: `xcrun simctl launch booted com.lin.spotlight`.

Expected: the same paragraph is in the band. Record the result in `docs/perf/m1-simulator.md`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add Capacitor iOS shell (Spotlight, com.lin.spotlight) and first simulator perf notes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Acceptance coverage (M1)

| Spec item | Where |
|---|---|
| TASKS 1 · scaffold, fonts, SQLite `user.db` migrations | Tasks 1, 4, 12 |
| TASKS 2 · bundled book in `Chapter` rows, exact 4a type | Tasks 3, 5, 7 (19.5/34, 34px sides), 11 |
| TASKS 3 · line table once per layout; virtualise chapter ±1 | Tasks 7, 8 |
| TASKS 4 · focus band engine **R-01** | Tasks 6, 8 |
| TASKS 5 · probe, `Settings.tier`, fallback **R-01** | Tasks 9, 11 |
| TASKS 6 · eyebrow + live %, fade masks | Tasks 8 (progress), 11 |
| TASKS 7 · position save/restore **R-07** | Tasks 8, 10, 11 (e2e), 12 (iOS kill test) |
| Zero network requests | Task 1 (no Google Fonts), Task 11 e2e |
| S-01 persistence (store only; the sheet is M3) | Task 5 |

**Not in M1:** Home, import UI, word drawer, footnotes, the settings sheet UI, the reader top bar and toolbar, the open-book transition, and `dict.db`. These are M2 and M3.
