# Account sync and one-time book transfer (M10, proposal)

Owner request 2026-10-13, after a review of the copyright and legal options (conversation of 2026-10-13):
the reader signs in, and their reading state follows them between devices; a book file can be moved
from one of their devices to another through an encrypted, one-time hand-off. **The server never keeps
a book.** Web build only; iOS later.

Status: **proposal, waiting for the owner's decisions in §11.** Building it changes the scope guard in
`CLAUDE.md` (accounts and sync are on the "Do NOT build" list today); that edit is the first commit of M10.

---

## 1. Goals and non-goals

**Goals**
- G1. Sign in on a second device and carry on: same position, same footnotes, same 撤回, same predicted-word model, same settings.
- G2. Match books across devices **without the server holding any of their text** (§3).
- G3. Move a book file to another of your own devices: end-to-end encrypted, same account only, one at a time, deleted the moment it arrives, and never older than 24 h (§6).
- G4. Fit the Cloudflare free plan for the first ~1,000 daily readers (§9).
- G5. Every part works offline; sync catches up later.

**Non-goals (this version)**
- A cloud bookshelf or library: no stored books, no download-again-later.
- Sharing of any kind: no links, no other accounts, no public shelf, no cross-user search or "popular".
- Syncing grammar analyses, Agent conversations, exposure counts, metrics, or the DeepSeek key (§4.4).
- iOS, Android, desktop apps; peer-to-peer (WebRTC) transfer.
- Serving readers in mainland China (§10.1).

---

## 2. Architecture

```
 Device A (web app)                        Cloudflare                         Device B (web app)
 ─────────────────                         ──────────                         ─────────────────
 user.db (sql.js) ──outbox──► Worker /api/sync ──► D1: entries (no text)  ◄── pull since cursor ── user.db
 book_key = HMAC(user key,                 /api/auth  ──► D1: users, sessions, devices
            content fingerprint)           /api/transfer ─► R2 (private): ciphertext, ≤ 24 h
 AES-GCM encrypt ─────────────────────────► R2 object ────────────────────────► AES-GCM decrypt → import
 key shown as QR / code  ─ ─ ─ (never sent to the server; read by device B's camera or typed) ─ ─ ─►
```

- One Worker (`server/worker.ts`, already deployed for `/api/fetch`) gains `/api/auth/*`, `/api/sync`, `/api/transfer/*`, `/api/account/*`.
- Bindings: D1 `DB`, R2 `TRANSFERS`, rate limiters, a daily Cron trigger. All on the Workers Free plan.
- New framework-free module `src/core/sync/` (fingerprint, book key, entries, merge, outbox, transfer crypto). Views call it; the reader engine is untouched.
- Local dev and e2e: the Vite plugin passes bindings from `wrangler`'s `getPlatformProxy()` (local D1 and R2 through Miniflare), so the same handler runs everywhere.

---

## 3. Book identity without text

### 3.1 Content fingerprint (on the device)
`content_key = SHA-256( every word of the book, in order, joined by one space )`. Words come from the
same tokeniser as the reader (`WORD` in `src/core/ingest/text.ts`).

- Paragraph, sentence and chapter splits do not affect it, so a new parser version or a re-packed EPUB of the same text still matches.
- It works the same for EPUB, TXT, link-imported articles and the bundled books.
- It is computed in the import Worker after parsing; existing books get it in a one-off background pass, in 5 ms slices.
- An edited text (a different edition) gives a different key. The fallback is in §3.3.

### 3.2 Per-user book key (what the server sees)
`book_key = HMAC-SHA-256(user_key, content_key)`, base64url.

- `user_key` is 32 random bytes created by the server at sign-up and sent to each signed-in device, which keeps it in local `settings`.
- Two users with the same book get different `book_key`s. The server cannot tell that two readers read the same book, and it cannot match keys against a list of known pirated files.
- Honest limit: the server holds `user_key`, so this protects against cross-user correlation, not against the operator. The operator still never receives `content_key` or any text.

### 3.3 When keys do not match
- A book on another device shows on the shelf as **「在其他设备上」** with its title (§7.2).
- On import, if no `book_key` matches but a remote book has the same title and author, ask: 「这是你在另一台设备上读的那本吗？」. On yes, the local book is **linked**: a local alias `book_key_alias` maps the new book to the remote key.
- Positions then match by sentence hash (§4.2), not by word index, because the texts differ.

---

## 4. What syncs

### 4.1 Entries
Everything is a small entry `(kind, key, value, deleted, updated_at, device_id)`, last-writer-wins per
key, except where noted. None of them contains book text.

