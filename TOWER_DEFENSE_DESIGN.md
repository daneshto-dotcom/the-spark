# SPARK Tower-Defense Feature — Final Design & Phased Roadmap

> **Status:** ready for owner approval. NOT a PDR — this is the design that a Phase-1a PDR will be cut from.
> **Generated:** 2026-06-24 (S100 design session) via a 14-agent design workflow (7 subsystem maps → draft design → 5 adversarial review lenses → synthesis). All review must-fixes folded in; residual risks in §7.
> **Source of vision:** owner message 2026-06-24 (pentagram spawner → pencil-drawn chewer swarm → "absolute priority" counterplay → defensive turrets → many minigame structures).
> **Next step:** owner resolves §8 Open Decisions → cut Phase-1a PDR (FULL tier) → build.

---

## 1. Executive Summary

Tower Defense lets a player build a specific shape (e.g. a pentagram of triangles) that **comes to life** — it earns victory points *and* spawns pencil-drawn creatures that slow-hop toward the nearest enemy structure and chew through its connectors, forcing every other player to prioritize destroying it. The one load-bearing insight: **this is not a new subsystem — it is a generalization of the Voltkin creature substrate that already ships.** The creature FSM, nearest-enemy-bond AI, Verlet locomotion, the `SEVER_BOND{cause:'creature'}` choke point, the host-authoritative additive-optional snapshot, and the recipe matcher all exist today; the genuinely net-new code is small and bounded (a persistent per-structure spawner record, an incremental "chew" counter, a persistence flag, and one new creature-targeting AI for the defensive turret). The dominant risk is **not** game logic — it is **sync/perf**: the wire is a full-world JSON snapshot at 10 Hz with no delta encoding, and *every existing roaming hazard caps at 1 active entity* (`BOMB_MAX_ACTIVE`/`POTATO_MAX_ACTIVE`/`RAINBOW_MAX_ACTIVE`/`SEAGULL_MAX_ACTIVE` all `=1`, Voltkin max-1), so a swarm is a 6–8× leap past anything the substrate has been load-tested against. The roadmap therefore front-loads an **empirical sync/perf gate** as a Phase-1 exit criterion, not a balance afterthought.

---

## 2. Architecture

### 2.1 The three new concepts — all generalizations

| Concept | Generalizes (real symbol) | Genuinely net-new part |
|---|---|---|
| **Spawner-structure** | the single-slot `pendingCreatureSpawn` one-shot poll (`main.ts:996`) → a recurring `Map<SpawnerId, CreatureSpawner>` | per-structure identity; tick-deterministic cadence state; shape re-validation |
| **Chewer creature** | `Creature` + Voltkin FSM (`creatureLifecycle.ts`) | persistence (no lifetime); incremental chew counter; enemy-ONLY targeting; FFA target-spread |
| **Laser turret** (Phase 2) | the "fire every N ticks" stateless-hash idiom (`seagullLifecycle.poopDropIntervalTicks` + `mix32`) | `findNearestEnemyCreature` (inverse of `findNearestBondTarget`); a "damage creature" lifecycle branch (creatures have no HP today) |

### 2.2 Reuse-vs-net-new split (explicit)

**Reused as-is or near-as-is:** `CreatureType`/`CREATURE_CONFIGS`/`getCreatureConfig` (the documented add-a-type seam); `creatureAI.findNearestBondTarget` (with one new `enemyOnly` parameter — see below); `creatureVerlet` arrive/repulse steering; `creatureAttack.applyCreatureAttack` → `SEVER_BOND{cause:'creature'}`; the additive-optional `creatures?`/`bombs?` snapshot pattern (`save.ts:112`); the recipe registry (`godlyRecipes/index.ts`); `scoring.computeComplexity` live recompute; `gameMode.addScore` discrete-score mutation (the `resolveSudoku` precedent).

**Genuinely net-new (budget it as real work, not "rename"):**
1. `CreatureSpawner` leaf type + `spawnerLifecycle.ts` (register/remove/teardown).
2. Persistent-FSM gate inside `creatureLifecycle.applyCreatureTick`.
3. The incremental chew loop (5 hits on one committed bond).
4. The per-spawner tick poll in `main.ts`.
5. De-hardcoding the `VOLTKIN_ATTACK_*` constants into per-config reads (a prerequisite refactor — the FSM is currently Voltkin-shaped, not generic).
6. The defensive turret + `findNearestEnemyCreature` (Phase 2).

> **Correction to one review claim:** the Scope-lens stated `runCreatureStress` "does not exist." It **does** — `save.replay.test.ts:176` defines it, spawns `creatureType:'voltkin'`, and ticks creatures. The real gap is narrower and still must-fix: it never exercises **chewers**, so it stays green even if all new chewer code is non-deterministic. We extend it (§3), we don't author it from scratch.

### 2.3 New world state (mirrors the `Map<Id,Entity> + nextId` convention)

Added to `worldTypes.ts:World` alongside `creatures`/`bombs`/`hunters`:

```ts
creatureSpawners: Map<SpawnerId, CreatureSpawner>;   // host-authoritative; additive-optional on wire
nextSpawnerId: number;
turrets: Map<TurretId, Turret>;                       // Phase 2
nextTurretId: number;
```

`CreatureSpawner` (new leaf type `src/state/spawners/spawner.ts`, to avoid an import cycle in `worldTypes`):

