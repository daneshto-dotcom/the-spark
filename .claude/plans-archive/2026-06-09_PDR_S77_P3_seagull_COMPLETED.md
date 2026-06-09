═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S77 P3: The Seagull (NEW hazard)
═══════════════════════════════════════════════════════════
Status: DRAFT → Council R1+R2 (Full) → PRIME-AUDIT → execute (batch pre-approved)
Tier: FULL (>30K, novel_mechanism + touches scoring/physics/protocol)

OBJECTIVE
  Add a recurring SEAGULL hazard: a seagull flies across the top of the board ~every
  2 minutes, dropping poop as it goes. Poop that hits a player's STRUCTURE halts that
  player's income entirely until they clean it (move their cursor/avatar over the
  splat); poop that hits a free SPARK makes that spark "poopy" — it moves at half speed
  ("cruiser speed") for ~15s until the poop falls off. Must look awesome / funny / epic.
  Host-authoritative + deterministic, mirroring the hunter/potato/rainbow hazards.

CURRENT STATE
  • 4 hazards exist (hunter/potato/bomb/rainbow), all host-authoritative + snapshot-
    replicated + spawner-cadence-driven. The seagull mirrors them.
  • Spawner (game/spawner.ts): per-hazard `sparksUntilX` counters, each drawn from a
    SEPARATE seeded rng stream; tick() pushes XSpawnRequest into an out-array; the
    physicsLoop dispatch site mints the entity gated on X_MAX_ACTIVE (skip-and-redraw).
  • Sim loop (main.ts ~674-730): per hazard a `if (PLAYING && !isClient){ spawn-check;
    fan-out X_TICK; poll }` block. tickScoring runs host-only before tickGameState.
  • Scoring (state/scoring.ts): tickScoring accrues per-player income ∝ computeComplexity
    (= #prims + 2×#magicBonds, attributed by placedBy). HOST-ONLY; scoreProgress=max.
  • Verlet (physics/verlet.ts): velocity is IMPLICIT (pos-prevPos)×DAMPING. ⚠ naive
    per-substep velocity scaling exponentially DECAYS a spark to a stop — the poopy-slow
    must be a one-time impulse (+ a carry-path scale), NOT a per-substep multiply.
  • netSnapshot (state/save.ts): serializes ALL entity Maps additively (seagulls[]/
    poops[] mirror hunters[]); applySnapshotCore rehydrates. Teardown: world.ts WIN_TRIGGER
    + gameMode.ts RETURN_TO_TITLE clear each Map + reset nextXId.
  • P2 (this session) added aboveFogLayer for global-reach entities. The seagull IS
    global-reach (poops on anyone) → its renderers parent into aboveFogLayer (synergy).

SCOPE (≈16 files)
──────────────────────────────────────────────────────────
NEW STATE / LOGIC
1. src/state/seagulls/seagull.ts (create) — `Seagull` {id, pos, prevPos, vx, state:
   'FLYING'|'DEPARTING', spawnedAtTick, ticksInState, dir(±1), lastPoopTick} +
   `Poop` {id, pos, prevPos, vy, state:'FALLING'|'SPLAT_STRUCTURE'|'SPLAT_SPARK', 
   spawnedAtTick, fouledPrimId?:PrimitiveId, ownerPlayerId?} + makeSeagull/makePoop +
   SeagullId/PoopId branded types (types.ts).
2. src/state/seagulls/seagullLifecycle.ts (create) — applySpawnSeagull (mint at a top
   edge, dir toward the other side); applySeagullTick (advance pos by vx; every
   POOP_DROP_INTERVAL_TICKS push a SPAWN_POOP; off-screen → DEPARTING → delete);
   applyPoopTick (fall by vy; collision: squared-dist vs world.primitives → foul [add
   to world.fouledPrimitives, set poop SPLAT_STRUCTURE + fouledPrimId]; vs free sparks →
   spark.poopyUntilTick = tick+POOP_SLOW_TICKS + impulse-halve its velocity, poop
   consumed; floor/ TTL → delete); applyCleanPoop (host-detected: owner avatar within
   POOP_CLEAN_RADIUS of a SPLAT_STRUCTURE poop → delete poop + world.fouledPrimitives
   .delete(primId)); teardownSeagulls (clear seagulls+poops+fouledPrimitives, reset ids).
   Determinism: squared-dist + SORTED id iteration (potato pattern).
3. src/state/worldTypes.ts + world.ts — add world.seagulls:Map, world.poops:Map,
   world.fouledPrimitives:Set<PrimitiveId>, nextSeagullId, nextPoopId; init in makeWorld;
   GameAction union += SPAWN_SEAGULL|SEAGULL_TICK|SPAWN_POOP|POOP_TICK|CLEAN_POOP|
   DESPAWN_SEAGULL (+ reducer wiring); WIN_TRIGGER teardown call.
4. src/state/gameMode.ts — RETURN_TO_TITLE: clear seagulls/poops/fouledPrimitives + ids
   (mirror the hunter/potato lines).
5. src/state/scoring.ts — computeComplexity (or tickScoring) HALTS a player's income
   while they have any fouled primitive: a player with ≥1 prim in world.fouledPrimitives
   accrues 0 this tick ("the WHOLE structure stops generating income"). Derive a
   fouledPlayerIds set once per tick from fouledPrimitives (cheap).
6. src/game/spark.ts — Spark += `poopyUntilTick?: number`. Poopy-slow applied as a
   one-time velocity HALVE on hit (setVelocity ×0.5) + a carry/drag-speed scale while
   poopy (controls.ts attract-drag) so a dragged poopy spark is visibly sluggish; tint
   while tick<poopyUntilTick. (Verlet core math UNCHANGED — avoids the decay trap.)
7. src/game/spawner.ts — add seagullRng + sparksUntilSeagull + sampleSeagullCountdown +
   a seagullsOut?:SeagullSpawnRequest[] param + sampleSeagullSpawn (edge pos + dir). 
8. src/constants.ts — SEAGULL_* (SPAWN_MIN/MAX_SPARKS ~15/24 ≈ ~2min at 0.15 spark/s;
   SPEED, RADIUS, MAX_ACTIVE=1, DEPART) + POOP_* (DROP_INTERVAL, FALL_SPEED, HIT_RADIUS,
   SLOW_TICKS=15s, SLOW_MULTIPLIER=0.5, CLEAN_RADIUS, GROUND_TTL) + __TEST_SEAGULL_*__ seam.

NET
9. src/state/save.ts — SerializedSeagull + SerializedPoop (omit host-only prevPos/
   spawnedAtTick); serialize/deserialize; seagulls?/poops? added to WorldSnapshot;
   emitted when non-empty in netSnapshot; rehydrated in applySnapshotCore (mirror
   hunters). SerializedSpark += poopy flag (additive) so clients render the tint.
10. src/net/protocol.ts — add the 6 new host-internal action types to
    KNOWN_GAME_ACTION_TYPES_RECORD (tsc-exhaustive mirror; inert as client intents).
    PROTOCOL_VERSION 6→7 (RECOMMENDED — see RISK R1 / Council decision).

RENDER (epic/funny/real — pure Pixi vector, no assets; the codebase doctrine)
11. src/render/seagullRenderer.ts (create) — animated flapping gull (body + flapping
    wings via sin(tick), beak, eye, little shadow), faces its flight dir; a "squawk"
    pose on spawn. Parented into aboveFogLayer (global-reach → fog-exempt).
12. src/render/poopRenderer.ts (create) — falling poop (white/green blob + motion
    streak); SPLAT_STRUCTURE = a star-splat on the structure + wavy "stink" lines + the
    fouled prim desaturates/dims (income-halted cue); SPLAT_SPARK brief splat. Into
    aboveFogLayer.
13. src/render/structureRenderer.ts (+ renderer.ts spark tint) — a fouled prim dims;
    a poopy spark gets a brown/green tint + drip (read poopyUntilTick).
14. src/main.ts — seagullRng (5th stream, xor 0x5a4e28b8); pass to Spawner; SPAWN_SEAGULL/
    SPAWN_POOP dispatch from the spawner out-array (gated SEAGULL_MAX_ACTIVE); host-only
    sim block (spawn-check + SEAGULL_TICK + POOP_TICK + CLEAN_POOP sweep); construct
    seagullRenderer + poopRenderer into aboveFogLayer; sync them each frame.
15. src/render/audioManager.ts (if cheap) — a seagull "caw" on spawn + a "plop/splat" on
    poop-land (mirror the bomb/potato BOOM precedent). Polish — degrade gracefully.

TESTS
16. src/state/seagulls/seagull.test.ts (create) + e2e/seagull.spec.ts (create) — units:
    spawn cadence (seam), flight+depart, poop drop interval, poop-vs-structure → foul →
    income halts (tickScoring=0 for that player) → clean restores, poop-vs-spark → slow
    +auto-clear at 15s, determinism (squared-dist+sorted), teardown clears all. e2e:
    seagull crosses + drops poop + a fouled structure halts income + cleaning restores +
    renders through fog (aboveFogLayer). Plus save.replay round-trip for the new fields.

NO CHANGES TO
  • Verlet core math (physics/verlet.ts) — poopy-slow is an impulse + carry-scale, not a
    verlet edit (the implicit-velocity decay trap). • Vision math. • The other 4 hazards'
    logic. • Bonds/placement/combos. • The P1/P2 changes.

RISK ASSESSMENT
  • R1 PROTOCOL BUMP (Council decision): no NEW client intent (cleaning is host-detected),
    so by the strict hunter/potato precedent it COULD be no-bump. BUT the seagull is a
    GLOBAL income-affecting hazard whose effects (income halt, spark slow) are invisible/
    confusing to a stale-v6 peer (the rainbow bumped 5→6 for exactly this "global state
    change" reason). RECOMMEND bump 6→7 to cleanly gate stale peers at HELLO. Mitigation:
    additive snapshot fields stay backward-shaped; bump is the safety call.
  • R2 income-halt severity ("WHOLE structure stops"): one poop = total income stop for
    that player until cleaned — literal to the ask + dramatic, but potentially harsh.
    Tunable via POOP_CLEAN_RADIUS (easy clean) + the foul being per-player. Flag for the
    user; alternative (only fouled prims stop) is a 1-line swap in scoring.
  • R3 poopy-slow physics: must NOT scale velocity per-substep (verlet decay trap → spark
    freezes). Mitigation: one-time impulse-halve + carry-drag scale; verlet untouched;
    unit-test the spark still MOVES (just slower) and self-clears at 15s.
  • R4 determinism: poop collision over primitives/sparks MUST use squared-dist + SORTED
    id iteration (potato pattern) so host/replay match. Seagull/poop on the seagullRng
    stream only → spark/bomb/potato/rainbow sequences byte-identical. Unit-test determinism.
  • R5 snapshot size: poops are short-lived + few (drop interval throttled, TTL'd); ≤~10
    live. Negligible vs the ~3KB primitives payload. Cap live poops if needed.
  • R6 teardown leak: seagull/poop/fouledPrimitives MUST clear on WIN + RETURN_TO_TITLE +
    START_GAME (else a fouled prim halts income into the next match). Mirror teardownHunters;
    unit-test the invariant.
  • R7 bundle size: new renderers + logic vs the <550KB charter (currently 534.35KB).
    Pure vector (no assets) keeps it small; verify build at the end. ~Headroom 15KB — watch.

TESTING PLAN
  • tsc -b 0; full vitest (1142 baseline + new seagull units, no regressions);
    vite build < 550KB charter.
  • Unit: spawn cadence (seam), flight/depart, poop-drop interval, poop→structure foul +
    income-HALT (tickScoring accrues 0 for the fouled player; 0 for others is unchanged),
    clean→restore, poop→spark slow + self-clear at POOP_SLOW_TICKS, determinism
    (squared-dist/sorted + seagullRng isolation = spark/bomb/potato/rainbow byte-identical),
    teardown clears seagulls/poops/fouledPrimitives. save.replay round-trip.
  • e2e/seagull.spec.ts: drive __SPARK__ → spawn a seagull (seam) → it crosses + drops →
    foul a structure → assert that player's income stops → clean → income resumes;
    + renders through fog (aboveFogLayer, mirror the P2 dual-pixel).
  • Full Playwright gating lane (now incl. seagull) at batch-end.
  • LIVE PREVIEW (mandatory — "must look epic/funny"): screenshot the gull flapping
    across + poop arcing + a splatted/dimmed structure + a poopy spark. User-facing polish.

TOOL TRIAGE
  Visual output needed?     Yes — VERIFICATION via preview screenshots (gull/poop/splat).
                            Renderers are pure Pixi VECTOR (codebase no-asset hazard
                            doctrine) → NO Imagen/Veo asset generation.
  Research/external data?   No — integration map built from the local codebase this session.
  Artifact delivery needed? No — code + this PDR; no Drive/PPTX/PDF/DOCX.

DIFFERENTIAL_TEST_REQUIRED: true
  SCOPE touches a schema-ish surface (PROTOCOL_VERSION bump + new wire action types +
  new snapshot fields) + the scoring path. TESTING includes a save.replay round-trip
  (serialize→deserialize byte-shape) + a determinism unit (seagullRng isolation leaves
  the other 4 hazard sequences byte-identical) = the behavioral-equivalence guard.

HOT_PATH_REFACTOR: false
  No edit to ~/.claude lib/hooks/router/LLM-prompt. The verlet CORE is explicitly NOT
  touched (the poopy-slow is an impulse + carry-scale, not a hot-path math change).
  scoring.tickScoring gains one cheap per-tick fouled-player guard (additive, gated).

ESTIMATED TOKENS: ~70K (Full — new entity + render + net + scoring + tests)
MODEL: Opus 4.8 (ALWAYS — S154)

═══════════════════════════════════════════════════════════
    GATE: batch pre-approved (user 'i approve full session priority batch + autonomous')
    → run Council R1+R2 + PRIME-AUDIT for QUALITY, then execute. No re-approval pause.
═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════
    COUNCIL R1+R2 (Full) + PRIME-AUDIT — RESOLVED DESIGN
═══════════════════════════════════════════════════════════
TRIUMVIRATE: Claude (Architect) / Grok-fast (Disruptor) / Gemini-2.5-pro (Auditor).
Strong convergence; Gemini verdict REVISE (balance + edge cases) → all addressed below.

BATTLE LEDGER (key decisions)
| # | Decision | Claude | Grok | Gemini | Resolution |
|---|----------|--------|------|--------|------------|
| 1 | Protocol bump v6→v7 | bump | CHALLENGE→bump (rainbow precedent) | bump (correct procedure) | CONVERGED BUMP v7 — the bump IS the mitigation for Grok's "pre-v7 income-state desync" HIGH risk (stale peer rejected at HELLO). |
| 2 | Income-halt severity | whole-player | CHALLENGE (per-prim) | CHALLENGE 2/5 (feels-bad) | SYNTHESIS — foul the hit prim's CONNECTED COMPONENT (= literally "the whole structure"); fouled prims contribute 0 via computeComplexity skip (local/deterministic, NOT a whole-economy halt). Correctly scopes multi-structure players. Balance flagged → 1-line tunable (component default; narrow=single-prim / widen=whole-player). User explicitly asked "whole structure stops" → honored, scoped, tunable. |
| 3 | Poopy-slow mechanism | impulse+carry | CHALLENGE (verlet decay/substep) | (edge: carry interaction) | SYNTHESIS — apply at the CARRY-FOLLOW path (the only case that matters; free sparks settle in ~1-2s via damping), verlet CORE UNTOUCHED. Grok's "substep-variation" risk REFUTED: substeps are LOCKED at 8 (§4) — no variation. Timer absolute (poopyUntilTick); slow applies while carried (that's the point: building with a slimed spark is sluggish); self-clears at 15s. |
| 4 | Cleaning | owner-avatar | CHALLENGE (grief/inconsistent) | ANY-player (disconnect) | CONCEDED → ANY player's avatar within CLEAN_RADIUS cleans a splat (only the owner is motivated; fixes disconnect-blight). Point-in-radius + generous radius for v1; swept line-segment check = noted polish. |
| 5 | Determinism | dedicated rng | shared-stream / spline alts | (5/5 approved) | KEEP dedicated seagullRng (shared-stream REJECTED — perturbs the other 4 hazards' byte-identical sequences). Poop drops on a FIXED interval (NO rng → determinism-trivial). Sorted-id first-hit collision. Sim position LINEAR; render adds a cosmetic sine-bob (Gemini juice) — sim stays deterministic. |
| 6 | Action types | dedicated | reuse generic HAZARD_TICK | — | KEEP dedicated SPAWN_SEAGULL/SEAGULL_TICK/... (consistency with the 4 existing hazards' tsc-exhaustive Record mirror; generic-subtype REJECTED). |

EDGE CASES (Gemini — all adopted)
  E1 destroyed fouled prim (bomb/potato) → on prim deletion remove it from
     world.fouledPrimitives + delete the orphaned SPLAT_STRUCTURE poop (its prim is gone).
     computeComplexity skip-check is has()-based so a stale id is harmless even pre-sweep.
  E2 disconnected player w/ fouled prims → any-player cleaning (E #4) + their prims clear
     on elimination teardown → no permanent blight.
  E3 multiple poops on one structure → cleaning ANY splat clears the whole component's
     foul (component-scoped, decision #2) — no per-splat confusion.
  E4 spark slow × carry → slow applies on the carry-follow; absolute 15s timer ticks
     regardless of carry/drop; resumes full speed at expiry.
  E5 cursor tunneling past CLEAN_RADIUS → generous radius for v1; swept-check = polish.

JUICE SPEC (Gemini creative — "epic/funny", pure vector, cheap)
  • Seagull: a faint shadow GLIDES across first (anticipation telegraph); flapping wings
    (rotate + squash/stretch via sin(tick)); body bobs out-of-phase; a quick "hunch"
    (squash) just before each drop.
  • Poop: teardrop (circle+triangle) with side-wobble + a wet "glint" arc + a dashed
    fall-trail.
  • Impact: reuse the existing ScreenShake.trigger (2-3 frame shake); procedural splat
    (5-7 small circles, organic blob); a short starburst (8-12 radiating lines, shrink);
    1-2 drips down the structure for ~1s; the fouled prim DESATURATES/dims (income-halt cue).
  • SFX: a seagull "caw" on spawn + a "plop/splat" on land (mirror the bomb/potato BOOM;
    degrade gracefully if the audio path is non-trivial).

PRIME-AUDIT DELTA (Rule 20)
  Δ1 income whole-player → CONNECTED-COMPONENT (literal "structure"), skip-fouled-prims.
  Δ2 poopy-slow → carry-follow path, verlet UNTOUCHED, substep-risk refuted (LOCKED 8).
  Δ3 cleaning → ANY-player (disconnect-safe).
  Δ4 + the 5 edge cases wired (prim-deletion purge / component-clean / carry-timer).
  Δ5 determinism simplified: fixed-interval drops (no rng), sorted-id first-hit, sim-linear+render-bob.
  Δ6 juice spec adopted (shadow/flap/shake/splat/drips/SFX).
  Runtime-verifiability: seagull runs in the live host tick → e2e (seam-spawn → foul →
  assert income halts → clean → assert resumes) is a real boot-then-smoke, NOT static
  parse. Render verified live in preview (mandatory — "must look epic/funny"). Determinism:
  fixed-interval drops + dedicated rng + sorted-id + linear sim = replay-safe; the
  save.replay round-trip + the rng-isolation unit are the DIFFERENTIAL guards.
  CONFIDENCE: HIGH on architecture/determinism/net; income-balance is a flagged user dial.
═══════════════════════════════════════════════════════════