| kind | key | value | Notes |
|---|---|---|---|
| `book` | book_key | `{title, author, format, wordCount, status, addedAt, finishedAt}` | Title and author are facts, not text; they are personal data (§10.3). |
| `pos` | book_key | `{word, chapter, para, sentence, sh, pv, pct}` | Not applied silently (§7.3). |
| `look` | book_key + `:` + word | `{lemma, surface, zh, phonetic, saved, at}` | `zh` and `phonetic` come from our dictionary, `surface` is one word. **No `sentence`.** |
| `forget` | book_key + `:` + lemma | `{at}` | 撤回: drops this lemma's `look` entries with `at` before it, on every device. |
| `vocab` | lemma | `{state, source, weight, at}` | Calibration answers and 撤回. Lookups already sync as `look`. |
| `pref` | name | the value | Only `fontSize`, `focusPct`, `blurMax`, `sentenceMode`, `theme`, `predict`. |

### 4.2 Positions that survive parser changes
- `word` is the index of the sentence's first word in the book's word stream, the same stream as §3.1, so it does not depend on paragraph or sentence splits.
- `chapter, para, sentence` plus parser version `pv` are a fast path; they are used only when `pv` matches.
- `sh` is the first 8 hex digits of SHA-256 of the sentence. It is used to re-find the sentence near `word` in a linked book with slightly different text (§3.3). A hash, not text.
- `look` keys use the word index of the looked-up word, so the same rule applies.

### 4.3 Merge rules
- **LWW:** `book`, `pref` and `vocab` take the newest `updated_at` (device clocks; the server stamps `server_at` to break ties).
- **Union:** `look` entries add up; `forget` removes. Both are idempotent.
- **Position:** the newest is kept, but the reader decides (§7.3).
- **Deletes:** deleting a book on one device sets `deleted` on its `book` entry. Other devices remove the book only after asking, because their copy is the reader's own file.

### 4.4 What never leaves the device
- Book text: chapters, sentences, and `lookup.sentence`.
- `grammar` rows: they hold a translation of the sentence, which is a derivative of the text. A later version may sync them end-to-end encrypted.
- `agent_session` / `agent_message`: they quote the text.
- `vocab.exposures` (high-volume and weak evidence), `metric` rows, the `tier` setting, and the **DeepSeek key**, which stays bound by the existing rule.
- Link-import URLs: the Import sheet promises 「不保存链接」. Articles match by `content_key` like any book.

---

## 5. Sync protocol

### 5.1 Device side (`src/core/sync/`)
- Every local change that maps to an entry is also written to `sync_outbox(kind, key, value, deleted, at)`, in the same transaction, so state and outbox never disagree.
- Coalescing: a new outbox row for the same `(kind, key)` replaces the old one, so 200 position saves become one entry.
- **Push** at most every 3 minutes while reading, on `visibilitychange → hidden`, when leaving the reader, and after 撤回. Each push carries at most 200 entries.
- **Pull** on app start, on opening a book, and after a push. The request is `GET /api/sync?since=<cursor>`; the response is entries with `seq > cursor` plus a new cursor.
- Offline, 429 or 5xx: keep the outbox and back off (30 s, 2 min, 10 min, then the next trigger). Reading never waits for sync.

### 5.2 Server side
- `POST /api/sync` `{device, entries[]}`:
  - Validates every entry's kind, key format and value schema, and keeps each under 2 KB.
  - Upserts into `entries` and returns the new cursor.
  - One D1 `batch`, so one round trip and one row written per entry.
- `seq` comes from a per-user counter row, `users.seq`, incremented in the same batch.
- The Worker never parses or logs values beyond schema checks.

### 5.3 Write budget
D1 Free allows 100,000 rows written a day.

| Per active reader per day | Rows |
|---|---|
| Positions, coalesced (one per push, about 20 pushes) | 20 |
| Lookups and 撤回 (a heavy day) | 40 |
| Book, pref and vocab changes | 5 |
| Counter row, once per push | 20 |
| **Total** | **≈ 85** |

That is about **1,100 daily readers**. A measurable check (C-07) keeps it under 100 rows per reader-hour.

---

## 6. One-time encrypted transfer

### 6.1 Flow
1. **Device A**, shelf row → 「传到另一台设备」:
   1. Generate a 128-bit key `K` and a transfer id.
   2. Build the package: `[meta length][meta JSON][payload]`. The meta is `{v, name, format, content_key}`. The payload is the original file bytes, or, for link-imported articles, the parsed book JSON.
   3. Encrypt with AES-GCM: random 96-bit IV, AAD = `transfer id + user id`.
   4. `POST /api/transfer` reserves a slot, then `PUT /api/transfer/:id` uploads the ciphertext.
