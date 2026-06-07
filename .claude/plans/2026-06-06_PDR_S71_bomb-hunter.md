═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S71 Batch: Bomb hazard + Pac-Man Hunter + Potato Bomb
═══════════════════════════════════════════════════════════
Tier: FULL (>30K, two net-sensitive gameplay entities + new client INTENT + protocol-version decision)
Deliberation: 3-way Council (2 rounds + quality gate via council-of-models)
Status: COUNCIL-CONVERGED (3-way, R1 + R2 quality gate + R3 targeted) + PRIME-AUDIT done — awaiting user GO.

OBJECTIVE
  Add two playtest-driven gameplay mechanics to SPARK (host-authoritative,
  deterministic, tick-based, net-replicated):
    P1 BOMB — a hazard the host-only spawner drops into the spawn zone every
      random 8–15 sparks. If a player grabs it (rushing → not paying attention),
      it severs ~25% of THAT player's own bonds (reduces complexity, sets them
      back). If un-grabbed for 15 s it dissipates. Max 1 live at a time.
    P2 HUNTER — when the leading player first reaches 75% of the win threshold
      (37 of 50 pts), a Pac-Man-like figure spawns and chases that player's spark
      (avatar) for 30 s. On contact it "eats" them: avatar removed + input locked
      for 30 s. Juke-able — an attentive player can lead it and escape.
  Both are environmental/automatic (a new category vs. the player-initiated
  disruption suite) — precedented by the SHIPPED Voltkin creature, which already
  auto-severs bonds.