```ts
interface CreatureSpawner {
  readonly id: SpawnerId;
  readonly ownerPlayerId: PlayerId;
  /** Stable identity = lowest PrimitiveId in the matched component at ignition.
      Primitives have stable ids and persist in world.primitives; a structure
      (componentOf BFS) has no persistent object. Re-validated every poll. */
  readonly anchorPrimitiveId: PrimitiveId;
  readonly recipeId: GodlyId;
  nextSpawnTick: number;       // tick-deterministic cadence — NEVER wall-clock
  lastValidatedTick: number;   // re-validation throttle cache (§3.4)
  spawnedCount: number;
  readonly ignitedAtTick: number;
}
```

**Why an anchor `PrimitiveId`, not a component snapshot:** `structure.ts:componentOf` is on-demand BFS with no stored identity, and `placerColor` (ownership) is mutable via rainbow-shuffle. The anchor is re-validated each poll: (a) `world.primitives.has(anchorPrimitiveId)`, (b) the *current* component of that anchor still satisfies the recipe. Either failing removes the spawner — income and swarm stop instantly. **This is the counterplay.**

### 2.4 Creature changes — generalize, don't fork

Add a `'chewer'` `CreatureType`. Additive host-only fields on `Creature`, default-safe:

```ts
sourceSpawnerId: SpawnerId | null;  // null = Voltkin (lifetime-bound); SpawnerId = chewer (persistent)
chewProgress: number;               // accumulator vs the CURRENT committed bond
```

`CreatureConfig` gains `persistent: boolean`, `chewHits: number`, `hopSpeedMul: number`, plus the de-hardcoded attack-timing fields (`attackCadenceTicks`/`attackFireTick`/`attackChargeEngageTick`/`attackRangeSq`) that today live as module constants `VOLTKIN_ATTACK_*`. `makeVoltkinCreature` becomes a thin wrapper over a generalized `makeCreature(config, args)` so existing call sites and tests stay green.

**FSM changes (`creatureLifecycle.applyCreatureTick`) — the regression-critical part:**
- The auto-delete (`:135`) and forced-DESPAWNING (`:144`) steps are wrapped exactly as `if (!config.persistent) { …existing step verbatim… }`. The Voltkin (`persistent:false`) path is **textually unchanged** — proven by the existing `creatureLifecycle.test.ts` plus a new assertion that a Voltkin still auto-deletes at tick **1200** and enters DESPAWNING at **1140** (Voltkin lifetime is **20 s / 1200 ticks**, not 8 s — corrected from the draft).
- Chewers set `despawnAtTick` to an inert sentinel as defense-in-depth, but the `persistent` gate is the sole mechanism.
- **Chew combat loop (resolved against the real ATTACKING↔SEEKING bounce at `creatureLifecycle.ts:220-230`):** a chewer stays in **ATTACKING for the full `chewHits × CHEW_INTERVAL_TICKS`** rather than bouncing to SEEKING after each hit. It increments `chewProgress` once per `CHEW_INTERVAL_TICKS` and dispatches `CREATURE_ATTACK` (→ `SEVER_BOND`) only on the 5th hit. `findNearestBondTarget` is **not run at all while `chewProgress > 0`** — the creature commits to the bond. `chewProgress` resets to 0 only when `world.bonds.has(targetBondId)` is false (the bond vanished). This guarantees 5 chews actually reach severance instead of Sisyphean re-seeking.

**`applySpawnCreature` cap (the single biggest blocker, resolved precisely):** the current hard max-1-per-owner early-return (`creatureLifecycle.ts:75`) is **kept for Voltkin** but split by population. For a chewer spawn (`sourceSpawnerId != null`): no-op if `count(creatures where sourceSpawnerId === id) >= CHEWER_MAX_PER_SPAWNER` OR `world.creatures.size >= CHEWER_MAX_GLOBAL`. For a Voltkin spawn (`sourceSpawnerId == null`): keep max-1 by counting **only** creatures with `sourceSpawnerId == null` and the same owner. The two populations are counted **independently** so a chewer swarm never blocks a Voltkin summon and vice-versa.