2. Device A shows a **QR code** and a **26-character code** in 5-letter groups, plus a 24 h countdown.
   - The QR code is `https://<app>/#t=<id>.<K>`. The fragment never reaches the server.
3. **Device B** (signed in to the same account):
   - Home shows 「有 1 本书等待接收」.
   - Scan the code (it fills the field) or type it, then `GET /api/transfer/:id` streams the ciphertext.
   - Decrypt and verify the GCM tag, then import with the normal pipeline and check `content_key`.
4. **Device B** `POST /api/transfer/:id/done` → the Worker deletes the R2 object and marks the row done.
   - Device A, polling every 5 s while its sheet is open, shows 「已送达，云端副本已删除」.

### 6.2 Rules (enforced by the Worker)
- **Same account only:** every transfer call needs the owner's session; there is no anonymous or link-only access.
- **One pending transfer per account:** a second reserve returns 409; cancel or wait.
- **Size:** ciphertext ≤ 25 MB + 64 bytes. The Worker counts streamed bytes and aborts past the limit.
- **Expiry 24 h:** a daily Cron deletes expired objects and rows, and an R2 lifecycle rule (delete after 1 day) is the backstop.
- **One download:** after `done`, or after 3 failed decrypt reports, the object is gone.
- **Devices:** at most 3 signed-in devices per account; at most 5 transfers per account per day.
- The server sees only: size, times, account and device. It cannot check the file type or scan the content (§10.2).

### 6.3 Why upload through the Worker (not presigned URLs)
- The R2 binding streams the request body straight into R2 (`TRANSFERS.put(key, request.body)`). Streaming uses I/O, not CPU, so it fits the 10 ms CPU limit, and needs no S3 credentials and no R2 CORS.
- 25 MB is far below the 100 MB request body limit.
- To verify in the first prototype: if a 25 MB upload goes over the CPU limit, switch to presigned URLs (aws4fetch, credentials as Worker secrets).

### 6.4 Home-screen web apps
On iPhone, a web app added to the Home Screen has its own storage, separate from Safari. A QR code opened
by the camera lands in Safari, which may be signed out and holds a different `user.db`. So the code can
always be **typed**, and the receive sheet says so.

---

## 7. Screens

### 7.1 Home: 账号与同步 card (between VocabCard and AiKeyCard)
- **Signed out:** one line of explanation and a 「登录以同步」 button. Email → 6-digit code → done.
- **Signed in:** email, 「已同步 · 2 分钟前」 or 「待同步 3 项」, 「立即同步」 and 「退出登录」.
- **Under 「账号」:**
  - 「设备」: list, remove.
  - 「导出我的数据」: a JSON file through the share sheet.
  - 「删除账号」: confirm, then everything goes (§8.3).
- One line on privacy: 「只同步阅读进度、查词和设置，不上传书的内容。」

### 7.2 Shelf
- Books known from sync but not on this device show as greyed rows: 「在其他设备上」.
- Tapping one opens a sheet: 「导入同一个文件」 (file picker) or 「从另一台设备传过来」 (§6).
- The row action on local books gains 「传到另一台设备」, next to 删除.

### 7.3 Reader
- When a newer position from another device is more than one paragraph away, a capsule above the bottom bar says 「在另一台设备上读到第 7 章 · 跳过去」.
- It closes after 6 s or on a tap; nothing jumps without a tap.

### 7.4 Transfer sheets
- **Sending:** QR code, code groups, 「24 小时内有效」, live state (等待接收 → 已送达).
- **Receiving:** code field, progress, then the book opens.
- Wrong code: 「传输码不对，请检查后再输入」. Expired: 「这次传输已过期，请在原设备上重新发送」.

---

## 8. Server

### 8.1 D1 schema (server)
```sql
CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, user_key BLOB NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, banned_at INTEGER);
CREATE TABLE login_codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE devices (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE entries (user_id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, server_at INTEGER NOT NULL,
  device_id TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY (user_id, kind, key));
CREATE INDEX entries_pull ON entries (user_id, seq);
CREATE TABLE transfers (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, size INTEGER NOT NULL,
  state TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, done_at INTEGER);
CREATE TABLE notices (id TEXT PRIMARY KEY, received_at INTEGER NOT NULL, claimant TEXT NOT NULL,
  details TEXT NOT NULL, user_id TEXT, action TEXT, closed_at INTEGER);
CREATE TABLE strikes (user_id TEXT NOT NULL, notice_id TEXT NOT NULL, at INTEGER NOT NULL);
```

