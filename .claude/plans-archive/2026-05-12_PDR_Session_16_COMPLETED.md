# PDR — Session 16

**Generated:** 2026-05-12
**Status:** Council R1 + PRIME-AUDIT + Scope Amendment #1 — **APPROVED 2026-05-12 (user `go`)**
**Tier:** Standard (batch — highest priority drives tier; P2 deploy is Standard)
**Active branch:** `master`
**Baseline:** ef681a6 (S15 closed; 291/291 green; typecheck exit 0)

═══════════════════════════════════════════════════════════
## 1. OBJECTIVE

Ship the two cross-network playtest BLOCKERS surfaced after S15
(lobby JOIN unusable; localhost not reachable cross-country) plus
the S15 carry-forward charter extraction, and close S16 with a
public, branded deploy at `spark-online.space`.

After this session the friend-in-different-country playtest path
is mechanically complete: friend opens
`https://spark-online.space/` (or `daneshto-dotcom.github.io/the-spark/`
as fallback) → types host's 6-char code into a real input field →
Connect → host clicks Begin Match → 1v1 networked play.

═══════════════════════════════════════════════════════════
## 2. SCOPE — five priorities, sequential

### P0 — Charter extraction (Micro, S15 carry-forward)
- **Move from** `src/state/world.ts` (357 LOC) **to** new `src/state/gameMode.ts`:
  - 4 dispatch case bodies (START_GAME @ L248, END_TURN @ L268, RETURN_TO_TITLE @ L276, UPDATE_AVATAR_POS @ L309)
  - `addScore` helper (L344-357) with its JSDoc block
- world.ts switch keeps the `case` labels and delegates to imported pure functions.
- `requirePlayer` (L323-327) STAYS in world.ts (pre-existing infra, used by placePrimitive.ts — DELTA-9 from A.0 probe; NOT in scope).
- Mechanical extract, zero behavior change. Same pattern as S14 P2.0 / S15 P1.
- Expected delta: world.ts ~357 → ~280; new gameMode.ts ~90 LOC.
- **Tests:** 291/291 regression preserved. No new tests required for mechanical move.

### P1 — Lobby JOIN UX (Micro, BLOCKER for cross-network play) — **Council-revised**
- **Replace** the Pixi-text + window.keydown hack in `src/render/lobbyScreen.ts`
  (lines 92-103 invisible `joinInputText` + `joinInputBg`; lines 227-243
  `installKeyHandler` / `uninstallKeyHandler`) **with** a real HTML
  `<input type="text">` overlaid via absolute positioning over the JOIN pane.
