# One login across the game network: design and payments research (S196, tree `s196/accounts-design`)

Written 2026-10-07. This is a design and research document only. Nothing was built, installed, deployed or signed up for. It covers owner rulings R196-V1 to V5, and unblocks canon §9 R182-H.

---

## THE ONE-SCREEN SUMMARY (plain words)

**What you asked for.** Each game gets its own website, and each website has an arcade that links to the other games. A player logs in once, with email, Google, Discord or Steam, and their progress follows them to any computer. Your friend's Pitch Masters progress would not have been lost.

**My recommendation: build one small login service of our own, on the Cloudflare account that already runs the SPARK leaderboard.**

- **Where it lives.** One service on one web address for your company, such as `id.<yourcompany>.com`. Every game sends the player there to log in, and the player comes back already logged in. A player who is already logged in on one game is let into the next one with one click: no typing, no new account.
- **How people log in, at first.** Email (we send a 6-digit code or a link, so there are no passwords), plus Google and Discord buttons. Steam comes second: once the Steam builds exist, a player on Steam is logged in automatically.
- **No passwords at all.** Legacy of the Realm found that password checking on Cloudflare is slow, and that it forces the paid plan just to log people in. Forgotten-password emails are also where most break-ins happen. With email codes and Google/Discord there is nothing to steal and nothing to reset.
- **What it reuses.** It takes the best pieces already proven in your other projects:
  - from CNC: the one-time email link design, server-side sessions that can be cut off instantly, and the login history log;
  - from Legacy of the Realm: saved progress that can't be overwritten by an older copy, and its "ask before replacing" rule for a computer with different progress;
  - from the SPARK leaderboard: the Cloudflare setup, salted IP privacy, the origin check, and protection against counting the same game twice.