### 8.2 Sign-in and sessions
- **Sign-in:** email + 6-digit code.
  - The code is stored hashed, lives 10 minutes and allows 5 attempts.
  - Rate limits: per IP, and per email at 3 an hour.
  - No passwords: password hashing does not fit 10 ms of CPU, and nothing to leak.
- **Mail:** a transactional email provider (decision §11, item 3). The Worker calls it with the address and code only.
- **Session:** a 256-bit random token in an `HttpOnly; Secure; SameSite=Lax` cookie on our own origin. D1 stores only `SHA-256(token)`. Sessions slide for 90 days.
- **Authorisation:** every query is scoped `WHERE user_id = ?` from the session, never from the request body.

### 8.3 Account deletion and export
- **「删除账号」** deletes every row for the user, including entries, sessions, devices and transfers, plus any R2 object, in one Worker call, and signs out every device. Local books stay on the devices.
- **「导出我的数据」** returns the user's rows as JSON.
- Backups: D1 Time Travel keeps 30 days of history on any plan. The privacy policy says deleted data is unrecoverable through the service at once and leaves backups within 30 days.

### 8.4 Network rule (replaces the CLAUDE.md line once approved)
Runtime requests, beyond `api.deepseek.com` and `/api/fetch`:
- `/api/auth/*`, only when the reader signs in.
- `/api/sync`, only while signed in.
- `/api/transfer/*`, only when the reader sends or receives a book.

Signed out, the app makes no new requests.

---

## 8a. Logging
- Workers observability stays off.
- The Worker logs nothing per request.
- `notices` and `strikes` are the only operational records; they hold no book text.

---

## 9. Free-plan budget (Cloudflare docs, checked 2026-10-13)

| Resource | Free allowance | Our use | Ceiling |
|---|---|---|---|
| Workers requests | 100,000 / day (static assets free and unlimited) | about 30 per active reader per day | about 3,000 daily readers |
| Workers CPU | 10 ms / request | Signature-free HMAC and DB calls; uploads are streamed | Verify uploads (§6.3) |
| D1 rows written | 100,000 / day | about 85 per active reader | **about 1,100 daily readers (first limit hit)** |
| D1 rows read | 5,000,000 / day | pulls are incremental | not a limit |
| D1 storage | 500 MB per database, 5 GB per account | about 50–200 KB per user | thousands of users per database |
| R2 storage | 10 GB-month | at most one 25 MB transfer per user, for under 24 h | about 400 transfers waiting at once |
| R2 operations | 1M Class A, 10M Class B / month | 2–3 per transfer | not a limit |

- R2 above the free tier is **billed, not blocked**. A Worker guard refuses new transfers when pending bytes pass 8 GB, and a billing alert is set in the dashboard.
- Beyond about 1,000 daily readers: Workers Paid ($5 a month) raises D1 writes to 50M a month and CPU to 30 s.

---

## 10. Legal and compliance

### 10.1 Market
- Launch for readers **outside mainland China**.
- Mainland users would need ICP filing, in-country storage, content-review duties (which conflict with end-to-end encryption) and cross-border data rules. That is a separate project.
- The terms name the service regions. The operator should be a company (decision §11, item 1).

### 10.2 Copyright: why the risk is low, and what keeps it low
- **Sync:** the server holds no text, no translations and no quotations of any book (C-03 tests this on every push). Fingerprints and titles are not copies of a work.
- **Transfer:**
  - The server holds only ciphertext it cannot read.
  - It holds it for at most 24 h, for a single recipient who is the uploader themselves.
  - It offers no sharing.
  - This is the transfer pattern, not storage for the public, and it is far from distribution.
- **What would undo this** (never build these):
  - share links;
  - transfers to other accounts;
  - longer retention or "download again";
  - server-side dedup;
  - a public shelf;
  - payment tied to particular books.
- **Even so:**
  - publish a copyright contact (§10.4);
  - keep the ability to cancel a pending transfer and to ban an account (`strikes`: 3 valid notices → ban);
  - register a DMCA designated agent if serving US users.
- **DRM:** encrypted books are still refused at import, which already happens on every device.

### 10.3 Personal data
- **What is held:**
  - email;
  - which titles a person reads, and their progress;
  - the words they looked up;
  - devices and times.
- Reading history can reveal beliefs or health, so treat it as sensitive.
- **Minimise:** no names, no IPs stored, no analytics, no exposure counts.
- **Rights:** the reader can export and delete. Deletion is immediate in the service and leaves backups within 30 days.
- **GDPR / UK:**
  - lawful basis is the contract (providing sync);
  - Cloudflare is the processor (accept its DPA);
  - mail provider DPA;
  - privacy policy;
  - no cookie banner needed for the session cookie alone (strictly necessary).