CURRENT STATE
  - Spawner (src/game/spawner.ts): host-only, deterministic Poisson spawn from a
    mulberry32 RNG seeded by world.rngSeed; appends Spark to world.freeSparks.
    SparkType is LOCKED to 6 canonical types (blueprint §IV "no variants").
  - Bonds (world.bonds: Map<BondId,Bond>): colorless; ownership derives from
    endpoint primitives' placerColor. §13.16 HARD INVARIANT: both endpoints of a
    bond share one placerColor → "a player's bonds" enumerates cleanly. Severance
    runs through applySeverBond (src/state/severBond.ts) + applySeverTopology
    (disruptionManager.ts): SEVER_BOND{cause:'player'|'physics'|'creature'};
    §VIII.4 deletes the smaller split component; cleanup + snapPrevPos automatic.
  - Player avatar (player.avatarPos: Vec2): the on-screen spark/cursor each player
    drives; rendered by avatarRenderer.ts. Input gating already exists:
    controls.isInputLocked() returns true when world.activeCinematicPlayerId === playerId.
  - Pickup (controls.ts onDown → pickSpark hit-test within PICK_RADIUS → dispatch
    PICKUP_SPARK). RMB → SEVER_BOND{cause:'player'}.
  - Scoring (gameMode.ts addScore; gameState.ts tickGameState): PHASE_1_WIN_SCORE
    = 50 (constants.ts:216); scoreProgress = max(scoreByPlayer); WIN fires at ≥50.
    Win condition is UNCHANGED by this PDR. (Blueprint §III.2 still says "≥51%
    area" — stale vs. shipped 50-pt threshold; README confirms "score threshold".)
  - Creature system (LOCKED §13.15, S22–S34): world.creatures Map; tick-based FSM
    (SPAWNING→SEEKING→ATTACKING→DESPAWNING); deterministic seek/arrive/repulse
    steering (creatureVerlet.ts: arriveForce/repulseForce, pure); findNearestBondTarget;
    despawnAtTick lifetime; serialized in NetSnapshot; rendered by CreatureRenderer.
    This is the architectural template for the hunter — but Voltkin is LOCKED, so
    the hunter rides a SEPARATE entity Map to avoid Voltkin regression (reusing the
    pure steering helpers).
  - Net (LOCKED §13.1-13.7): host-authoritative; client = pure interpolation, NO
    sim. NetSnapshot = save.ts WorldSnapshot minus 4 host-only fields. Additive-
    optional snapshot fields ship WITHOUT a version bump (creatures S28, effects
    S31, lobby S70 precedents). PROTOCOL_VERSION = 4. A NEW client→host INTENT
    type historically DID bump (S52 PLACE_FROM_FREE: 2→3) because a stale peer
    would desync. HELLO handshake is version-lockstep.
  - Timing: tick-based ONLY. Wall-clock setTimeout that mutates world was DELETED
    S28 P0 (breaks replay). 60 Hz → 15 s = 900 ticks, 30 s = 1800 ticks. The
    pendingCreatureSpawn poll in main.ts physics loop is the established pattern.
  - Anti-bloat §7/§XV: no module > 500 LOC (≤300 per handler, S61). Tick-based +
    seeded-RNG determinism is mandatory (§10.5). v1 threat model = 1v1 friends-only.
  - Safety net: vitest 1039; Playwright gating lane (24/24) + quarantine real-WebRTC
    lane. e2e is NOT in tsconfig (a constant/wire/coord change can pass tsc + unit
    tests yet break Playwright) → MUST run Playwright on this work.

SCOPE — P1 BOMB (≈14 files)
──────────────────────────────────────────────────────────
1. src/state/worldTypes.ts (modify)
   Add `bombs: Map<BombId, Bomb>` + `nextBombId: number`. New BombId branded type.
   Bomb = { id; pos: Vec2; radius; spawnedAtTick; dissipateAtTick }. v1 STATIONARY
   (no drift) → net-trivial (pos only), deterministic, low risk. (Drift = deferred
   tunable.) makeWorld() inits empty Map + nextBombId=0.

2. src/constants.ts (modify)
   BOMB_SPAWN_MIN_SPARKS=8, BOMB_SPAWN_MAX_SPARKS=15 (cadence window),
   BOMB_TTL_TICKS=900 (15 s), BOMB_FRACTION=0.25, BOMB_MAX_ACTIVE=1,
   BOMB_RADIUS, BOMB_PICK_RADIUS (reuse PICK_RADIUS). E2E test overrides via
   window.__TEST_* mirror the existing spawn-rate/win-score override pattern.

3. src/game/spawner.ts (modify, host-only)
   Add a deterministic bomb cadence: a `bombCountdown` drawn from the spawner's
   OWN rng (preserves RNG call order — Agent-1 hazard), decremented per spark
   spawned; at 0, if world.bombs.size < BOMB_MAX_ACTIVE, emit a SPAWN_BOMB at a
   seeded spawn-disk position and redraw the countdown in [MIN,MAX]. RNG draws stay
   inside the spawner's sequence (host-only; clients mirror via snapshot).

4. src/state/world.ts (modify)
   GameAction += SpawnBombAction{type:'SPAWN_BOMB';pos} + TriggerBombAction
   {type:'TRIGGER_BOMB';bombId;playerId}. dispatch() cases delegate to bombLifecycle.

5. src/state/bombLifecycle.ts (CREATE, ≤~160 LOC)
   - applySpawnBomb(world, action): mint BombId, set dissipateAtTick = tick+TTL,
     add to world.bombs.
   - applyTriggerBomb(world, action): no-op if bomb gone. Then the COUNCIL-PINNED
     deterministic, all-topology severance (Fork B synthesis — replaces lowest-BondId):
       N = picker's bond count (placerColor === picker, §13.16 one-endpoint check). N==0 → fizzle.
       target = max(1, round(BOMB_FRACTION*N)); primCap = ceil(BOMB_PRIM_CAP_FRACTION*P), P=picker prims.
       STEP 1 FREEZE pre-detonation topology; for each picker bond compute cost(bond) =
         size of the smaller component §VIII.4 would delete if that bond ALONE were cut
         (cycle bond that doesn't split = 0; leaf = 1; interior > 1) via a PURE
         componentSizeIfSevered dry-walk (reuse severSplit's split computation; NO mutation).
       STEP 2 order all picker bonds by (cost ASC, BondId ASC) — total order, no unresolved ties.
       STEP 3 greedily fill kill-set in that order while killset<target AND cumulativeCost+cost≤primCap;
         stop at the first cap-breach (ascending ⇒ all later breach too). Empty kill-set → fizzle.
       STEP 4 execute applySeverBond{cause:'bomb'} per kill-set bond in order; skip-if-missing
         (incidental cascade overlap). Emit BOMB_EXPLODE at bomb.pos + BOND_SEVERED audio. Delete bomb.
     Determinism: STEPS 1-3 are a pure fn of frozen pre-state + BondId (Grok R3 CONVERGE).
     Loops handled (cycle bonds cost 0 → cut first → "open the ring, no wipe"). 0 bonds → visual only.

6. src/state/severBond.ts + src/state/disruptionManager.ts (modify)
   Add 'bomb' to the cause union; canSeverBond bypasses charge + auth for 'bomb'
   (identical to 'creature'/'physics'). No change to 'player' semantics (§13.11).

7. src/input/controls.ts (modify)
   In the pickup hit-test, also test world.bombs within BOMB_PICK_RADIUS; if a bomb
   is the nearest pickable under the cursor, dispatch TRIGGER_BOMB{bombId,playerId}
   instead of PICKUP_SPARK (host-authoritative; NOT client-predicted). Respect
   isInputLocked().

8. src/net/protocol.ts (modify) — Fork A RESOLVED (Council UNANIMOUS): bump 4 → 5
   Add TRIGGER_BOMB to the INTENT action allowlist + bump PROTOCOL_VERSION 4 → 5 —
   a new client→host gameplay INTENT (S52 PLACE_FROM_FREE precedent; a stale peer
   would desync on bomb-grabs / see a divergent world). SPAWN_BOMB + all HUNTER_*
   are host-internal (NOT client INTENTs). Snapshot bomb/hunter fields stay additive-
   optional, but the version bump hard-rejects cross-version play at HELLO. protocol.test
   asserts the new value + the mismatch UX.

9. src/state/save.ts (modify)
   serializeBomb/deserializeBomb; bombs?: SerializedBomb[] additive-optional in
   WorldSnapshot/NetSnapshot; applySnapshotCore clears+rebuilds world.bombs each
   apply (creature pattern). SerializedBomb = {id,pos,dissipateAtTick?}.

10. src/game/effects.ts (modify)
    GameEffect += BOMB_EXPLODE{kind;tick;pos;radius}. (Audio reuses BOND_SEVERED.)

11. src/render/bombRenderer.ts (CREATE) + src/render/effects/bombExplode.ts (CREATE)
    BombRenderer.sync(world): dark pulsing orb + fuse/danger pulse at bomb.pos
    ("distinct but misclickable"). bombExplode drawer: expanding ring (severErase
    pattern). Pure Pixi vector — NO image/asset generation.

12. src/render/effectsRenderer.ts + src/render/effects/lifetime.ts (modify)
    Wire BOMB_EXPLODE kind + lifetime (~36 ticks).

13. src/main.ts (modify)
    Physics-loop poll (beside pendingCreatureSpawn): for each bomb, if tick ≥
    dissipateAtTick → remove + small fizzle effect (host-only). Wire
    bombRenderer.sync into the render block.

14. TESTS (P1): bombLifecycle.test.ts (enumerate-own-bonds, 25%/round/min-1,
    cascade-skip-missing, 0-bonds, dissipate); spawner bomb-cadence determinism
    test; protocol parse + v5 + TRIGGER_BOMB allowlist test; save bombs roundtrip
    + pre-bomb-snapshot back-compat; controls bomb-pickup-priority test. e2e:
    deterministic bomb spawn (test override) → grab → assert picker bond-count
    dropped ~25% (tag @quarantine-flaky ONLY if it needs real-WebRTC; the single-
    client deterministic path can live in the gating lane).

SCOPE — P2 HUNTER (≈14 files)
──────────────────────────────────────────────────────────
15. src/state/worldTypes.ts (modify)
    Add `hunters: Map<HunterId, Hunter>` + `nextHunterId` + `hunterSpawned: boolean`
    (once-per-game guard). Hunter = { id; pos; prevPos; state:'SEEKING'|'CATCHING'|
    'DESPAWNING'; ticksInState; targetPlayerId; spawnedAtTick; despawnAtTick }.
    Player += `benchedUntilTick?: number` (additive). SEPARATE Map (NOT a Voltkin
    CreatureType) → Voltkin LOCKED system untouched, zero regression. (Council fork:
    separate-Map vs extend-CreatureType.)

16. src/constants.ts (modify)
    HUNTER_TRIGGER_FRACTION=0.75 → HUNTER_TRIGGER_SCORE=floor(50*0.75)=37,
    HUNTER_HUNT_TICKS=1800 (30 s), HUNTER_BENCH_TICKS=1800 (30 s),
    HUNTER_CATCH_RADIUS, HUNTER_MAX_ACCEL / HUNTER_MAX_SPEED (tuned juke-able vs
    avatar), HUNTER_SPAWN at canvas edge. Test overrides mirror existing pattern.

17. src/state/world.ts (modify)
    GameAction += SPAWN_HUNTER, HUNTER_TICK, HUNTER_CATCH (host-internal; NOT in the
    client INTENT allowlist — host-authored, replicated via snapshot). dispatch cases
    delegate to hunterLifecycle.

18. src/state/hunters/hunterLifecycle.ts (CREATE, ≤~150 LOC) + hunterAI.ts (CREATE, ≤~60 LOC)
    - findLeadingPlayer(world): highest scoreByPlayer, tiebreak lowest PlayerId
      (reuses the win-check scan pattern); solo = the sole player.
    - applySpawnHunter: mint, target = leading player (LOCKED at spawn), state SEEKING,
      despawnAtTick = tick + HUNT_TICKS.
    - applyHunterTick: if tick ≥ despawnAtTick → delete (escape); else steer toward
      target.avatarPos (reuse arriveForce from creatureVerlet), Verlet-integrate;
      if dist(hunter.pos, target.avatarPos) < CATCH_RADIUS → dispatch HUNTER_CATCH.
    - applyHunterCatch: set victim.benchedUntilTick = tick + BENCH_TICKS; if victim
      carries a spark, DROP it; emit a chomp effect; delete the hunter.

19. src/main.ts (modify)
    Host-only, in the physics loop: (a) 75% trigger — when !world.hunterSpawned and
    scoreProgress ≥ HUNTER_TRIGGER_SCORE and gameState===PLAYING → dispatch
    SPAWN_HUNTER + set hunterSpawned; (b) fan-out HUNTER_TICK per hunter (after the
    creature loop), run steering; (c) bench-expiry: when tick ≥ benchedUntilTick,
    clear the field (host); (d) TEARDOWN on PLAYING→WIN/POSTGAME/TITLE — clear
    world.hunters, reset hunterSpawned=false, AND clear every player's benchedUntilTick
    (PRIME-AUDIT: else a player can start the NEXT match still benched). Mirrors creature
    cleanup. (e) ORDERING: apply client INTENTs (incl. TRIGGER_BOMB) BEFORE the bomb-
    dissipation poll in the tick, so a grab on the dissipate tick wins deterministically
    (a late grab on an already-removed bomb no-ops via skip-if-missing). Wire
    hunterRenderer.sync into render.

20. src/input/controls.ts (modify)
    isInputLocked() also true when the LOCAL player's benchedUntilTick > world.tick
    (reuses the cinematic-lock early-return; "fully benched").

21. src/render/avatarRenderer.ts (modify)
    Skip rendering a player's avatar while benchedUntilTick > world.tick ("spark gone
    for 30 s").

22. src/render/hunterRenderer.ts (CREATE, ≤~150 LOC)
    Pac-Man vector figure (yellow wedge, animated open/close mouth, faces movement
    dir) at hunter.pos; CATCHING → chomp burst. Pure Pixi vector — NO sprite assets
    (simpler than Voltkin's textures). Renders from snapshot state on the client.

23. src/state/save.ts (modify)
    serializeHunter/deserializeHunter; hunters?: SerializedHunter[] + player
    benchedUntilTick additive-optional; clears+rebuilds world.hunters each apply.
    SerializedHunter = {id,pos,state,ticksInState,targetPlayerId}.

24. TESTS (P2): hunterLifecycle.test.ts (findLeadingPlayer + tiebreak, spawn-once-at-
    37, tick/steer-toward-avatar, catch-within-radius → bench + drop-carried,
    despawn-on-escape, teardown-on-WIN); controls input-locked-when-benched test;
    avatar-hidden-when-benched (pure helper) test; save hunters + benchedUntilTick
    roundtrip + back-compat. e2e: __TEST_WIN_SCORE low so 37→trigger fires fast;
    assert hunter spawns + (forced catch) benches victim. Tag per WebRTC need.

SCOPE — P3 POTATO BOMB (Scope Amendment; Council-reviewed; ≈11 files, net-new: 2)
──────────────────────────────────────────────────────────
25. src/state/worldTypes.ts (modify) — SEPARATE world.potatoes Map (Fork D: Council
    UNANIMOUS vs the shared-bombs-Map proposal — avoids god-map bloat, keeps P1 simple) +
    nextPotatoId. Potato = {id; pos; prevPos; state:'FREE'|'CARRIED'|'ARMED'; carrierId:
    PlayerId|null; spawnedAtTick; detonateAtTick}. Player += carriedPotatoId?: PotatoId
    (MUTUALLY EXCLUSIVE with carriedSparkId — carry-1 honored).
26. src/constants.ts (modify) — POTATO_FUSE_TICKS (≈1380=23s, tunable), POTATO_BLAST_RADIUS
    (small, ≈sprite), POTATO_SPAWN cadence window, POTATO_MAX_ACTIVE. Test overrides mirror P1.
27. src/game/spawner.ts (modify, host-only) — deterministic potato spawn on its own seeded
    cadence (in-sequence with the existing RNG; capped at POTATO_MAX_ACTIVE).
28. src/state/world.ts (modify) — GameAction += PICKUP_POTATO, PLACE_POTATO, DROP_POTATO
    (client→host intents, v5) + POTATO_DETONATE (host-internal). dispatch → potatoLifecycle.
29. src/state/potatoLifecycle.ts (CREATE, ≤~160 LOC)
    - applyPickupPotato: reject if the player already carries a spark OR potato; else set
      carrierId + state CARRIED.
    - applyPlacePotato: plant at cursor; state ARMED; FORK E fuse-start (see ledger — USER decision).
    - applyDropPotato: discard; potato stays ARMED at the drop position (continues its fuse).
    - applyPotatoDetonate: DETERMINISTIC radial AoE — collect primitives with (dx*dx+dy*dy ≤ R*R)
      [squared distance, NO sqrt/hypot — replay-safe] iterated in SORTED PrimitiveId order; delete
      them + all incident bonds; reuse the existing cleanup (endpoint-set removal, dangling-bond
      drop, snapPrevPosForUnbonded). Owner-AGNOSTIC; POSITION-based (fires at the planted coord even
      if the structure there is already gone = area denial); NO chain reaction (deletes prims/bonds
      only — not other bombs/potatoes). Host-only computed + snapshot-replicated → no client divergence.
30. src/input/controls.ts (modify) — potato pickup hit-test → PICKUP_POTATO; carrying a potato
    blocks PICKUP_SPARK and vice-versa; pointer-up while carrying potato → PLACE_POTATO; DROP_POTATO path.
31. src/net/ (clientHandlers/hostHandlers, modify) — on peer-leave, if the leaver carried a potato →
    FORCE-DETONATE at the last-synced carrier pos (Grok: "cooks off if its carrier vanishes" — no
    orphan state). Two PICKUP_POTATO for the same potato same tick → tiebreak lowest PlayerId.
32. src/state/save.ts (modify) — potatoes[] + player.carriedPotatoId additive-optional;
    clears+rebuilds world.potatoes each apply. SerializedPotato = {id,pos,state,detonateAtTick,carrierId}.
33. src/render/potatoRenderer.ts (CREATE) — potato skin (FREE in spawn zone; CARRIED follows the
    carrier; ARMED planted + fuse-countdown VFX; detonation burst). Pure Pixi vector — no assets.
34. src/main.ts (modify) — physics-loop poll potato detonateAtTick (host-only, beside bomb dissipate,
    intents-before-poll); teardown clears world.potatoes + every player's carriedPotatoId on
    PLAYING→WIN/POSTGAME/TITLE. Wire potatoRenderer.sync.
35. TESTS (P3) — potatoLifecycle.test (pickup-reject-when-carrying, place/arm, drop-stays-armed,
    AoE radial-delete prims+incident-bonds within R + DETERMINISM (sorted-ID + squared-dist),
    carrier-leave force-detonate, position-based fires-on-empty-coord, teardown clear); controls
    carry-exclusivity; protocol v5 + new-intent allowlist; save potatoes roundtrip + back-compat.
    e2e: spawn potato (override) → carry → plant → fuse → assert prims within R deleted.

NO CHANGES TO
  - Voltkin creature system (src/state/creatures/*, creatureRenderer, creatureVerlet
    behavior) — REUSE the pure force helpers only (import, no edit). §13.15 LOCKED.
  - Win condition / PHASE_1_WIN_SCORE / the ≥50 WIN gate (gameState WIN unchanged).
  - SEVER_BOND 'player' charge/auth semantics (§13.11), §VIII.4 topology rule, §13.16
    color-segregated bonding, §13.19 territory.
  - Spark physics, bonding, collision, the 6 canonical SparkTypes (§IV) — bomb is a
    SEPARATE entity, not a 7th SparkType.
  - transport.ts / sync.ts interpolation core / hostHandlers / clientHandlers wiring
    (beyond the protocol allowlist + version constant + snapshot fields).
  - Lobby / seating / gameMode roster.

RISK ASSESSMENT
  - R1 (HIGH) e2e blind spot — new constants/wire/render can pass tsc+vitest yet
    break Playwright (e2e not in tsconfig). MIT: deterministic test overrides
    (__TEST_BOMB_*, low __TEST_WIN_SCORE); RUN full Playwright gating + new bomb/
    hunter specs pre-ship; new real-WebRTC specs carry @quarantine-flaky.
  - R2 (HIGH) bomb over-punishment — 25% of bonds via §VIII.4 cascade can delete
    large structure chunks (swingy). MIT: BOMB_FRACTION + min-1 are tunable; deterministic
    lowest-BondId selection (predictable); ALTERNATIVE = disconnect-without-delete
    (new topology semantics, conflicts §VIII.4 — flagged for Council, NOT default).
    Reusing the LOCKED sever path is the low-code-risk choice; tune feel post-playtest.
  - R3 (HIGH) PROTOCOL_VERSION decision — wrong call either strands cross-version
    peers (over-bump) or risks silent desync (under-bump). MIT: explicit Council fork
    (§8); proposed 4→5 on the new-INTENT precedent; whichever way, protocol.test.ts
    asserts it + HELLO mismatch UX.
  - R4 (MED) hunter feel — too fast = unfair guaranteed catch; too slow = no threat.
    MIT: HUNTER_MAX_ACCEL/SPEED + CATCH_RADIUS tunable; Verlet momentum vs instant
    cursor naturally yields juke-ability; playtest-tune.
  - R5 (MED) benched-player net fidelity — client must hide the victim's avatar +
    (if local) lock input. MIT: benchedUntilTick serialized; renderer + isInputLocked
    both gate on tick comparison (self-heals even if a clear is missed).
  - R6 (MED) hunter target locked at spawn — if another player overtakes mid-hunt,
    hunter still chases the original. MIT: matches "the player who hit 75%"; re-target
    is a flagged tunable, not v1.
  - R7 (MED) anti-bloat — new modules must stay ≤500/≤300 LOC; world.ts dispatch grows.
    MIT: all logic in new bombLifecycle/hunters/* + renderers; world.ts gains only
    thin delegating cases.
  - R8 (MED) determinism — any Math.random/Date.now or RNG-order shift breaks replay/
    net-sync. MIT: bomb cadence uses the spawner's own rng in-sequence; all timing
    tick-based; selection deterministic; save.replay.test stays green.
  - R9 (LOW) Pixi render not vitest-testable. MIT: pure parts unit-tested; render via
    boot-smoke (preview MCP) + Playwright. preview_screenshot times out on WebGL → use
    preview_eval / Playwright accessors.
  - R10 (LOW) bomb+hunter+Voltkin coexistence. MIT: separate Maps, no shared state,
    no interaction; both replicate independently.

TESTING PLAN
  - Static: tsc -b --noEmit PASS; knip 0; vitest (1039 + new ≈ 1075+); vite build
    ≤550 KB charter (watch the +renderers).
  - save.replay.test.ts byte-equivalence stays green (determinism proof).
  - Self-driven boot-smoke (preview MCP, NOT screenshot on canvas): bomb spawns via
    test override → grab → bond count drops; force score to 37 → hunter spawns +
    chases → forced catch → avatar hidden + (local) input locked → returns at 30 s.
    Zero console errors.
  - Playwright: gating lane MUST pass (24/24 + new deterministic bomb/hunter specs);
    real-WebRTC presence/2-peer specs only in the @quarantine-flaky lane.
  - MCV (S150): verification[] file_contains/grep_count bindings on bombLifecycle
    exports, TRIGGER_BOMB, PROTOCOL_VERSION value, hunters Map, benchedUntilTick,
    hunterRenderer — every modified watch-root file gets a binding assertion.

TOOL TRIAGE
  Visual output needed?     No GENERATION — bomb + Pac-Man are Pixi-drawn vector
                            (pac-man = wedge/arc, no assets; bomb = orb). Verify via
                            preview MCP + Playwright, not Imagen/Veo.
  Research/external data?    No — design sourced from local code + blueprint/LOCKED
                            (State-Discovery done this session).
  Artifact delivery needed?  No — shipped via git/CI to spark-online.space.

DIFFERENTIAL_TEST_REQUIRED: false
  SCOPE is game src/, NOT ~/.claude/lib/ /hooks/ /router/ LLM-prompt/ OS-session-state
  schema. The net-protocol + NetSnapshot changes are GAME schema, covered by
  protocol parse tests + save-roundtrip + replay-equivalence + Playwright — not the
  S95/S96 OS-hot-path differential class. Behavioral-equivalence is still proven
  (replay byte-compare + e2e on the existing flow stays green).

HOT_PATH_REFACTOR: false
  Not an OS hot-path (lib/hooks/router/classifier/LLM/schema). It IS net-sensitive
  GAME code → CHECK is full Triumvirate + Rule22 + Playwright (already Full tier);
  the S103 OS-hot-path escalation rule does not apply.

ESTIMATED TOKENS: ~140–190K for the full 3-feature batch (~32 files + tests + Council
  + Playwright + Triumvirate CHECK ×3). LARGE — almost certainly a MULTI-SESSION effort.
  Execute P1 → CHECK → commit/push → P2 → … each priority checkpoints independently; at
  ORANGE, ship what's done + /handoff with the rest carried (re-approval per Rule 11).
  Suggested split: P1 (bomb) this session; P2 (hunter) + P3 (potato) next — user decides.
MODEL: Opus 4.8 (ALWAYS — S154)

CHECK PLAN: per-priority Triumvirate (RALPH:PATROL + GROK-ANALYST + GEMINI-AUDITOR,
  adversarial distinct lenses) + Rule22 runtime audit + Playwright. v1-friends-only
  threat scope stated in the Grok CHECK prompt (S70 #improve carry-forward).

───────────────────────────────────────────────────────────
COUNCIL R1 + R2 (quality gate) + R3 (targeted) SYNTHESIS — Battle Ledger
───────────────────────────────────────────────────────────
3-way: Claude(Architect) + Grok(Disruptor, grok-4.20-reasoning) + Gemini(Auditor, gemini-2.5-pro).

FORK RESOLUTIONS:
- FORK A (protocol version) → BUMP 4→5. UNANIMOUS (Claude+Grok+Gemini). New client→host
  TRIGGER_BOMB intent = the S52 precedent; HELLO lockstep then hard-rejects cross-version.
- FORK B (bomb damage) → R1 SPLIT (Grok: new disconnect-rule; Gemini+Claude: reuse §VIII.4).
  SYNTHESIS adopted Grok's CORE critique (lowest-BondId is meaningless + cascade-catastrophic =
  "sometimes you just lose") WITHOUT Gemini's flagged new-semantics risk: KEEP the single §VIII.4
  sever path, but PIN selection to a deterministic, all-topology, blast-capped LEAF-FIRST algorithm
  (SCOPE item 5). Gemini R2 + Grok R3 BOTH CONVERGED on the pinned algorithm.
- FORK C (hunter entity) → separate world.hunters Map. UNANIMOUS. Voltkin stays LOCKED; reuse its
  steering as a PURE imported fn.

ADOPTED (R1→R2, both reviewers):
- Bomb is NOT carried — pickup = INSTANT detonation (removes the whole carrier-state/disconnect class). [Gemini #3/#6]
- Bomb cadence deterministic per spark SPAWNED (sparksUntilBomb = 8 + rng()%8, spawner's seeded RNG
  in-sequence, reconstructed from SEED, covered by replay test); max-1 → skip+redraw on cadence-fire. [Grok+Gemini #1/#2]
- Two TRIGGER_BOMB same bomb/tick & two players cross 37 same tick → tiebreak lowest PlayerId. [Gemini #5/#12]
- CRITICAL host-crash fix: hunter target disconnect/eliminate → IMMEDIATE despawn + every avatarPos
  access guarded (Gemini's #1 single-highest risk). [Gemini #9]
- hunter once/game flag non-resettable; teardown despawns hunter on WIN/POSTGAME/TITLE. [Gemini #8/#11]
- "drop carried spark" = REUSE existing DROP_SPARK (not a new mechanic). [Gemini #13]

REJECTED w/ reason:
- Grok "bomb = carried cursed spark, trigger on deposit onto bonded structure" — changes the user's
  spec (picker's OWN bonds, trigger on PICKUP not deposit) + needs the locked 6-spark-types rule waived.
- Grok "hunter as decoration/component on Voltkin/player" — overcomplex vs the unanimous separate-Map.
- Grok client-hit-test "fatal desync" — DE-FANGED for a STATIONARY + host-authoritative (no client
  prediction) bomb: worst case is a harmless missed click at the 15s dissipate edge (host no-ops). Grok did not re-raise it.

SCORES: Gemini R1 Q2/C2/R1 → R2 Q4/C4/R4 (all R1 findings resolved). Quality gate: Gemini YES;
Grok NO at R2 (Fork B algo unpinned) → R3 CONVERGE after the algorithm was pinned.

PRIME-AUDIT (Rule 20) — delta vs. the raw draft:
1. Rubber-stamp check: Fork A bump independently verified (mixed-version shows divergent worlds → hard-
   reject correct, not just consensus). Fork C independently sound (Voltkin LOCKED+tested).
2. Convergent-blocker (NOT dropped): the Fork-B algorithm is now a pure fn of frozen pre-state +
   (cost ASC, BondId ASC); loops handled (cycle bond cost 0 → opened first); fraction-vs-cap defined
   (cap wins, empty kill-set → fizzle). Directly answers both reviewers' R2 block.
3. NEW (audit-found, folded into SCOPE 19d): teardown clears every player's benchedUntilTick — else a
   player starts the NEXT match still benched. + intent-before-dissipation ordering (19e) + pure
   componentSizeIfSevered dry-walk, no mutation (item 5).
4. Edge trace: bomb severs do NOT trigger the godly matcher (it scans BOND_FORMED, not severs);
   bomb vs active-Voltkin on the same bond → skip-if-missing. Solo-hunter-bench = a hard 30s timeout
   for the lone player — FLAGGED as the top feel risk + easiest per-mode disable (with bomb fraction/cap).
5. Materially better than R1: removed a host-crash class + the carried-bomb class + pinned a
   deterministic all-topology selection (vs random catastrophic) + resolved the version question. YES.
Confidence: HIGH.

───────────────────────────────────────────────────────────
P3 POTATO BOMB — Council R1 + PRIME-AUDIT (Scope-Amendment addendum)
───────────────────────────────────────────────────────────
FORKS: D → SEPARATE world.potatoes Map (UNANIMOUS — reversed the architect's shared-Map proposal;
avoids god-map bloat). F → radial-delete (UNANIMOUS) with REPLAY-determinism guards: squared-distance
(no sqrt/hypot) + SORTED-PrimitiveId iteration (both reviewers' #1 risk). E (fuse start) → ESCALATED TO
USER: Council UNANIMOUS from-PLACEMENT (skill-based; Grok "23s is comedy, ~8s once-armed more balanced");
architect honors the user's 23s-from-SPAWN (hot-potato) reading as primary — FEEL is the user's call.
ADOPTED (both reviewers): carrier-disconnect → FORCE-DETONATE at last carrier pos (no orphan state);
carry-slot potato/spark mutually exclusive + DROP_POTATO; two-grab tiebreak lowest PlayerId; position-
based area-denial; owner-agnostic AoE; no chain reaction; teardown clears potatoes + carriedPotatoId;
snapshot additive (potatoes[] + carriedPotatoId). REJECTED: Grok "potato in a pocket (doesn't block
spark)" — keeps carry-1; flagged as alt. Grok ~8s fuse — balance opinion; user said 23s → tunable.
PRIME-AUDIT: (1) reversed Fork D ON a sound argument (not rubber-stamp) — separate Map keeps P1 simple
+ under 500 LOC. (2) AoE determinism FULLY closed: host-only computes it + replicates via snapshot, so
client divergence is impossible BY CONSTRUCTION; the squared-dist + sorted-ID guards exist only for
host REPLAY equivalence (consistent with §10.5 same-browser float determinism). (3) Carried-potato +
from-spawn fuse CAN self-detonate in hand (AoE at carrier pos, clear carriedPotatoId) — that IS the
hot-potato risk Grok called feel-bad; from-placement removes it → reinforces the Fork-E user decision.
(4) Planted potato can't be re-picked-up (committed) — flagged enhancement. Materially build-ready vs the
R1 happy-path sketch (Gemini risk 1/5 → addressed). Confidence: HIGH.

OPEN FEEL-KNOBS for the user (tunable post-playtest, not blockers): BOMB_FRACTION (0.25) + BOMB_PRIM_CAP
(0.30); HUNTER speed/CATCH_RADIUS (juke-ability); whether solo gets the hunter at all (default: yes);
POTATO_FUSE (23s) + BLAST_RADIUS; **FORK E fuse-start (from-spawn [user] vs from-placement [Council]).**

═══════════════════════════════════════════════════════════
    GATE: Awaiting user GO (then write pdr_approved + deliberation_completed
    + unlock_source=user at top-level AND per-priority; execute P1 → ship → P2)
═══════════════════════════════════════════════════════════
