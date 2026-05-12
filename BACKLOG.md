# SPARK — Build Backlog

**Plan horizon:** 5–6 main sessions to working Phase-1 prototype + 3 buffer.
**Locked decisions:** [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md).
**Spec:** [SPARK_Blueprint.md](SPARK_Blueprint.md) v0.5.1.

---

## Session 17 — Phase-2 Tier-1 disruption + custom-domain ready-to-ship [COMPLETED] (2026-05-12)

**Triggered by user approval of presented S17 PDR + mid-PDR Scope Amendment #1 BLOCKER report ("I can't join room when playing with friend... it lets you put the code in that my friend generated and then cant click enter"). Standard tier (5 priorities), Council R1 (Grok DISRUPTOR + Gemini AUDITOR) on the Phase-2 work, no Council re-invocation for the Lobby BLOCKER (pre-existing defect in S16 P1 module, no new architectural surface).**

Council R1 outcomes (8 ADOPT / 3 REJECT / 3 PARTIAL): Gemini BLOCKER `placerColor not ownerColor for §X.2 "reveal contributions"` ADOPTED; stroke decomposition (Pixi v8 has no native A→B gradient API) ADOPTED; hostile-if-EITHER-endpoint-placerColor-differs auth rule ADOPTED; §VIII.3 disambiguation (cross-player Sever costs 1 charge; §VIII.4 self-sever free) ADOPTED; save.ts disruptionCharges + buildActions serialization Gemini #2 RESOLVED via A.0 audit (already wired, no schema bump). Grok REJECTED: inter-player bonding bug-not-feature (it IS the §V/§VI.4/§X.2 multi-color mechanism), range-gate on bond pick (no spec authority — fog A is the visibility mechanic), P0 separate-PDR extraction (5 LOC doesn't justify overhead).

PRIME-AUDIT delta caught 5 items Council didn't surface: (A) net protocol intent envelope audit, (B) cycle-bond no-charge-consume, (C) charge dot color = player's color, (D) §VIII.3 amendment precise text, (E) BETA badge text length grew → connectionDot relocation.

**P0' — Lobby Connect bug fix (Scope Amendment #1 BLOCKER, commit `fd016c2`).** Root cause: `src/render/lobbyScreen.ts` set `joinButton.position` / `hostBtn.position` / `codeText.position` using ABSOLUTE canvas coords but they're children of relative-positioned pane Containers — double offset drove Connect button to stage (2090, 940), 170px past CANVAS_WIDTH=1920. S16 P1 tests are pure-helper unit tests (sanitize / validate / map-canvas-to-page) — couldn't catch Pixi Container child-positioning math, so the bug shipped invisible. Fix: 3 absolute-coord position.set calls → pane-relative; extract attemptJoin closure invoked from BOTH joinButton.pointertap AND new inputEl.keydown(Enter) UX fallback; 5 new regression tests via pure-helper exports (getConnectButtonCanvasBounds, getHostButtonCanvasBounds, getHostCodeTextCanvasPos, getHostPaneOrigin, getJoinPaneOrigin) asserting all elements stay in canvas bounds + explicit witness against the buggy x=2090 position. Tests: 307 → 312 (+5).

**P0 — Custom-domain commit prep (Micro, commit `c6f636d` local-only, push GATED).** S16 P2 Scope Amendment #2 carry-forward closed. `vite.config.ts` flips `base: '/the-spark/'` → `'/'`. `public/CNAME` NEW (single line `spark-online.space\n`). Build verified: `dist/index.html` references `/assets/...` (not `/the-spark/assets/...`); `dist/CNAME` contains `spark-online.space`. PUSH GATED on user explicit go after Squarespace DNS (4 A records + www CNAME) + GitHub Settings → Pages → Custom domain = spark-online.space + Enforce HTTPS toggle. LOCKED §13.9 amendment deferred to after-push success.

