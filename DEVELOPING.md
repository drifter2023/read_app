# Developing Spotlight

## One-time setup

- **Node 22** (`.nvmrc`; the build scripts run `.ts` files directly with Node).
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

## Publish the mobile web build (Cloudflare)

Production is https://spotlight-reader.ai-core.workers.dev (`wrangler.jsonc`, Worker name `spotlight-reader`). One deploy updates the static site and `POST /api/fetch` together. `public/_headers` makes `index.html` and `sw.js` revalidate on every visit, so phones pick up new deploys.

The delivery path is GitHub Actions, not a laptop:

1. Open a pull request. `.github/workflows/ci.yml` runs `npm run build`, `npm test`, and `npm run e2e` on Node 22. The dictionary sources are cached from `.cache/dict`. In CI, Playwright serves the `dist/` that job just built (`npm run preview` only).
2. When those checks pass, the same workflow uploads a Worker **version** with alias `pr-<number>`. That preview does not take production traffic. The URL is commented on the pull request (`preview_urls` in `wrangler.jsonc`).
3. Merge to `main`. CI runs again on that commit. When it succeeds, `.github/workflows/deploy-web.yml` deploys the **same** `dist/` artifact with `npx wrangler deploy`. It does not rebuild the dictionary.

`npm run deploy:web` still builds and deploys from a machine where `npx wrangler login` has been done. Use it only when Actions cannot run. Do not use `build:ios:dev` for the web production build (`VITE_DEV_TOOLS=1`).

### GitHub settings (once)

Repository → Settings → Secrets and variables → Actions. Both the preview upload and the production deploy read these. The test job does not. Do not add a DeepSeek key or any `VITE_*` secret; reader keys stay on the device, and the Worker stores no URLs.

- `CLOUDFLARE_API_TOKEN` — Workers Scripts edit on this account only.
- `CLOUDFLARE_ACCOUNT_ID` — the account whose `workers.dev` subdomain is `ai-core`.

Repository → Settings → Rules → Rulesets (or Branches). Protect `main`:

- Require a pull request before merging. Do not allow direct pushes.
- Require the status check **CI** (job `CI` in `.github/workflows/ci.yml`). Also require **Preview** so a pull request cannot merge without a preview upload.

`deploy-web.yml` is read from `main`. The merge that adds these workflows runs CI on that commit, and a green result deploys it.

## Tests

```bash
npm test
npm run e2e
```

- `npm test`: unit tests (Node) and browser tests (WebKit + Chromium). `tests/unit/dict-data.test.ts` also checks the real `dict.db` when it has been built.
- `npm run e2e`: the whole app at iPhone size in WebKit. It covers every acceptance ID: zero network, R-04 to R-07, R-09, R-10, H-01 to H-05, S-01, the log export, and offline use (that one runs in Chromium; see `playwright.config.ts`).

## Component stories (Storybook)

```bash
npm run storybook
```

Opens on http://localhost:6006 (dev only; nothing in it ships in the app). Each component has its stories next to it (`*.stories.tsx`). Reader: 单词抽屉, 语法抽屉, 阅读设置, 顶部栏与胶囊, 目录, 选中与问旁注, Agent 抽屉. Home: 首页 (the whole page), 书架行, 导入, 确认, 预测生词, 词汇量测试, AI 语法分析. The toolbar switches 纸白 / 夜读. Like the app it serves `public/` (covers, dict.db), so run `npm run assets` once first.

- Stories run on fixtures in `src/views/_stories/`: Gatsby's opening lines, a still reader page (`ReaderPage`) in a 402 × 874 phone frame (`Phone`, or `HomeScreen` for Home), a shelf (`SHELF`, `shelfDb`), and an in-memory `user.db` (`memDb`, `bookDb`, `prefsWith`). No DeepSeek calls: AI answers are written into the stories.
- Home components need the `.home` root around them (it sets `--zh` and `--sec`; `HomeScreen` does that); reader overlays go in `ReaderPage`'s `overlay`, drawers in its gap (`gapAfter`).
- Components that load data themselves have a display part for stories: `VocabCardView`, `CalibrationScreen`. No story may press 确认 with a key or send a question: that would call DeepSeek.
- When a component changes, update its stories in the same commit. They are also the source for `/design-sync` (the design system in Claude Design).
- `npm run build-storybook` builds the static site into `storybook-static/` (gitignored).

## Scripts

| Script | What it does |
|---|---|
| `npm run books` | `books/*.epub` → `public/books/*.json` and `public/covers/*.jpg` |
| `npm run dict` | ECDICT + ipa-dict + WordNet → `public/dict.db`; fails if under 98% of the bundled books' words resolve |
| `node scripts/make-icons.ts` | renders `design/icon/icon.html` to the iOS app icon and `public/icons/` |

## Where things are

- `src/core/`: framework-free domain code — `ingest` (EPUB/TXT, Worker), `library`, `db`, `prefs`, `reader` (engine, layout, hit test, decorations), `dict` (lemma, gloss, service), `annot` (Lookup rows, footnotes), `metrics`.
- `src/app/`: platform glue — boot, dictionary loader, import, share, haptics, offline.
- `src/views/`: React — `home/`, `reader/`, `agent/`, `WordDrawer`, `Flight`; `*.stories.tsx` next to the components, story fixtures in `_stories/`.
- `docs/plans/`: plans and decision notes. `docs/research/`: research. `docs/perf/`: measurements.
