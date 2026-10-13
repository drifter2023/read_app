# TODO · Account sync and one-time book transfer (M10)

**Status:** planned, not started. Do not build any of this until the owner picks it up.
**Plan:** [`docs/plans/2026-10-13-sync-and-transfer.md`](../plans/2026-10-13-sync-and-transfer.md). The plan is the spec; § numbers below point into it.
**Rule that never changes:** the server never keeps a book, its text, a translation of it or a quotation from it.

Tick items as they land; keep each commit small, with its test (as in M6–M9).

---

## 0. Owner decisions (before any code) — plan §11
- [ ] Operator: company or individual; the name and contact to publish.
- [ ] Market: launch outside mainland China (confirm).
- [ ] Mail provider for sign-in codes (Resend free tier, or Cloudflare Email Sending if it is generally available).
- [ ] Our own domain, not `*.workers.dev`.
- [ ] Approve the scope edit to `CLAUDE.md`: accounts, sync and transfer allowed; the network rule of §8.4; "never store a book on the server".

## 1. Groundwork — task 46 · C-01
- [ ] Edit `CLAUDE.md`: scope guard, network rule, the no-books-on-server rule, module `sync` in the module list.
- [ ] Add M10 tasks 46–53 to `TASKS.md` (replace the "planned" note).
- [ ] `wrangler.jsonc`: D1 `DB`, R2 `TRANSFERS` (private), a daily Cron trigger, rate limiters for auth, sync and transfer.
- [ ] R2 lifecycle rule: delete objects after 1 day.
- [ ] D1 schema migration for the server (plan §8.1).
- [ ] `scripts/api-plugin.ts`: pass `getPlatformProxy()` bindings, so dev, preview and e2e use local D1 and R2.
- [ ] Draft the terms, privacy policy and copyright page (§10.4).

## 2. Book identity — task 47 · C-02, C-04
- [ ] `src/core/sync/fingerprint.ts`: `content_key` = SHA-256 of the book's word stream (§3.1).
- [ ] Compute it in the import Worker after parsing; store it in `book.content_key`.
- [ ] Background pass in 5 ms slices for books already on the shelf, bundled books included.
- [ ] `book_key = HMAC(user_key, content_key)` (§3.2).
- [ ] Word-index anchors: sentence → global word index and back (§4.2).
- [ ] Sentence hash `sh` (8 hex) and parser version `pv`.
- [ ] Tests:
  - [ ] same text → same key after EPUB re-packing and re-segmented paragraphs;
  - [ ] different text → different key;
  - [ ] two users → different `book_key`s.

## 3. Sign-in — task 48 · C-01
- [ ] `POST /api/auth/start`: a 6-digit code stored as a hash, valid 10 min, 5 attempts; rate limits per IP and per email (3 an hour).
- [ ] `POST /api/auth/verify`: create or find the user (with a random 32-byte `user_key`), the device and a session cookie (`HttpOnly; Secure; SameSite=Lax`, 90 days sliding; D1 keeps only the token hash).
- [ ] `POST /api/auth/logout`; device list and removal; at most 3 devices.
- [ ] Every query scoped by the session's `user_id`, never by the request body.
- [ ] Home card 「账号与同步」 (§7.1): signed-out, signed-in and account sections.
- [ ] Tests: code expiry, attempt limit, rate limit, cookie flags, a fourth device refused, another user's data unreachable.

## 4. Sync — task 49 · C-03, C-05, C-06, C-07, C-11
- [ ] user.db migration v8:
  - `book.content_key`
  - `book_key_alias`
  - `sync_outbox`
  - `lookup.word`
  - sync state in `settings`: cursor, device id, `user_key`