**P1 — Phase-2 §VIII.3 Sever-as-disruption (Standard, commit `629044a`).** `SEVER_BOND` action gains `{ playerId: PlayerId; cause: 'player' | 'physics' }` discriminator. `cause='player'` routes through 1v1 input gate + hostile-if-EITHER-endpoint-placerColor-differs auth + §VIII.1-2 charge gate (1 charge per destructive hostile sever; cap = MAX_DISRUPTION_CHARGES=2). `cause='physics'` bypass (constraint-solver overstretch isn't a disruption action). PRIME-AUDIT B: cycle-bond sever does NOT consume a charge (severSplit returns empty del per §VIII.4 no-op; bond still removed). Self-sever (both endpoints share actor.placerColor) preserves Phase-1 §VIII.4 zero-cost path. UI: per-player charge dots in `src/render/ui.ts` (drawPlayerCharges helper — 0/1/2 filled player-colored circles next to per-player score readouts; hollow rings when unearned). save.ts audit confirmed disruptionCharges + buildActions already serialized (lines 111-112) — no schema bump needed. Net protocol audit (IntentMsg.action: GameAction) — TS structural typing auto-extends. 16 pre-existing SEVER_BOND dispatch sites migrated (2 production: main.ts physics-cause overstretch, controls.ts player-cause RMB-click; 14 test sites: cause='physics' preserves §VIII.4 topology-focused semantics). 10 new tests covering cross-player consume, 0-charge reject, self-sever free, wrong-turn reject, mixed-ownership auth, cycle-no-consume, charge cap, independent accumulation, save roundtrip, physics-cause bypass. Tests: 312 → 322 (+10). world.ts +18 LOC → 308 (10% over 280 target; S18 carry-forward for disruptionManager.ts extract per Council R1 Grok #8).

**P2 — Phase-2 §VI.4/§X.2 multi-color bond rendering (Standard, commit `91e1e21`).** `BondVisualParams.color: number` → `colorA + colorB`. `drawDefaultLine` decomposes into 4 sub-segments with lerped color when colorA !== colorB (Pixi v8 no native endpoint-gradient stroke API per Council R1 Grok #6 + Gemini #5); single solid stroke fast-path when colorA === colorB (Phase-1 back-compat). 12 magic silhouettes use `colorA` as primary stroke — per-silhouette gradient deferred to S18 polish. `structureRenderer.ts` caller sources from `primitive.placerColor` (immutable per §VI.4 / §X.2 "reveal contributions" per Council R1 Gemini #1 BLOCKER), NOT `ownerColor` (transient, mutates on Phase-2 Steal). Stress-tint (`lerpTint(.., 0xff3030, stress*0.85)`) applied per-endpoint so the bond turns red as it approaches break threshold even when endpoint colors differ. `mixTints` (pre-S17 single-color mid-blend helper) REMOVED — drawBondVisual now consumes per-endpoint colors directly. `lerpColor` pure helper exported (S10 #test-via-pure-helper-export pattern). 8 new tests (lerpColor at t=0/0.5/1, green-cyan channel preservation, same-color back-compat, cross-color 4-segment count, monotonic R/B progression, axis-span boundary). Tests: 322 → 330 (+8). bondVisualRenderer.ts +30 LOC → ~430 (within 500 soft charter).

**P3 — Closeout (this commit).** LOCKED amendments: §13.10 BETA badge text 'BETA' → 'BETA · S17 PHASE-2' + connectionDot relocation to clear longer badge (PRIME-AUDIT E); NEW §13.11 Phase-2 §VIII.3 Sever-as-disruption codification (full auth rule + cycle-no-consume + cause discriminator + charge dots UI + test coverage); NEW §13.12 Phase-2 §VI.4 multi-color bond rendering codification (stroke decomposition + placerColor sourcing + magic-12 deferred); NEW §13.13 §VIII.4 topology preserved notice. §13.9 deferred — primary URL stays `github.io/the-spark/` until P0 user-confirmed push then update to `spark-online.space`. reflexion_log prepended with 5 S17 entries (cap 50 — see file). boot-snapshot regenerated. PDR archived to `.claude/plans-archive/2026-05-12_PDR_Session_17_COMPLETED.md` via git mv. HANDOFF rotated: S16 → `.handoff-archive/HANDOFF_2026-05-12_S16_postS17.md`; new S17 HANDOFF at root.

**Carry-forward for S18+:**
- Custom-domain push if not done in S17 (P0 commit `c6f636d` ready locally)
- disruptionManager.ts extraction from world.ts (anti-bloat §XV; world.ts 308 LOC, 10% over 280 target)
- Per-silhouette gradient upgrade for 12 magic combos (Phase-2 §VI.4 polish — Open Question #7 "rich" version)
- bond-hover cost preview (Council R1 Grok #4 deferred-PARTIAL)
- Phase-2 D (Inject Spiral) — spec-ambiguous propagation, design risk
- Phase-2 E (Steal) — couples with F polish; closes territorial loop
- Phase-2 A (Fog of war) — foundation for visibility-gated raiding (visibility currently full per Council R1 Grok #9 REJECT)
- Phase-2 G (Mega-combos via connector chain) — standalone, no other prereqs
- Audio (Suno didgeridoo trance track upload still pending since S5)
- Cloudflare DNS migration (user preference, optional, post-P0 playtest)

---

## Session 16 — Cross-network playtest blockers (lobby UX + GH Pages deploy) [COMPLETED] (2026-05-12)

**Triggered by user post-S15-playtest review of the lobby screenshot:
2 BLOCKERS surfaced for cross-network 1v1 with friend in different country.
(1) JOIN pane keyboard hack invisible (no caret, no click-to-focus, no
paste) — friend cannot enter the host's code. (2) Dev server is
localhost-only — friend cannot load the page. Standard tier (P2 deploy
drives tier; P0/P1/P3 Micro; P4 closeout).**

User approval: "let run top priority batch so that me and my friend can
play it by the end of the day, and remember we need to add 'beta' to the
game page somewhere in the top of the screen" — triggered Scope Amendment
#1 (BETA badge added to P3; P3 promoted from optional → mandatory). User
clarified Cloudflare DNS migration is acceptable but stayed on Squarespace
DNS for today's playtest speed (Scope Amendment #2 deferred Step 2 swap
to S17 ready-to-ship).

Council R1 (Standard tier, council-of-models): Grok REVISE + Gemini
REVISE/HIGH. 8 ADOPTED / 6 REJECTED / 1 MITIGATION. Key adopt: switched
P2 deploy action from peaceiris/actions-gh-pages@v3 → GitHub-official
actions/upload-pages-artifact@v3 + actions/deploy-pages@v4. Adopted P1
a11y attrs (aria-label, autocomplete, autocapitalize, inputmode,
spellcheck) + Pixi z-index guard (1000) + mobile-keyboard visualViewport
handler. Adopted NEW P2 Step 1.5 favicon/robots/OG meta. Rejected
Cloudflare Pages alternative, Stryker mutation testing, Sentry/analytics/
Lighthouse/privacy, peer-bound dispatch optimization, Pixi/Vite version
bumps. CSP/Trystero risk mitigated by knowledge (GH Pages has no default
CSP; WebRTC bypasses connect-src via RTCPeerConnection).

PRIME-AUDIT delta caught 6 items Council rubber-stamped: deploy-pages@v4
requires permissions/environment/concurrency blocks (added); requires
Pages Source = "GitHub Actions" (different user-step from peaceiris,
documented + enabled via gh API); favicon.svg needs concrete SVG content
(shipped 32x32 concentric crimson + cyan circles); trystero ^0.20→^0.24
API stability refuted by 291/291 green tests; CNAME byte-format safety
note (LF-only); OG image deferred to S17+ no designed share asset.

**P0 — Charter extraction (Micro, commit `b2979fc`).** Mechanical move of
4 dispatch handler bodies (START_GAME, END_TURN, RETURN_TO_TITLE,
UPDATE_AVATAR_POS) + addScore helper from `src/state/world.ts` (357 LOC)
to new `src/state/gameMode.ts` (169 LOC w/ JSDoc). world.ts switch
delegates to imported `applyStartGame` etc. addScore re-exported from
world.ts for back-compat with placePrimitive.ts + session15.test.ts
(zero-touch on those files). world.ts: 357 → 290 LOC (target 280, 3.5%
over — accepted per S15 trip-wire reflexion). requirePlayer stays
(pre-existing, used by placePrimitive.ts). 291/291 green; typecheck
exit 0. Same Micro pattern as S14 P2.0 (placePrimitive extract) and
S15 P1 (redundantBondTargets extract).

**P1 — Lobby JOIN HTML <input> overlay (Micro BLOCKER, commit `5ff7865`).**
Replaced Pixi-text + window.keydown buffer hack in
`src/render/lobbyScreen.ts` (lines 92-103 invisible joinInputText +
joinInputBg; lines 227-243 installKeyHandler) with real
`<input type="text">` positioned via `canvas.getBoundingClientRect()`
over the JOIN pane code area. 11 attrs verified live in browser: type,
maxLength=6, pattern=`[2-9A-HJ-NP-Z]{6}`, placeholder, autocomplete=off,
spellcheck=false, autocapitalize=characters, inputmode=text,
aria-label="Room code", position=fixed, zIndex=1000, textTransform=
uppercase. visualViewport.resize handler (feature-checked, mobile-
keyboard guard). Pure helpers extracted (S10 #test-via-pure-helper-
export pattern): sanitizeRoomCodeValue, isValidRoomCode,
mapCanvasRectToPage, JOIN_INPUT_RECT. Connect button now reads
inputEl.value + visual alpha gate (0.4 disabled, 1.0 enabled).
PRIME-AUDIT init-order bugfix: inputEl creation moved to start of
constructor BEFORE setVisible(false) call (caught via preview
console boot-failure log). Click anywhere on JOIN pane focuses input.
Hint text below: "Click here, type the code from your friend." Drops
joinBuffer + installKeyHandler + uninstallKeyHandler entirely.
16 new tests in `src/render/lobbyScreen.test.ts` (293→307 total).

**P2 — GitHub Pages deploy (Standard BLOCKER, commits `4011862`
+ `9d9d9ee` enabling).** Step 1 + 1.5 SHIPPED:
- `vite.config.ts` base='/the-spark/' for project-page deploy
- `.github/workflows/deploy.yml` using GitHub-official
  actions/upload-pages-artifact@v3 + actions/deploy-pages@v4 (Council R1
  switch from peaceiris@v3; PRIME-AUDIT-required permissions/environment/
  concurrency blocks all included)
- `public/favicon.svg` (32x32 concentric crimson + cyan circles)
- `public/robots.txt` (Allow: /)
- `index.html` OG meta tags (og:title/og:description/og:type) + favicon
  link

LIVE at **https://daneshto-dotcom.github.io/the-spark/** (HTTP 200, HSTS
enforced, no CSP per Council Grok #5 analysis). GH Actions run
25732727978 deployed in 1m4s. PRIME-AUDIT #2 user-step ("Settings →
Pages → Source = GitHub Actions") satisfied via `gh api -X POST
/repos/.../pages -f build_type=workflow` after first deploy 25732612027
failed with "Pages not enabled" error.

Step 2 (spark-online.space swap) DEFERRED to S17 ready-to-ship commit
per Scope Amendment #2: same-session push would deploy assets at
`/assets/` not `/the-spark/assets/`, breaking github.io fallback URL
until user toggles Custom Domain in Pages Settings (async step). User
flow for S17 swap: (a) Squarespace DNS Custom Records add 4 A records
(Host=`@`, values=185.199.108-111.153) + CNAME `www`→
`daneshto-dotcom.github.io.`, (b) `dig +short spark-online.space @8.8.8.8`
confirms resolution, (c) Settings → Pages → Custom domain =
spark-online.space → Enforce HTTPS, (d) push ready-to-ship 3-line commit
(vite.config base='/' + public/CNAME=spark-online.space).

**P3 — Visual polish (Micro mandatory per Amendment #1, commit `9d9d9ee`).**
P3.a BETA badge: persistent Pixi Text "BETA" added directly to app.stage
(NOT inside any TitleScreen/LobbyScreen/HUD container) so visible across
all gameState values. monospace 14px, cyan PLAYER_COLORS[1]=0x3bd7ff,
letterSpacing=4, alpha=0.55, anchor.set(1,0) top-right at (CANVAS_WIDTH-12,
12). P3.b: spawnerRing + legend now captured as variables (previously
inlined without ref); game-loop visibility update toggles them off when
gameState ∈ {TITLE, LOBBY}. Eliminates spawner-ring artifact bleeding
through lobby panes from S15 screenshot.

**P4 — Closeout (this commit).**
- LOCKED §13.1 trystero version drift fix (^0.20 → ^0.24.0)
- LOCKED §13.9 NEW: deployment row (primary URL spark-online.space S17+,
  fallback github.io/the-spark/ shipped, GH Pages deploy pipeline spec,
  one-time Source=GitHub Actions step, no default CSP, HSTS, OG meta)
- LOCKED §13.10 NEW: persistent BETA badge row
- LOCKED §7 module-map: added `src/state/gameMode.ts`,
  `src/state/placePrimitive.ts` (already extracted, was missing from doc),
  `public/` block with favicon.svg + robots.txt
- BACKLOG S16 entry (this entry) above S15
- reflexion_log.md S16 entries (5 new, pruned to ≤50)
- boot-snapshot.md regenerate
- PDR archive: `.claude/plans/2026-05-12_PDR_Session_16.md` →
  `.claude/plans-archive/2026-05-12_PDR_Session_16_COMPLETED.md`
- HANDOFF rotate: S15 → `.handoff-archive/HANDOFF_2026-05-12_S15_postS16.md`;
  new S16 HANDOFF at root with S17 next-steps + Step 2 ready-to-ship spec

**S17 carry-forward** (queued ready-to-ship):
- **Step 2 (spark-online.space swap):** 3-line commit user pushes after
  DNS + Custom Domain toggle. Vite config base='/' + public/CNAME.
- **Cloudflare DNS migration option:** user-preference, nameserver swap
  to ada.ns.cloudflare.com + cole.ns.cloudflare.com (or similar);
  re-add 4 A records + www CNAME in CF UI. 24-48h propagation.
- **Cross-network playtest:** verify Trystero/Nostr WebRTC handshake +
  AttractDrag feel + NetSnapshot tick over real internet hop. May
  inform: client prediction (Grok R1 carry), delta NetSnapshot (Council
  R1 nice-to-have), host-migration stub (Grok R2 carry), live cursor sync.
- **POST-playtest tune:** NET_SNAPSHOT_HZ + NET_INTERPOLATION_MS feel
  constants.

**Known v1 limits unchanged** (LOCKED §13.7): AttractDrag client latency,
no host-migration, tab-hidden host pause, pre-S15 save format break,
no reconnect.

**Phase-2 Tier-1+ deferred** (docs/phase-2-design-options.md):
recommended C (Sever-as-disruption) + F (Multi-color rendering).

**Audio: Suno track upload still pending since S5.**

---

## Session 15 — S14 Charter Extraction + Phase-2 1v1 Networked Play [COMPLETED] (2026-05-12)

**Triggered by user request "present top recommended priority session batch
following full pipeline flow." Standard tier escalated to Full tier mid-session
on user amendment 2 ("not same machine hotseat because my friend is in a
different country") which authorized breaking LOCKED § 1 Phase-2/3 boundary
for Phase-2 networked play.**

User amended scope twice in-session:
1. Original PDR proposed Tier-0 Hotseat + Fog of war (~450 LOC). Council R1
   returned REVISE/REVISE.
2. User playtest of S14 build: "looks a lot better, well done! no need for fog
   of war yet. lets just work on making another player." Hotseat → re-Council
   carry-forward, scope reduced to lobby + hotseat (~330 LOC).
3. User cross-country amendment: "not same machine hotseat because my friend
   is in a different country, so lets make it a lobby host or something."
   Council R1+R2 deliberation (Trystero vs PeerJS resolved by R2 convergence
   on Trystero/Nostr; host-migration deferred to S16 via Gemini's "Connection
   lost" overlay v1). PRIME-AUDIT applied 6 leak-throughs.

User approval gate: "approved! be most technical, pedantic, logical and
thorough!"

**P1 — Charter extraction (Micro, commit `b9c4b20`).** Mechanical extraction
of `pickRedundantBondTargets` + `angularDistance` from controls.ts
(:449-534 pre-S15) to new `src/input/redundantBondTargets.ts`. Zero behavior
change. controls.ts 565 → 479 LOC (under § XV soft charter; closes S14
PRIME-AUDIT carry-forward documented in HANDOFF). redundantBondTargets.ts
at 102 LOC. 252/252 regression preserved. Same Micro pattern as S14 P2.0
(world.ts → placePrimitive.ts).

**P2 — Networked 1v1 MVP (Full tier core, commit `add497f`).** Six new
files + 8 modified + Trystero ^0.20 dep (+~40KB bundle):
- `src/net/transport.ts` (103 LOC): NetTransport wrapping `trystero/nostr`
  joinRoom; Nostr-primary signaling per PRIME-AUDIT #1 (BitTorrent default
  rejected via Grok R1 rate-limit concern); auto-fallback multi-strategy.
- `src/net/protocol.ts` (83 LOC): typed discriminated-union envelopes
  Hello/Intent/NETSNAPSHOT/EndGame; generateRoomCode (32-char no-confusion
  alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`) + parseRoomCode.
- `src/net/sync.ts` (146 LOC): HostSync emits snapshotSeq-numbered NetSnapshot
  every NET_SNAPSHOT_HZ=10 (every 6 physics ticks); ClientSync.receive
  validates seq>lastSeq (out-of-order rejected); interpolateInto lerps
  primitive + freeSpark positions between prev + current over
  NET_INTERPOLATION_MS=100 (linear lerp Council R2 + needsFullApply flag
  PRIME-AUDIT perf avoids per-render Map rebuild).
- `src/net/lerp.ts` (15 LOC): lerp01 clamp utility.
- `src/render/titleScreen.ts` (144 LOC): "SPARK" title + "1 Player" / "1v1
  (2 Player)" buttons.
- `src/render/lobbyScreen.ts` (289 LOC): host pane (generates code +
  "Waiting for Player 2" → "Begin Match") / join pane (text input + Connect)
  / "Connection lost" full-screen overlay / Back to Title.

Schema additions:
- `Player` interface gains `avatarPos: Vec2` (Council R1 Grok BLOCKER #2
  carry-forward).
- `World` gains `gameMode: 'solo' | '1v1'`, `currentPlayerId: PlayerId`,
  `scoreByPlayer: Map<PlayerId, number>`, `isHost: boolean`. GameState
  union extended with `'TITLE' | 'LOBBY'`. New actions: `START_GAME`,
  `END_TURN`, `RETURN_TO_TITLE`, `UPDATE_AVATAR_POS`.
- `PICKUP_SPARK`, `DROP_SPARK`, `PLACE_PRIMITIVE` silently reject when
  `gameMode === '1v1' && action.playerId !== currentPlayerId` (Gemini R1
  BLOCKER input sanitization).
- `addScore(world, playerId, delta)` helper: solo additive (preserves test
  contract — gameState.test.ts L51, session10/session13 SCORE_TIER tests
  directly mutate scoreProgress); 1v1 per-player + scoreProgress =
  max(scoreByPlayer.values()) for WIN gate.
- `WorldSnapshot` extended (additive, optional fields for pre-S15 compat):
  gameMode, currentPlayerId, scoreByPlayer, avatarPos. New exports
  `netSnapshot()` (NetSnapshot = WorldSnapshot - {savedAt, rngSeed,
  nextPrimitiveId, nextBondId} per Council R2 retain-list) +
  `applyNetSnapshot()`.

Input layer:
- `controls.ts` dispatcher injection via `ControlsDispatchFn`; default
  `makeLocalDispatcher` preserves back-compat. Solo / host: local dispatch.
  Client: net-routed via ClientSync.wrapIntent + NetTransport.send.
  Space key handler: END_TURN in 1v1 PLAYING; auto-release on AttractDrag
  (drop to Idle) or ConnectDrag (DROP_SPARK at cursor) per PRIME-AUDIT #4.
  `setPlayerId(1)` for client joiner.

Entry + render pipeline:
- `main.ts`: boots gameState='TITLE'; TitleScreen + LobbyScreen lifecycle
  via callbacks (onHostStart generates code + on(INTENT)→dispatch;
  onJoinAttempt setPlayerId(1) + on(NETSNAPSHOT)→clientSync.receive;
  onBeginMatch dispatches START_GAME(1v1)). Snapshot emission gated on
  host PLAYING every SNAPSHOT_INTERVAL_TICKS=6. Client physics skipped
  (host authoritative); client interpolation runs every render frame.
  Connection-lost overlay shows when 1v1 PLAYING + peerCount=0.
- `ui.ts` (HUD): turn indicator badge (active player color + "SPACE to
  end"), per-player score readouts (RED / BLUE vs 50), connection status
  dot (green=connected, red=disconnected). Energy gauge tracks
  currentPlayerId. WIN banner uses winner's player color.

Spec amendments (LOCKED_DECISIONS.md, P3 closeout):
- § 1 row split: Phase-2 net (Trystero ^0.20) + Phase-3 net (Colyseus
  reserved for scalability).
- § 7 module map: src/net/ block added; gameState FSM TITLE→...→TITLE.
- § 10.2: dispatcher injection note + input-sanitization gate.
- § 10.4: NetSnapshot wire variant note.
- NEW § 13: Phase-2 Networked Play v1 (8 subsections — transport,
  authority, sync, lobby, FSM, per-player scoring, known v1 limits,
  constants).

Council R1+R2 deliberation (Full tier mandatory):
- Grok DISRUPTOR (grok-4.20-0309-reasoning): R1 PeerJS-better; R2
  CONCEDED Trystero (multi-strategy Nostr fallback negates rate-limit
  concern). R2 host-migration mandatory-stub deferred to S16.
- Gemini AUDITOR (gemini-2.5-pro): R1 Trystero better (zero-infra);
  R1 ADOPT-LIST entity-interpolation (lerp), batch SPLIT, formal § 1
  amendment text, NetSnapshot audit. R2 host-migration "Connection
  lost" overlay v1 (adopted).
- PRIME-AUDIT delta (6 catches): Trystero/Nostr explicit import (not
  default BitTorrent); per-direction seq numbers; npm install scope;
  net/ in module-map; AttractDrag latency known-limit doc;
  scoreProgress reset on RETURN_TO_TITLE.

**P3 — Closeout (this commit).** Per-priority commits + push (P1
`b9c4b20`, P2 `add497f`, P3 closeout). session-state per priority
(status, check_completed, check_method verbose per
INTEGRITY-WARNING PROTOCOL, checkpoint_commit). reflexion +5 S15 /
prune 5 S7 to maintain ≤50 cap. boot-snapshot regen. PDR archived to
`.claude/plans-archive/2026-05-12_PDR_Session_15_COMPLETED.md` (full
Battle Ledger R1+R2 + PRIME-AUDIT delta + adopt-list). HANDOFF_2026-05-12
replaced (S14 version archived to `.handoff-archive/HANDOFF_2026-05-12_S14_postS15.md`).
BACKLOG.md S15 entry inserted above S14. LOCKED_DECISIONS amendments
applied per Council adopt-list.

Verification:
- `npx tsc -b --noEmit` exit 0
- `npx vitest run` → 291/291 (252 prior + 39 new across protocol.test
  9, sync.test 16, session15.test 14)
- LOC delta: +~490 added; -120 moved (P1 extract); +~80 doc/comments
- world.ts at 357 LOC over the 280 trip-wire — S16 carry-forward
  (extract dispatch handlers + addScore to gameMode.ts, ~80 LOC moved)
- transport+protocol+sync+lerp = 347 LOC (over the 160 combined
  trip-wire; bandwidth from adding lerp utility + room-code parsing;
  not split — feature-coherent module)

S16 carry-forward block:
- CHARTER (S15 P2 PRIME-AUDIT): world.ts → gameMode.ts extraction
  (~80 LOC moved; brings world.ts to ~280; same Micro pattern as
  S14 P2.0 / S15 P1).
- PLAYTEST-GATED: NET_SNAPSHOT_HZ + NET_INTERPOLATION_MS feel tuning;
  S14 carry-overs (AVATAR_PULSE_*, REDUNDANT_BOND_*); S13 carry-overs
  (cinematics constants).
- NET ENHANCEMENT: client-side AttractDrag prediction + reconciliation
  buffer (~150 LOC, Grok R1 ask); delta-encoded NetSnapshot for
  bandwidth (Council R1 nice-to-have); host-migration stub if playtest
  shows transient-drop annoyance (Grok R2 ask); live cursor-move sync
  for remote avatar (~50 LOC).
- ASSET-GATED: Audio (Suno track upload pending since S5).
- PHASE-2 TIER-1+: Sever-as-disruption / Inject Spiral / Steal /
  Multi-color rendering / Mega-combos per `docs/phase-2-design-options.md`.

---

## Session 14 — Avatar Disambiguation + Multi-Endpoint Redundant Bonding [COMPLETED] (2026-05-12)

**Triggered by post-S13 playtest user report (same session day, follow-up batch).**
Two distinct findings: (a) the "highlighted cruiser" on the left that "is stuck
and is not the main cruiser" — diagnosed as a placed Dot primitive in player
color (0xff3b6b crimson) which visually collides with the avatar (also a
crimson dot at the cursor); (b) "if I put a new shape near existing structure
and end points, it only connects to the nearest endpoint. however it needs to
connect to all nearest endpoints… building backup lines so that your structure
doesn't get deleted from raiding." Standard-tier batch, Council R1 ON, user
pre-approved "top priority recommended batch following full pipeline flow."

**P1 — Avatar disambiguation (Micro, commit `0ccb3fe`).** Anti-phase outer/inner
alpha pulse via `performance.now()` so the avatar visibly "breathes" relative
to a static Dot primitive in the same color. Constants: `AVATAR_PULSE_HZ=1.2`
(sub-heartbeat, well under PEAT's 3 Hz threshold), `AVATAR_PULSE_DEPTH=0.20`
(±20% outer, ±10% anti-phase inner). Pure `computeAvatarAlphas(t, baseOuter,
baseInner, hz, depth)` exported for unit-testability (S10
#test-via-pure-helper-export pattern). 7 unit tests covering t=0 base,
quarter-period (+1), three-quarter-period (-1 with inner clamp), wide-t
boundedness, extreme-depth clamp on both outer and inner, period closure.
Council R1: Grok #6 chevron alternative REJECTED — chevron only fires under
motion; user complaint was about indistinguishability at rest.

**P2.0 — Mechanical extraction `placePrimitive → src/state/placePrimitive.ts`
(Micro, commit `9bb784e`).** Zero behavior change. world.ts drops 587→228 LOC
(closes S13 PRIME-AUDIT carry-forward; now under 500-LOC § XV soft charter).
placePrimitive.ts at 382 LOC pre-P2.1 (also within charter; sized to absorb
P2.1's ~80 LOC). Moved verbatim: 304-LOC placePrimitive function + 17-LOC
makeBond helper. `PlacePrimitiveAction` type defined + exported in
placePrimitive.ts; world.ts composes GameAction with it (JSON shape
unchanged — Phase 3 dispatchOverNetwork seam intact). `requirePlayer()`
promoted to export in world.ts (shared throw-on-missing semantics). Council
R1: Grok #7 + Gemini § 7.1 both independently flagged "refactor first,
feature second" (adopted — my original PDR said "safer post-feature," Council
inverted it).

**P2.1 — Multi-endpoint redundant bonding (Standard core, commit `ab40447`).**
New placements with a primary target create up to `REDUNDANT_BOND_K=3` total
bonds into the primary's connected component, subject to ≥25° angular spread
filter (5π/36 rad). Redundancy bonds emit `BOND_COMMIT` but DO NOT contribute
to `scoreProgress` (Council G5/G8 ADOPTED — keeps `PHASE_1_WIN_SCORE=50`,
frames redundancy as defense not score-velocity). Algorithm: distance-sorted
greedy angular-spread picker, capped at `REDUNDANT_BOND_MAX_CANDIDATES=16` for
O(N) cost bound. New `pickRedundantBondTargets()` exported pure function;
`angularDistance()` wrapped-arc helper also exported. `PlacePrimitiveAction`
gains optional `extraBondTargetIds`; placePrimitive.ts validates each in DEV
(self-id / primary-id / duplicate / missing / not-in-component all skipped
with console.error) and skips silently in production. 29 new tests across 5
groups: (A) pickRedundantBondTargets pure-function 10 cases including K=0/1
boundary, no in-range cand, K=3 well-spread vs sparse, AUTO_BOND_RADIUS=59-
in/61-out boundary, colinear-degeneracy, MAX_CANDIDATES=17→16 truncation;
(B) angularDistance 5 cases (zero, π/2, π, wrap, modulo); (C) end-to-end
placePrimitive 6 cases including scoreProgress no-contribution for redundancy
+ magic-primary correctness; (D) severSplit interaction 2 cases — cycle
preserves on redundancy sever (the entire point) + non-cycle chain still
amputates; (E) DEV invariant validation 5 cases.

Council R1 disposition (Battle Ledger in archived PDR):
  Grok REVISE — 8 challenges + ports alternative.
    Adopted: G3 (25° spread vs 30°), G4 strain-cascade test, G5/G8 no-score,
    G7 extract-first (shipped as P2.0).
    Rejected: G1 "all-within-radius" literal (defeats raid-resistance via
    colinear redundancy), G2 per-type maxDegree (Phase-2 candidate), G6
    avatar chevron (wrong for static-cursor case), GA ports (Phase 2).
  Gemini REVISE — 6 invariant stresses + 8 edge cases + perf audit.
    All applicable concerns adopted. Test count grew 11 → 29.

**P3 — Closeout.** Per-priority commit + push (S9 rule). BACKLOG S14 entry +
session map update. reflexion log: +5 S14 entries (#council-led-restructuring-
as-prerequisite, #no-score-for-redundancy-clean-frame, #pure-function-
extraction-for-class-method-testability, #verify-council-claim-with-source-
not-narrative, SESSION #prime-audit-as-revision-gate-not-decoration) - prune
to stay ≤50 cap. boot-snapshot regenerated. PDR archived to
`.claude/plans-archive/2026-05-12_PDR_Session_14_COMPLETED.md` with Battle
Ledger + Council adoption tables + PRIME-AUDIT delta. HANDOFF_2026-05-12.md
replaced (S13 root archived to `.handoff-archive/HANDOFF_2026-05-12_S13_postS14.md`).

**Exit gate:** 252/252 tests passing (was 216 from S13, +36 new: 7 avatar +
29 session14). Typecheck clean (`npx tsc -b --noEmit` exit 0). 3 priority
commits (`0ccb3fe` P1, `9bb784e` P2.0, `ab40447` P2.1) + this closeout commit
on master, all pushed.

**Carry-forward to S15+:**
- PLAYTEST-GATED (highest priority for S15): user playtests the post-S14
  build. Verify: (a) avatar visibly distinct from placed Dot primitives
  (pulse at 1.2 Hz reads as "alive"); (b) placing near multiple endpoints
  creates up to 3 bonds visibly (triangulated cell, not single edge);
  (c) raids on triangle-redundancy cell can't amputate via single sever;
  (d) no spurious physics breaks from STRUCTURE_GROW + multi-bond
  triangulation under typical play.
- TUNE if needed: `REDUNDANT_BOND_K` (default 3 — drop to 2 if "too rigid"
  or back to 1 for pre-S14 behavior); `REDUNDANT_BOND_MIN_ANGLE_RAD`
  (default 25°); `AVATAR_PULSE_HZ` (default 1.2 — drop to 0.6 if "too
  anxious"); `AVATAR_PULSE_DEPTH` (default 0.20).
- CHARTER (S14 PRIME-AUDIT): `controls.ts` grew 436 → 565 LOC (+129 from
  pure-function extraction). 13% over § XV charter. Recommended S15 fix:
  extract `pickRedundantBondTargets` + `angularDistance` to
  `src/input/redundantBondTargets.ts`. ~120 LOC moved; brings controls.ts
  back to ~445 LOC. Not blocking; charter is soft.
- ASSET-GATED (still): Audio integration (Suno track pending).
- PHASE-2-GATED (still): Phase 2 implementation per
  `docs/phase-2-design-options.md` user pick (recommended Tier-0 first
  = B.2 Hotseat + A Fog, ~450 LOC).

---

## Session 13 — Playtest Feedback Batch [COMPLETED] (2026-05-12)

**Triggered by post-S12 user playtest.** User reported one bug (merge
inconsistency: placing in the middle of three close-but-separate
structures only merges with one) + three cinematics-visibility gaps:
STRUCTURE_GROW visual flash great but "doesn't actually grow
physically," MERGE_IMPULSE 1.2 px "can't see any difference,"
SCORE_TIER corner pulse "not sure." Standard-tier batch, Council R1 ON
per user "thoroughly… creative technical, coherent" approval. 4 work
priorities + closeout.

**P1+P3 — Merge reach fix + MERGE_IMPULSE tuning (Standard, Council-
revised, commit `8e58cd2`).** Council R1 ran in parallel (Grok DISRUPTOR
+ Gemini AUDITOR both REVISE). Adopted Gemini #1 (short-bond clamp),
Gemini #2 (explicit nearest-pick map), Gemini #3 (cross-ref comments);
rejected Grok #1 (spatial-index claim — verified `spatial.ts` indexes
Sparks only), Grok #3 (constraint amplification — verified `bonds.ts`
strictly dissipative), Grok #4 (off-center dedup — independent
components dedup-safe). Battle Ledger + PRIME-AUDIT in archived PDR.

Code changes: new `MERGE_REACH_RADIUS=100` in constants.ts (separate from
controls.ts-local `AUTO_BOND_RADIUS=60` which stays for primary picking);
controls.ts:onUp passes wider candidate set to placePrimitive; world.ts
merge sweep refactored to two-phase `Map<componentRoot, {cand, distSq,
comp}>` — Phase 1 groups candidates by component picking nearest-to-new-
prim, Phase 2 iterates one merge bond per chosen-nearest cand. Replaces
S9's implicit "first-iterated cand wins." `MERGE_IMPULSE_MAGNITUDE`
1.2→3.0 px (5% strain on 60-px bond, 5× headroom; compression-only since
bonds break on extension per `physics/bonds.ts:58`). New
`MIN_BOND_LENGTH_FOR_IMPULSE=25`: short-bond scale `min(1, rest_length /
MIN)` prevents impulse-teleport-through-new-prim on tight placements.

**P2 — STRUCTURE_GROW outward verlet impulse (Micro, Council-revised,
commit `72caa22`).** Adopted Grok #2's centroid-outward revision (was:
origin-outward, which reads as "recoil from new prim" not "grow"). After
existing STRUCTURE_GROW visual emit (cinematicsEnabled-gated), iterate
primary's pre-existing component primitives (snapshotted from
`componentOf(target).primitiveIds` minus new prim) and apply `prevPos
-= unit(centroid → p) × STRUCTURE_GROW_IMPULSE=0.8`. Centroid = post-bond
component (pre-existing + new prim) so 2-prim structures produce non-zero
outward direction. Bonds resist; net effect = brief outward "puff." Cand
components excluded (they get inward MERGE_IMPULSE instead): visual
signature split on a cross-structure merge is "existing puffs OUT,
absorbed snaps IN." Gated on cinematicsEnabled (paired with the visual
emit) unlike MERGE_IMPULSE's S10 unconditional pattern — single mental
model for the C-keybind toggle.

**P4 — SCORE_TIER center pulse at placement (Standard, Council-revised,
commit `8b5ad3e`).** Adopted Grok #5 partial (single pulse, not dual).
SCORE_TIER effect gains required `pos: Vec2` field; emit-site in world.ts
captures `prim.pos` so the renderer draws AT the new primitive on tier
crossing. Corner-pulse code removed from `scoreTier.ts` entirely. HUD
progress bar still fills continuously as running indicator. Renderer
scale-up: bloom 28→60 (start) / 56→100 (end); ring 18→40 (start) / 68→100
(end); stroke width 2→3; duration 30→48 ticks (~500ms → ~800ms) for
longer foveal-attention coverage. 3 effectsRenderer.test.ts SCORE_TIER
fixtures updated for required pos field.

**P5 — Closeout.** Per-priority commit + push (S9 rule). BACKLOG S13
entry + session map (S13 DONE → S14+ Phase 2 implementation). Reflexion
log: prepend 5 S13 entries + prune oldest S5 detail entries to maintain
≤50 cap. Boot-snapshot regenerated with S13 commit list + post-S13 state
+ § XV charter PRIME-AUDIT carry-forward note. PDR archived to
`.claude/plans-archive/2026-05-12_PDR_Session_13_COMPLETED.md` with
post-execution Battle Ledger + Council adoption table + PRIME-AUDIT
delta. HANDOFF_2026-05-12.md written at root; S12 root archived to
`.handoff-archive/HANDOFF_2026-05-11_S12_postS13.md`.

**Exit gate:** 216/216 tests passing (was 201; +15 new across P1/P2/P3/
P4: 3-structure merge @ 90 px, nearest-pick per component, separate-
components, MERGE_IMPULSE=3.0 verification, short-bond clamp formula,
sentinel constants, STRUCTURE_GROW outward direction validation on 2-
prim and 3-prim chain primaries, cinematicsEnabled gate, cand-component
exclusion, SCORE_TIER.pos co-location, multi-tier crossing pos-tagging).
Typecheck clean (`npx tsc -b --noEmit` exit 0). 3 priority commits
(`8e58cd2` P1+P3, `72caa22` P2, `8b5ad3e` P4) + this closeout commit on
master, all pushed to origin.

**PRIME-AUDIT carry-forward:** `world.ts` grew from 481 LOC (S12 close)
to 587 LOC across S13's three additions in placePrimitive — 17% over the
§ XV 500-LOC soft charter. Recommended S14 fix: extract `placePrimitive`
into its own file (`src/state/placePrimitive.ts`, similar pattern to
S12's per-kind effect-renderer split). Leaves world.ts at ~340 LOC.
Not blocking S14 playtest — charter is soft, breach is 17% (vs S12's
14% before refactor), and the additions are cohesive single-function
growth, not architectural drift.

**Carry-forward to S14+:**
- PLAYTEST-GATED: cinematics constants tuning (ATTRACT_FOLLOW_RATE,
  STRUCTURE_GROW_HOP_TICKS, STRUCTURE_FLASH_TICKS, MERGE_IMPULSE_MAGNITUDE
  at new 3.0, SCORE_TIER_STEP, **NEW** STRUCTURE_GROW_IMPULSE,
  **NEW** MERGE_REACH_RADIUS) + S5-S9 carry-overs (AUTO_BOND_RADIUS,
  MAX_RELEASE_REACH, PHASE_1_WIN_SCORE, strain thresholds). User
  re-playtests post-S13 build to validate the 4 fixes feel right.
- ASSET-GATED (still): Audio integration (Suno track pending).
- PHASE-2-GATED (still): Phase 2 implementation per
  `docs/phase-2-design-options.md` user pick (recommended Tier-0 first =
  B.2 Hotseat + A Fog, ~450 LOC).
- CHARTER (S13 PRIME-AUDIT): `world.ts` placePrimitive extraction
  refactor — small S14 priority if user agrees, else carry to S15+.

---

## Session 12 — effectsRenderer Per-Kind Split [COMPLETED] (2026-05-11)

**Triggered by S11 PRIME-AUDIT carry-forward.** `effectsRenderer.ts` at 569 LOC
breached the § XV soft charter (500-LOC cap); Phase 2 will add more effect
kinds, so refactoring along the per-kind axis NOW prevents the monolith from
growing worse. All three S11-eligible backlog items (cinematics tuning /
audio / Phase 2 implementation) remained user-gated; the renderer refactor
was the only un-gated path. Standard tier, Council R1 ON.

**P1 — Process drift cleanup (Micro).** Pushed `ca6f10c [state-autocommit] S11`
plus a fresh `fc982af` autocommit (state-hook fired again during push) to
`origin/master` (e565d60..fc982af). Working tree tracking clean. No source change.

**P2 — effectsRenderer per-kind split (Standard, Council-revised).** Council
R1 ran in parallel (Grok DISRUPTOR returned VETO with 5 challenges; Gemini
AUDITOR returned REVISE with Q:2/E:4/T:2/C:3 + 3 concerns); synthesized
adoption was 6 of 7 challenges. Rejected #1 (defer to post-Phase 2) on
charter authority — § XV breach is current; per-kind seam is the additive
axis itself. Dead-silhouette audit ran FIRST per Grok #2 (grep combos.ts
visualEffectId vs 13 drawBondCommit cases) — yielded **zero deletions**;
all 12 magic IDs + fx.bond.default actively emitted. 7 new files written
under `src/render/effects/` (lifetime, silhouettes, bondCommit, severErase,
structureGrow, structureMerge, scoreTier) + parent rewrite (569→116 LOC,
class only) + new smoke test (`effectsRenderer.test.ts`, 22 tests covering
lifetime + all 5 per-kind drawers + all 12 magic silhouettes + class
lifecycle). SEVER_ERASE drawer newly extracted from inline parent body
for shape consistency with the other 4 kinds. Risks #4 (Graphics ownership)
+ #5 (world.tick state) — Gemini-flagged — resolved by design: parent owns
Graphics + clears once per sync, drawers receive `(g, effect, age:number)`
as pure-fn params, never read `world.tick` directly. § XV LOC compliance
restored — largest file `silhouettes.ts` at 243 LOC, parent at 116 LOC.
Tests: 201/201 (179 prior + 22 new). Typecheck clean. Battle Ledger
appended to PDR.

**P3 — Closeout.** Per-priority commit + push (S9 rule). BACKLOG S12 entry
+ session map update. Reflexion log: prepend 4 S12 entries + prune 4 oldest
S5/S6 detail entries (50-cap maintained). Boot-snapshot regenerated. PDR
moved to `.claude/plans-archive/2026-05-11_PDR_Session_12_COMPLETED.md`
with post-execution Battle Ledger + PRIME-AUDIT delta. HANDOFF root
replaced (S11 root → `.handoff-archive/`).

**Exit gate:** 201/201 tests, typecheck clean, no file > 500 LOC,
EffectsRenderer public surface unchanged (main.ts imports intact),
2 priority commits (`fc982af` push + `80f52e8` refactor) + closeout
commit on master, all pushed.

**Carry-forward to S13+:**
- PLAYTEST-GATED (still): cinematics constants tuning (ATTRACT_FOLLOW_RATE,
  STRUCTURE_GROW_HOP_TICKS, STRUCTURE_FLASH_TICKS, MERGE_IMPULSE_MAGNITUDE,
  SCORE_TIER_STEP) + carry-overs (AUTO_BOND_RADIUS, MAX_RELEASE_REACH,
  PHASE_1_WIN_SCORE, strain thresholds).
- ASSET-GATED (still): Audio integration (Suno track pending).
- PHASE-2-GATED (still): Phase 2 implementation per
  `docs/phase-2-design-options.md` user pick. Refactored renderer is
  Phase-2-ready — new effect kinds (e.g., STEAL_FLASH, SPIRAL_INFECT,
  VISION_REVEAL) plug in as new files in `src/render/effects/` in the
  same shape as the 5 current kinds.

---

## Session 11 — Buffer: Drift Cleanup + Phase 2 Design Matrix [COMPLETED] (2026-05-11)

**Triggered by S10 handoff carry-forward.** All three S11-eligible backlog items
(cinematics tuning / audio / Phase 2 implementation) are user-gated. Only un-gated
high-leverage work is design-doc prep for the Phase 2 conversation when user signs
off Phase 1. Standard-tier batch, Council R1 ON per user "APPROVED per your best
recommendations" approval. 2 work priorities + closeout.

**P1 — Process drift cleanup (Micro).** Pushed 3 pending state-autocommits
(`f46f56e..60e588a`) to `origin/master`. No source change — pure hook bookkeeping.
Working tree clean tracking origin.

**P2 — Phase 2 design decision matrix (Standard).** Produced
`docs/phase-2-design-options.md` (523 lines, decision-ready matrix). 7 mechanics
covered (6 original from PDR + 1 surfaced by Council R1 against spec § VIII.3:
**Sever-as-disruption**, which Phase 1's self-sever already half-implements). All
7 options have ASCII sketch + fires-when + spec citation + cost (S/M/L anchored
to S1-S10 live LOC) + pros + cons + risks + playtest readiness + verdict +
flag-for-veto. Mermaid prereq DAG: B→{C,D,E}, E→F, A→{C,D,E} dotted, G standalone.
Tier groupings (foundation / disruption suite / render / richness). 7 open
questions, tiered rollout recommendation (S12-S15 sequencing if "ship Phase 2
minimal"). Pattern matches S9 P4's `docs/structure-cinematics-options.md`.
Council R1: Grok DISRUPTOR + Gemini AUDITOR both REVISE; all adopted Council
changes synthesized (per-option risks, playtest-readiness, rationale paragraph,
cost-anchor grounding, Mermaid graph). Battle Ledger appended to PDR.

**P3 — Closeout.** Per-priority commit + push. BACKLOG S11 entry + session map.
Reflexion log: prepend S11 (4 entries) + prune 4 oldest S5 entries to maintain
50-cap. Boot-snapshot regenerated. PDR archived to
`.claude/plans-archive/2026-05-11_PDR_Session_11_COMPLETED.md`.
HANDOFF_2026-05-11.md root replaced; S10 root → `.handoff-archive/`.

**Exit gate:** 179/179 tests still pass (no source change), typecheck clean,
2 priority commits (`60e588a` push + `2329dcf` P2) + 1 closeout commit on master,
all pushed to origin.

**PRIME-AUDIT carry-forward:** `effectsRenderer.ts` at 569 LOC exceeds 500-LOC
soft charter (`§ XV`). Refactor candidate for S12+ when Phase 2 adds more effect
kinds — split per-kind drawers into separate files.

---

## Session 10 — Tuning + Cinematics Implementation [COMPLETED] (2026-05-11)

**Triggered by S9 handoff carry-forward.** User playtested post-S9 build:
P1 (release teleport) and P2 (cross-structure merge) confirmed working;
P3 (scoring) implicitly accepted. New tuning callout on AttractDrag feel
("stupid magnet slowly swinging"). User picked cinematics options B + C +
D-lite from `docs/structure-cinematics-options.md` with explicit answers
to all 4 open questions (outward-from-new-prim, real-verlet-impulse,
every-15, include-debug-toggle). Standard-tier batch — Council waived per
S7/S8/S9 precedent; PRIME-AUDIT per priority. 5 implementation priorities
+ closeout; ~480 LOC across constants.ts, controls.ts, world.ts,
effects.ts, structure.ts, effectsRenderer.ts, main.ts + 14 new tests.

**P1 — AttractDrag follow tuning (Micro).** Replaced S5-era impulse-on-
prevPos (k = ATTRACT_STRENGTH / dist pushed against prevPos under verlet
damping 0.998 = damped pendulum) with position-lerp:
`spark.pos += (cursor - spark.pos) * ATTRACT_FOLLOW_RATE; spark.prevPos
= oldPos`. At 8 substeps/frame × rate 0.06, ~38% gap-closure per frame.
Pure position math — no force/dt coupling, no overshoot. Side effect
(intentional): at LMB-up spark is within ~5px of cursor, so S9's
MAX_RELEASE_REACH=120 gate fires only on real flicks. Extracted as pure
helper `stepAttractLerp` for unit testing. ATTRACT_STRENGTH removed.
5 new tests. Closes "stupid magnet slowly swinging" user report.

**P2 — Cinematic B: STRUCTURE_GROW outward pulse (Micro).** New effect
kind carrying precomputed BFS hop maps (`Map<PrimitiveId, hop>` +
`Map<BondId, hop>` + maxHop) from `bfsHopMap(seed, prims, bonds)` in
`structure.ts`. Emitted at end of `placePrimitive` for the new prim's
post-merge component. Renderer's `drawStructureGrow` iterates hop maps,
flashing each primitive when wavefront arrives at `hop ×
STRUCTURE_GROW_HOP_TICKS=4`, sine envelope over STRUCTURE_FLASH_TICKS=18.
Bonds highlight on the later endpoint's hop. Live primitive positions
looked up from world per frame (severed-mid-effect skipped). Anchor
placements emit `{origin: 0}` minimum-event. effectsRenderer refactored
to per-kind `effectLifetime()` helper + draw signature `(effect, age,
lifetime, world)`. 3 new tests. session5.test.ts 1 test updated.

**P3 — Cinematic C: STRUCTURE_MERGE with real verlet impulse (Micro).**
Per merge bond inside the sweep loop: (1) apply verlet impulse — for each
prim in `candComp.primitiveIds`, push prevPos AWAY from new prim by
MERGE_IMPULSE_MAGNITUDE=1.2px along unit (cand→prim). Next-step velocity
= (pos - prevPos) propels TOWARD new prim. Magnitude conservative — 2%
strain at LOW-tier worst case, well under 2.0× break threshold. (2) Emit
STRUCTURE_MERGE with `unionPrimIds = [...mergedComponents,
...candComp.primitiveIds]` snapshotted BEFORE the candidate is added.
Renderer's `drawStructureMerge` flashes union after MERGE_LEAD_IN_TICKS=4
delay — synchronized "snap" vs STRUCTURE_GROW's BFS-timed "wave."
3 new tests.

**P4 — Cinematic D-lite: SCORE_TIER corner pulse every-15 (Micro).**
`placePrimitive` snapshots `oldScore` at entry; after all increments,
emits one `SCORE_TIER` per crossed multiple of SCORE_TIER_STEP=15 via
`for (t = oldTier+1; t <= newTier; t++)` loop. Renderer's
`drawScoreTier` draws bloom + leading ring at (PROGRESS_X+40,
CANVAS_HEIGHT-60) — co-located with HUD progress bar. Renderer-only,
sine envelope over SCORE_TIER_DURATION_TICKS=30 (~500ms). At threshold
50, expect 3 tier events before WIN (15, 30, 45). 3 new tests.

**P5 — Cinematics debug toggle (Micro).** World gains
`cinematicsEnabled: boolean = true` (not persisted in save.ts —
debug-only). 3 emission sites gated on this flag. P3 verlet impulse
stays UNCONDITIONAL — user picked physics-over-visual, so physics half
is a designed mechanic. BOND_COMMIT and SEVER_ERASE remain unconditional
(bond-level combat feedback). main.ts `C`/`c` keydown handler flips
toggle. Legend hint gains "C cinematics" suffix. 4 new tests.

**P6 — Closeout.** Per-priority commit + push (S9 rule). BACKLOG +
reflexion (≤50 cap maintained, 7 S10 entries + S4 detail prune + 1 S5
entry prune) + boot-snapshot + PDR archive + handoff + push.

**Exit gate:** 179/179 tests (was 161 + 18 net new in session10.test.ts
+ 1 P2-impact rewrite in session5.test.ts), typecheck clean, browser
HMR clean across all S10 commits (vite logs show 13+ page reloads zero
errors). 5 priority commits (3f599b5, 479fb5a, 2d3e4e7, 79c0e0c,
02e5308) + 1 closeout commit on master, all pushed.

---

## Session 9 — Playtest Bug Fixes + Cinematics Brainstorm [COMPLETED] (2026-05-11)

**Triggered by post-S8 user playtest.** Four observations + four process directives.
Three playtest-confirmed bugs closed; cinematics brainstorm doc landed for S10 pick.
**No physics tuning** — AUTO_BOND_RADIUS / ATTRACT_STRENGTH / strain thresholds
stay deferred for post-S9 playtest.

**P1 — Release teleport fix (Micro).** Removed S7 P1's snap-to-cursor at LMB-up
(`spark.pos/prevPos = cursor`). Replaced with reachability gate: if
`dist(spark.pos, cursor) > MAX_RELEASE_REACH=120` at release, the place is
rejected — spark stays Free where physics put it. When reachable + outside
zone, PICKUP+PLACE proceeds at `spark.pos`, and `pickPrimitiveInRange`
measures from `spark.pos`. Bond-length-bounded invariant preserved via
spark-physics range, not via cursor snap. Closes the user-reported "you can
literally have it teleport to the end point" bug. 3 tests in session7.test.ts
rewritten to match.

**P2 — Cross-structure auto-merge (Micro).** PLACE_PRIMITIVE action gains
optional `mergeCandidateIds: ReadonlyArray<PrimitiveId>`. After primary bond,
`placePrimitive` sweeps candidates and adds one bond per *other* connected
component (dedup via `mergedComponents: Set<PrimitiveId>` seeded from
primary's `componentOf`, per-candidate alreadyMerged early-exit). Each merge
bond emits BOND_COMMIT. `controls.ts` onUp now gathers all primitives within
AUTO_BOND_RADIUS=60 of spark.pos via new `allPrimitivesInRange` helper and
passes them as candidates. Closes the user report that distinct structures
never interconnect despite proximity. 5 new tests in session9.test.ts.

**P3 — Complexity-weighted scoring (Micro).** Replaces flat
`primitives.size / 30` with `world.scoreProgress` accumulator. Magic combos
contribute SCORE_MAGIC_BOND=3, Functional placeholders SCORE_FUNCTIONAL_BOND=1,
anchors SCORE_ANCHOR=1. WIN at PHASE_1_WIN_SCORE=50. P2 merge bonds also
weighted. `gameState.tickGameState` uses scoreProgress; `softReset` zeros it;
`ui.HUD.drawProgress` reads it; `save.WorldSnapshot` persists optionally
(?? 0 fallback for pre-S9 saves). Closes user report that all combinations
score equally. gameState.test.ts + 5 new P3 tests in session9.test.ts.

**P4 — Cinematics options brainstorm (design doc only).** Created
`docs/structure-cinematics-options.md` (~280 lines): 5 options A-E with ASCII
sketches, fires-when, intensity scaling, implementation cost (S/M), pros/cons,
verdicts. Recommendation for S10: B (structure-wide pulse along bonds from
new primitive) + C (merge-wave for P2 cross-structure events) + D-lite
(corner pulse every 10 score). 4 open questions for user pick before S10:
pulse direction, merge-wave force (visual vs physics), tier frequency,
skip-cinematic debug toggle. No code changes.

**P5 — Closeout.** Per-priority commit + push (new rule from S9 boot: push
at every commit, not deferred to handoff). Updated BACKLOG.md, prepended
reflexion_log.md S9 block (9 entries), regenerated boot-snapshot.md, archived
PDR to plans-archive/, wrote HANDOFF_2026-05-11.md at root replacing S8
version (S8 archived to .handoff-archive/HANDOFF_2026-05-11_S8.md).

**Exit gate:** 161/161 tests (was 151 + 10 new across session7/session9/
gameState), typecheck clean, browser HMR'd cleanly between priorities (no
console errors, world.scoreProgress exposed at 0 on fresh init). 4 priority
commits + 1 closeout commit on master, all pushed.

---

## Session 8 — Bond-Visual Polish + PRIME-AUDIT Delta Closure [COMPLETED] (2026-05-11)

**Triggered by S7 PRIME-AUDIT delta + close re-read of `bondVisualRenderer.ts`.**
S7 PRIME-AUDIT flagged whip wave static + lattice cross-hatch fading at
small bond lengths; close re-read against the wheel/vortex/orbital pattern
surfaced a sister defect (drawWarped also static despite the name) and
one creative-coherent add (filament starburst should shimmer with energy).
**No physics tuning** — AUTO_BOND_RADIUS / ATTRACT_STRENGTH / strain
thresholds are playtest-gated per the S7 carry-forward and stayed
deferred.

**P1 — Whip wave drift (Micro).** Added `driftPhase = p.tick * 0.022`
inside the wave's sin term so the wave propagates A→B at one wavelength
every ~2.4s. Closes whip half of S7 PRIME-AUDIT delta.

**P2 — Lattice cross-hatch contrast (Micro).** Replaced `width: 1,
alpha: 0.5` constants with `crossWidth = Math.max(1.2, p.width * 0.55)`
and `crossAlpha = p.alpha * 0.65`. HIGH-tier cross-hatch jumps from
1.0px to 1.65px vs outline 2.4px — visible 70% weight (was 42%). Closes
lattice half of S7 PRIME-AUDIT delta.

**P3 — Warped 3-fold rotation + breathing (Micro, sister fix).** Added
`rotPhase = p.tick * 0.008` inside `sin(a*3 + rotPhase)` (full turn
~13s) and `breatheAmp = 0.3 + sin(tick*0.025)*0.08` (0.22–0.38 extent,
period ~4.2s) replacing the static 0.3 multiplier. At tick=0 breatheAmp
reads 0.3 — backward-compat with prior visual baseline.

**P4 — Filament starburst shimmer (Micro, creative add).** Ray alpha
modulates `0.40–0.70` of `p.alpha` over ~2.6s via `sin(p.tick * 0.04)`.
Main bond stroke unchanged. GraphicsMock extended to capture
`[width, color, alpha]` so alpha-only animations show up in serialize-
comparison tests; verified safe across the existing 35 S7 tests.

**P5 — Static-equality test consolidation (Micro).** Replaced the
singleton `non-animated fx.cable is identical` test with `it.each` over
the 6 silhouettes that must NOT introduce tick dependence (cable,
bracket, diamond, star, lattice, capsule). Guards the OPPOSITE regression
class — a future refactor accidentally wiring `p.tick` into a structural
silhouette.

After S8 the 12 magic silhouettes formally split: **6 ANIMATED** (wheel,
vortex, orbital — pre-existing; whip, warped, filament — added in S8) +
**6 STATIC** (cable, bracket, diamond, star, lattice, capsule). The split
matches combo tier semantics: LOW-tier unstable + HIGH-tier energetic
animate; MID-tier structural stay frame-stable. Each silhouette now has
a paired regression test (animated → tick-diff; static → tick-equality).

**P6 — Process closeout.**

**Exit gate:** 151/151 tests (was 142 + 9 net new), typecheck clean,
browser-verified at 60px bond length (pixel-hash diff at tick=0 vs
tick=120 for whip/warped/filament; identical hash for lattice — static-
silhouette signature confirmed). 5 priority commits + 1 closeout commit
on master.

---

## Session 7 — Connection-Range Gate + Per-Combo Persistent Bond Visuals [COMPLETED] (2026-05-09)

**Triggered by post-S6 user playtest.** Two issues surfaced in real play:
(a) bonds spanning the canvas (user: "you can connect from any part of the
map, which doesn't make sense"); (b) all bonds rendering as the same line
even though the 36 combos differ in stiffness/area/effectId (user: "every
shape you connect to the structure it changes the structure shape
mathematically right? ... for now it just makes a line, which is not bad
for session 6 but still not really any interesting").

**P1 — Connection-range gate (Micro).** Root cause was cursor↔spark-pos
divergence in AttractDrag: `pickPrimitiveInRange` measured from cursor while
placement used the lagged `spark.pos`. Bond length = dist(spark→cursor) +
60, unbounded. Fixed by snapping `spark.pos = cursor` at LMB-up before
PICKUP/PLACE so all three (placement, in-zone test, auto-bond range) share
cursor as source-of-truth. Bond length ≤ AUTO_BOND_RADIUS=60 by
construction. Side effect (intentional UX): cursor-into-zone now cancels
the place. 3 new vitest tests in `session7.test.ts`.

**P2 — Per-combo persistent bond visuals (Standard).** New module
`bondVisualRenderer.ts` (~290 LOC, under 500 charter). 12 magic combos
render their named silhouette stretched/anchored between bond endpoints
(filament, cable, bracket, diamond, wheel, star, orbital, lattice,
capsule, vortex, whip, warped); the 24 functional combos keep the default
straight line. Animation tied to `world.tick` (pauses with physics) for
wheel rotation, vortex phase, orbital pulse. Stress-tint + width still
applied at the structureRenderer layer — silhouettes inherit the lerped
color, near-break red-overlay pulse remains an additive top layer. 35 new
vitest tests covering dispatch + degenerate-bond fallback + animation
differentiation. Browser-verified at 110px and 60px bond lengths.

**P3 — BACKLOG.md hygiene** (this entry + S6 retro-entry). **P4 — handoff +
dev server up for next-day playtest.**

**Exit gate:** 142/142 tests, typecheck clean, browser-verified grid of all
12 magic combos. Per-priority commits (4d82b8b, 83140e0).

---

## Session 6 — Polish Pass + Git + Carry-Forwards [COMPLETED] (2026-05-09)

**P0 — Git initialization.** Project ran 5 sessions without a git repo;
initial commit (`bc89a53`) captured the full post-S5 state. Subsequent
session-6 commits per priority on top.

**P1 — Bond stiffness tier defensive refactor (S3 carry-forward).** Static
trace disproved the "tier=MID for Dot→Line" hypothesis from the original
handoff (the actual code path keeps the spark in `freeSparks` after
PICKUP_SPARK, so the lookup succeeded). Defensive refactor applied anyway:
`computeStiffnessTier` now takes `SparkType` directly, captured BEFORE
`PICKUP_SPARK` dispatch — code-clarity win even if the bug wasn't real.

**P2 — Effects-list hard count cap (S3 carry-forward).** New constant
`MAX_ACTIVE_EFFECTS=64`. Belt-and-braces over the existing lifetime ageing.

**P3 — 12 per-combo placeholder silhouettes (S3 carry-forward).** Plumbed
`visualEffectId` through PLACE_PRIMITIVE → BOND_COMMIT effect; renderer
switches per id to draw distinct ephemeral flair (filament starburst,
cable parallels, bracket triangle, diamond, wheel, star, orbital, lattice,
capsule, vortex, whip, warped + default ring for the 24 functional). All
silhouettes are ephemeral one-shot pops at the bond-commit moment —
became persistent in S7 P2.

**P4 — Browser verification + screenshots.** 13-effect probe grid via
`__SPARK__.world` mutation (Pixi pauses ticking when Claude Preview tab is
hidden, so static state-mutation + manual render is the way).

**Exit gate:** 104/104 tests, typecheck clean, 4 commits on master.

---

## Session 5 — Playability Pass [TOP PRIORITY] (2026-05-09)

**Why first:** Session 4 made the game spec-correct (distinct shapes, colorless free, player-color placed, no-build zone) but a hands-on attempt revealed the game is still unplayable due to physics tuning + input fidelity issues. None of these are spec-locked numbers — they're playability defaults that S1-S3 picked without playtest data.

**P1 — In-zone spark physics too fast.** With 10+ free sparks the zone becomes a chaotic blur. Sparks should drift slowly so the player can actually grab them.
- Likely fix: lower `SPARK_INITIAL_VELOCITY_MIN/MAX` (currently 20–80) to ~5–20
- Increase per-substep damping or add a global slow-down on free sparks inside the zone
- Possibly clamp max speed to a "drifting" cap (~30 px/sec)
- Verify the soft-cap of 50 still feels right at the new pace; may need to drop to 20–25

**P2 — Spawn rate too aggressive.** Currently 1.5/sec — players get any shape they want immediately. Should be ~10× slower so getting the right type becomes a strategic bet.
- `SPAWN_RATE_PER_SECOND` from 1.5 → ~0.15
- Re-validate the soft-cap math (at 0.15/sec a population of 50 takes ~5 min to fill, which is fine)
- Check that the stress test still works under the slower spawn

**P3 — Cursor↔spark misalignment.** Cursor and the spark/avatar are not aligned, feels weird.
- Likely root cause: `Controls.updateCursor()` scales by `canvas.width / rect.width` but Pixi's `autoDensity + resolution` doubles the internal canvas. The mouse-coord scaling is probably double-counting DPR.
- Verify against [controls.ts:187-193](src/input/controls.ts:187) — the `sx`/`sy` formula
- Test: cursor at top-left should put avatar at canvas (0,0), not (0,0)/2 or (0,0)*2

**P4 — LMB/RMB drag unreliable.** Sometimes pointer events don't fire / drag doesn't engage.
- Likely cause: `pointerdown` listener may be losing pointer capture; `pointerup` outside the canvas isn't handled (only `pointerleave`)
- Fix candidates: `setPointerCapture` on pointerdown; listen on `window` for `pointerup` instead of canvas; use `passive: false` if scroll is competing
- Also verify right-click context-menu is actually suppressed in all browsers (Chrome/Edge/Safari)

**Exit gate:** User can sit down, build a 10-primitive structure without frustration. Sparks drift slowly, new shapes are scarce-feeling, cursor visibly tracks the avatar pixel-perfect, every drag attempt commits.

---

---

## Session map

| Sess | Theme | Goal | Exit gate |
|---|---|---|---|
| **0** | Plan + scaffold | (DONE) Locked decisions + Vite/Pixi project booting | typecheck clean, dev server starts |
| **1** | Physics foundation | (DONE) Verlet + spawner + spark rendering | 6 spark types bouncing in spawner, 60s no NaN, dev stats overlay green |
| **2** | Core interaction | (DONE) Mouse + Carry-1 FSM + first bond | Grab spark, drag back, bond commits, structure renders |
| **3** | Game logic | (DONE) 36-combo lookup + structure + self-sever (BFS) + energy stub | Build 5-spark structure with 3 combos, sever splits correctly |
| **4** | Game state loop | (DONE) Win condition + state machine + save/load (WorldSnapshot) | SETUP→PLAYING→WIN→POSTGAME with JSON save |
| **5** | Playability pass | (DONE 2026-05-09) Drift speed, spawn rate, cursor alignment, drag reliability, single-action place | 50 sparks drifting cleanly; auto-bond on release-outside-zone within 60 px |
| **6** | Polish + git + carry-forwards | (DONE 2026-05-09) git init + bond-tier defensive refactor + effects-list cap + 12 ephemeral combo silhouettes | 4 commits on master, 104/104 tests, browser-verified probe grid |
| **7** | Connection-range gate + per-combo persistent bond visuals | (DONE 2026-05-09) snap-to-cursor + bondVisualRenderer for 12 magic combos | 142/142 tests, browser-verified 12-combo grid at 60px and 110px |
| **8** | Bond-visual polish + PRIME-AUDIT delta closure | (DONE 2026-05-11) whip drift + lattice contrast + warped rotation + filament shimmer + animated/static regression-test pair | 151/151 tests, browser-verified all 4 visual fixes via pixel-hash diff |
| **9** | Playtest bug fixes + cinematics brainstorm | (DONE 2026-05-11) release teleport fix + cross-structure auto-merge + complexity-weighted scoring + cinematics options doc | 161/161 tests, browser HMR clean across priorities, 3 bugs closed |
| **10** | Tuning + cinematics implementation | (DONE 2026-05-11) AttractDrag follow-lerp tuning + STRUCTURE_GROW outward pulse + STRUCTURE_MERGE verlet impulse + SCORE_TIER every-15 corner pulse + C-key debug toggle | 179/179 tests, browser HMR clean, all 4 cinematics + tuning callout closed |
| **11** | Buffer: drift cleanup + Phase 2 design matrix | (DONE 2026-05-11) Push state-autocommits + `docs/phase-2-design-options.md` (7 mechanics × full template, Mermaid prereq DAG, tiered rollout recommendation, Council R1 deliberated) | 179/179 tests, Phase 2 conversation has decision-ready artifact when user signs off Phase 1 |
| **12** | effectsRenderer per-kind split (§ XV charter compliance) | (DONE 2026-05-11) Dead-silhouette audit (zero deletions) + 7 new files under `src/render/effects/` + parent rewrite (569→116 LOC) + new smoke test, Council R1 (Grok VETO + Gemini REVISE) adopted 6 of 7 | 201/201 tests (179 + 22 new), typecheck clean, no file >500 LOC, Phase-2-ready seam |
| **13** | Playtest feedback batch — merge bug fix + cinematics tuning | (DONE 2026-05-12) MERGE_REACH_RADIUS=100 + nearest-pick map (multi-structure merge), STRUCTURE_GROW centroid-outward impulse, MERGE_IMPULSE 1.2→3.0 + short-bond clamp, SCORE_TIER center pulse at placement. Council R1 (Grok DISRUPTOR + Gemini AUDITOR both REVISE) adopted 6 of 10 findings | 216/216 tests (201 + 15 new), typecheck clean, all 4 playtest items closed |
| **14+** | **Audio / Phase 2 implementation** [NEXT] | User re-playtest post-S13 build; then: Audio (when Suno track lands); Phase 2 implementation per `docs/phase-2-design-options.md` user pick (recommended Tier-0 first = B.2 Hotseat + A Fog); placePrimitive extraction (S13 PRIME-AUDIT carry-forward); any post-playtest re-tuning | User picks from Phase 2 matrix + "ship Phase 2" |

If Session 12 closes all gates early → Phase 2 implementation begins (foundation tier: B.2 hotseat + A fog of war).

---

## Session 1 — Physics foundation (THE GATING SESSION)

**Why this is first:** Per Grok Round 3 audit, the Verlet+spring solver gates every other system. Bugs here cascade. Land it stable before adding any interaction.

**Priorities:**
1. `src/physics/verlet.ts` — position-based integrator (60 Hz, 8 substeps, damping 0.998)
2. `src/physics/bonds.ts` — Hooke-style constraint relaxation (NOT force) with stiffness 0.2/0.5/0.8 + position-correction clamp 0.5×rest_length
3. `src/physics/collision.ts` — soft pairwise positional resolution (free sparks within zone)
4. `src/physics/spatial.ts` — cell-grid spatial hash for neighbor queries (Phase 1 ~50 entities, scales to 400)
5. `src/game/spawner.ts` — confined 250-px zone, 1.5/sec Poisson spawn, elastic boundary bounce
6. `src/game/spark.ts` — entity with `state: Free | Carried | Bonded` discriminated union
7. `src/render/renderer.ts` — Pixi v8 `Application` boot; ParticleContainer for free sparks
8. `src/render/statsOverlay.ts` — toggle `~`: FPS, physicsMs, renderMs, sparkCount

**Tests** (start lightweight in Vitest):
- `verlet.test.ts` — deterministic 300-tick run, snapshot final positions, assert no NaN
- `spawner.test.ts` — seeded 500-tick run, all sparks remain in zone

**Exit gate:** Run `npm run dev`. See 6 type-distinct sparks (one of each) bouncing in spawner zone for 60+ seconds. No NaN, no explosions. Stats overlay shows physics ≤ 5.5 ms, render ≤ 7.0 ms, FPS = 60.

---

## Session 2 — Core interaction

**Priorities:**
1. `src/input/controls.ts` — mouse listeners; drag-state FSM
2. `src/game/player.ts` — Carry-1 enforced via discriminated union `IdlePlayer | CarryingPlayer` + runtime guard on every transition
3. `src/game/primitive.ts` — placed spark with `readonly pos` post-`commit()`; stores `placerColor`, `createdTick`, `bonds: Set<BondId>` from day 1 (per LOCKED_DECISIONS § 10.1)
4. `src/state/world.ts` — single `dispatch(action: GameAction)` seam (per LOCKED_DECISIONS § 10.2)
5. Drag-attract: hold LMB on free spark in zone → spark accelerates toward cursor; release inside zone keeps it free, outside zone locks as carried
6. Drag-connect: hold RMB while carrying, drag to existing primitive in your structure → bond commits via `dispatch({type: 'PLACE_PRIMITIVE', ...})`
7. First bond proves out the constraint solver under user load

**Tests:**
- `player.test.ts` — Carry-1 FSM: pickup-then-pickup throws, drop after carry returns to idle, type-level guard prevents double-carry

**Exit gate:** grab a Dot from spawner, drag outside zone, grab another Dot, RMB-drag to first → see bond render and tug elastically when sparks move. No double-carry possible.

---

## Session 3 — Game logic

**Priorities:**
1. Wire `src/combos.ts` `lookupCombo()` into bond commit — apply `stiffnessTier`, `areaMultiplier`, render `visualEffectId` placeholder
2. Verify all 36 combos resolve (test all entries via `comboSystem.test.ts`)
3. `src/game/structure.ts` — connected-component tracking via Union-Find OR adjacency-driven BFS
4. **Self-sever** — double-RMB on a bond → BFS split → smaller side deletes (§ VIII.4); tiebreaker = max `createdTick` on each side
5. Edge cases (per spec): single-primitive side always loses; cut on connector chain → bridge deletes
6. Energy: flat `+5/sec` accumulating in `Player.energy`; render small peripheral gauge (no number, just bar fill)

**Tests:**
- `comboSystem.test.ts` — `test.each` for all 36 ordered pairs; assert `isMagical` count = 12
- `sever.test.ts` — 8 hand-crafted graphs (chain, tree, cycle, balanced split, single-primitive limb, anchor isolation); assert exact deleted set per tiebreaker rule

**Exit gate:** Build a 5-spark structure with ≥3 distinct combos (e.g., Dot→Line→Triangle→Triangle→Circle). Sever a bond → smaller side erases visibly. Energy gauge ticks up.

---

## Session 4 — Game state loop

**Priorities:**
1. `src/state/gameState.ts` — FSM: `SETUP → COUNTDOWN → PLAYING → WIN → POSTGAME`
2. Win condition: `claimedArea / canvasArea ≥ 0.51` per primitive's `areaMultiplier`. **Phase 1 placeholder for solo:** trigger WIN at 30 placed primitives (constant `PHASE_1_WIN_PRIMITIVE_COUNT`).
3. WIN state: gameplay halts, simple "WIN" text overlay (per spec § XIII Phase 1: "placeholder cinematic")
4. POSTGAME: snapshot saved via `src/state/save.ts` → `WorldSnapshot` JSON to localStorage with timestamp
5. Reset/restart on click → SETUP

**Tests:**
- `gameState.test.ts` — FSM transitions; can't enter PLAYING from POSTGAME without SETUP
- `save.test.ts` — round-trip serialize/deserialize a 30-primitive `WorldSnapshot`

**Exit gate:** Full SETUP → PLAYING → WIN → POSTGAME loop. Save file generated. Reload restores state.

---

## Session 5 — Smoothness pass

**Goals:** every Phase 1 done-gate (LOCKED_DECISIONS § 8) closes.

**Priorities:**
1. Stress runs (3 × 10 min) — log any explosions / NaN / softlocks → fix
2. Frame-budget verification — physics ≤ 5.5 ms, render ≤ 7.0 ms; if over, optimize per LOCKED_DECISIONS § 10.7
3. Verify all 6 invariants (LOCKED_DECISIONS § 11) have type-level + runtime enforcement
4. Edge-case fuzz: rapid clicks, edge-of-canvas builds, sever-during-bond-commit, carry-during-sever
5. Visual feedback tightening: bond commit pop, sever erase, energy gauge animation
6. If a Pixi-side issue: ParticleContainer for free sparks, single Graphics per Structure (per LOCKED_DECISIONS § 10.7)

**Exit gate:** all 3 Phase-1 done gates pass. Project ready for hands-on user playtest.

---

## Session 8 — User playtest tuning [NEXT]

User drives. Claude assists with quick iteration on whatever feels off in
the post-S7 build (snap-to-cursor placement + per-combo persistent bond
visuals).

**Likely tuning targets (gated on user input):**
- `AUTO_BOND_RADIUS` (60) — tighten or relax based on play feel
- `ATTRACT_STRENGTH` (60_000) — likewise
- Strain auto-sever thresholds (LOCKED_DECISIONS § 11.4 STRAIN_BREAK_BY_TIER)
- Bond visual polish — whip wave drift, lattice cross-hatch contrast at small bond lengths, star size

**Exit gate:** user explicitly says "yes, this works, ship Phase 2."

If issues remain → continues into Sessions 9-10.

---

## Sessions 9-10 — Buffer

Reserved for:
- Tuning/iteration on user feedback
- Audio integration (when user uploads Suno didgeridoo trance track + small connection SFX)
- Phase 2 design (fog of war, local-MP, full disruption: Inject Spiral + Steal)
- Phase 2 multi-color/structure work
- Mega-combo connector chains

---

## Cross-cutting rules

- **Each session ends with**: typecheck clean, tests green, git commit (or commit-equivalent), session-state.json updated.
- **Every commit** must respect § XV anti-bloat charter — no module > 500 LOC, no unrequested features, no audio (until user uploads track).
- **No vision changes.** All deviations from spec § XIII Phase 1 deliverables flagged in this doc as Phase 2+ scope.
- **Council usage**: targeted only — Grok for execution decisions, Gemini for math validation. NOT for creative redesign.
- **LOCKED_DECISIONS is sacred.** If a number must change during Phase 1, log as Open Items v2 — don't sneak.

---

## NOT in Phase 1 (per spec § XIII + LOCKED_DECISIONS)

- ❌ Networking (Phase 3)
- ❌ Multiplayer / opponents (Phase 2 local-MP first)
- ❌ Fog of war (Phase 2)
- ❌ Disruption beyond self-sever (Phase 2: Inject Spiral, Steal)
- ❌ Multi-color structures via Steal (Phase 2)
- ❌ Mega-combos / connector chains (Phase 2)
- ❌ Tutorial, menus (charter § XV)
- ❌ **Audio** — deferred until user uploads Suno didgeridoo track
- ❌ Full victory cinematic with migration/collapse (Phase 3)
- ❌ Accounts / persistence beyond local snapshot (Phase 4)

---

## Phase 1 done = working base

All 3 done-gates pass + full game loop exists + save/load works. Then Phase 2 design begins.