- **Later, for the App Store:** in-app account deletion is required, and "Sign in with Apple" is required if other social logins are added.

### 10.4 Documents and pages before sign-up opens
1. **Terms of service:**
   - private use;
   - the reader warrants their right to the files they move;
   - no sharing;
   - bans for abuse;
   - service regions.
2. **Privacy policy:**
   - what is synced and what is never synced (§4.4);
   - where data is held (Cloudflare);
   - retention, export and deletion;
   - DeepSeek sentences, sent only on the reader's tap.
3. **Copyright page:**
   - contact address and form;
   - what a notice must contain;
   - response time (3 working days);
   - counter-notice;
   - repeat-infringer policy.
4. **Operator name and contact** on all three.

### 10.5 Encryption export
- The app uses standard AES-GCM through the browser.
- When the iOS app comes, answer Apple's encryption questions as "uses encryption, exempt, standard algorithms", and check whether a yearly self-classification report is due.

---

## 11. Decisions for the owner
1. **Operator:** company or individual, and the name to publish.
2. **Market:** confirm "outside mainland China" for launch.
3. **Mail provider** for sign-in codes. Resend's free tier is 3,000 mails a month; Cloudflare Email Sending if it is generally available and allows any recipient by then.
4. **Domain:** sessions, the QR links and the legal pages want our own domain, not `*.workers.dev`.
5. **Scope edit to CLAUDE.md:**
   - accounts, sync and one-time transfer allowed;
   - the network rule in §8.4;
   - "never store a book on the server" added as a rule.

---

## 12. Acceptance

| ID | Check |
|---|---|
| **C-01** | Sign in with an email code on two devices; sign out; sessions are cookie-only, `HttpOnly`; codes expire, are attempt-limited and rate-limited. |
| **C-02** | The same text gives the same `content_key` across EPUB re-packing and parser versions, and different keys for different texts. Two users' `book_key`s for one book differ. |
| **C-03** | No push or transfer request ever carries book text: a test pushes a full reading session and asserts that no 5-word run of the book appears in any request body. |
| **C-04** | A position from device A opens on device B behind the 「跳过去」 capsule at the same sentence, also after a simulated parser change (re-segmented paragraphs). |
| **C-05** | Footnotes on B match A after sync; 撤回 on B removes the footnote on A; calibration and settings follow. |
| **C-06** | Offline: reading, lookups and 撤回 work; the outbox survives reloads and flushes when online; a 429 never blocks the reader. |
| **C-07** | A 30-minute scripted reading session with 20 lookups writes ≤ 50 D1 rows. |
| **C-08** | Transfer is end-to-end: the server receives only ciphertext; no request contains `K` (it travels in the URL fragment or by hand); a wrong code fails cleanly. |
| **C-09** | Transfer lifecycle: same account only (another account gets 404); one pending per account; deleted on `done`; expired after 24 h by Cron; ≤ 25 MB; ≤ 3 devices; ≤ 5 a day. |
| **C-10** | Export returns all of a user's rows; deleting an account removes every row and object and signs out every device. |
| **C-11** | The DeepSeek key, metrics, grammar and Agent rows and link URLs never leave the device (asserted on request bodies). |

---

## 13. Tasks (TASKS.md → M10, in order)
46. Scope edit (CLAUDE.md), the legal page drafts (§10.4) and Worker bindings: D1, R2, Cron, local `getPlatformProxy` for dev and e2e. **C-01**
47. `content_key`, `book_key`, word-index anchors and sentence hashes; background fingerprint pass for existing books. **C-02 C-04**
48. Sign-in: codes, mail, sessions, devices; the Home 账号与同步 card. **C-01**
49. Entries, outbox (user.db migration v8: `book.content_key`, `book_key_alias`, `sync_outbox`, `lookup.word`), push and pull, merge, back-off. **C-03 C-05 C-06 C-07 C-11**
50. Shelf 「在其他设备上」 rows, linking by title, and the reader's 「跳过去」 capsule. **C-04 C-05**
51. Transfer: AES-GCM package, reserve, upload and download through the Worker, done and cancel, QR and code sheets, Cron expiry, limits. **C-08 C-09**
52. Account export and deletion; notices and strikes tooling (a small admin script, not a UI); copyright page live. **C-10**
53. Launch check: free-plan budget dashboard and alerts, R2 guard at 8 GB, real-device test on two phones. **C-07 C-09**

Each task lands in small commits with its tests, as in M6–M9.