- **What it costs.** Free while small. It becomes about $5 a month once we send real login emails, plus about €10 to €15 a year per domain.
- **First step (Phase 1).** Login plus NONET progress saved to the account, plus the arcade board showing account names. A player's existing progress on their computer is moved into their account the first time they log in, and nothing is lost.
- **Steam and money.** Sales on Steam go through Steam, which keeps 30%. Inside the Steam version, anything bought must go through Steam, and we never advertise the website or cheaper prices there. On our own websites we sell through a "merchant of record" (Paddle or Stripe's equivalent). It keeps about 5% and handles all European VAT for you. Your website as the "best experience" fallback is fine on the websites themselves and in normal marketing, just never as a sales pitch inside Steam.

**Questions only you can answer** (my recommendation in brackets):

1. **The company name and web address** for the login page. [Buy it now, before Phase 1, and put it on Cloudflare. Moving the login address later logs everyone out and means re-registering with Google, Discord and Steam.]
2. **Can `spark-online.space` be moved onto Cloudflare's address system?** The site itself stays on GitHub Pages. [Yes. It lets the login stay safely tucked inside each game's own address. If not, Phase 1 still works with a slightly weaker storage method.]
3. **Should typing a name without an account still put you on the arcade board?** [Yes, as "guest" rows. Old names stay as they are and can't be claimed, because nobody can prove they own a 3-letter name.]
4. **Allow passwords too?** [No, not in Phase 1. Email code, Google and Discord cover everyone.]
5. **Should something bought on the website also work inside the Steam version?** [Don't plan on it until Valve answers in writing. Their documents don't say, so ask Valve partner support before we sell anything.]
6. **Minimum age.** [The login page says "15 or older, or with a parent's permission", which is France's age of digital consent. We don't profile or advertise to anyone.]
7. **The Workers Paid plan at $5 a month** when real players start logging in. [Yes, at Phase 1 go-live: it is the cheapest way to send login emails from Cloudflare itself.]

---

## Contents
1. What exists today (SPARK side)
2. Reuse survey: Legacy of the Realm and CNC, plus the reuse table
3. The design
   1. Where it runs
   2. Identity model
   3. Login methods
   4. Login across many domains
   5. Data model (D1)
   6. Per-game progress, sync and migration
   7. The arcade board moves to accounts (R182-G), and R182-H unblocked
   8. Security
   9. Privacy and GDPR (France / EU)
   10. Cost at small scale
   11. What each game must change
4. Phased plan
5. Payments research (R196-V3 / V5), with dated sources
6. What I could not verify
7. Open questions (repeated, with recommendations)

---

## 1 · What exists today (verified in this tree)

- **The live leaderboard Worker** (`server/leaderboard/worker.js`, deployed S182, `https://spark-leaderboard.saras-fdtta.workers.dev`, D1 `spark-leaderboard`, region WEUR) is the only server SPARK has. It already contains several patterns the account service must keep:
  - an Origin allowlist enforced on writes, server-side and not only through CORS (`worker.js:39,53,300`);
  - a salted IP hash with a mandatory `IP_SALT` secret; writes are refused without it (`:294`);
  - an append-only, time-aged rate-limit table (`writes`);
  - idempotency keys (`seen_runs`, 24 h TTL, `:95`);
  - a board registry (`boards`);
  - identity as a typed 3-character name (`NAME_ALPHABET`, `:104`).
- **Canon §9.** The board ranks players by their average time (R182-G), and identity is the typed name, with collisions accepted. **R182-H** (adaptive difficulty) is blocked on persistent identity. It also collides with ranking by average, because a stronger player who draws harder grids drifts down the table.
- **Progress that lives only on the device**:
  - SPARK master: `spark.arcade.nonet.scores.v1`, `.ranking.v1`, `.pending.v1` (`src/render/arcadeScores.ts`), plus display and audio preferences.
  - NONET campaign, on branch `s196/nonet-home`, at `src/nonet/campaignProgress.ts:13`: `spark.nonet.progress.v1` = `{unlocked: 1..30, stars[30]: 0..3}`. Its fold `recordClear` is **monotone**: stars only go up, and unlocked only goes up. Merging two devices is therefore a lossless element-wise max, with no conflict prompt needed.
  - NONET daily, at `dailyProgress.ts:10`: `spark.nonet.daily.v1` = the last solved UTC day key.
  - The campaign docblock records R196-D2 6e: *"No account system is invented before Steam."* This design does not contradict that. NONET ships device-local first, and accounts arrive as a separate, owner-approved phase.
- **Pitch Masters**, a separate project that SPARK sessions don't touch, left its plan on branch `notes/s196-one-login-network` (`docs/ONE_LOGIN_GAME_NETWORK.md`, read-only via `git show`). It is a Godot desktop and web game. Its side is designed and built by its own sessions, against the API in this document.

## 2 · Reuse survey (R196-V4), read-only

Both surveys were run read-only and spot-checked against the source. No secret values were copied. Raw notes are in `.tmp-gates/survey_cnc.md` and `.tmp-gates/survey_legacy.md`.

### CNC (conviction.run): Next.js 16 / Drizzle / Neon Postgres / Vercel. No Cloudflare.
- **Live:**
  - email and password, with bcryptjs at cost 12 (`passwords.ts:3`, verified);
  - magic link sent through Resend (`magic-link.ts`): a 32-byte token, stored as an HMAC-SHA256 whose key is HKDF-derived from the JWT secret with a domain-separation label (verified, `:1,13,55`), a 15-minute TTL, single use through an atomic `UPDATE…RETURNING`, a `purpose` column, and a per-email limit of 3 per hour held in the database.
- **Sessions:** an HS256 JWT valid for 7 days, *plus* a server-side `sessions` row (jti, sha256 token hash, surface, `revoked_at`) checked on every request. Revocation is therefore instant, per session or for all of a user's sessions. The cookie is `httpOnly`, `SameSite=Lax` and host-only.
- **Audit log:** the `auth_events` table, with hashed IPs and fail-open writes.
- **Stripe:** webhook signature checks and an atomic, idempotent claim/release of events.
- **Weak points to avoid:**
  - rate limits are in memory, per serverless instance;
  - account lockout silently does nothing without Redis, and Upstash was removed;
  - the client IP comes from `x-forwarded-for`, which a client can spoof;
  - registering an existing email returns CONFLICT, which reveals that the account exists;
  - **the magic link is consumed on a GET** (`callback/route.ts:31`, verified), so email scanners that prefetch links can use it up;
  - the consent checkbox is enforced only in the browser;
  - the Stripe `returnUrl` is not validated, an open redirect;
  - Stripe was never provisioned in production, and has no `automatic_tax`.
- **Missing entirely:** OAuth, password reset and 2FA.
- **Incidents:** S273/274, where Neon cold starts of more than 15 s caused login timeouts. This is a reason not to put the login path on a database that scales to zero.
- **Tests:** about 100 vitest cases.

### Legacy of the Realm: the live build is `Game/founding-realm/rebuild`, a Cloudflare Worker plus Neon plus Durable Objects
- **Login:** username and password only. No magic link, OAuth, password reset or email verification.
- **Password hashing (`Passwords.ts`):** PBKDF2-SHA256 through WebCrypto, stored in a self-describing format, and upgraded on the next login when settings change.
  - **workerd caps PBKDF2 at 100,000 iterations** (`:61`, verified), against the 600k that OWASP recommends.
  - One login costs about 29 ms of CPU, against the free plan's 10 ms limit, so **logging in needs the Workers Paid plan** (`HANDOFF_S125:77-80`, still unresolved).
- **Sessions (`Sessions.ts`):** an HMAC token valid for 30 days, kept in localStorage. It cannot be revoked per token; the only option is rotating the secret, which logs everyone out.
  - It also has 120-second WebSocket tickets with scope and a nonce, which are a good model for a hand-off between domains.
- **Login timing:** login checks against a dummy hash when the username doesn't exist and returns one identical message, which is good. Registration still returns 409 when a name is taken.
- **Saves:** `save(player_id, realm_id, schema_version, data, revision)` with **optimistic concurrency**, returning 409 on a stale revision.
- **`deploy/RESEARCH-accounts.md` §4, guest to account.** "Link, do not replace."
  - Case A: registering on the device that has the progress. The local save becomes the first write.
  - Case B: logging in on a second device that has *different* progress. A **blocking prompt** appears before anything is overwritten (`pull()` only reports; `adoptRemote` and `keepLocal` are explicit calls). This follows Google's Play Games guidance, `developer.android.com/games/pgs/savedgames`.
- **Weak points:**
  - no rate limit in code; it relies on a dashboard rule that was never shown to exist;
  - no captcha;
  - a Cloudflare token was pasted into a transcript (CF-S123, needs rotating);
  - a password hash once leaked into the save blob (CF-S119, fixed);
  - saves are only pushed on restart (CF-S120, HIGH, still open);
  - **one signing key shared with CNC means a token minted by one app is valid in the other**, which the wrangler comment itself flags.

### Reuse table

| Component | Source | Verdict | Why |
|---|---|---|---|
| Magic-link token design (HMAC hash with an HKDF-derived key, TTL, atomic single use, `purpose`, per-email limit in the DB) | CNC `app/src/modules/auth/magic-link.ts` | **Adapt** | Proven and tested (29 cases). Port `node:crypto` to WebCrypto. **Fix:** the link opens a page whose *button* POSTs, and a 6-digit code is offered alongside it, so link scanners can't burn the token. |
| Server-side session row with instant revocation, for all sessions or one | CNC `sessions.ts:75-126`, `middleware.ts` | **Adapt** | The right shape. Here it becomes opaque refresh tokens in D1 with rotation and reuse detection. CNC has no rotation, and Legacy has no revocation at all. |
| `auth_events` audit log (hashed IP, jsonb details, fail-open) | CNC `sessions.ts:92-103` | **Reuse as-is** (concept and columns) | Cheap, and the only way to answer "who logged into my account?". |
| Resend email wrapper | CNC `lib/email/client.ts` | **Reuse as a fallback** | First choice is Cloudflare Email Service (`env.EMAIL.send`, public beta 2026-04-16). Resend is the drop-in if that beta disappoints. |
| Stripe webhook idempotent claim/release | CNC `webhook/stripe/route.ts:59-80` | **Adapt, later (Phase 3)** | A good pattern. CNC's own Stripe was never live, so **avoid** its checkout route (open redirect, no tax). |
| CSRF: custom header plus Origin/Referer check | CNC `lib/security.ts:15-29` | **Adapt** | Becomes an exact Origin allowlist per game client. That is the same idea as the leaderboard's `isAllowedOrigin`, which is already live. |
| Rate limits (in-memory) and Redis lockout | CNC `lib/rate-limit.ts`, `lockout.ts` | **Avoid** | They don't hold on serverless or Workers. Use D1 rows that age out by time (the leaderboard's `writes` pattern), the Workers Rate Limiting binding, and Turnstile. |
| bcryptjs | CNC | **Avoid** | Too heavy for the Workers CPU budget. Moot anyway, since there are no passwords here. |
| `Passwords.ts` (PBKDF2, WebCrypto, upgrade-on-login) | Legacy `rebuild/src/server/Passwords.ts` | **Keep in reserve** | The best password code we have. **Not used in Phase 1:** no passwords, so we avoid the paid-CPU dependency, reset flows and credential stuffing. If the owner ever wants passwords, take it as-is. |
| One-message login with dummy-hash timing | Legacy `Handlers.ts:229-277` | **Reuse the principle** | Every auth answer here is identical whether or not the account exists ("we sent a code if that address is registered" style). |
| Save rows with `revision` and 409 on stale writes | Legacy `deploy/schema.sql` + `Handlers.ts:493` | **Reuse** (ported to SQLite) | Exactly the per-game save store needed. |
| "Link, do not replace": Case A automatic, Case B blocking prompt, `pull()` only reports | Legacy `RESEARCH-accounts.md` §4 | **Reuse the design** | Plus one improvement: where a game's progress is monotone (NONET), the merge is automatic and lossless, and the prompt is needed only for non-mergeable saves (Pitch Masters, Legacy). |
| Short-lived, scoped, nonce'd ticket | Legacy `Sessions.ts:216-308` | **Reuse the idea** | It is the authorization code of the cross-domain hand-off: single use, 60 s, bound to one game client and one PKCE verifier. |
| HMAC session token with no revocation, kept in localStorage | Legacy `Sessions.ts` | **Avoid** | It can't be revoked, and it shares a signing key with CNC. |
| Old Express `auth.ts` / `InMemoryAuth` | Legacy `src/` | **Avoid** | Node-only, frozen, and loses accounts on restart. |
| Origin check, salted IP hash, mandatory secret refusal, idempotency keys, board registry | SPARK `server/leaderboard/worker.js` | **Reuse as-is** | Already live on the same Cloudflare account, and it has passed SPARK's audits. |
| OAuth (Google, Discord, Steam), PKCE, refresh rotation, account linking, Turnstile, data export and delete | none | **Build new** | Nothing to reuse. Use small, well-known libraries only with the merge owner's and owner's approval (for example `arctic` for OAuth and `jose` for JWTs, which both run on Workers). Otherwise write it by hand against WebCrypto. |

