# PDR — S87: VS-BOTS mode + Multiplayer rename + Quickmatch (USER-QUEUED batch)

STATUS: IN-PROGRESS (user pre-approved batch + autonomous run, 2026-06-12, verbatim:
"figure out the best way to make it happen and make it happen in the next session or
two. this is before continuing other priorities from backlog. Produce the best quality
output and i am preapproving this session batch and autonomous run and going to sleep!")

Tier: FULL (>30K). Council R1 design-fork consult (Grok + Gemini). A.0 probes run.

## USER INTENT (verbatim decomposition)
1. New game mode "1 v Bots": choose up to 6 bots, per-bot difficulty
   NOOB / MID / HARD / IMBA(OP). Bots must ACTIVELY play the game as sparks
   (cruise, collect, build, disrupt) — not score-fakers.
2. Rename "1v1" to "Multiplayer" (it already supports up to 6 unique players).
3. Multiplayer gets TWO entry paths: the existing code-entry friends lobby
   (unchanged) + QUICKMATCH that gathers up to 6 strangers; ALL gathered players
   must click start (3 players who all click = match of 3; or wait for 6).
4. This jumps the BACKLOG queue (Tier-1 G-items resume after).

## A.0 STATE PROBES (Rule 21)
- vitest baseline: 1312/1312 green on tip 9b3fc4c (code tip 53b4251). EXIT 0.
- bundle baseline: 548.3 KiB / 550 charter → only ~1.7 KiB headroom in the index
  chunk ⇒ ALL new substantial code MUST be code-split (debugOverlay precedent).
- git clean (one zombie lockdir, known validator artifact).
- MAX_PLAYERS=6, PLAYER_COLORS has exactly 6 entries; seats 0..5.
- REASONABLE_PICKUP_REACH=600 (remote-carrier reach gate), AUTO_BOND_RADIUS=60,
  MERGE_REACH_RADIUS=100, SPAWNER_RADIUS=250 center (960,540).
- Scoring: income = 0.05/complexity/s; complexity = prims + 2×magicBonds +
  0.25×min(funcBonds, ⌊1.5×prims⌋); fouled component = zero income.
- Dispatch seam: every mutation through dispatch(world, action); central bench
  gate at entry; remote-origin (playerId ≠ localPlayerId ∧ isNetworked) gets
  reach/zone/territory validation + host re-picks bond targets from placementPos.
- UPDATE_AVATAR_POS couples carried spark pos to avatar (S45 Sym A) — a synthetic
  player that moves its avatar per tick HAULS its carried spark visibly.
- isNetworked(world) ≡ gameMode !== 'solo' (S62) — a new mode value inherits
  networked semantics (fog, territory, shrink, reach validation) by default.
- Lobby: LobbyStateMachine pure reducer (select/hosting/joining), seat rack,
  host-clicked Begin; LOBBY_PRESENCE roster beacons (no proto bump precedent);
  crypto host identity: room code = host pubkey 30-bit fingerprint + attestation.
- PROTOCOL_VERSION = 7. parseNetMessage drops unknown kinds (graceful).

## OBJECTIVE
Ship the full mode restructure: title = Solo / Multiplayer / VS Bots / Codex;
VS Bots = local match vs 1..6 AI sparks with per-bot difficulty that genuinely
play through the SAME authoritative dispatch pipeline as humans; Multiplayer
lobby gains Quick Match (discovery + all-ready start gate) beside the unchanged
friends lobby. CI green, bundle charter respected via code-splitting, deployed.

## SCOPE (5 priorities)

### P1 — Mode restructure + VS Bots setup UI
- titleScreen: "1v1 (2 Player)" → "Multiplayer" (sublabel: host, join, or
  quick match — up to 6 players). NEW "VS BOTS" button (between Multiplayer and
  Codex). TitleButtonCenters gains vsBots (oneVOne KEY kept for e2e stability).
- NEW BotSetupOverlay (codexOverlay pattern — overlay above TITLE, no new
  GameState): bot count 1..6, per-bot difficulty cycler NOOB/MID/HARD/IMBA,
  START button → dispatch START_GAME{mode:'bots', roster, botSeats} + arm the
  bot manager. Pixi-only, geometry getter for e2e.
- GameMode union += 'bots' (internal '1v1' value KEPT — wire/test churn for a
  cosmetic rename rejected; UI strings carry the new name).
- StartGameAction += optional botSeats: readonly number[]; World += botSeats:
  Set<PlayerId> (cleared on START_GAME without the field + RETURN_TO_TITLE);
  save.ts additive-optional botSeats roundtrip.
- PLAYER_COLORS 7th entry (seat 6, bots-mode only reachable; lobby/roster
  validators stay MAX_PLAYERS=6) → 1 human + up to 6 bots = 7 seats.
- avatarRenderer nameplate + scoreboard rows: bot seats render B{n} (not P{n}).
- e2e helpers: titleButtonCss key map updated; smoke spec label assertions.

### P2 — Bot framework (code-split src/bots/)
- botConfig.ts: difficulty table (cursorSpeed px/tick, thinkEveryTicks,
  buildCooldownTicks, aimJitterPx, feature flags: sever/fleeHunter/cleanSplat/
  rainbow/potato/shrink/bondOptimal). NOOB 3.2/48/360/60; MID 5/30/210/28;
  HARD 7/18/130/10; IMBA 10.5/6/70/2 + all flags.
- botController.ts: per-bot FSM (IDLE→TO_SPARK→HAUL→PLACE / errand states),
  virtual cursor = the bot's avatarPos moved ≤speed px/tick via UPDATE_AVATAR_POS
  through the SAME dispatchFn; claim via PICKUP_SPARK at arrival (≤30px), haul
  via the S45 coupling, commit via PLACE_PRIMITIVE at the build site (remote-
  origin path re-picks targets host-side), DROP_SPARK fallback on any stuck
  state. NO direct world mutation — actions only (bench gate, poop gate, race
  rejects all apply to bots identically by construction).
- botManager.ts: owns N controllers, seeded mulberry32(rngSeed ^ seat ^ 0xB07)
  per bot, tick(world) called from main.ts host-only PLAYING block (hunter-loop
  idiom). Armed at bots-START via dynamic import (bundle charter), torn down on
  TITLE transition.
- Unit tests: deterministic decision tests on synthetic worlds; same-seed
  same-actions replay test; bench/poop gate compliance tests.

### P3 — Bot brain: actually PLAY the game
- Goal arbitration per think-tick (utility order): FLEE_HUNTER (if targeted &
  flag) → CLEAN_SPLAT (own fouled structure & flag) → CLAIM_RAINBOW (flag) →
  SEVER enemy bond (charges ≥1 & flag, cruise to midpoint first — no
  across-the-map snipes) → PLANT_POTATO on enemy structure (IMBA) →
  SHRINK_TERRITORY (IMBA, situational) → BUILD loop (default).
- BUILD loop: home sector = radial spawn angle; chain placement ≥SPAWNER rim
  +margin, outside enemy territory, placementPos within AUTO_BOND_RADIUS of own
  frontier prim (host re-pick forms the bond), aimJitter applied per difficulty;
  HARD/IMBA bias placements near 2+ own prims (merge candidates → bond density
  toward the 1.5×prim complexity cap) and prefer magic-combo carried types when
  visible. NOOB scatters anchors + misses cooldowns.
- Bots read world state directly (fog ignored) — documented as v1 simplification;
  NOOB/MID act mostly in own sector so it reads fair, IMBA is meant to be unfair.
- Tuning constants centralized in botConfig for playtest iteration.

### P4 — Multiplayer lobby split: Friends Lobby + Quick Match
- LobbyScreen select pane: third action "QUICK MATCH" beside Host/Join (NO new
  screen layer — e2e geometry preserved); friends-lobby flow byte-identical.
- NEW net/quickmatch.ts (code-split): discovery via Trystero nostr room
  'spark-qm-v{PROTOCOL_VERSION}'; protocol {t:'host', code} announcements every
  2s; SEEK 2.5s → self-promote to host (normal createHostStartHandler room —
  crypto attestation works unchanged because the announced code IS the host
  fingerprint); demotion rule: a peerless announcing host that sees a
  lexicographically-smaller code demotes + joins it (convergent election).
  Seekers join announced code via the standard join path. Host leaves discovery
  at Begin/full; seekers leave on join.
- READY GATE (quickmatch rooms only): every player (incl. host) gets a READY
  button; NEW NetMessage kind 'LOBBY_READY' {ready} client→host; host tracks
  readiness, RosterEntry += optional ready?: boolean riding LOBBY_PRESENCE;
  auto-Begin when seated ≥2 ∧ all ready. Friends lobby keeps host-clicked Begin.
  NO PROTOCOL_VERSION bump (LOBBY_PRESENCE no-bump precedent; same-deploy site;
  unknown-kind drop is graceful) — Council to ratify.
- lobbyStateMachine: mode 'quickmatch' + READY/announce events (pure, tested).

### P5 — Verification sweep + ship
- Full vitest + e2e lane; bundle measured at EVERY render-code commit (charter:
  index chunk < 550 KiB; bots + quickmatch + setup overlay all lazy chunks).
- Live preview playthrough: start VS Bots (2 bots MID/HARD), verify bots cruise,
  haul sparks, build bonded structures, score income, get eaten by the hunter,
  win banner attribution; screenshot proof.
- BACKLOG.md roadmap: insert this as the completed user-mandate session; Tier-1
  G-items remain next.
- Per-priority commit + push; CI green on tip; session-state completion protocol.

## OUT OF SCOPE
- Internal '1v1' enum/wire rename (cosmetic; UI strings only).
- Bot fog-of-war honesty (v1 documented simplification).
- Quickmatch skill matching/regions; host-migration (Tier-3 unchanged).
- Save/replay of mid-match bot controller state (bots re-decide after load).

## RISKS / MITIGATIONS
- Bundle charter (1.7 KiB headroom): ALL new feature code dynamic-imported;
  measure per commit; title/lobby button deltas are the only index-chunk cost.
- e2e drift: keep oneVOne getter key + lobby select-pane geometry; update
  helpers in the SAME commit as UI changes.
- Stuck-Carrying bots: every controller tick re-validates its FSM against world
  (spark gone → reset; Carrying with no path → DROP); placePrimitive throw paths
  pre-validated (Carrying + spark exists) before dispatch.
- 7th seat: PLAYER_COLORS[6] consumers audited (rainbow derangement is
  player-generic; radialSpawnPos generic; seatRack is lobby-only ≤6; leaderboard
  iterates world.players). New color must be distinct from 6 seats + 6 spark hues.
- Quickmatch relay flakiness: self-promote timeout means a lone seeker always
  becomes a waiting host (functional degraded mode).
- Determinism: bots = pure fn(world, controllerState, seededRng); no Math.random
  / Date.now; actions through dispatch only.

## TESTING
- New: botConfig table lock test; botController FSM unit tests (synthetic
  worlds); botBrain goal-arbitration tests per difficulty; determinism
  (same seed ⇒ same action stream); bench/poop-gate compliance; quickmatch
  election pure-helper tests; lobbyStateMachine quickmatch-mode tests;
  LOBBY_READY parse + roster.ready validator tests; save.ts botSeats roundtrip.
- Existing: 1312 must stay green (START_GAME/RETURN_TO_TITLE invariants extended
  not changed); e2e lane on PR-tip.

## TOKEN BUDGET / SESSION SPLIT
P1+P2+P3 are the core user ask (~bots playable) — this session. P4 quickmatch +
P5 sweep same session if context ≤ ORANGE; else P4 hands off with design locked
(user authorized "next session or two").

## COUNCIL R1 BATTLE LEDGER (Grok 4.20 DISRUPTOR + Gemini 2.5-pro AUDITOR, 1 round)

F1 ACTUATION — Grok ADOPT-WITH-FIX, Gemini ADOPT-WITH-FIX → **ADOPTED + 4 fixes**:
  (1) per-TICK target invalidation (controller re-validates targetSpark state every
  tick, not every think — kills Grok's stale-claim stutter scenario); (2) seat-
  staggered think phase (Gemini: bot i thinks on tick ≡ i mod thinkEvery — amortizes
  CPU); (3) cursor velocity easing (accel/decel ramp, not constant-velocity lurch —
  Grok's "robotic pause-then-lurch" feel); (4) dev-log bot rejects via existing
  rejectReasons buckets. REJECTED-on-evidence: Grok's "BotManager lives outside the
  60Hz loop" premise — it ticks INSIDE the same fixed-step host-only block as
  hunters (his fix is the shipped design). Gemini's "bot becomes the hunter" — the
  hunter is an NPC, not a player role (misread). Bot save/load state: OUT OF SCOPE
  (documented; bots re-decide post-restore; save seams are DEV-only).

F2 CAPACITY — Grok REJECT, Gemini REJECT → **OVERRULED-WITH-EVIDENCE → 6 bots (7 seats, bots-mode only)**:
  PRIME-AUDIT verified both REJECTs rest on hallucinated structures: Grok's
  `fogVisionMask Uint8Array(6)` does not exist (vision.ts is player-Map-generic);
  his radial-spawn collision assumed total=6 with seat=6, but applyStartGame passes
  total=roster.length=7 → distinct angles; Gemini's `new Array(MAX_PLAYERS)` score
  arrays don't exist (scoreByPlayer is a Map). The ONE real consumer found by grep
  audit: ui.ts leaderboard row pool (`for i < MAX_PLAYERS`) → switch to
  PLAYER_COLORS.length. Adopted mitigations: 7th color = silver 0xc0c8d0 (bot-y,
  B{n} nameplates carry identity per S62 council note that color alone stops
  identifying beyond 3); MAX_PLAYERS stays 6 everywhere wire/lobby; NEW 7-seat
  invariant test (distinct radial angles at 7, rainbow derangement bijection over 7,
  leaderboard rows). User's literal ask ("upto 6 bots") honored.

F3 MODE SEMANTICS — Grok REJECT, Gemini ADOPT-WITH-FIX → **ADOPTED (Grok refuted)**:
  Grok's rejection rests on "bots mode forces the 10Hz NetSnapshot mirror so the
  human sees 100ms-quantized bots" — architecturally false: in bots mode the human
  IS the host (isHost=true), renders the live world at 60Hz; snapshot emission
  gates on hostSync!==null && netTransport!==null (both null), client interpolation
  gates on !world.isHost. Gemini's fix executed pre-lock: grep audit of ALL 11
  isNetworked() consumers — every transport use is null-guarded (godlyOrchestration
  explicitly `ctx.netTransport !== null &&`). ADOPT as planned.

F4 QUICKMATCH — Grok REJECT (wants server matchmaker), Gemini ADOPT-WITH-FIX →
  **ADOPTED + 5 fixes** (Grok's dedicated-relay matchmaker rejected: serverless
  transport is a project constraint; transient split lobbies at friends-scale
  population converge via the demotion rule and are acceptable):
  (1) **PROTOCOL_VERSION 7→8** — Gemini's stuck-lobby argument is correct and
  decisive: a pre-S87 v7 client in a quickmatch room can never send LOBBY_READY →
  permanent stall; the bump makes the existing HELLO hard-reject + "refresh" UX
  handle it (CONCEDED→GEMINI, overrides my no-bump lean);
  (2) jittered self-promotion window (~2.0-3.5s derived from selfId hash) to
  de-synchronize simultaneous promotions (Gemini);
  (3) seekers join the SMALLEST announced code when several arrive (deterministic
  convergence, kills Grok's 3/1 split scenario at the seeker side);
  (4) host announces full:true at 6 seated + stops announcing at Begin; seekers
  ignore full rooms (Gemini's 7th-seeker hole);
  (5) readiness derived from CURRENT seated roster ∩ readySet so a departed peer's
  ready bit can never wedge the gate (Gemini's close-tab hole); host-left in a
  quickmatch lobby → error banner + back to select (v1; auto-research is a logged
  nice-to-have). Discovery room id embeds the version: 'spark-qm-v8'.

PRIME-AUDIT note: 3 of 4 Council REJECT votes were refuted on file/line evidence
(S86 calibration pattern repeats: external models strong on lifecycle holes
[Gemini's ready-gate/disconnect catches are real and adopted], noisy on
architecture claims about code they haven't read). Consensus was NOT rubber-
stamped; every adopted fix names its evidence.