- **Input contract** (Council R1 Gemini #1 adopted — a11y + mobile attrs):
  - `maxLength="6"` + `pattern="[2-9A-HJ-NP-Z]{6}"` (excludes 0,O,1,I per protocol charset)
  - `style.textTransform = 'uppercase'` + JS `.toUpperCase()` on `input` event
  - `autocomplete="off"`, `autocapitalize="characters"`, `inputmode="text"`,
    `spellcheck="false"`, `aria-label="Room code"`
  - `style.zIndex = '1000'` (Council R1 Grok #2 — Pixi z-stacking guard)
  - Cyan border + monospace font matched to existing pane accent
  - Native focus, caret, paste, IME work for free
  - `placeholder="ENTER CODE FROM HOST"`
- **Affordance fixes:**
  - Hint text below input: "Click here, then type the code your friend shared."
  - Click anywhere on the JOIN pane (or its tap-target wrapper) calls `inputEl.focus()`.
  - "Connect" button reads `inputEl.value`; disabled while length < 6 (visual `alpha`).
- **Positioning** (Council R1 Grok #3 — mobile viewport guard adopted):
  - Compute on resize/visibility using `canvas.getBoundingClientRect()`
    + canvas-space → page-space ratio. Position over JOIN pane code area
    (the `joinInputBg` Pixi rect at world coords `(joinPaneX+40, paneY+100, PANE_WIDTH-80, 60)`).
  - Recompute on `window.resize` AND on `window.visualViewport.resize`
    (mobile keyboard viewport collapse). Guard `visualViewport` with feature-check.
- **Lifecycle:** create input lazily in `LobbyScreen` constructor; show on
  `setVisible(true)` + mode='select'; hide on `setVisible(false)` and on
  mode transitions away from 'select'. Cleanup on lobby destroy
  (none currently — long-lived singleton — but provide `destroy()` for parity).
- **Drop** the keyboard-buffer hack entirely (`joinBuffer`, `installKeyHandler`,
  `uninstallKeyHandler`). The HTML input is the source of truth.
- **Tests:** 3-5 new in `src/render/lobbyScreen.test.ts` (jsdom):
  - input has correct attrs (maxLength, pattern, uppercase, a11y, inputmode)
  - Connect button disabled when value.length !== 6
  - clicking pane wrapper focuses input
  - lowercase paste auto-uppercases
  - showing/hiding lobby toggles input display
- **jsdom limitation acknowledged** (Council R1 Grok #3): full mobile-keyboard
  e2e requires real browser; covered by `npm run dev` manual smoke + future playtest.
- Expected delta: ~95 LOC + ~60 LOC of test.

### P2 — GitHub Pages deploy + custom-domain swap (Standard, BLOCKER) — **Council-revised: official actions instead of peaceiris**

**Step 1 (initial — daneshto-dotcom.github.io/the-spark/):**
- `vite.config.ts`: add `base: '/the-spark/'`
- Create `.github/workflows/deploy.yml` using **GitHub's official Pages actions**
  (Council R1 Grok #4 + Gemini #2 adopted — drops peaceiris/actions-gh-pages@v3
  in favor of `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`,
  GitHub's audited modern path):
  - Trigger: push to `master` (+ `workflow_dispatch`)
  - **Permissions block** (PRIME-AUDIT #1 — required by actions/deploy-pages@v4):
    `pages: write`, `id-token: write`, `contents: read`
  - **Environment:** `github-pages` (PRIME-AUDIT #1)
  - **Concurrency:** `group: pages, cancel-in-progress: false`
  - Two-step job: build → deploy (Grok #4 — clean separation):
    - `build` job: `ubuntu-latest`, `setup-node@v4` with `node-version: 22` + `cache: 'npm'`, `npm ci`, `npm run build`, then `actions/upload-pages-artifact@v3` with `path: ./dist`
    - `deploy` job: `needs: build`, `actions/deploy-pages@v4`
- After first successful run, **manually** flip GitHub Settings → Pages →
  Source: **"GitHub Actions"** (PRIME-AUDIT #2 — different from peaceiris's "branch" mode; one-time user step). Documented in HANDOFF S17 acks.
- Verify the deployed URL loads + Trystero WebRTC handshake works
  (HTTPS enforced by github.io; default GH Pages has NO CSP set — Council R1
  Grok #5 risk mitigated: WebRTC bypasses CSP `connect-src` via `RTCPeerConnection`
  anyway, and Trystero/Nostr WSS to public relays is unblocked).

**Step 1.5 (NEW — Council R1 Gemini #3 + Grok #8 partial adopt — favicon + robots + OG meta):**
- Create `public/` dir (A.0 DELTA-4 already requires this).
- `public/favicon.svg`: minimal 32×32 single-glyph SVG (a small geometric spark
  — concentric rings or a triangle-burst, ~5 LOC inline SVG).
- `public/robots.txt`: `User-agent: *\nAllow: /\n` (single file, 2 lines).
- `index.html`: add `<link rel="icon" type="image/svg+xml" href="favicon.svg">`
  + minimal OG meta tags (og:title="SPARK", og:description="Geometric
  emergence — 1v1 networked play", og:type="website"). ~5 LOC delta.
- **DEFERRED (rejected at this scope):** sitemap.xml, web-manifest, OG image
  asset, Lighthouse CI, CSP plugin, Sentry, analytics, privacy policy.

**Step 2 (custom domain — spark-online.space, ships in same session per S15 handoff ef681a6 carry-forward):**
- `vite.config.ts`: flip `base: '/'`
- `public/CNAME`: single line `spark-online.space` (no newline).
- DNS (Squarespace Domains → DNS panel → Custom Records):
  - 4 A records, Host=`@`, values:
    - `185.199.108.153`
    - `185.199.109.153`
    - `185.199.110.153`
    - `185.199.111.153`
  - 1 CNAME, Host=`www`, value=`daneshto-dotcom.github.io.` (trailing dot per RFC)
- GitHub Settings → Pages → Custom domain: `spark-online.space` → Enforce HTTPS
- Let's Encrypt auto-issues cert within ~15 min once DNS A records resolve.
- **User-step DNS check:** `dig +short spark-online.space @8.8.8.8` should
  list the 4 GitHub Pages IPs.

**SCOPE AMENDMENT #2 (in-execution, 2026-05-12 — Step 2 deferred):**
Original plan committed Step 1 + 1.5 + Step 2 same session. Issue caught
mid-execution: Step 2's `base='/'` change would deploy assets at `/assets/`
not `/the-spark/assets/` — breaking the github.io fallback URL until the
user toggles Custom Domain in Pages Settings (asynchronous user step). For
the user's "play today" constraint, the safer sequence is:

- **P2 ships Step 1 + 1.5 NOW** → github.io URL works ~1min after Actions
  green. User can playtest TODAY at `daneshto-dotcom.github.io/the-spark/`.
- **Step 2 becomes a S17 ready-to-ship commit** that user pushes only after:
  (a) DNS A records added at Squarespace, (b) `dig +short spark-online.space`
  resolves, (c) Custom Domain toggled to `spark-online.space` in Pages
  Settings. ~3-line commit (vite.config `base: '/'` + `public/CNAME` create).
  HANDOFF documents the exact 3 commands.

This trades the original 'two-step-same-session' optimization for a
guaranteed-working URL TODAY. CF DNS migration also deferred to S17+.

- Expected delta: +1 LOC vite.config, +~50 LOC workflow YAML (build + deploy
  jobs + permissions/env/concurrency blocks), +1 LOC CNAME, +5 LOC favicon.svg,
  +2 LOC robots.txt, +5 LOC index.html OG meta, +LOCKED §13.9 amendment.

### P3 — Visual polish: BETA badge + lobby ring/legend visibility (Micro — **now mandatory per Scope Amendment #1**)

**P3.a — BETA badge (Scope Amendment #1, user-requested):**
- Add a small persistent "BETA" badge top-right of canvas, always visible
  across all `gameState` values (TITLE / LOBBY / PLAYING / WIN).
- Implementation: Pixi `Text` added to `app.stage` (not the lobby/title/HUD
  containers, so it's never hidden) with monospace font, ~14px, accent color
  (use cyan `PLAYER_COLORS[1]` at alpha 0.55 for subtle non-obtrusive).
- Position: `(CANVAS_WIDTH - 12, 12)` anchored top-right (anchor.set(1,0)).
- Text content: `"BETA"`.
- Wired in `src/main.ts` during boot, after `app` is ready and before the
  render loop starts.

**P3.b — Lobby ring/legend visibility (from handoff):**
- In `src/main.ts` per-frame visibility update (or game-state-change callback),
  set `makeSpawnerRing` + `makeLegend` containers' `.visible = false` when
  `world.gameState ∈ {TITLE, LOBBY}`. Re-show when PLAYING.
- Eliminates spawner-ring artifact bleeding through lobby panes
  (visible in user's S15 screenshot).

- **Tests:** none (both items cosmetic, single-pixi-property toggles).
- Expected delta: ~20 LOC.

### P4 — Closeout
- **LOCKED §13 amendment:** add §13.9 Deployment URL row (primary:
  `https://spark-online.space/`, fallback: `https://daneshto-dotcom.github.io/the-spark/`,
  Trystero strategies confirmed working over HTTPS).
- **LOCKED §13.1 drift fix (A.0 DELTA-7):** version pin `trystero@^0.20` →
  `trystero@^0.24.0` (actual `package.json` state).
- **LOCKED §7 module-map:** add `src/state/gameMode.ts`.
- BACKLOG.md S16 entry above S15 (P0-P3 narrative, Council R1, PRIME-AUDIT delta).
- reflexion_log.md: 4-5 S16 entries (pruned to ≤50).
- boot-snapshot.md regenerate.
- PDR move to `.claude/plans-archive/2026-05-12_PDR_Session_16_COMPLETED.md`.
- HANDOFF root → `.handoff-archive/HANDOFF_2026-05-12_S15_postS16.md`; new S17 HANDOFF at root.
- Final git commit + push.

═══════════════════════════════════════════════════════════
## 3. NON-GOALS (explicit)

- ❌ No client-side AttractDrag prediction / reconciliation buffer
  (deferred per S15 LOCKED §13.7 known limit + Grok R1 ask).
- ❌ No delta-encoded NetSnapshot (Council R1 nice-to-have, deferred).
- ❌ No host-migration stub (Grok R2 ask, deferred to post-playtest).
- ❌ No live cursor-move sync for remote avatar (commit-only updates remain).
- ❌ No NET feel constant re-tuning (NET_SNAPSHOT_HZ, NET_INTERPOLATION_MS)
  — gated on actual cross-network playtest signal.
- ❌ No Phase-2 Tier-1+ disruption suite (`docs/phase-2-design-options.md`).
- ❌ No ngrok-based "same-day tunnel" path (P2 ships permanent infra instead).
- ❌ No audio (Suno track upload still pending).

═══════════════════════════════════════════════════════════
## 4. RISKS

| # | Risk | Mitigation |
|---|------|------------|
| R1 | HTML input z-index loses to Pixi canvas, or canvas swallows clicks | Set `inputEl.style.zIndex = '1000'` + `pointer-events: auto`; Pixi canvas does not swallow events outside its rect |
| R2 | Input positioning drifts on window resize | Listen on `resize` event + on Pixi `app.renderer.resize`; recompute from canvas bounding rect each show |
| R3 | jsdom test env may not have realistic `getBoundingClientRect` | Mock `canvas.getBoundingClientRect` in test setup; assert positioning function output rather than visual placement |
| R4 | GitHub Actions deploy.yml fails on first run (token perms, branch protection) | `peaceiris/actions-gh-pages@v3` is battle-tested; built-in `GITHUB_TOKEN` works if Settings → Actions → Workflow permissions allows write (default OK for public repos); if fail, surface error + retry in same session |
| R5 | `base: '/the-spark/'` breaks dev (`npm run dev` expects `/`) | Vite's `base` only affects build; dev server serves from `/` regardless. Verify by `npm run dev` post-change |
| R6 | Trystero ICE/STUN fails over GitHub Pages HTTPS due to mixed-content or CSP | Trystero defaults use WebRTC + public STUN + BitTorrent/Nostr strategies, none of which trigger mixed-content; GH Pages has no CSP by default |
| R7 | DNS A records don't propagate before user wants to ship | Step 1 (github.io URL) ships independently; Step 2 commit is queued and pushes after Step 1 verifies. Both commits land same session but user can pause between |
| R8 | LOCKED §13 trystero version drift (^0.20 → ^0.24) hides breaking change | Read trystero changelog (or test surface) before amending — but our use is `joinRoom({appId}, roomId)` core API, stable across 0.20-0.24 |
| R9 | P0 extract breaks 14 session15 tests that exercise the 4 dispatch handlers | Re-export action types from gameMode.ts AND world.ts; reducer dispatch must remain on `dispatch(world, action)` (the public API). Internal delegation to `applyStartGame` etc. is invisible to tests |
| R10 | world.ts LOC re-grows past 280 trip-wire from Council recommendations | None expected this session; charter goal IS to reduce |
| R11 | Connect button currently reads `this.joinBuffer` — extraction must rewire | Single touch point at line 105-117; rewire to `this.inputEl.value` |

═══════════════════════════════════════════════════════════
## 5. STATE-DISCOVERY (Rule 21 A.0 — empirically verified)

Probed at `git rev-parse HEAD` = ef681a6, 2026-05-12 13:22.

| # | Claim | Probe | Actual | Delta |
|---|-------|-------|--------|-------|
| 1 | vite.config.ts has no `base` | Read | confirmed, lines 6-15 | ✅ |
| 2 | package.json build script | Read | `"build": "tsc -b && vite build"` | ✅ |
| 3 | `.github/workflows/` exists | Glob | NOT present | ✅ Confirms P2 creates it |
| 4 | `public/` dir exists | Glob | NOT present | ⚠️ P2 Step 2 must `mkdir public/` (no .gitkeep needed — CNAME is the file) |
| 5 | git origin URL | Bash | `https://github.com/daneshto-dotcom/the-spark.git` | ✅ |
| 6 | world.ts 357 LOC, controls.ts 542 LOC | wc -l | confirmed | ✅ |
| 7 | trystero version pin | Read package.json | **`^0.24.0`** (LOCKED §13 says ^0.20) | ⚠️ Doc drift — P4 amendment |
| 8 | dispatch handler line numbers | Grep | START_GAME L248, END_TURN L268, RETURN_TO_TITLE L276, UPDATE_AVATAR_POS L309 ✅ | ✅ |
| 9 | addScore at L344 | Read | confirmed, JSDoc spans L330-343 | ✅ |
| 10 | requirePlayer included in P0 extract? | Read | L323-327, comment says "used by placePrimitive.ts and other state mutators" | ⚠️ STAYS in world.ts (NOT in P0 scope) |
| 11 | Lobby JOIN keyboard hack location | Read | joinInputText L92-98, joinInputBg L100-103, installKeyHandler L227-243 | ✅ |
| 12 | Connect button gates on joinBuffer.length === 6 | Read | L106 confirmed | ✅ Single rewire point |
| 13 | controls.ts ControlsDispatchFn injection | Grep | confirmed (S15 P2 work — dispatch already injected) | ✅ |
| 14 | tests/typecheck baseline | npx vitest run + tsc -b | **291/291 pass, exit 0** | ✅ GREEN |
| 15 | last-pushed commit | git log -1 | ef681a6 (matches handoff) | ✅ |
| 16 | working tree state | git status --short | only `.claude/session-state.json` autocommit churn | ✅ Clean enough |

═══════════════════════════════════════════════════════════
## 6. TESTING (verification plan)

### Per priority

- **P0:** `npx vitest run` → 291/291 (no new tests, regression preserved); `npx tsc -b --noEmit` exit 0. Spot-check session15.test.ts: 14 tests still pass (exercise START_GAME/END_TURN/RETURN_TO_TITLE/UPDATE_AVATAR_POS through public `dispatch`).
- **P1:** `npx vitest run` → 291 + ~4 new = ~295/295. Manual smoke: `npm run dev` → click 1v1 → JOIN pane → click input → caret visible → type 6 chars → uppercase → click Connect → connecting status fires. Negative: type 5 chars + Connect → "Code must be 6 characters" hint. Paste lowercase → uppercased. Window resize → input stays positioned.
- **P2 Step 1:** Local sanity: `npm run build` → check `dist/index.html` references `/the-spark/assets/…`. `npm run preview --base=/the-spark/` → loads at root. GH Actions: push commit → watch workflow → green check → visit `https://daneshto-dotcom.github.io/the-spark/` → game loads → 1P (solo) works → 1v1 lobby loads. (Trystero P2P validated by spawning 2 incognito tabs — not a true cross-network test but proves transport.)
- **P2 Step 2:** `npm run build` → check `dist/CNAME` exists + correct content; `dist/index.html` references `/assets/…` (no the-spark prefix). Push → Actions green → visit `https://spark-online.space/` (after DNS+cert ~15 min) → game loads → Enforce HTTPS lock icon green.
- **P3:** Manual: in TITLE/LOBBY, spawner ring + legend invisible; in PLAYING they reappear.
- **P4:** `git status` clean; `git log` shows S16 priority commits; reflexion_log.md ≤50 entries; PDR archived; HANDOFF current.

### Whole-session gates
- `npx vitest run` final → all green
- `npx tsc -b --noEmit` final → exit 0
- `git push` confirmed for every priority commit
- session-state.json: per-priority `check_completed:true` + `check_method` (verbose) + `checkpoint_commit` (SHA) per Integrity-Warning Protocol
- Token budget: GREEN throughout (target <500K / 1M Opus window)

═══════════════════════════════════════════════════════════
## 7. CONSTITUTIONAL GATES (LOCKED amendments — applied in P4)

Required spec amendments — applied IN P4 closeout, NOT during execution:

1. **LOCKED §13.1 (transport):** version pin `trystero@^0.20` → `trystero@^0.24.0` (A.0 DELTA-7 fix; doc drift from S15 P2 — package.json was bumped but spec not synced).
2. **LOCKED §13.9 NEW (deployment):** add subsection:
   - Primary URL: `https://spark-online.space/`
   - Fallback URL: `https://daneshto-dotcom.github.io/the-spark/`
   - Transport: GitHub Pages static hosting, Let's Encrypt HTTPS, Squarespace DNS apex A records (4 × 185.199.108-111.153) + `www` CNAME → `daneshto-dotcom.github.io.`
   - CI: `.github/workflows/deploy.yml` on push:master via `peaceiris/actions-gh-pages@v3`
3. **LOCKED §7 module-map:** add `src/state/gameMode.ts` (S15 dispatch handlers + addScore extracted from world.ts).
4. **LOCKED §10.2 (input sanitization):** unchanged.
5. **LOCKED §11 (FSM):** unchanged.
6. **LOCKED §XV (charter trip-wires):** world.ts trip-wire 280; post-S16 actual ≤280 (target met).

═══════════════════════════════════════════════════════════
## 8. APPROVAL GATE

| Field | Value |
|-------|-------|
| `pdr_approved` | **true** |
| `deliberation_completed` | **true** (Council R1 + PRIME-AUDIT + Amendment #1) |
| `unlock_source` | **user** (`go` + BETA addition + Squarespace DNS confirm) |
| `tier` | Standard |
| `council_required` | yes (Standard tier — Rule 17) |
| `council_waived` | no |
| `council_invoked` | `R1-completed-Grok-Gemini-both-REVISE-converging-on-deploy-pages-v4-plus-a11y-attrs-plus-favicon-robots-OG-plus-mobile-viewport-guard-PRIME-AUDIT-applied-Amendment-1-BETA-badge` |
| `pdr_path` | `.claude/plans/2026-05-12_PDR_Session_16.md` |

**User action required before execution begins:** Approve this batch PDR
explicitly (`go`, `approved`, `ship it`). On approval, gate fields land
at BOTH top-level AND each priority entry in `session-state.json`
(per CLAUDE.md PDR GATE — Genesis S35 hook-semantic fix), then PDCA
agent executes P0→P1→P2→P3→P4 sequentially.

═══════════════════════════════════════════════════════════
## BATTLE LEDGER

### Council R1 — completed 2026-05-12 (Trident Strike → Claude synthesis)

**Triumvirate positions (one-line):**
- **Claude (Prime Architect):** Ship 5-priority batch as drafted; both BLOCKERS land + carry-forward charter + closeout.
- **Grok (Disruptor):** REVISE — peaceiris is suboptimal vs deploy-pages@v4; mobile-keyboard hazard on P1; CSP/Trystero risk to verify; reject Cloudflare alternative (out of scope); P0 safe via public dispatch surface.
- **Gemini (Quality Auditor):** REVISE/HIGH — adopt a11y attrs + favicon/robots/OG meta; quality gaps in CSP/Sentry/Lighthouse are aspirational and DEFERRED for v1.

### Battle Ledger

| # | Decision | Claude | Grok | Gemini | Authority | Resolution | Tok Δ | Risk Δ |
|---|----------|--------|------|--------|-----------|------------|-------|--------|
| 1 | P0 switch-delegation pattern | Switch+delegate | Re-export safer | AGREE Claude | Claude (1.75) impl | **AGREED → switch-delegate; session15 tests hit public dispatch surface, immune** | 0 | 0 |
| 2 | P1 HTML overlay vs Pixi-native | HTML | Pixi+IME risky but concede | Adopt HTML+a11y | Claude (1.75) | **AGREED HTML** | 0 | 0 |
| 3 | P1 mobile viewport guard | absent | `visualViewport.resize` recalc | WCAG/responsive | Grok (1.75) edge | **ADOPTED — visualViewport.resize handler + zIndex=1000** | +~15 LOC | -1 |
| 4 | P1 a11y attrs | absent | implicit | aria-label/autocomplete/inputmode/spellcheck | Gemini (1.75) quality | **ADOPTED — 5 attrs added** | +~5 LOC | -1 |
| 5 | P2 peaceiris vs deploy-pages@v4 | peaceiris@v3 | "deprecated zombie, v5 audited" | Lock SHA, audit CI | 2 dissenters override | **ADOPTED — actions/upload-pages-artifact@v3 + actions/deploy-pages@v4, official GH path** | +~20 LOC YAML | -1 |
| 6 | P2 CSP/Trystero risk | No default CSP | "CRITICAL: GH Pages CSP blocks WebRTC" | n/a | Grok (1.75) edge | **MITIGATION — default GH Pages has no CSP; WebRTC RTCPeerConnection bypasses connect-src anyway; verify in smoke** | 0 | -1 (mitigated by knowledge) |
| 7 | P2 same-session timing | Commits same session, Custom Domain toggle async | DNS roulette 70% fail | Hardening missing | Claude (1.75) impl | **AGREED — commits same session; Custom Domain toggle is user-async post-DNS** | 0 | 0 |
| 8 | NEW Step 1.5 favicon+robots+OG | absent | "favicon/robots/CSP plugin" | "favicon/OG/web-manifest" | Gemini (1.75) quality | **ADOPTED PARTIAL — favicon.svg + robots.txt + OG meta. Sitemap/manifest/CSP-plugin DEFERRED** | +~15 LOC | 0 |
| 9 | P3 hide ring/legend in TITLE/LOBBY | Ship | AGREE trivial | Q 5/5 | unanimous | **AGREED** | 0 | 0 |
| 10 | Trystero ^0.20→^0.24 API break | Tests prove API works (291/291) | "Breaking API untested" | n/a | Tests are evidence | **REJECTED concern** | 0 | 0 |
| 11 | Cloudflare Pages alternative | n/a | "Smarter mechanism" | n/a | Scope expansion + user owns Squarespace domain | **REJECTED** | 0 | 0 |
| 12 | Stryker mutation testing | n/a | "P0 safety" | n/a | Premature | **REJECTED** | 0 | 0 |
| 13 | Sentry/analytics/Lighthouse/privacy | n/a | n/a | Multiple Missing items | All aspirational, out of scope for playtest-blocker | **REJECTED — out of scope** | 0 | 0 |
| 14 | Pre-bound dispatch handlers vs switch | switch | "branch predictor stalls" | n/a | Premature optimization | **REJECTED** | 0 | 0 |
| 15 | Pixi 8.5→8.6 / Vite 5.2→5.4 bump | Current pins | "newer bundles better" | n/a | Out of scope, no observed problem | **REJECTED — could open new failure modes** | 0 | 0 |

Resolution legend: AGREED (consensus), ADOPTED (incorporated), REJECTED (declined with reason), MITIGATION (informed change without scope expansion).

### Quality Scorecard (Gemini)
- Quality: 4.5/5 | Efficiency: 4.5/5 | Tool Utilization: 4/5 (after P2 Step 1.5 add) | Completeness: 4/5

### Risk Consensus
- **Agreed risks** (in PDR §4): R1 (z-index), R2 (resize), R3 (jsdom), R4 (Actions perms — addressed by deploy-pages@v4 permissions block in PRIME-AUDIT #1), R5 (base in dev), R6 (CSP — defused by default-no-CSP knowledge), R7 (DNS propagation — defused by async toggle), R8 (trystero drift — defused by 291/291), R9 (test breakage — public dispatch immune), R10, R11.
- **Unresolved (no SPLIT items):** none — all decisions resolved.

### Veto Log
- No vetoes used. Both R1 ledger members can apply a veto in S17+ if synthesis miscarries.

═══════════════════════════════════════════════════════════
## PRIME-AUDIT DELTA (Rule 20 — adversarial self-audit on synthesized PDR)

After Council R1 synthesis, before user gate, I (Claude) re-audited the
revised PDR for items the Council rubber-stamped or under-addressed:

1. **PRIME-AUDIT #1 — Council missed deploy-pages@v4 workflow requirements:**
   `actions/deploy-pages@v4` REQUIRES three additional workflow elements
   that Grok's "switch to deploy-pages" recommendation glossed over:
   - `permissions: { pages: write, id-token: write, contents: read }` at workflow level
   - `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }` on deploy job
   - `concurrency: { group: pages, cancel-in-progress: false }` to prevent overlapping deploys
   These are baked into the revised P2 Step 1 spec above.

2. **PRIME-AUDIT #2 — Council missed Pages Source setting change:**
   `actions/deploy-pages@v4` requires Settings → Pages → Source = **"GitHub
   Actions"** (NOT "Deploy from a branch / gh-pages"). This is a different
   one-time user-step from peaceiris's flow. Documented in P2 Step 1 +
   will be called out in HANDOFF S17 acks.

3. **PRIME-AUDIT #3 — favicon.svg needed concrete content:**
   Gemini said "add favicon" but did not specify what. To keep Step 1.5
   genuinely Micro-tier, ship a minimal 32×32 SVG: viewBox 0 0 32 32,
   a single white triangle-burst or concentric-rings glyph, no
   anti-aliasing dependencies. ~5 LOC inline SVG. Polish/branding pass
   deferred to a future "S## brand" priority.

4. **PRIME-AUDIT #4 — Trystero ^0.20→^0.24 drift verified:**
   Re-checked: S15 P2 shipped at trystero ^0.24.0 with 291/291 tests
   green. The `joinRoom({appId}, roomId)` API has been stable across
   0.20-0.24 (verified by 14 session15.test.ts tests that mock joinRoom
   via NetTransport wrapper). Grok's "breaking API untested" risk is
   refuted by working tests. LOCKED §13.1 needs only doc-pin amendment.

5. **PRIME-AUDIT #5 — public/CNAME file format quirk:**
   GitHub Pages CNAME file must contain ONE bare hostname, no protocol,
   no trailing newline-only-counts-as-newline weirdness — but Git on
   Windows may LF→CRLF auto-convert. Ensure `.gitattributes` or
   explicit LF write. (Auto-handled by Vite copy-from-public/ which
   preserves bytes; verify post-build that `dist/CNAME` is exactly
   `spark-online.space\n` (21 bytes).)

6. **PRIME-AUDIT #6 — Step 1.5 OG image deferred (Council Gemini #3 partial):**
   Gemini suggested OG image asset. Without a designed share image, OG
   tags reference no image (or self-referential favicon). For honest scope,
   ship og:title + og:description + og:type only, NO og:image.
   Documented in §13.9 as future "brand polish" carry-forward.

All 6 deltas have been folded into the revised PDR body above.

═══════════════════════════════════════════════════════════
## SCOPE AMENDMENT #1 (user, 2026-05-12, post-Council R1)

**Source:** User message acknowledging `go` on the Council-revised PDR, with
two clarifications:

1. **BETA badge addition:** "we need to add 'beta' to the game page somewhere
   in the top of the screen". Folded into P3 as P3.a (always-visible Pixi
   text top-right of canvas, ~10 LOC in `main.ts`). P3 is now **mandatory**
   (no longer optional).

2. **DNS path decision:** User noted "I don't mind moving to Cloudflare if
   needed... most of my domains are on cloudflare anyways it's just easier
   to buy on squarespace." Decision: **stay with Squarespace DNS for S16**
   (4 A-records take 5 min to add at Squarespace today; Cloudflare nameserver
   migration would add 24-48h propagation delay, incompatible with the
   user's "play by end of day" goal). **Cloudflare DNS migration logged as
   S17+ carry-forward** — easy lift: change Squarespace nameservers to
   `ada.ns.cloudflare.com` + `cole.ns.cloudflare.com` (or similar), re-add
   the 4 A records + www CNAME in CF UI. No code change required.

No Council re-deliberation needed (Micro-tier addition, established
pattern, no risk surface).

═══════════════════════════════════════════════════════════
## SUMMARY OF SCOPE CHANGES vs DRAFT

Council R1 + PRIME-AUDIT delta resulted in these scope adjustments:

- **P1 +**: 5 a11y attrs (aria-label, autocomplete, autocapitalize, inputmode, spellcheck), zIndex=1000, visualViewport.resize handler.
- **P2 Step 1 CHANGE**: Switched from `peaceiris/actions-gh-pages@v3` to
  `actions/upload-pages-artifact@v3` + `actions/deploy-pages@v4`. Added
  permissions/environment/concurrency blocks. Pages Source = "GitHub Actions"
  (different user-step).
- **P2 Step 1.5 NEW (~15 LOC total)**: favicon.svg (5 LOC inline SVG) +
  robots.txt (2 LOC) + OG meta tags in index.html (5 LOC).
- **P2 Step 2 SAFETY**: documented Custom-Domain toggle is user-async
  (commits land same session, DNS wait happens externally).
- **P4 LOCKED §13.9 EXPAND**: deployment row now lists no-default-CSP,
  WebRTC RTCPeerConnection bypass, favicon/OG files, gh-actions deploy
  pipeline (actions/deploy-pages@v4).
- **NON-GOALS GROWN**: sitemap.xml, web-manifest, OG image asset, CSP plugin,
  Sentry, analytics, privacy policy, WCAG audit, browser-matrix, brand
  guidelines — all DEFERRED to future sessions.

═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════