**Headline:** neither project has OAuth, cross-domain login or rate limiting worth keeping. CNC contributes the email-link and revocable-session design. Legacy contributes the save store and the guest-to-account rules. SPARK's leaderboard contributes the Cloudflare hardening. Nothing is copied wholesale. Both projects carry a known defect that this design fixes explicitly: CNC's link consumed on GET and open redirect, and Legacy's unrevocable token and key shared across apps.

---

## 3 · The design

### 3.1 Where it runs
- **A new Cloudflare Worker, `account`, with its own D1 database `account`, created with `--jurisdiction eu`.** D1 jurisdictions have existed since 2025-11-05; a jurisdiction can only be set at creation, and it keeps the data stored and processed in the EU, which suits an owner in France. It runs on the same Cloudflare account as `spark-leaderboard`.
- **Why Cloudflare and not Vercel/Neon** (CNC's stack):
  - the owner already runs D1 there, and the leaderboard worker is right next to it;
  - the free tier covers small scale;
  - no cold-start database. CNC's S273 login timeouts came from Neon scaling to zero, and D1 has no such pause.
- **Separate from the leaderboard worker.** The leaderboard stays as it is, and only learns to *verify* an account token (§3.7). Keeping them apart means a leaderboard bug cannot touch accounts, and the leaderboard keeps working if accounts are down.
- **Address:** `id.<company-domain>` (open question 1). Until that is bought, a private pilot can run on `account.<sub>.workers.dev`. That address is on the Public Suffix List, so its cookies are naturally host-only, which is fine for a pilot but not for the public. The login page must show the company's own name: players type their email into it.

### 3.2 Identity model
- **One `account` per person.** It has an id (random UUID), a display name, an **arcade tag** (3 characters from the board's alphabet, *not* unique: the board keys on account id, so two players named "DAN" are now two rows), a created time, and a deletion state.
- **Many `identity` rows per account:** `(provider, subject)` is unique. The providers are `email`, `google`, `discord` and `steam`. The subject is the stable provider id: the Google `sub`, the Discord user id, the Steam 64-bit SteamID, or the lower-cased email.
- **Linking rules.** These are the most security-sensitive part.
  1. You link a new provider **only while logged in** ("Add Discord to my account"). Steam returns no email at all, so this is the *only* way Steam joins an account.
  2. **Never auto-merge by email**, except when both sides hold a *verified* address for it. That means the email-code identity, Google's `email_verified=true`, or Discord's `verified=true`. In that case the login offers "You already have an account with this email: log in to it", with no silent merge.
  3. Two existing accounts can be **merged** only by a player logged into both, through an explicit screen. Progress merges per game (§3.6), and the arcade rows of the absorbed account fold into the survivor by `runs` and `total_ms`. These are sums, so the merge is exact.
  4. The last remaining identity cannot be removed, so nobody locks themselves out.

### 3.3 Login methods
| Method | Phase | How | Notes |
|---|---|---|---|
| Email code / link | 1 | We email a 6-digit code and a link. The link opens a page with a "Log me in" button that POSTs. Each code and link is single use and expires after 15 minutes. | CNC design, with its GET defect fixed. The code works in any browser, on desktop builds and in the Steam overlay. Turnstile runs before sending. |
| Google | 1 | OIDC authorization code with PKCE and `state` + `nonce`; verify the ID token's signature, `aud`, `iss` and `exp`. | Needs a Google Cloud OAuth client. **The owner creates it** in his own Google account; the client secret goes into `wrangler secret`. |
| Discord | 1 | OAuth2 authorization code with PKCE, scope `identify email`. | The owner creates the Discord application. |
| Steam (website) | 2 | Steam OpenID 2.0 ("Sign in through Steam"). The server **must call back to Steam** (`check_authentication`) to verify the response, and pull the SteamID from `claimed_id`. | Needs no Steamworks app, only a Steam Web API key for the profile name. Link only (rule 1 above). |
| Steam (inside a Steam build) | 3 | The client calls `GetAuthTicketForWebApi("id.<company>")`, and the server calls `ISteamUserAuth/AuthenticateUserTicket` with the **publisher key**, which returns the SteamID. | Logs in silently on Steam. Needs the Steamworks app; the publisher key is server-only. |
| Passwords | not planned | — | See the summary. If ever wanted, Legacy's `Passwords.ts` plus the Workers Paid plan. |

### 3.4 Login across many domains (the hard part)
Cookies never cross domains, and browsers now block third-party cookies (Safari ITP, Firefox, and Chrome's restrictions). **Silent login through a hidden frame is therefore out.** The design is a small OAuth 2.1-style authorization server with **top-level redirects**:

1. A player on `nonet.example` presses **Log in**. The game creates a PKCE verifier and `state`, keeps them in `sessionStorage`, and sends the whole page to `https://id.<company>/authorize?client_id=nonet&redirect_uri=https://nonet.example/auth/callback&code_challenge=…&state=…`.
2. The `id.` domain holds its **own** session cookie (`__Host-sid`, `HttpOnly; Secure; SameSite=Lax`, host-only; it is first-party on that site). If the cookie is already present, because the player logged into SPARK last week, `/authorize` redirects straight back with a code, with no screen at all (or one "Continue as DAN?" click; ⚠ MINE, I recommend the click the first time each game is used). Otherwise it shows the login page.
3. The game's callback POSTs `code + verifier` to `/token` (CORS allowed only for that client's exact origin). It receives:
   - an **access token**: a JWT signed with **EdDSA (Ed25519)**, valid for 15 minutes, `aud = nonet`;
   - a **refresh token**: opaque, 30-day sliding window, **rotated on every use**. Reusing an old one revokes the whole family (theft detection).
4. Other services, such as the leaderboard, verify access tokens **offline** with the public key (JWKS at `/.well-known/jwks.json`). No shared secret is handed out, which fixes Legacy and CNC's shared-key hazard.

**Where each game keeps its refresh token.** Static sites (GitHub Pages) have no server to set a first-party HttpOnly cookie.
- **Recommended:** put each game domain's DNS on Cloudflare and add a Worker **route** `<game-domain>/auth/*` to the same `account` Worker. The `/token` exchange then happens *on the game's own domain*, and the refresh token lives in an `HttpOnly; Secure; SameSite=Strict` cookie that JavaScript can never read. This is the "backend for frontend" pattern, run by one Worker across many domains. The static site itself stays on GitHub Pages behind the Cloudflare proxy (open question 2). ⚠ This needs checking against `verify-deploy` and Pages TLS before go-live.
- **Fallback, if a domain can't move:** the refresh token goes in `localStorage`, with rotation and reuse detection to limit how long a stolen one is useful, plus a strict Content-Security-Policy. This is weaker against XSS. It is acceptable for a game with no payment data on the page.
- **Pitch Masters (Godot desktop):** RFC 8252, where the desktop app opens the system browser to `/authorize` with a `http://127.0.0.1:<port>/callback` loopback redirect and PKCE. A device-code fallback (RFC 8628: "go to id.<company>/link and type ABCD-1234") covers locked-down machines. Pitch Masters' own sessions build this.
- **Log out:** "log out here" clears the game's cookie. "Log out everywhere" revokes every refresh-token family and the `id.` session.

### 3.5 Data model (D1 / SQLite), a sketch rather than a migration
```sql
account(id TEXT PK, display_name TEXT, arcade_tag TEXT, created INTEGER, deleted_at INTEGER NULL, age_ok INTEGER)
identity(provider TEXT, subject TEXT, account_id TEXT REFERENCES account, email TEXT NULL,
         email_verified INTEGER, linked INTEGER, PRIMARY KEY (provider, subject))
client(id TEXT PK, name TEXT, redirect_uris TEXT /*json, EXACT match*/, origins TEXT /*json*/)   -- spark, nonet, pitchmasters, …
login_code(id TEXT PK, email TEXT, code_hash TEXT, link_hash TEXT, purpose TEXT, expires INTEGER,
           consumed INTEGER NULL, ip_hash TEXT, tries INTEGER)                                     -- CNC magic_link_tokens, + code
idp_session(id_hash TEXT PK, account_id TEXT, created INTEGER, last_seen INTEGER, expires INTEGER, revoked INTEGER NULL)
auth_code(code_hash TEXT PK, client_id TEXT, account_id TEXT, redirect_uri TEXT, pkce_challenge TEXT,
          expires INTEGER /*60 s*/, used INTEGER NULL)                                             -- Legacy ticket idea
refresh_token(hash TEXT PK, family TEXT, account_id TEXT, client_id TEXT, created INTEGER,
              expires INTEGER, rotated_to TEXT NULL, revoked INTEGER NULL)
save(account_id TEXT, game TEXT, slot TEXT, schema_version INTEGER, data TEXT /*json ≤ 64 KB*/,
     revision INTEGER, updated INTEGER, PRIMARY KEY (account_id, game, slot))                      -- Legacy save + revision
entitlement(id TEXT PK, account_id TEXT, sku TEXT, source TEXT /*steam|web|key*/, source_ref TEXT,
            granted INTEGER, revoked INTEGER NULL)                                                 -- Phase 3, empty until then
auth_event(id TEXT PK, account_id TEXT NULL, type TEXT, client_id TEXT, ip_hash TEXT, details TEXT, created INTEGER)  -- CNC
rate(key TEXT, created INTEGER)  -- the leaderboard `writes` pattern: ages out by TIME
```
Tokens and codes are stored **only as hashes**: the HMAC pattern from CNC, keyed by a `wrangler secret`.

### 3.6 Per-game progress, sync and migration
- **API:**
  - `GET /saves/:game/:slot` returns `{data, revision}`; a missing save returns `{data:null, revision:0}`, never 404 (Legacy's lesson).
  - `PUT` with `If-Match: <revision>` returns 409 when stale.
  - The client re-reads, **merges with the game's own pure merge function**, and retries.
- **Local first, always.** `localStorage` stays the working copy, so a game works offline and while logged out. It syncs on login, after every stage clear, and when the tab is hidden (`visibilitychange`). It never syncs only on restart, which is Legacy's still-open CF-S120.
- **Merge functions belong to the game**, are pure, and are unit-tested:
  - **NONET campaign:** `unlocked = max`, `stars[i] = max`. Lossless and order-free, so it never needs a prompt.
  - **NONET daily:** the later day key wins.
  - **SPARK:** no progress today. Only preferences (audio/display) *may* sync later (⚠ MINE: not worth it in Phase 1).
  - **Pitch Masters / non-mergeable saves:** Legacy's Case B **blocking prompt** ("This computer has a different save. Keep this computer's, or use your account's?"), with `matchesLocal` skipping the prompt when both are equal.
- **First-login migration (device to account):**
  1. After the first login on a device, the game reads its local keys (`spark.nonet.progress.v1`, `spark.nonet.daily.v1`, Pitch Masters' own) and merges them into the account's save.
  2. It records `spark.account.linked.v1 = <account-id hash>` on the device.
  3. If a *different* account later logs in on that device, the game **asks once**: "Add this computer's progress to <tag>?" Otherwise a shared family PC would silently give one person's stars to another.
  4. Local keys are never deleted, so logging out leaves the device exactly as it was.
- **The friend's case:** with this, his progress lives in his account; logging in on the new computer brings it back. ⚠ **Before accounts exist**, Pitch Masters could ship an "Export / import my progress" code. That is a cheap stop-gap, and its own sessions can decide.

### 3.7 The arcade board moves to accounts (R182-G), and R182-H is unblocked
- **Leaderboard change (small, additive):**
  - `players` gains `account_id TEXT NULL`; ranked rows key on `(board, account_id)` when one is present.
  - The worker verifies the `Authorization: Bearer` access token offline (JWKS, `aud` in an allowlist) and **ignores any client-sent name for an account**: the name shown is the account's arcade tag, so a player can't take another's tag on their own row.
  - **Guests stay** (open question 3, recommended yes): no token means today's typed-name row, labelled as a guest.
  - Existing name rows stay untouched and **cannot be claimed**, because ownership of a 3-letter name can't be proven.
  - The rest of R182-G is unchanged: ranked by average from run 1, `runs` + `total_ms` stored, board visible only after you submit.
  - The leaderboard's current Origin, rate-limit and idempotency defences stay. Per-account rate limits are added as well, so a stolen token can't flood the board.
- **R182-H (adaptive difficulty):** now possible, because identity persists across devices. The collision canon §9 warns about (a better player drawing harder grids sinks on a raw-average board) is solved at no cost by the **board registry that already exists**:
  - each difficulty tier is its own board (`nonet:t1`, `nonet:t2`, …; `BOARD_RE` already accepts `a:b` ids);
  - an account is placed in a tier by its average, and an average only ever compares players drawing from the same distribution;
  - the promotion threshold is the owner's to rule when H is built, and is not part of this design.
- ⚠ **The cheating story improves but is not solved.** An account makes a cheater *identifiable and bannable* (`account.deleted_at` / a ban flag), but the client still owns the clock. A board that is actually secure is still a server-minted puzzle, a different feature (README "Cheating").

### 3.8 Security checklist (each line is a requirement)
1. Use PKCE S256 for every client, plus `state`. For Google, also `nonce`, verified.
2. Match **redirect URIs exactly** against the `client` row (fixes CNC's open redirect). Never accept a `returnUrl` from the client.
3. Make auth codes single use, 60 s, bound to client + PKCE. Rotate refresh tokens; reuse revokes the whole family.
4. Sign access tokens with Ed25519 for 15 minutes, with a `kid` so keys can roll. The private key lives only in a `wrangler secret`. **No signing key is shared with any other project** (Legacy's hazard).
5. Store email codes and links only as HMAC hashes. Allow 5 attempts per code. Send at most 3 per email per hour, rate-limited per IP hash in D1 (the `writes` pattern), with **Turnstile** before any email goes out.
6. Give **one answer whether or not an account exists**, for login, sending a code, and linking (fixes the register leaks in both CNC and Legacy).
7. Cookies: the `__Host-` prefix, `HttpOnly; Secure; SameSite=Lax` on `id.`, `Strict` on game domains.
8. Allowlist exact origins per client for CORS, and **also** reject bad `Origin` on every state-changing route, server-side (the leaderboard's lesson: CORS does not stop the write).
9. Take the client IP only from `CF-Connecting-IP`, never `x-forwarded-for` (CNC's spoofing defect). Hash it with a salt (`IP_SALT` pattern; refuse to start without it).
10. Write an `auth_event` for every login, link, unlink, merge, logout-everywhere, export and delete. Players can see their own recent logins.
11. No passwords means no credential stuffing, and no hashing costs on the CPU budget.
12. Secrets are **only** set with `wrangler secret put` by the owner. Their names are listed in the README, never their values. The `CF-S123` token-in-transcript incident is the reason why.

### 3.9 Privacy and GDPR (France, EU)
- **Data minimisation:** an email (only for email login), provider subject ids, a display name and tag, hashed IPs, and game saves. No analytics trackers, and no advertising ids.
- **Lawful basis:** contract, since the account is the service the player asked for. **Only strictly necessary cookies** (login session), which CNIL exempts from consent, so **no cookie banner is needed** as long as nothing else is added.
- **Data stays in the EU:** D1 `--jurisdiction eu`. Cloudflare's DPA covers Workers, and the email processor needs a DPA too (Cloudflare or Resend).
- **Rights:**
  - **Download my data** (JSON of the account, identities, saves and arcade rows);
  - **Delete my account**: the account is soft-deleted at once, then fully deleted after 30 days. Arcade rows are anonymised, keeping the guest tag and dropping the account id, so the board's averages stay true;
  - a privacy page naming the controller (the owner's company), the processors and the retention periods.
- **Age:** France's digital-consent age is 15. Sign-up asks "I am 15 or older, or have a parent's permission" (open question 6). There is no profiling and no marketing email without a separate opt-in.
- **Breach:** CNIL notification within 72 h. The `auth_event` log is what makes the scope knowable.

### 3.10 Cost at small scale
| Item | Cost | Source / note |
|---|---|---|
| Workers + D1, free plan | €0 | 100k requests/day; D1 5M reads and 100k writes/day (README, read 2026-09-18). A login is about 5 requests and about 10 rows written. |
| Workers Paid plan | $5/month | Needed for Cloudflare Email Service sending (3,000 emails/month included, then $0.35 per 1,000; public beta 2026-04-16). It also raises the CPU limits. |
| Or Resend instead | free tier | ⚠ Free-tier limits not re-verified this session. |
| Turnstile | free | |
| Domains | about €10–15/year each | At cost through Cloudflare Registrar. |
| Google / Discord / Steam OpenID | free | Steam *app* fee ($100 per app on Steam Direct) is only for selling on Steam, not for login. |

### 3.11 What each game must change
- **SPARK:**
  - a "Log in" item in the menu;
  - a tiny shared `accountClient` module (PKCE redirect, callback, refresh, `fetchWithAuth`), well under 10 KiB of the shared bundle charter;
  - send the token with leaderboard POSTs.
  - Multiplayer is unchanged: seat identity (R195-T2) is untouched. An account *may* later supply the lobby name. ⚠ MINE: not in Phase 1.
- **NONET:** the same client, plus progress sync and migration (§3.6), plus the board change. Its campaign is already monotone, so this is the easiest game to start with.
- **Pitch Masters:** its own sessions. It needs the RFC 8252 loopback flow in Godot, a save merge-or-prompt, and its device migration. The API in this document is the contract.
- **Leaderboard worker:** the additive `account_id` change and JWKS verification (§3.7). **No protocol bump.** None of this touches the SPARK network wire (`PROTOCOL_VERSION`).
- **Each game's arcade page** links to the others (R196-V1). Each arcade can look different; the login button is the same everywhere.

---

## 4 · Phased plan

| Phase | Contents | Done when | Owner actions |
|---|---|---|---|
| **0 · decisions** | Answer the open questions; buy the company domain and put it on Cloudflare; decide on DNS for `spark-online.space`. | Domain on Cloudflare. | Buy the domain; create the Google OAuth client and Discord app (his accounts); `wrangler secret put` the secrets. |
| **1 · smallest useful slice** | The `account` Worker + D1 (eu), with email code/link + Google + Discord; `id.` session; authorize/token/refresh/JWKS; `save` API; NONET progress sync and first-login migration; leaderboard verifies tokens (`account_id` rows, guests kept); account page with export, delete and logout-everywhere; privacy page. | A player logs in on PC A, clears 3 NONET stages, logs in on PC B and sees 3 stages and their account tag on the board. | Approve the Workers Paid plan; approve any npm package (`jose` / `arctic`) or have it written by hand. |
| **2 · the network** | Steam OpenID linking on the web; Pitch Masters joins (its sessions: loopback + device code); account merge screen; each game's arcade cross-links; SPARK menu login; refresh-cookie routes on each game domain. | One account across SPARK, NONET and Pitch Masters; the friend's case can't happen again. | Buy the NONET and Pitch Masters domains (*"once the game is ready and running good"*). |
| **3 · Steam and money** | Steam-ticket silent login in Steam builds; the `entitlement` table; web shop through a merchant of record; Steam purchases through Steam (§5). | First sale recorded as an entitlement from either source. | Steamworks company and app; choose the merchant of record; written answer from Valve on cross-store entitlements. |
| **4 · R182-H** | Per-tier boards `nonet:tN`, promotion by account average. | Owner rules the threshold. | The ruling. |

The progress file and this document are the plan of record. When building starts, this becomes `BRAIN`-style `ACTIVE_PLAN_accounts.md` per the Founder DNA plan-persistence rule. That is for the merge owner to decide.

---

## 5 · Payments research (R196-V3), every source dated (accessed 2026-10-07)

### 5.1 Steam (Valve)
- **Revenue share:** 30%, falling to 25% on a game's revenue above $10M and 20% above $50M. This includes DLC, in-game sales and Marketplace fees, and has applied since 2018-10-01 (TechCrunch / Neowin, Nov–Dec 2018 coverage of Valve's announcement). ⚠ The Steam Distribution Agreement itself sits behind the partner login, so these terms are confirmed by press reports only.
- **In-game purchases inside the Steam build must use Steam:** *"For any in-game purchases, you'll need to use the microtransaction API so Steam customers can only make purchases from the Steam Wallet."* (`partner.steamgames.com/doc/features/microtransactions`, no page date, read 2026-10-07).
- **Steam keys sold elsewhere (including our own site) are allowed, with price parity:** *"don't give Steam customers a worse deal than Steam Key purchasers"*. Discounts at different times are fine if Steam customers get a comparable offer within a reasonable time (`partner.steamgames.com/doc/features/keys`, read 2026-10-07). Keys don't cost the 30%. Volume is reviewed (reported soft limit of about 5,000 per request; secondary sources).
- **Selling a *non-Steam* copy** (our own download or web version) at any price: per reports the parity rule covers *Steam keys*, not separate builds (secondary; ⚠ not in Valve's own wording).
- **Steering:**
  - Store page descriptions and graphics **may not promote or link to other websites**, including QR codes and spelled-out URLs. The official website and social links go in the Store Page Editor's link fields (`partner.steamgames.com/doc/store/page/description`; links auto-hidden from September 2024, Destructoid/WePC, August 2024).
  - Inside the game, any purchase must go through the Steam Wallet (above).
- **Web purchases usable in the Steam build:** **not addressed in Valve's public docs** (⚠ unverified either way; see §6). The industry pattern is one account across stores, with each store selling through its own checkout (Supremacy 1914 below).

**How the owner's stance (R196-V5) is worded within Valve's rules:**
- ✅ The Steam store page has the official website in its **website link field**.
- ✅ The game's support or help screen in the Steam build may say: "Having trouble? Visit our support page" (a support link, not a shop).
- ✅ Our *own* sites, newsletters and Discord may say: "Also playable in your browser at <domain>, with the same account."
- ❌ Not in the Steam build or Steam page: "buy cheaper on our site", web-shop links, prices, QR codes, or "the website version is better".
- ❌ Not: a Steam build that sells anything except through the Steam Wallet.
- ⚠ My reading, not Valve's words: a neutral in-game "your account also works at <domain>" on a settings or account screen carries some risk. Leave it out of the Steam build until Valve confirms (open question 5).

### 5.2 Apple App Store (only relevant if a game ever ships on iOS)
- **EU (DMA), new single terms from 2026-10-01** (`developer.apple.com/support/dma-and-apps-in-the-eu/`, last updated 2026-08-18):

| Option | Standard rate | Small business |
|---|---|---|
| Apple in-app purchase | 26% | 15% |
| Alternative in-app payment | 20% | 10% |
| Link out to the web (sales within 7 days of the tap) | 15% | 10% |
| Apps distributed from alternative marketplaces or the web (Core Technology Commission) | 5% | — |

- **United States:** since the 2025-04-30 contempt order in Epic v. Apple, apps may include buttons and links to web purchases. The Ninth Circuit (2025-12-11) vacated the zero-commission ban and sent the case back for a "reasonable" commission. Apple has proposed 15% standard and 5% small business on linked-out purchases (iClarified, 2026-08-14). The Supreme Court took up the contempt question on 2026-06-30 (Courthouse News / MacDailyNews, August 2026). **Unsettled as of today.**
- **Multiplatform (Guideline 3.1.3(b)):** an app may let users access items bought on the web or other platforms, *including consumables in multiplatform games*, **provided those items are also offered as in-app purchases in the app** (Apple guidelines PDF / developer forums, read 2026-10-07).

### 5.3 Google Play (only if on Android)
- **From 2026-06-30 in the UK, EEA, Australia and Japan:** alternative billing costs 10% on the first $1M, then 20% for new installs or 25% for existing ones. Web link-out purchases within 24 h cost about 10%.
- **Link-out rules:** only to your own offers; tell the user before linking; no personal data in the link; no misleading destination (`support.google.com/googleplay/android-developer/answer/17161464`, read 2026-10-07).
- **EEA External Offers (2024 structure):** 10% (5% for subscriptions) initial acquisition for 2 years, plus 17% / 7% ongoing (TechCrunch 2024-03-06; `answer/16505463`). ⚠ It may be superseded by the 2026 structure, so verify before relying on it.

### 5.4 How Supremacy 1914 (Bytro) routes purchases
- **One Bytro account** across browser, Steam, Android, iOS and Windows, with the same features everywhere (developer reply on Steam discussions, 2019-06-06; Steam store app 979920). Players link a browser account to Steam by logging in with the same username and password.
- **Each storefront sells through its own checkout:** Steam sells its packs as **Steam DLC** (Steam Wallet); Green Man Gaming sells the same packs as **keys**; the browser site has its own shop. ⚠ **Unverified:** whether gold bought on the web shows up in the Steam client. Public sources don't say; inferred yes, because it is one account balance.
- **The lesson for us:** the *account* is shared, and the *checkout* belongs to whichever store the player is in. That is exactly the `entitlement(source=…)` design.

### 5.5 A desktop download sold from our own site
- **No store cut.** Only the payment or merchant-of-record fee. The game can carry its own login (§3.4, desktop loopback).
- **Practical extras:** a Windows code-signing certificate (without one, SmartScreen warns on every download; ⚠ prices not checked); an updater; refunds handled by us or the merchant of record.
- **itch.io as the shop instead:** open revenue share, 10% by default and adjustable (gamedeveloper.com; itch docs page returned 403). ⚠ Whether itch acts as merchant of record and handles EU VAT is unverified.

### 5.6 Payment processors and EU VAT
- **The VAT problem:** a French seller selling digital goods to consumers elsewhere in the EU has an **EU-wide threshold of €10,000** a year. Above it, VAT is charged at the *buyer's* country rate and declared through **OSS** in one quarterly return in France (Fonoa / Junto / hayot-expertise 2026 guides). Below it, French VAT applies. Every sale needs evidence of the buyer's country.
- **A merchant of record (MoR)** is legally the seller: it collects and remits every country's VAT, handles chargebacks, and pays us out.
  - **Paddle:** 5% + $0.50 per transaction, VAT and sales tax in 200+ markets (Paddle pricing via 2026 comparisons). It has a "Paddle for games" offering. ⚠ One 2026 secondary source says its acceptable-use policy bars *virtual currency / stored value*, but the AUP page as fetched shows no games restriction. **Ask Paddle before selling in-game currency.** Selling the game itself, or "packs" of content, is safest.
  - **Stripe Managed Payments** (Stripe's own MoR, in the main API since April 2026): Stripe fees plus 3.5%, about 6.4% all-in domestic (dodopayments 2026).
  - **Lemon Squeezy** (owned by Stripe since July 2024): 5% + 50¢.
  - **Plain Stripe** (CNC's choice): about 1.5% + €0.25 on EU cards (⚠ not re-checked), but **we** do OSS VAT, invoices and chargebacks. Only worth it at volume.
- **Recommendation:** a merchant of record (Paddle, or Stripe Managed Payments if Paddle refuses game currency). The extra few percent buys never having to file VAT in 27 countries, which a one-person company should not take on. Entitlements are granted by the MoR's signed webhook, using CNC's idempotent claim/release pattern, with **no** client-supplied return URL (CNC's open-redirect defect).

---

## 6 · What I could not verify (stated, not guessed)
- Whether Valve allows web-bought items or currency to be honoured in a Steam build. The public docs are silent; ask Valve partner support in writing.
- That the parity rule covers only Steam keys and not separate non-Steam builds (press reports, not Valve's wording).
- Whether Supremacy 1914's web-bought gold appears in its Steam client.
- The final US commission on Apple link-outs (in court).
- Whether Google's 2024 EEA External Offers fees are superseded by the 2026 structure.
- Paddle's stance on in-game currency (conflicting sources).
- itch.io's VAT / merchant-of-record status (docs returned 403).
- Resend free-tier limits; plain-Stripe EU card fees; code-signing prices.
- Whether `spark-online.space` DNS can move to Cloudflare without disturbing GitHub Pages TLS or `verify-deploy` (an owner and merge-owner check before Phase 2).
- The Steam revenue share figures come from 2018 press coverage of Valve's announcement; the agreement text needs a partner login.

## 7 · Open questions for the owner (each with my recommendation)
1. **Company name and domain for `id.`.** Buy it before Phase 1 and put it on Cloudflare. Moving it later logs everyone out and means re-registering every provider.
2. **`spark-online.space` DNS onto Cloudflare** (site stays on GitHub Pages). Yes. It makes refresh tokens HttpOnly; the fallback works but is weaker.
3. **Guest typed names on the board.** Keep them as guest rows. Old names can't be claimed.
4. **Passwords.** No.
5. **Web purchases honoured in Steam.** Don't plan on it until Valve answers in writing; ask before Phase 3.
6. **Age line.** "15 or older or with a parent's permission"; no profiling or marketing.
7. **Workers Paid plan at $5/month** at Phase 1 go-live. Yes.
8. *(For Phase 3)* **Merchant of record.** Paddle first, Stripe Managed Payments as the alternative; ask Paddle about virtual currency first.
9. *(⚠ MINE, can wait)* **A "Continue as DAN?" click** the first time a player enters each game. Yes, the first time per game, then silent.

## 8 · Sources (all accessed 2026-10-07)
- Valve: partner.steamgames.com/doc/features/microtransactions · /doc/features/keys · /doc/store/page/description · /doc/webapi/ISteamUserAuth · /doc/api/ISteamUser
- Steam revenue tiers: techcrunch.com (2018-11-30), neowin.net, mcvuk.com (Dec 2018)
- Store-page link ban coverage: destructoid.com, wepc.com, shacknews.com (Aug 2024)
- Apple: developer.apple.com/support/dma-and-apps-in-the-eu/ (updated 2026-08-18) · App Review Guidelines 3.1.3(b) · iclarified.com (2026-08-14) · courthousenews.com, macdailynews.com (2026-08-14) · fkks.com / revenuecat.com (2025 injunction summaries)
- Google: support.google.com/googleplay/android-developer/answer/17161464 · /answer/16505463 · techcrunch.com (2024-03-06)
- Supremacy 1914: steamcommunity.com/app/979920/discussions/0/1638661595042267408 (2019-06-06) · store.steampowered.com/app/979920 · greenmangaming.com pack listings
- Processors: paddle.com/help/…/what-am-i-not-allowed-to-sell-on-paddle · dodopayments.com (2026 Stripe Managed Payments / Lemon Squeezy) · fungies.io (2026) · gamedeveloper.com (itch open revenue sharing)
- EU VAT: fonoa.com France guide · junto.fr (2026) · hayot-expertise.fr (2026)
- Cloudflare: developers.cloudflare.com/changelog/2025-11-05-d1-jurisdiction/ · /email-service/platform/pricing/ · /changelog/post/2026-04-16-email-sending-public-beta/ · Workers/D1 pricing (via SPARK `server/leaderboard/README.md`, 2026-09-18)
- Google Play Games saved-games guidance: developer.android.com/games/pgs/savedgames (cited by Legacy RESEARCH-accounts.md)
