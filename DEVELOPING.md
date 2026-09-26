# Developing Spotlight

## One-time setup

- **Node 22+** (the build scripts run `.ts` files directly with Node).
- **Xcode 27** with the iOS simulator installed, and `xcode-select` pointing at Xcode.

```bash
npm install
npx playwright install webkit chromium
```

## Run the web version

```bash
npm run dev
```

Open the printed URL with `?dev=1`, e.g. `http://localhost:5173/?book=gatsby&dev=1`, and set the browser to a phone size (402 × 874).

- `?book=gatsby | farewell | falcon` picks the book.
- `?dev=1` shows the FPS readout and temporary controls: font size S/M/L, focus band, blur, sentence mode, and tier (`probe` / `full` / `fallback`).

## Run on the iOS simulator

```bash
npm run build:ios
npx cap open ios
```

In Xcode, pick an iPhone simulator and press ▶. `build:ios` turns the dev tools on. For a clean build, use `npm run build && npx cap sync ios` instead.

## Tests

```bash
npm test
npm run e2e
```

- `npm test` runs the unit tests (Node) and the browser tests (WebKit + Chromium).
- `npm run e2e` runs the full app in WebKit at iPhone size: zero network requests, and the reading position restored after a reload.

## Where things are

- `src/core/`: framework-free domain code (`ingest`, `library`, `db`, `prefs`, `reader`).
- `src/views/`: React.
- `scripts/build-books.ts`: turns `books/*.epub` into `public/books/*.json` (runs before `dev` and `build`).
- `docs/plans/`: implementation plans. `docs/research/`: research notes. `docs/perf/`: measurements.