- [ ] Write outbox rows in the same transaction as each local change; coalesce by `(kind, key)`.
- [ ] Entry kinds `book`, `pos`, `look`, `forget`, `vocab`, `pref` (§4.1). **No `sentence` in `look`.**
- [ ] Push (every 3 min while reading, on hide, on leaving the reader, after 撤回; ≤ 200 entries).
- [ ] Pull since the cursor (on start, on opening a book, after a push).
- [ ] Merge rules (§4.3): LWW; union plus `forget` for lookups; positions not applied silently.
- [ ] Back-off on offline, 429 and 5xx (30 s, 2 min, 10 min); reading never waits.
- [ ] `POST /api/sync` and `GET /api/sync`: schema checks, ≤ 2 KB per value, one D1 batch, per-user `seq`.
- [ ] Never synced (§4.4): book text, `grammar`, Agent rows, exposures, metrics, `tier`, **the DeepSeek key**, link URLs.
- [ ] Tests:
  - [ ] C-03: no 5-word run of the book appears in any request body;
  - [ ] C-11: the never-synced fields;
  - [ ] C-07: a 30-min scripted session with 20 lookups writes ≤ 50 rows;
  - [ ] C-06: the outbox survives a reload offline.

## 5. Shelf and reader — task 50 · C-04, C-05
- [ ] Greyed shelf rows 「在其他设备上」, with a sheet offering 导入同一个文件 / 从另一台设备传过来 (§7.2).
- [ ] Link by title and author when keys differ (「这是你在另一台设备上读的那本吗？」, then `book_key_alias`).
- [ ] Reader capsule 「在另一台设备上读到第 N 章 · 跳过去」 (shown for 6 s; nothing jumps without a tap) (§7.3).
- [ ] Deleting a book on one device asks before removing it on the others.
- [ ] e2e with two browser contexts (device A and B): position, footnotes, 撤回 both ways, settings.

## 6. One-time transfer — task 51 · C-08, C-09
- [ ] `src/core/sync/transfer.ts`:
  - package `[meta length][meta JSON][payload]`;
  - AES-GCM with a 128-bit key, random IV, AAD = transfer id + user id.
- [ ] `POST /api/transfer` (reserve; one pending per account → 409 otherwise; ≤ 5 a day).
- [ ] `PUT /api/transfer/:id`: stream into R2; abort past 25 MB + 64 bytes. **Prototype first:** confirm a 25 MB upload stays within 10 ms of CPU; otherwise switch to presigned URLs (§6.3).
- [ ] `GET /api/transfer/:id` (owner only), `POST …/done` (delete at once), `DELETE` (cancel).
- [ ] Cron: delete expired transfers (24 h) from D1 and R2.
- [ ] Guard: refuse new transfers while pending bytes are over 8 GB.
- [ ] Send sheet: QR code `https://<app>/#t=<id>.<K>` (the key stays in the fragment), a 26-character code in groups, a countdown and live state.
- [ ] Receive sheet: code field (typing always works: home-screen web apps have separate storage, §6.4), progress, then import and open.
- [ ] Errors in Chinese: wrong code, expired, too large, another transfer pending.
- [ ] Tests:
  - [ ] the server gets ciphertext only;
  - [ ] no request contains the key;
  - [ ] another account gets 404;
  - [ ] expiry and size limits work;
  - [ ] the object is gone after `done`.

## 7. Account data and copyright handling — task 52 · C-10
- [ ] 「导出我的数据」 (JSON through the share sheet).
- [ ] 「删除账号」: every row and object deleted, every device signed out; local books stay.
- [ ] `notices` and `strikes`: a small admin script to record a notice, cancel a transfer and ban after 3 strikes.
- [ ] Copyright page live, with a contact form or address and a response time (3 working days).
- [ ] If serving US users: register a DMCA designated agent.

## 8. Launch check — task 53 · C-07, C-09
- [ ] Cloudflare billing alert; a dashboard check of D1 writes per day against 100,000.
- [ ] Terms, privacy policy and copyright page linked from Home and the sign-in sheet.
- [ ] Two real phones: sign in, read, look up, 撤回, transfer a 20 MB EPUB, delete the account.
- [ ] Deploy only when the owner asks.

---

## Never build (these would turn transfer into storage or distribution) — plan §10.2
- Share links.
- Transfers to other accounts.
- Keeping files longer than 24 h, or "download again".
- Server-side dedup.
- A public or shared shelf, or cross-user search.
- Payment tied to particular books.
