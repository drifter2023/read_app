# Developing Spotlight

## One-time setup

- **Node 22+** (the build scripts run `.ts` files directly with Node).
- **Xcode 27** with the iOS simulator installed, and `xcode-select` pointing at Xcode.

```bash
npm install
npx playwright install webkit chromium
```

The first `npm run dev` or `npm run build` downloads the dictionary sources once (about 70 MB: ECDICT, ipa-dict `en_US`, the WordNet exception lists) into `.cache/dict/` and builds `public/dict.db` (about 5 MB). This is build time only; the app itself makes no network requests.

## Run the web version

```bash
npm run dev
```

Open the printed URL and set the browser to a phone size (402 × 874).

- `/` is Home. `?book=gatsby | farewell | falcon` opens a book directly.
- `?dev=1` adds an FPS readout and a tier switch (`probe` / `full` / `fallback`), and exposes `window.__spotlight`.

## Run on the iOS simulator

```bash
npm run build:ios
npx cap open ios
```

In Xcode, pick an iPhone simulator and press ▶. `npm run build:ios:dev` builds with the developer overlay turned on.

## Mobile web build (offline)

`npm run build` writes `dist/`, including `sw.js`, a service worker that precaches every file (about 9 MB with the dictionary). After the first visit the web app runs with no network, and Home-screen installs work through `manifest.webmanifest`. Host `dist/` as static files over HTTPS; any path works because the build uses relative URLs.

## Tests

```bash
npm test
npm run e2e
```

- `npm test`: unit tests (Node) and browser tests (WebKit + Chromium). `tests/unit/dict-data.test.ts` also checks the real `dict.db` when it has been built.
- `npm run e2e`: the whole app at iPhone size in WebKit. It covers every acceptance ID: zero network, R-04 to R-07, R-09, R-10, H-01 to H-05, S-01, the log export, and offline use (that one runs in Chromium; see `playwright.config.ts`).

## Scripts

| Script | What it does |
|---|---|
| `npm run books` | `books/*.epub` → `public/books/*.json` and `public/covers/*.jpg` |
| `npm run dict` | ECDICT + ipa-dict + WordNet → `public/dict.db`; fails if under 98% of the bundled books' words resolve |
| `node scripts/make-icons.ts` | renders `design/icon/icon.html` to the iOS app icon and `public/icons/` |

## Where things are

- `src/core/`: framework-free domain code — `ingest` (EPUB/TXT, Worker), `library`, `db`, `prefs`, `reader` (engine, layout, hit test, decorations), `dict` (lemma, gloss, service), `annot` (Lookup rows, footnotes), `metrics`.
- `src/app/`: platform glue — boot, dictionary loader, import, share, haptics, offline.
- `src/views/`: React — `home/`, `reader/`, `WordDrawer`, `Flight`.
- `docs/plans/`: plans and decision notes. `docs/research/`: research. `docs/perf/`: measurements.