**Chewer targeting is enemy-ONLY (resolved):** `findNearestBondTarget` today returns `bestEnemyId ?? bestOwnId` — the own-bond fallback is a *Voltkin* feature (it attacks the summoner's own structure when no enemy exists). For a chewer this would make it eat its own spawner. Fix: add `findNearestBondTarget(world, creature, enemyOnly: boolean)` (default `false` preserves Voltkin byte-for-byte); chewers pass `true` and idle/SEEK harmlessly with no enemy in range.

### 2.5 Ignition pipeline — new recipe, decoupled from the cinematic single-slot

A spawner-structure is a new recipe (`godlyRecipes/pentagram.ts`, modeled on `voltkin.ts`'s strict degree/cycle predicate). The `GodlyRecipe` type currently *requires* cinematic fields (`cinematicAsset`/`voiceAsset`/`characterSprite`/`cinematicMs`/…); a spawner recipe needs none, so **Phase 1b splits the recipe type** into a cinematic-bearing variant and a non-cinematic variant (or makes those fields optional with a discriminant).

**Critical decoupling (resolved — this is a blocker, not an Open Decision):**
- The matcher early-returns while `activeCinematicPlayerId !== null` (`godlyOrchestration.ts:72`) and fires **one** trigger per frame (`break` at `:113`). In a 4–6p FFA this means while *any* cinematic plays, *no other* player can ignite *any* recipe. Spawner ignition therefore dispatches **`REGISTER_SPAWNER` directly, bypassing `activeCinematicPlayerId`/`pendingCinematics` entirely.** An optional non-blocking "birth" VFX may play but must not occupy the cinematic slot.
- The `godlyFiredThisMatch` gate (`index.ts:50`) is **per-type-per-match** — it would let only the *first* player ever build a pentagram, and never rebuild after a raid. This is **broken for multiplayer**, not merely "less fun." Resolution: spawner recipes are **excluded from `godlyFiredThisMatch`** and instead gated per-`(playerId, anchorPrimitiveId)` against the live `world.creatureSpawners` map (you can't double-register an anchor that's already a spawner; you *can* rebuild after it's destroyed). Multi-anchor-per-frame tie-break = lowest `anchorPrimitiveId`. A test asserts: two players each build a pentagram → two spawners; destroy one → rebuild succeeds.

### 2.6 The recurring emit poll (host-only, tick-deterministic)

Modeled on the **bomb-dissipate tick poll** and the `pendingCreatureSpawn` one-shot poll in `main.ts` — **NOT** the wall-clock `Spawner` class in `game/spawner.ts` (which spawns free sparks via `dtSec` + 5 dedicated RNG streams and would reintroduce the S25 setTimeout replay-break class of bug). **`game/spawner.ts` and the `physicsLoop` out-array dispatch path are off-limits for spawner cadence, and no 6th RNG stream is added.**

```
for (const [id, sp] of [...world.creatureSpawners]) {       // PLAYING && !isClient
  if (world.tick - sp.lastValidatedTick >= REVALIDATE_INTERVAL_TICKS) {  // throttle, §3.4
    sp.lastValidatedTick = world.tick;
    if (!world.primitives.has(sp.anchorPrimitiveId) || !recipeStillSatisfied(world, sp)) {
      dispatch(world, { type:'REMOVE_SPAWNER', spawnerId:id }); continue;  // income+swarm STOP
    }
  }
  if (world.tick >= sp.nextSpawnTick && underCaps(world, sp)) {
    dispatch(world, { type:'SPAWN_CREATURE', creatureType:'chewer', ownerPlayerId: sp.ownerPlayerId,
                      pos: anchorPos, sourceSpawnerId: id });
    sp.nextSpawnTick += SPAWN_INTERVAL_TICKS;
  }
}
```

The chewer fan-out reuses the existing `main.ts` creature loop unchanged. **Target-stickiness** is scoped to chewers explicitly (`sourceSpawnerId != null && chewProgress > 0`) so Voltkin's every-tick re-selection is byte-identical.

### 2.7 Scoring integration (zero new sync path)

Passive income: a tiny term in `scoring.computeComplexity` (`+ spawnerCountForPlayer × SPAWNER_INCOME_COMPLEXITY`). Because complexity is recomputed from **live state every tick**, a destroyed spawner's bonus vanishes instantly — "raid it to stop its income" works for free. The spawner-kill reward uses `gameMode.addScore` (the `resolveSudoku` discrete-mutation precedent). **No parallel accrual loop** (the player-1-consistency bug came from a split accrual path).

### 2.8 Teardown parity — all FOUR sites (verified, not two)

A new `teardownSpawners(world)` (clears `creatureSpawners` + `turrets`, resets `nextSpawnerId`/`nextTurretId` to 0) must be wired into **all four** existing teardown sites, mirroring `teardownHunters`/`teardownSeagulls`:
1. `world.ts:376-386` (WIN_TRIGGER)
2. `gameState.ts:119-122` (START_GAME + RETURN_TO_TITLE)
3. `gameMode.ts:284-289` (title-return)
4. `godlyActions.ts:70` (applyGodlyAbort)

Plus the `save.ts` clear+rehydrate+advance-`nextId` pattern (see §3.5).

---

## 3. Determinism & Sync Plan (the make-or-break constraint — the resolved safe path)

### 3.1 How the sim syncs today (verified)
Host runs physics + creature fan-out; **clients never simulate** (`isClient = isNetworked && !isHost`). Host emits a **full-world** `NetSnapshot` at **10 Hz** (`SNAPSHOT_INTERVAL_TICKS = 6`), raw `JSON.stringify`, **no delta encoding**, rebroadcast 2–3× across Trystero strategies. The real payload is **~3 KB** (primitives + bonds, per `save.ts:392`) — **not** the "~50 B" in the stale `transport.ts:16` migration comment. Clients do a full `applySnapshotCore` (clear + rebuild every Map) per arrival and render ~150 ms behind via `interpolatePositions`. Determinism (`rng.ts` mulberry32) is host-internal; `rngSeed` is stripped from the wire. The replay guard runs two identically-seeded worlds and asserts byte-identical `JSON.stringify(snapshot)`.

### 3.2 Determinism rules the TD code MUST obey
1. **All sim host-only** — cadence, chew accumulation, turret fire, AI run only in `!isClient` blocks.
2. **Tick-based, never wall-clock** — `SPAWN_INTERVAL_TICKS = 900`, `CHEW_INTERVAL_TICKS = 60`, `TURRET_FIRE_INTERVAL_TICKS = 600`; `world.tick >= nextSpawnTick` with `+=` accumulation.
3. **No `Math.random` in reducers** — any jitter uses the stateless `mix32` hash (`seagullLifecycle.ts:67/86`) keyed on serialized inputs. This consumes **no** RNG stream, so existing spark/bomb/potato/rainbow/seagull byte sequences stay identical. (Justification is the no-stream property, **not** host-migration — see §3.6.)
4. **Deterministic tie-breaks** — every "nearest" tie-breaks on lowest `Id` (the `findNearestBondTarget` pattern). V8 Map order is insertion order.
5. **Sever only via `SEVER_BOND{cause:'creature'}`** — the chew defers the dispatch; it never inlines `bonds.delete`.
6. **Extend the replay stress (MANDATORY Phase-1 acceptance gate):** extend `runCreatureStress` (or add `runChewerStress`) to spawn chewers, accumulate `chewProgress`, sever via the chew path, and register/re-validate/teardown a spawner — asserting byte-identical snapshots across two seeded runs. **Without this the replay test gives false confidence on exactly the new code.**

### 3.3 Bandwidth — re-baselined against the real ~3 KB, with an enforced budget

The draft's "576 B, within an order of magnitude of the 50 B budget" arithmetic is **deleted** — it compared against a fictional ceiling and ignored the ~3 KB prim/bond base. Resolved approach:
- **Hard caps, lowered for Phase 1:** `CHEWER_MAX_GLOBAL = 8` (not 14), `CHEWER_MAX_PER_SPAWNER = 2` (not 3). Every existing roaming hazard caps at **1**; 8 is already an 8× leap. Raise only after a measured playtest.
- **Render-trimmed wire shape is MANDATORY** (not optional): emit only `id/type/ownerPlayerId/pos/state/ticksInState/killCount` per `SerializedCreature` (~36 B per the existing comment; treat realistic JSON as 60–90 B). `chewProgress`/`targetBondId`/`sourceSpawnerId` are **host-only, never on the wire.** At 8 creatures the marginal cost is ~0.5–0.7 KB on top of ~3 KB (~+20%) × 10 Hz × 2–3 strategies.
- **Spawner wire shape is tiny:** `id/ownerPlayerId/anchorPrimitiveId/recipeId`. `nextSpawnTick`/`lastValidatedTick`/`spawnedCount` stay host-only.
- **Additive-optional, emit-only-when-non-empty** (`creatures?` precedent) → pre-feature saves stay byte-identical, **no `schemaVersion` bump**.
- **`PROTOCOL_VERSION` bump 9 → 10** (verified current = `9` at `protocol.ts:65`). Required: a stale peer can't render an income-affecting + structure-destroying system.
- **Enforced byte-budget test (MUST-FIX):** instrument `netSnapshot()`, serialize a worst-case world (8 chewers + spawners + max prims/bonds), and assert `JSON.stringify(...).length < N` (conservative single-SCTP-message ceiling ~16 KB). The "50 B/5 KB" comment is treated as deleted; this test is the real ceiling.

### 3.4 Host AI + re-validation cost (both budgeted; the draft omitted the second)
- **AI targeting** is O(SEEKING-creatures × bonds), with `isEnemyBond` doing 2× `primitives.get` + 1× `players.get` per bond. **Mitigations made MANDATORY in Phase 1** (not "if hot"): (1) throttle SEEKING re-selection to every K ticks, deterministic via `world.tick % K` phase-spread by `creature.id`; (2) hoist the per-creature owner/ownerColor lookup out of the per-bond inner loop; (3) wire the existing `physics/spatial.ts:SpatialGrid` for bond-midpoint queries. Target-stickiness alone does **not** cover the long SEEKING-in-transit approach.
- **Re-validation cost** (the draft missed this): `recipeStillSatisfied` re-runs a DFS predicate per-spawner. Throttled to every `REVALIDATE_INTERVAL_TICKS` via the `lastValidatedTick` cache; budgeted explicitly as O(N_spawners × component / REVALIDATE_INTERVAL).
- **Verlet steering** early-returns `ZERO_ACCEL` when `state !== SEEKING` (`creatureVerlet.ts:113`) — CHEWING chewers are free; the cost is paid only during approach. `hopSpeedMul` must thread through `computeSteeringAccel` (currently a module-const `CREATURE_MAX_ACCEL`).
- **A dev perf HUD** (creature count, fan-out ms/tick, snapshot bytes) ships before any cap is raised.

### 3.5 Host save/load (a concrete bug the draft would have shipped — resolved)
`deserializeCreature` (`save.ts:1154`) reconstructs `despawnAtTick=0`/`targetBondId=null`. A persistent chewer rehydrated through the *host save path* (not just client mirror) would get `despawnAtTick=0` → **instant auto-delete next tick**, and lose `chewProgress`. Resolution: the **host save path round-trips** `despawnAtTick`/`chewProgress`/`sourceSpawnerId`/`targetBondId` (the `SerializedBomb.dissipateAtTick` precedent at `save.ts:413`), while the **wire (`netSnapshot`) still strips them.** On rehydrate, advance `nextSpawnerId`/`nextCreatureId` past max-loaded-id (`save.ts:690-696` precedent) so a save-load doesn't mint colliding ids. Add `creatureSpawners?`/`turrets?` nullish guards mirroring `save.ts:690`. Tests: a live chewer **mid-chew** survives host save/load; an old save with no TD fields loads as empty.

### 3.6 Host-migration (downgraded to a non-concern, per verification)
`hostIdentity.ts:20`/`transport.ts` state host-page death = world death; there is **no client-promotes-to-host** path in-game (`quickmatch.ts` self-promote is lobby-only, pre-game). The draft's "§2.6 migration-safe by construction" reasoning solved a non-existent problem. The `mix32`-over-seeded-stream choice is still correct — justified on the no-RNG-stream property (rule 3 above), not migration.

### 3.7 Interpolation (accept-and-verify for Phase 1)
`interpolatePositions` lerps creatures only when `state==='SEEKING'` in *both* bracketing snapshots; CHEWING chewers render at raw 10 Hz. Phase 1 ships option (a) accept-it, but **verifies in a real 1v1 playtest** (the readable hop between connectors is exactly when stepping could show). If judder appears, extend the lerp gate to a "hopping" sub-state — which requires a new wire state value (budget it then, not now). **Do not** put `chewProgress` on the wire for a progress bar; derive any bar from `state==='ATTACKING'` + `ticksInState`.

---

## 4. Balance & Anti-Grief Design

### 4.1 Concrete tunables (`constants.ts`, near the hazard block)

| Constant | Phase-1 value | Rationale |
|---|---|---|
| `SPAWN_INTERVAL_TICKS` | `900` (15 s) | user's number |
| `CHEW_HITS` | `5` | user's number |
| `CHEW_INTERVAL_TICKS` | `60` (1 s) | 5 × 1 s = 5 s/connector (user's number) |
| `CHEWER_HOP_SPEED_MUL` | `~0.6` | slower than Voltkin (~208 px/s) → readable, counterable |
| `CHEWER_MAX_PER_SPAWNER` | **`2`** (start; #1 balance dial) | lowered from 3 — destruction rate scales with this |
| `CHEWER_MAX_GLOBAL` | **`8`** (start) | lowered from 14 — perf/wire ceiling; raise only after measurement |
| `CHEWER_MAX_PER_VICTIM` | **`3`** | a single swarm can't fully strip one player |
| `REVALIDATE_INTERVAL_TICKS` | `30` (0.5 s) | re-validation throttle |
| `SPAWNER_INCOME_COMPLEXITY` | `~0` to `1.0` (near-zero) | at 0.05 score/s/complexity, +1 ≈ 1/12600 of WIN — cosmetic |
| `SPAWNER_KILL_REWARD` | small one-shot VP | raid incentive (split — see §4.3) |
| `TURRET_FIRE_INTERVAL_TICKS` | `600` (10 s) | user's number (Phase 2) |
| `TURRET_RANGE` | `~250 px` | longer than chew range to intercept (Phase 2) |

### 4.2 VP integrates without touching the protected 630 anchor
`PHASE_1_WIN_SCORE = 630` is version-historied and protected; prior sessions tune match length by *raising* WIN, never by income. The real balance threat is **not** the passive bonus (mathematically negligible at 0.05/complexity/s — verified) — it is **destruction throughput**: chewers cut the *victim's* live complexity, slashing their score/s while the spawner owner accrues. This is the degenerate "win by suppressing every rival's income" path. Bounded by `CHEWER_MAX_PER_SPAWNER=2` + `CHEWER_MAX_PER_VICTIM=3`. A playtest guardrail explicitly checks that a spawner owner **cannot** reach 630 purely by income-suppression. `HUNTER_TRIGGER_SCORE` (0.75×WIN) auto-derives from 630 and is left untouched; we verify the hunter still triggers sensibly after the near-zero income bump.

### 4.3 Anti-grief guardrails (resolved)
- **Phase 1 ships a creature kill-path** (resolved blocker): the draft deferred all creature counterplay to the Phase-2 turret, leaving chewers *untargetable* in Phase 1 (every existing primitive targets bonds/positions, never creatures). Fix: **extend `applyPotatoDetonate` to also `DESPAWN_CREATURE` chewers within `POTATO_BLAST_RADIUS`** (owner-agnostic, sorted-`CreatureId` deterministic, mirroring the existing sorted prim-deletion loop). Phase 1 thus has a real "blow up the swarm" answer with no new entity.
- **FFA target-spread** (resolved): chewers do **not** inherit Voltkin's pure-nearest selection (which focus-fires the one geometrically-closest neighbor and enables kingmaking). They hash `(creatureId, sourceSpawnerId)` via `mix32` to bias toward *different* enemy players, and/or weight toward the current score leader (read `world.scoreByPlayer`) to reinforce the catch-up dynamic the hunter already encodes.
- **Bot counterplay** (resolved — VS-BOTS is the primary mode): `botBrain` gains a SEVER-priority that targets the nearest enemy spawner-anchor's connectors over generic bonds, plus a chewer-avoid. "Bots respond to spawners" is a Phase-1 test line item. Without it, VS-BOTS balance tests give a false "spawners are fine" reading.
- **First-mover trap mitigation:** `SPAWNER_KILL_REWARD` is **split** across all players who landed a sever (not winner-take-all), and a brief post-ignition grace (~10 s where the structure can't be reduced below the recipe) lets the builder get one wave out. Tied to Open Decision §8.3: the spawner's cost should be its raid-vulnerability, not also a charge tax.
- **Territory interaction** (resolved gap): `isInsideEnemyTerritory` (`territory.ts:139`) hard-blocks enemy placement within `R = 60 + 12·log₂(complexity+1)`, so a player can't forward-build a turret in the chewer ingress zone. **Decision: defensive structures (turrets) are exempt from the enemy-territory block** (a place-anywhere defensive class). We confirm a raider can still reach charge-sever range of an 8-prim spawner from outside its bubble.

### 4.4 Counterplay loop
```
Build spawner-structure → pulses VP + emits a chewer every 15s
   │                              │
 enemies see a high-value     chewers slow-hop to nearest enemy connector (FFA target-spread),
 target                       chew 5×/5s, destroy it, move to next
   ▼                              ▼
 respond with ANY mechanic:    defend: POTATO the swarm (Phase 1) · build a TURRET
  · raid + charge-sever          (lasers chewers, Phase 2) · build your OWN spawner (base race)
  · potato the swarm/anchor      
  · summon a Voltkin       
  · build a turret (P2)    
   │
   ▼
 reduce below the recipe shape → swarm + income STOP instantly; raiders split SPAWNER_KILL_REWARD
```

---

## 5. Art/VFX Plan (original-art-compliant; OFF the critical path)

**Originality rule (project memory):** no literal StarCraft zerg / franchise copy (a Totoro look-alike was reworked in S95). "Zerg" is a *feel cue* only — the chewer is an **original pencil-drawn design** (small, scuttling, many-legged, ink-and-graphite).

**Placeholder-first path (art never blocks the loop):**
1. **Phase 1 ships a procedural-vector chewer** — clone-and-**share** `hunterRenderer.ts`/`seagullRenderer.ts` scaffolding (one shared `Graphics`, `clear()` + redraw per frame, faces target via `atan2`, cosmetic gait via `performance.now()`). **Zero art assets.** Do not duplicate the Graphics — share it (bundle headroom, §6).
2. **Chew VFX:** a new `CHEW_BITE` effect — clone `drawBombExplode` (small ring) at the bond midpoint + a graphite-dust burst. **Kept host-local-only** (like `BOND_COMMIT`/`SEVER_ERASE` at `save.ts:1085`) so it adds **no** wire/protocol surface. (If it must be client-visible in 1v1, the `serializeEffect`/`deserializeEffect` + protocol cost is budgeted explicitly then.)
3. **Laser VFX (Phase 2):** reuse `drawArcFlash` with `ARC_JITTER_AMP_PX` low (straight beam), recolored → instant turret laser; `drawBombExplode` for impact.
4. **Spawner "alive" aura:** clone `bombRenderer.ts`'s pulsing ring over the anchor component, or reuse `structureRenderer`'s `lerpTint` for a breathing tint.
5. **Pencil polish (Phase 4 only):** highest-fidelity/lowest-engine path = the NONET video route (`sudokuOverlay.makeVideoSprite` + `assets-source/nonet-video/make_mask.py`) — **but video animates on its own clock, not `world.tick`**, so it's fine for ambient hop/idle, wrong for combat-timed frames. Combat frames use the **atlas path** (`build-voltkin-atlas.py` → `currentAnimCell` is pure of `(state, ticksInState)`, replay-safe). **Imagen reference-conditioning is non-functional in this auth setup** (per `SLICE_SPEC.md`) — consistency comes from Veo-from-one-seed, never repeated Imagen text-gen.
6. **Render-layer generalization (the one real render refactor, Phase 4):** `creatureRenderer.ts`/`voltkinFrames.ts` hardwire Voltkin atlas URLs. Per-`CreatureType` lookup (`ANIM_ATLAS_BY_TYPE[type]`) threading `creature.type` through `sync()`. Easy to under-scope — budgeted explicitly in Phase 4.

---

## 6. Phased Roadmap

> **Sequencing principle:** front-load the highest-risk *unknown* (sync/determinism/perf), and isolate the highest-risk *rework* (godly decoupling) from the genuinely-new sim state. Phase 1 is split so the loop ships behind a debug trigger with the perf gate, before touching the matcher.
>
> **Bundle budget (the draft never mentioned this):** S99 headroom is **2.8 KiB under the 560 KiB charter**. Phase 1 realistically adds 8–20 KiB. Plan a **Council-gated charter raise (560 → ~580)** or offsetting trims; reuse hunter/seagull renderer scaffolding; **measure bundle delta per phase, hard-fail if over charter.**

### Phase 1a — Sim loop behind a debug trigger — **FULL tier**
**Objective:** spawner record + chewer creature + 5-hit chew + shape re-validation + caps + replay determinism, driven by a **dev keypress / direct `REGISTER_SPAWNER` dispatch** — **zero godly-recipe changes.** Solo.
**Files/symbols:** `worldTypes.ts` (`creatureSpawners`+`nextSpawnerId`, `sourceSpawnerId`/`chewProgress` on `Creature`); new `state/spawners/spawner.ts` + `spawnerLifecycle.ts`; `voltkin-config.ts` (`'chewer'` config, de-hardcoded attack constants, `makeCreature(config,args)` + `makeVoltkinCreature` wrapper); `creatureLifecycle.ts` (`!config.persistent` gate, split caps, CHEWING loop); `creatureAttack.ts` (defer `SEVER_BOND` to 5th hit); `creatureAI.ts` (`enemyOnly` param); `main.ts` (spawner poll + throttled re-validation, scoped target-stickiness); `world.ts` (new actions + dispatch + teardown wiring × 4 sites); `save.ts` (host round-trip of persistent fields + `creatureSpawners?` + nextId advance); `net/protocol.ts` (TD actions in `KNOWN_GAME_ACTION_TYPES_RECORD` **only, NOT** `CLIENT_INTENT_TYPES`; `PROTOCOL_VERSION` 9→10); `potatoLifecycle.ts` (despawn chewers in blast); new `chewerRenderer.ts` (vector); `CHEW_BITE` host-local effect; `scoring.computeComplexity` spawner term.
**Test strategy (acceptance gates, not bullets):** unit tests — recipe-independent spawner register/remove, chew accumulation reaches 5 on a stationary bond, cap enforcement (per-spawner/global/per-victim), independent Voltkin-vs-chewer counting, re-validation teardown, enemy-only targeting (chewer with no enemy idles). **Extend `runCreatureStress`/add `runChewerStress`** for byte-identical replay across two seeded runs (HARD GATE). `creatureLifecycle.test.ts` Voltkin regression (auto-delete @1200, DESPAWN @1140). **Host save/load mid-chew test.** **Enforced snapshot byte-budget test.** **Protocol test:** TD actions absent from `CLIENT_INTENT_TYPES`. **Dev perf HUD** + a 1-laptop frame-time read at `CHEWER_MAX_GLOBAL`.
**PDR tier:** FULL. **Key risk:** regressing the locked Voltkin replay byte-equivalence; the cap relaxation regressing existing tests. **Exit criterion (front-loaded sync/perf gate):** measured snapshot bytes + frame time at the cap pass budget, or the cap comes down / delta-encoding becomes a prerequisite.

### Phase 1b — Real pentagram recipe + godly decoupling — **FULL tier**
**Objective:** wire the pentagram recipe into the matcher; decouple ignition from the cinematic single-slot; split `GodlyRecipe` for non-cinematic recipes; per-`(playerId, anchor)` gate.
**Files/symbols:** `godlyRecipes/pentagram.ts` (DFS/cycle predicate); `godlyRecipes/types.ts` (recipe-type split / optional cinematic fields); `godlyRecipes/index.ts` (exclude spawner recipes from `godlyFiredThisMatch`); `godlyOrchestration.ts` (dispatch `REGISTER_SPAWNER` without `activeCinematicPlayerId`); `GodlyId` widen + `registerRecipe`.
**Test strategy:** predicate unit tests; **two players each build a pentagram → two spawners; destroy one → rebuild succeeds**; matcher does not block other ignitions during a (non-spawner) cinematic.
**PDR tier:** FULL. **Key risk:** the matcher decoupling is structural to the godly subsystem; multi-anchor-per-frame determinism.

### Phase 2 — Defensive laser turret — **Standard tier**
**Objective:** a turret recipe that fires at the nearest enemy creature every 10 s.
**Files/symbols:** `turrets` Map + `Turret`; `findNearestEnemyCreature` (inverse of `findNearestBondTarget`, lowest-id tie-break); `TURRET_FIRE` → `DESPAWN_CREATURE` (v1 one-shot kill) + `LASER_BEAM` effect (reuse `drawArcFlash` low-jitter); `turretRenderer.ts`; turret recipe; turrets exempt from `isInsideEnemyTerritory`; save/teardown/protocol wiring.
**Test:** targeting determinism, fire cadence, replay stress, byte budget at turret+chewer mix.
**PDR tier:** Standard. **Key risk:** first creature-targeting-creature AI; "damage creature" is a new lifecycle branch.

### Phase 3 — VP/balance tuning + reward polish — **Standard tier**
**Objective:** tune caps, `SPAWNER_INCOME_COMPLEXITY` (keep near-zero), split kill-reward, grace window; **raise `CHEWER_MAX_GLOBAL` above 8 only if the measured perf gate allows**; verify hunter-trigger timing unaffected.
**Files:** `constants.ts`, `scoring.ts`, `gameMode.ts`; intentional `constants.lock.test.ts`/`scoring.test.ts` updates (never silent).
**PDR tier:** Standard. **Key risk:** income-suppression win path; perf when caps rise.

### Phase 4 — Pencil-drawn art — **Standard tier (asset-heavy)**
**Objective:** replace vector chewer with original pencil atlas; spawner/turret art.
**Files:** `build-<creature>-atlas.py` clone (or NONET video for ambient); **generalize `creatureRenderer`/`voltkinFrames` to per-type atlas lookup** (budget explicitly).
**PDR tier:** Standard. **Key risk:** the render-hardwiring refactor (under-scope trap); Imagen non-functional → Veo-from-one-seed; original-art rule.

### Phase 5 — More structure types — **Standard each (often near-Micro)**
Additional recipes (different shapes → different chewer behaviors / defensive structures). The Phase-1/2 substrate makes each subsequent type an additive recipe + config entry.

---

## 7. Risk Register (residual, post-resolution)

| # | Risk | Sev | Status / Mitigation |
|---|---|---|---|
| R1 | Swarm blows the (uncapped) full-world JSON wire; the "50 B/5 KB" budget is a stale comment with no chunking/MTU guard | **CRITICAL** | Phase-1 caps lowered to 8/2; render-trimmed wire mandatory; **enforced byte-budget test** (<~16 KB); measured-bytes exit gate. If exceeded → caps down or delta-encoding becomes prerequisite. |
| R2 | New chewer reducers non-deterministic but existing replay test stays green (it only ticks voltkin) | **CRITICAL** | Extend `runCreatureStress`/add `runChewerStress` to exercise chew + spawner register/teardown; byte-identical assertion = HARD Phase-1 gate. |
| R3 | Persistent chewer save/loads with `despawnAtTick=0` → instant delete + lost chew progress | **CRITICAL** | Host save path round-trips `despawnAtTick`/`chewProgress`/`sourceSpawnerId`/`targetBondId` (SerializedBomb precedent); wire still strips them; mid-chew save/load test. |
| R4 | Conditional auto-delete silently regresses the locked 20 s Voltkin lifecycle | **CRITICAL** | Gate written as `if (!config.persistent){ …verbatim… }`; Voltkin path textually unchanged; assert auto-delete @1200 / DESPAWN @1140. |
| R5 | Per-type `godlyFiredThisMatch` makes spawners non-rebuildable + one-per-type-per-match across all players (broken in FFA) | **CRITICAL** | Exclude spawner recipes from the gate; per-`(playerId, anchor)` against live `creatureSpawners`; lowest-anchor tie-break; two-player + rebuild test (Phase 1b). |
| R6 | Phase-1-only build has chewers with **no kill path** (untargetable) → one-sided beatdown | **CRITICAL** | Extend `applyPotatoDetonate` to despawn chewers in blast radius (owner-agnostic, sorted-id). Ships in Phase 1a. |
| R7 | Host AI O(creatures×bonds) + per-spawner re-validation become the hot path at swarm scale | **MAJOR** | Mandatory K-tick re-selection throttle (phase-spread by id) + owner-lookup hoist + SpatialGrid; re-validation throttled via `lastValidatedTick`; perf HUD + frame-time gate. |
| R8 | Chewer eats its **own** structure via `findNearestBondTarget`'s own-bond fallback | **MAJOR** | `enemyOnly` parameter (default false preserves Voltkin); chewer with no enemy idles; test. |
| R9 | 5-hit chew never completes (ATTACKING↔SEEKING bounce resets target/progress) | **MAJOR** | Chewer stays in ATTACKING the full `chewHits×interval`; no re-seek while `chewProgress>0`; reset only when bond vanishes; severance-at-5 test. |
| R10 | `applySpawnCreature` cap relaxation makes a chewer swarm block a Voltkin summon (or vice-versa) | **MAJOR** | Count the two populations (`sourceSpawnerId` null vs not) independently; cross-summon test. |
| R11 | Bots ignore spawners → false "spawners are fine" in VS-BOTS (primary mode) | **MAJOR** | `botBrain` spawner-sever priority + chewer-avoid; Phase-1 test line item. |
| R12 | Territory hard-block makes forward turrets unplaceable in the ingress zone | **MAJOR** | Turrets exempt from `isInsideEnemyTerritory`; confirm raider reaches charge-sever range from outside an 8-prim bubble. |
| R13 | Income-suppression (chewers cutting victim complexity) is the real win-trivialization path | **MAJOR** | `CHEWER_MAX_PER_SPAWNER=2` + `CHEWER_MAX_PER_VICTIM=3`; playtest guardrail that a spawner owner can't win purely by suppression; keep `SPAWNER_INCOME_COMPLEXITY` near-zero. |
| R14 | Bundle charter: 2.8 KiB headroom vs 8–20 KiB feature | **MAJOR** | Council-gated charter raise (560→~580) or trims; share renderer scaffolding; per-phase bundle-delta hard-fail. |
| R15 | Client GC: per-frame Map alloc in `interpolatePositions` + 10 Hz full clear/rebuild scale with swarm | **MAJOR** | Cache prev/curr creature Maps per snapshot-pair; verify 60 Hz client render at the cap on a mid browser. |
| R16 | FSM is Voltkin-shaped; de-hardcoding `VOLTKIN_ATTACK_*` + `CREATURE_MAX_ACCEL` is real work mis-labeled "rename" | **MINOR** | Prerequisite refactor into per-config reads, gated by byte-identical Voltkin regression. |
| R17 | Interpolation stepping visible on slow chewer hops | **MINOR** | Ship accept-it; verify in real 1v1; if judder, add a "hopping" wire state (budget then). |
| R18 | Old-save load TypeError on missing TD fields | **MINOR** | `save.ts:690`-style nullish guards + nextId max-advance; old-save load regression test. |

---

## 8. Open Decisions for the Owner (resolve before Phase 1 locks)

1. **Caps for Phase 1.** Ship at `CHEWER_MAX_GLOBAL=8`, `CHEWER_MAX_PER_SPAWNER=2`, `CHEWER_MAX_PER_VICTIM=3`, and raise only after a measured playtest? **Recommended default: yes** (the review's perf lens is right that 14/3 is an untested 7–14× leap).
2. **Spawner lifetime.** Persist forever while the shape survives (matches "destroy it to stop it"), or add decay? **Recommended default: persist-while-shape-survives.**
3. **Does building a spawner cost the owner anything** (charge tax / income penalty), or is the only cost its raid-vulnerability + the grace-window? **Recommended default: raid-vulnerability only** (a charge tax double-taxes it into non-viability).
4. **Kill reward shape.** Split `SPAWNER_KILL_REWARD` across all severers + ~10 s post-ignition grace, or winner-take-all? **Recommended default: split + grace** (avoids the first-mover-trap and kingmaking).
5. **FFA chewer targeting.** Pure target-spread (hash across enemies), or also weight toward the score leader? **Recommended default: spread + leader-weight** (reinforces the existing catch-up/hunter dynamic).
6. **Turret kill model (Phase 2).** One-shot kill (simple), or creature-HP requiring multiple hits (richer, more code + a new wire field)? **Recommended default: one-shot for v1**, HP later.

---

### Key file references (absolute paths, verified this session)
- `src/state/creatures/{creature.ts, creatureLifecycle.ts (gate @135/@144, bounce @220-230), creatureAttack.ts, creatureAI.ts (own-bond fallback @104-106, isEnemyBond @73-84), voltkin-config.ts (lifetimeTicks:1200 @122)}`
- `src/state/seagulls/seagullLifecycle.ts` (mix32 @67, poopDropIntervalTicks @86 — the stateless-hash template)
- `src/state/godlyOrchestration.ts` (single-slot @72, single-break @113), `godlyRecipes/index.ts` (per-type gate @50), `godlyActions.ts` (teardown @70)
- `src/state/{worldTypes.ts, world.ts (teardown @376-386), gameState.ts (@119-122), gameMode.ts (@284-289), save.ts (~3 KB note @392, creature shape @380, guards @690, deserialize @1154), scoring.ts, potatoLifecycle.ts (applyPotatoDetonate @151)}`
- `src/state/territory.ts` (isInsideEnemyTerritory @139, computeTerritorialRadius @101)
- `src/main.ts` (pendingCreatureSpawn poll @996, isClient @916), `src/game/spawner.ts` (wall-clock — DO NOT clone for cadence)
- `src/net/protocol.ts` (PROTOCOL_VERSION=9 @65 → bump to 10), `src/state/save.replay.test.ts` (runStress @50, runCreatureStress @176 — exists, extend for chewers)
- `src/constants.ts` (PHASE_1_WIN_SCORE=630 @294, SCORE_INCOME_PER_COMPLEXITY_PER_SEC=0.05 @259, all hazard MAX_ACTIVE=1)
