/**
 * SPARK — Per-creature-type config table (S34 P2-20).
 *
 * **Audit lineage:** Gemini Council Q2 carry-forward across S26+S27+S28
 * (deferred while only Voltkin existed); S30 audit P2-20; S34 P2 batch shipped.
 *
 * **Purpose:** consolidate the 7 hardcoded per-creature constants that
 * previously lived as top-level exports in `creature.ts` into a single
 * canonical config record. Prerequisite for Anvil (S35+) — adding a second
 * creature type becomes `+1 CreatureConfig` entry + `+1 attack handler
 * dispatch` instead of `+N file edits per constant`.
 *
 * **Back-compat:** `creature.ts` continues to export the original constant
 * names (`VOLTKIN_LIFETIME_TICKS`, `VOLTKIN_ATTACK_RANGE_SQ`, etc.), with
 * the literal values now derived from `VOLTKIN_CONFIG` here. No call-site
 * needed updating — 8 importing files (5 prod + 3 test) compile unchanged.
 *
 * **PRIME-AUDIT Δ2 (S34 Council R1):** `attackRangeSq` is **NOT** a config
 * field. The pre-squared value is a sqrt-avoidance derivative; exposing it
 * in CreatureConfig would invite drift between the two. Consumers compute
 * `attackRange * attackRange` inline (or via the existing
 * `VOLTKIN_ATTACK_RANGE_SQ` back-compat re-export in creature.ts).
 *
 * **What's NOT in CreatureConfig (deliberate):**
 *   - Visual effect constants (`ARC_HALO_WIDTH`, `ARC_JITTER_AMP_PX`,
 *     `ARC_FLASH_DURATION_TICKS`) — describe the EFFECT, not the creature.
 *     Anvil might also use ARC_FLASH (cleave-style sparks). Stays in
 *     `src/render/effects/arcFlash.ts` + `lifetime.ts`.
 *   - Screen-shake constants — describe the shake effect, not the creature.
 *     Stays in `src/render/screenShake.ts`.
 *   - Cinematic-timing constants (`cinematicMs`, `FADE_MS`,
 *     `sustainedEffectMs`) — describe the cutscene overlay, not the creature
 *     spec. Stays in `src/render/cutsceneOverlay.ts`.
 *
 * **Empirical guard for byte-exact preservation:**
 * `src/state/save.replay.test.ts` (S33 P1-12 replay-determinism baseline)
 * runs two identically-seeded worlds through identical dispatch sequences
 * and asserts `JSON.stringify(snapshot(w1)) === JSON.stringify(snapshot(w2))`.
 * If this refactor changed any computed value, that test fails. Must stay
 * green post-refactor.
 */

import type { CreatureType } from './creature.ts';
import {
  CHEWER_HP,
  VOLTKIN_HP,
  DRONE_LIFETIME_TICKS,
  DRONE_EXPLODE_RADIUS,
  GOBLIN_ATTACK_CADENCE_TICKS,
  GOBLIN_ATTACK_FIRE_TICK,
  GOBLIN_ATTACK_RANGE,
  GOBLIN_LIFETIME_TICKS,
  GOBLIN_MAX_ACCEL,
  GOBLIN_MELEE_HP,
  CHEWER_ATK,
  CHEWER_DEF,
  CHEWER_PEN,
  DRONE_ATK,
  DRONE_DEF,
  DRONE_HP,
  DRONE_PEN,
  GOBLIN_MELEE_ATK,
  GOBLIN_MELEE_DEF,
  GOBLIN_MELEE_PEN,
  VOLTKIN_ATK,
  VOLTKIN_DEF,
  VOLTKIN_PEN,
  GOBLIN_ARCHER_HP,
  GOBLIN_ARCHER_DEF,
  GOBLIN_ARCHER_ATK,
  GOBLIN_ARCHER_PEN,
  GOBLIN_ARCHER_RANGE,
  GOBLIN_SHIELD_HP,
  GOBLIN_SHIELD_DEF,
  GOBLIN_SHIELD_ATK,
  GOBLIN_SHIELD_PEN,
  GOBLIN_HOUND_HP,
  GOBLIN_HOUND_DEF,
  GOBLIN_HOUND_ATK,
  GOBLIN_HOUND_PEN,
  GOBLIN_BAT_HP,
  GOBLIN_BAT_DEF,
  GOBLIN_BAT_ATK,
  GOBLIN_BAT_PEN,
  GOBLIN_SUICIDE_HP,
  GOBLIN_SUICIDE_DEF,
  GOBLIN_SUICIDE_ATK,
  GOBLIN_SUICIDE_PEN,
  GOBLIN_SUICIDE_BLAST_RADIUS,
} from '../../constants.ts';

/**
 * Per-creature-type config record. One entry per `CreatureType` discriminant
 * value. All fields are numeric tick counts or distances.
 *
 * Adding a new creature type:
 *  1. Add the new discriminant value to `CreatureType` union in `creature.ts`.
 *  2. Add a new `XYZ_CONFIG` constant below following the `VOLTKIN_CONFIG` shape.
 *  3. Add the new entry to `CREATURE_CONFIGS` Record.
 *  4. Add a new attack-handler branch in `creatureAttack.ts` (or a `kind` field
 *     here if attack handlers diverge enough to need per-type dispatch).
 *  5. Verify `save.replay.test.ts` stays green.
 */
export interface CreatureConfig {
  /** Discriminator — matches the `Creature.type` field. */
  readonly type: CreatureType;
  /**
   * HIT-POINT POINTS on the shared 1..12 ladder (S151 P2; was a bare hit count).
   *
   * S102 established the unified model: a "hit" (player RAID, Voltkin zap, laser beam, HELGA slap)
   * routes through `damageCreature` and the creature despawns at hp ≤ 0. S151 keeps that path and
   * re-homes the NUMBER: `hp` is now a point on the ladder, and this unit's effective pool is
   * `unitPoolFifths(hp, def)` = `hp × (5 + def)` fifths.
   *
   * ⚠ Every shipped unit has `def: 0`, so `pool = hp × 5` and the arithmetic is exactly the old hit
   * count scaled by five — chewer 1, Voltkin 8 (owner R71), goblin 1 (owner R70). Defaulted onto
   * `Creature.hp` by `makeCreature`.
   */
  readonly hp: number;
  /**
   * ⭐ S151 P2 (owner R72) — DEFENCE POINTS. Indexes the linear multiplier ladder `1 + 0.2·DEF`, so
   * this unit's effective pool is `hp × (1 + 0.2·def)` — see `state/stats.ts` `unitPoolFifths`.
   *
   * ⚠ ZERO IS A REAL VALUE, NOT "UNSET". Every shipped unit is `def: 0`, which means `×1.0` and
   * therefore reproduces the pre-S151 hit-count arithmetic EXACTLY. That is deliberate: this
   * priority moves where the numbers come from without moving unit-vs-unit balance. Inventing
   * non-zero defences here would be precisely the unvalidated first-pass tuning R75 just deleted.
   */
  readonly def: number;
  /**
   * ⭐ S151 P2 (owner R72) — ATTACK POINTS on the shared 1..12 ladder. Damage dealt per hit is
   * `atk × (1 + 0.2·pen)` fifths (`state/stats.ts` `attackFifths`), and it is compared against the
   * SAME scale whether the target is a unit or a connector. One scale, one comparison.
   */
  readonly atk: number;
  /**
   * ⭐ S151 P2 (owner R72) — PENETRATION points, the attacker's mirror of DEF.
   *
   * Owner: *"we will consider defence and hp as the exact inverse stat for ATK and PEN … pen = /1.2"*.
   * Placement is provably free: comparing `atk × (1+0.2·pen)` against `hp × (1+0.2·def)` is
   * algebraically identical to dividing the defender's rating by `(1+0.2·pen)`, so the multiply form
   * is used — no division, no zero edge, exact in integers. `stats.test.ts` proves the equivalence
   * over the whole design range rather than by example.
   */
  readonly pen: number;
  /**
   * Total lifetime in ticks. `despawnAtTick = spawnedAtTick + lifetimeTicks`.
   * Blueprint Q5; Voltkin = 480 (8 s @ 60 Hz).
   */
  readonly lifetimeTicks: number;
  /* S58 (#4): Voltkin = 1200 (20 s @ 60 Hz) — 2.5× the original 480/8 s. */
  /**
   * Duration in ticks of the SPAWNING state before SEEKING activates.
   * During SPAWNING the creature is force-free (`computeSteeringAccel`
   * returns `ZERO_ACCEL`). Blueprint Q7; Voltkin = 60 (1 s).
   */
  readonly spawnTicks: number;
  /**
   * Duration in ticks of the DESPAWNING state at end-of-life. Blueprint
   * Q5 + Q8; Voltkin = 60 (1 s).
   */
  readonly despawningTicks: number;
  /**
   * Tail window inside `despawningTicks` during which sprite alpha tweens
   * 1.0 → 0.0. MUST be ≤ `despawningTicks`. Blueprint Q8; Voltkin = 30 (~500 ms).
   */
  readonly fadeTicks: number;
  /**
   * Max distance (px) from creature pos to target-bond midpoint for
   * SEEKING → ATTACKING transition. Blueprint Q9; Voltkin = 180
   * (~3× prim radius — ranged lightning arc).
   *
   * Squared comparisons (`distSq <= attackRange * attackRange`) are
   * preferred in hot paths; do NOT add `attackRangeSq` here (PRIME-AUDIT Δ2).
   */
  readonly attackRange: number;
  /**
   * Total tick-cycle duration of one attack (wind-up + fire + recovery).
   * Voltkin = 60 (1 s); ~6 full attack cycles per 8s active window.
   */
  readonly attackCadenceTicks: number;
  /**
   * Mid-cycle tick at which the ATTACK action dispatches (sever bond +
   * ARC_FLASH emit). Council R1 Q2 COMPROMISE between tick-0 wind-up and
   * tick-end recovery; Voltkin = 30 (middle of cadence).
   */
  readonly attackFireTick: number;
  /**
   * S37 P7 — wind-up tick at which the lion-form `charge` sprite engages and
   * the procedural Web Audio CHARGE SFX fires (250 ms rising tone climaxing
   * at attackFireTick). Promoted from voltkinFrames.ATTACKING_CHARGE_ENGAGE_TICK
   * so both the render-layer sprite schedule and the state-layer
   * applyCreatureTick emit site share a single source of truth (DRY —
   * Council R1 D1 + PRIME-AUDIT Δ3 fallback documented). Voltkin = 15
   * (halfway through the 30-tick wind-up).
   */
  readonly attackChargeEngageTick: number;
  /**
   * S100 P1 (TD Phase 1a) — when `false` the creature is lifetime-bound
   * (`despawnAtTick = spawnedAtTick + lifetimeTicks` auto-deletes it, and the
   * end-of-life forced-DESPAWNING step runs) — the original Voltkin behavior,
   * preserved byte-for-byte. When `true` (chewer) the FSM auto-delete + forced-
   * DESPAWNING steps are skipped (wrapped in `if (!config.persistent)`), so the
   * creature persists until an external removal (spawner teardown / potato
   * blast). Voltkin = `false`. See TOWER_DEFENSE_DESIGN.md §2.4 (R4).
   */
  readonly persistent: boolean;
  /**
   * ⭐ S151 P2 (owner R76) — DOES THIS CREATURE GNAW CONNECTORS? Replaces the old `chewHits: number`.
   *
   * ⛔ WHY THE OLD FIELD HAD TO GO, not just be renamed. `chewHits` was "how many bites sever a
   * bond" — i.e. A CONNECTOR'S DURABILITY, STORED ON THE ATTACKER. That is the same inversion owner
   * R72 objected to in the goblin, and it meant every bond in the game took exactly 5 chews whether
   * it was half of a loose pair or one strut of a forty-connector fortress. Durability now lives on
   * the connector (`Bond.damageFifths` vs `connectorCapacityFifths`), and how fast a chewer gets
   * through it is simply its `atk`.
   *
   * `true` keeps the chewer's committed, incremental gnaw (one bite per `CHEW_INTERVAL_TICKS`,
   * glued to `targetBondId` until the bond is gone); `false` is Voltkin's single-fire bounce.
   */
  readonly chewsConnectors: boolean;
  /**
   * S100 P1 (TD Phase 1a) — multiplier on `CREATURE_MAX_ACCEL` (= this config's
   * `maxAccel`) for locomotion speed. Voltkin = `1` (unchanged top speed ~208
   * px/s). Chewer = `~0.6` (slower, readable, counterable hop). Threaded into
   * `creatureVerlet.computeSteeringAccel` by a later layer (today that module
   * reads the module-const `CREATURE_MAX_ACCEL` directly). See §3.4 (R16).
   */
  /**
   * ⛔ S153 P5c — THIS FIELD HAD NO CONSUMER, AND THAT MADE THE OWNER SPEED LADDER A NO-OP.
   *
   * The ONLY thing that drives locomotion is `maxAccel` (creatureVerlet.computeSteeringAccel reads
   * `config.maxAccel` and nothing else). Voltkin, the chewer and the drone always BAKED the
   * multiplier into their own `maxAccel` by hand — the chewer comment says so: "200 x hopSpeedMul
   * 0.6 = 120". The six goblins did not: every one of them carried a flat `GOBLIN_MAX_ACCEL`, so
   * they all moved at IDENTICAL speed no matter what this number said.
   *
   * S153 P1 then "re-tiered the speeds" by editing three of these values and shipped a change that
   * could not possibly do anything. The owner reported it plainly: *"the speed of the goblin units
   * has not yet been changed as i asked it to be."* They were right. Worse, the A.0 for P1 reported
   * that per-type speeds ALREADY EXISTED — true of the DATA and false of the BEHAVIOUR, which is
   * the difference that mattered. Verifying that a config field matches a spec is not the same as
   * verifying anything reads it.
   *
   * Every goblin `maxAccel` is now GOBLIN_MAX_ACCEL x this value, matching the shipped convention,
   * and creatureSpeedLadder.test.ts asserts the ORDERING so a future dead knob fails loudly.
   */
  readonly hopSpeedMul: number;
  /**
   * S100 P1 (TD Phase 1a) — per-substep peak steering acceleration (px/s²),
   * de-hardcoded from the `CREATURE_MAX_ACCEL` module constant in
   * `src/physics/creatureVerlet.ts` (current value 200). Voltkin = `200`
   * (unchanged — byte-identical Voltkin locomotion is the guard). Chewer is
   * scaled by `hopSpeedMul`. A later layer threads this per-config value
   * through `computeSteeringAccel` to replace the bare module constant. See §3.4 (R16).
   */
  readonly maxAccel: number;
  /**
   * S113 Batch C — `true` for the suicide lightning-DRONE: instead of the chewer's
   * chew loop or Voltkin's single-fire zap, a selfExplode creature flies to the nearest
   * ENEMY connector and DETONATES (a radial sever of <= DRONE_MAX_CONNECTORS enemy bonds)
   * on arrival within `attackRange` OR on lifetime-fuse expiry, then despawns. The
   * main.ts fan-out reads this flag to dispatch DRONE_EXPLODE (the sever stays on the
   * single SEVER_BOND path, cause:'drone') BEFORE the CREATURE_TICK that would otherwise
   * step the generic FSM. Voltkin/chewer = `false` (byte-identical — they never explode).
   */
  readonly selfExplode: boolean;
  /**
   * S139 P2 — THE STRUCTURE-ATTACKER DISCRIMINATOR (sibling of `selfExplode`).
   *
   * `true` ⇒ this creature navigates to and attacks the nearest enemy PRIMITIVE via
   * `findNearestEnemyPrimitiveFrom` + `damageEntity({kind:'primitive'})`, instead of committing to a
   * connector (chewer) or zapping a creature (Voltkin). `targetBondId` stays null for its whole life.
   *
   * ⚠ WHY THIS IS A CONFIG FLAG AND NOT A `sourceSpawnerId` TEST. A.0b measured five separate
   * places where `sourceSpawnerId === null` is overloaded to mean "is a Voltkin": the target-mode
   * selection (hostTick), the own-bond fallback (`enemyOnly`), the canvas-centre repulse
   * (creatureVerlet), the raid gate (world.ts) and the population cap (creatureLifecycle). Riding
   * that overload to add a fourth type would inherit all five behaviours silently. Adding a named
   * flag is the same move S113 made for the drone, and it keeps every existing type byte-identical
   * because all three are explicitly `false`.
   */
  readonly targetsStructures: boolean;
}

/**
 * Voltkin — lightning godly (S22 P3 originator, S25–S28 implementation chain).
 * S58 (#4): 20s lifetime (was 8s — 2.5× for a longer, more powerful/epic
 * summon per user playtest call), 180px ranged arc, 60-tick attack cycle
 * firing at mid-tick → ~18 full attack cycles over the active window.
 */
export const VOLTKIN_CONFIG: CreatureConfig = {
  type: 'voltkin',
  lifetimeTicks: 1200,
  spawnTicks: 60,
  despawningTicks: 60,
  fadeTicks: 30,
  attackRange: 180,
  attackCadenceTicks: 60,
  attackFireTick: 30,
  attackChargeEngageTick: 15,
  // S100 P1 (TD Phase 1a) — Voltkin keeps its original behavior byte-for-byte:
  // lifetime-bound (persistent:false), single-fire zap (chewHits:0, NOT the chew
  // loop), full top speed (hopSpeedMul:1), and the literal CREATURE_MAX_ACCEL=200
  // de-hardcoded from creatureVerlet.ts unchanged. These are the byte-identical
  // Voltkin regression guards (save.replay.test.ts / creatureLifecycle.test.ts).
  persistent: false,
  chewsConnectors: false,
  hopSpeedMul: 1,
  maxAccel: 200,
  hp: VOLTKIN_HP, // 8 — godly; owner R71. An HP POINT on the shared ladder since S151 P2.
  // S151 P2 — DEF 0 keeps the shipped ladder EXACTLY: pool = 8 x (5+0) = 40 fifths, so HELGA
  // (ATK 3 = 15 fifths) still needs THREE slaps and the laser (ATK 6 = 30) still needs TWO. The
  // stat system re-homes these numbers; it does not re-tune them.
  // ⭐ Owner R77: "voltkin - 3 atk (chain lightning …) 6 pierce. 8hp, and 3 def".
  def: VOLTKIN_DEF,
  atk: VOLTKIN_ATK,
  pen: VOLTKIN_PEN,
  selfExplode: false, // a Voltkin zaps; it never self-detonates
  targetsStructures: false, // a Voltkin targets connectors + creatures, never shapes
};

/**
 * Chewer — tower-defense swarm creature (S100 P1, TD Phase 1a). A slow-hopping,
 * pencil-drawn creature emitted every `SPAWN_INTERVAL_TICKS` by a live
 * spawner-structure. Generalizes the Voltkin substrate (same FSM / Verlet /
 * SEVER_BOND choke point) with three behavioral diffs encoded here:
 *
 *   - `persistent: false` (S104 P1 — was true) — a FINITE `lifetimeTicks` so the swarm
 *     CHURNS: a chewer ages out through the SAME `!config.persistent` DESPAWNING→auto-delete
 *     FSM the Voltkin uses, freeing the spawner's per-spawner slot so its 15s cadence keeps
 *     producing (the owner's "constantly produce more every ~15s" fix). A chewer can also die
 *     early to a raid / potato / laser / slap (hp 1), or instantly when its spawner is destroyed.
 *   - `chewHits: 5` (= constants.ts `CHEW_HITS`) — instead of Voltkin's single
 *     mid-cycle zap, a chewer commits to ONE bond and lands 5 incremental chews
 *     (one per `CHEW_INTERVAL_TICKS` = 60), severing only on the final hit (R9).
 *     `attackCadenceTicks` therefore spans the whole chew (5 × 60 = 300) and
 *     `attackFireTick` is the final hit (300) so the FSM stays in ATTACKING for
 *     the full chew rather than bouncing to SEEKING after each hit.
 *   - `hopSpeedMul: 0.6` / `maxAccel: 120` — ~60% of Voltkin's top speed:
 *     a readable, counterable hop. `maxAccel = 200 × 0.6` (the de-hardcoded
 *     CREATURE_MAX_ACCEL scaled by hopSpeedMul).
 *
 * `lifetimeTicks` (3000 = 50s @ 60Hz) is the REAL despawn gate now (`persistent:false`):
 * the FSM auto-deletes at `despawnAtTick` and routes the last second through DESPAWNING, so
 * a timed-out chewer FADES (the renderer reserves the green-goo splat for KILLS). `attackRange`
 * is a touch shorter than Voltkin's 180 (chewers engage at melee-ish chew range, not a ranged arc).
 *
 * NOTE for downstream layers: the FSM chew loop, the split caps, the enemy-only
 * targeting, the spawner poll, and threading `hopSpeedMul`/`maxAccel` through
 * `computeSteeringAccel` all live in later layers. This entry only declares the
 * config; adding it here forces the CREATURE_CONFIGS exhaustiveness below.
 */
export const CHEWER_CONFIG: CreatureConfig = {
  type: 'chewer',
  // S104 P1 — FINITE lifetime (was a 1e9 sentinel + persistent:true). The chewer now ages out
  // through the SAME replay-proven Voltkin DESPAWNING→auto-delete FSM, so the spawner's swarm
  // CHURNS (an old chewer expires ~as the 15s cadence mints a new one) instead of hard-stopping at
  // the per-spawner cap — the owner's "should constantly produce more every ~15s" fix. 3000t = 50s
  // @ 60Hz, comfortably longer than seek+travel+a full 5-chew sever (5×60=300t=5s) so a chewer
  // actually completes severs rather than timing out mid-bite. Lifetime-expiry FADES via DESPAWNING
  // (the chewerRenderer death-watcher reserves the green-goo splat for KILLS — a non-DESPAWNING vanish).
  lifetimeTicks: 3000, // 50 s @ 60Hz — finite so the swarm churns (steady-state ≈ 3000/SPAWN_INTERVAL_TICKS 900 ≈ 3.3/spawner)
  spawnTicks: 30, // 0.5 s materialize (faster than Voltkin's 1 s — it's a swarm unit)
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: 35, // S102 #3: true MELEE — chewer walks right up to the connector before chewing
                   // (was 180 via the VOLTKIN_ATTACK_RANGE_SQ hardcode; now read per-config in isWithinAttackRange)
  attackCadenceTicks: 300, // legacy span; the gnaw now runs until the connector gives way
  attackFireTick: 300, // sever on the final (5th) chew hit
  attackChargeEngageTick: 60, // first chew bite lands one CHEW_INTERVAL_TICKS in
  persistent: false, // S104 P1 — finite lifetime (see lifetimeTicks); routes end-of-life through the Voltkin DESPAWNING FSM
  chewsConnectors: true, // the gnawer — durability lives on the bond now, not here
  hopSpeedMul: 0.6,
  maxAccel: 120, // 200 (CREATURE_MAX_ACCEL) × hopSpeedMul 0.6
  hp: CHEWER_HP, // 1 — dies in a single hit (S102 unified HP model; an HP POINT since S151 P2)
  // ⭐ S151 P2 (R76) — THE CHEWER'S ATK IS WHAT REPLACED `chewHits`. A connector's toughness used to
  // live HERE, on the attacker, as a flat "5 chews for any bond ever". Now the chewer simply deals
  // `atk x (5+pen)` = 5 fifths per bite and the CONNECTOR decides how much it can take, which is why
  // eating a lone pair is quick and eating a 40-connector fortress is not.
  // ⭐ Owner R77: "pencil chewers - 1 atk 2 pierce, 1hp, 0 def. so 1x1.4 offence, and 1 def" —
  // and our fifths formula reproduces both of the owner's own figures exactly.
  def: CHEWER_DEF,
  atk: CHEWER_ATK,
  pen: CHEWER_PEN,
  selfExplode: false, // a chewer gnaws bonds; it never self-detonates
  targetsStructures: false, // a chewer commits to a CONNECTOR, not a shape
};

/**
 * Lightning DRONE — S113 Batch C suicide creature emitted by a `lightningHub` spawner.
 * Generalizes the Voltkin substrate (same FSM / Verlet / SEVER_BOND choke) with the NEW
 * `selfExplode` behavior: it homes on the nearest ENEMY connector and DETONATES (radial
 * sever of <= DRONE_MAX_CONNECTORS enemy bonds) on arrival within `attackRange`
 * (= DRONE_EXPLODE_RADIUS) OR on lifetime-fuse expiry, then despawns. Rendered as the
 * procedural Voltkin rig @ LIGHTNING_DRONE_SPRITE_SCALE (0.5 — owner "~50% smaller").
 *
 *  - `selfExplode: true` — the discriminator the main.ts fan-out reads to dispatch
 *    DRONE_EXPLODE before the generic CREATURE_TICK (it never enters the chew/zap path).
 *  - `persistent: false` + `lifetimeTicks` = the fly-time FUSE (DRONE_LIFETIME_TICKS, 8s):
 *    if it never reaches an enemy it explodes harmlessly in place at fuse end.
 *  - `chewHits: 0` (not a chewer); `attackRange` = DRONE_EXPLODE_RADIUS (arrival == blast).
 *  - `hopSpeedMul` 1.2 / `maxAccel` 240 — a touch faster than a Voltkin (it's a missile).
 *  - `hp: 1` — dies in one hit (a raid / laser / slap / potato can shoot it down).
 */
export const LIGHTNING_DRONE_CONFIG: CreatureConfig = {
  type: 'lightningDrone',
  lifetimeTicks: DRONE_LIFETIME_TICKS, // 8s fly-time fuse
  spawnTicks: 30, // fast materialize (like a chewer) — it's a swarm-ish unit
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: DRONE_EXPLODE_RADIUS, // arrival == explode radius (reused by isWithinAttackRange)
  attackCadenceTicks: 60, // unused (the drone explodes, it never ATTACKS) — sane placeholder
  attackFireTick: 30, // unused
  attackChargeEngageTick: 15, // unused
  persistent: false, // lifetime-bound: lifetimeTicks is the fuse
  chewsConnectors: false, // not a chewer
  hopSpeedMul: 1.2, // a touch faster than Voltkin — a homing missile
  maxAccel: 240, // 200 (Voltkin) × 1.2
  hp: DRONE_HP, // ⭐ R77 — 2, was CHEWER_HP (1)
  // S151 P2 — a suicide drone never trades blows: it detonates on arrival. `atk` is stated for table
  // completeness (the matrix is exhaustive by construction) and its real payload is DRONE_EXPLODE.
  // ⭐ Owner R77: "the electric drone - 5 damage(atk) and 1 pierce in an area of effect … 2hp, 0 def".
  def: DRONE_DEF,
  atk: DRONE_ATK,
  pen: DRONE_PEN,
  selfExplode: true, // THE drone discriminator
  targetsStructures: false, // a drone detonates on a CONNECTOR
};

/**
 * S139 P2 — GOBLIN (melee). The first FREE, NON-GODLY unit in SPARK, and the first creature that
 * attacks STRUCTURES.
 *
 * Owner spec: *"each player starts with one goblin of every kind that either attack the closest
 * enemy structure or each other. takes them 6 attacks to destroy a connector or a UNIT."*
 *
 * Shape of the behaviour, and why each field is what it is:
 *  - `targetsStructures: true` — THE discriminator. Navigates to the nearest enemy PRIMITIVE
 *    (`findNearestEnemyPrimitiveFrom`, enemy-only with NO own-shape fallback) and damages it through
 *    `damageEntity`. `targetBondId` is never set.
 *  - `chewHits: 0` — deliberately NOT the chewer path. A.0b measured that the chew branch
 *    (`config.chewHits > 0`) handles ONLY bonds and bounces straight back to SEEKING when
 *    `targetBondId` is null, so a chewHits>0 goblin would exit ATTACKING before ever reaching
 *    `attackFireTick`. Zero routes it down the Voltkin ATTACKING→SEEKING cadence bounce, which is
 *    exactly the repeat-swing rhythm a melee unit wants.
 *  - `hp: GOBLIN_MELEE_HP` (6) — the owner's "6 attacks" on the CREATURE hp scale, where every
 *    single-target hit deals CREATURE_HIT_DAMAGE (1). Its damage against a shape is the other scale
 *    (GOBLIN_DAMAGE_VS_PRIMITIVE 167 × 6 = 1002 ≥ PRIMITIVE_MAX_HP), so one owner-visible rule holds
 *    on both.
 *  - `persistent: true` + a match-length lifetime — a granted starter unit that faded on a timer
 *    would make "you start with one" meaningless a minute in.
 *  - `attackRange` 35 = true melee: it closes ONTO the shape, like the chewer, rather than being
 *    held off at Voltkin's ranged band.
 */
export const GOBLIN_MELEE_CONFIG: CreatureConfig = {
  type: 'goblinMelee',
  hp: GOBLIN_MELEE_HP, // ⭐ S151 P2 — now 1 (owner R70, "as weak as chewer"); was 6 AND was the
  // backbone the whole damage scale derived from. See the constant's own docblock.
  // Its damage against a SHAPE stays on the other scale (GOBLIN_DAMAGE_VS_PRIMITIVE, 1000-based) —
  // a loose primitive is building material, not a combatant, and never joined this ladder.
  // ⭐ Owner R77: "melee goblin - 2 atk, 1 pierce, 1hp 2 def".
  def: GOBLIN_MELEE_DEF,
  atk: GOBLIN_MELEE_ATK,
  pen: GOBLIN_MELEE_PEN,
  lifetimeTicks: GOBLIN_LIFETIME_TICKS,
  spawnTicks: 30, // 0.5 s materialize — a swarm-scale unit, not a 1 s godly reveal
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: GOBLIN_ATTACK_RANGE,
  attackCadenceTicks: GOBLIN_ATTACK_CADENCE_TICKS,
  attackFireTick: GOBLIN_ATTACK_FIRE_TICK,
  attackChargeEngageTick: 0, // no charge-up tell: it just swings
  persistent: true,
  chewsConnectors: false, // NOT the chew path — see the docblock above
  hopSpeedMul: 0.85,
  maxAccel: Math.round(GOBLIN_MAX_ACCEL * 0.85), // the ladder, made REAL (S153 P5c)
  selfExplode: false,
  targetsStructures: true, // THE goblin discriminator
};

/**
 * Canonical lookup table. ONE entry per CreatureType discriminant value.
 * `Readonly<Record<...>>` enforces compile-time exhaustiveness for new
 * creature types.
 */

/**
 * ARCHER (Line) — the ranged goblin. He is the only goblin that kills without closing, which is
 * what his long attackRange buys; in exchange he is the flimsiest thing the tower makes.
 * Stats are owner R77, transcribed verbatim; see the constants for the sentence each came from.
 */
export const GOBLIN_ARCHER_CONFIG: CreatureConfig = {
  type: 'goblinArcher',
  hp: GOBLIN_ARCHER_HP,
  def: GOBLIN_ARCHER_DEF,
  atk: GOBLIN_ARCHER_ATK,
  pen: GOBLIN_ARCHER_PEN,
  lifetimeTicks: GOBLIN_LIFETIME_TICKS,
  spawnTicks: 30,
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: GOBLIN_ARCHER_RANGE,
  attackCadenceTicks: GOBLIN_ATTACK_CADENCE_TICKS,
  attackFireTick: GOBLIN_ATTACK_FIRE_TICK,
  attackChargeEngageTick: 0,
  persistent: true,
  chewsConnectors: false,
  hopSpeedMul: 0.7,
  maxAccel: Math.round(GOBLIN_MAX_ACCEL * 0.7), // the ladder, made REAL (S153 P5c)
  selfExplode: false,
  targetsStructures: true,
};

/**
 * SHIELD (Square) — the wall. Highest DEF in the game and almost no offence: he exists to be
 * ATTACKED, which is why he is also the slowest thing on the board.
 * Stats are owner R77, transcribed verbatim; see the constants for the sentence each came from.
 */
export const GOBLIN_SHIELD_CONFIG: CreatureConfig = {
  type: 'goblinShield',
  hp: GOBLIN_SHIELD_HP,
  def: GOBLIN_SHIELD_DEF,
  atk: GOBLIN_SHIELD_ATK,
  pen: GOBLIN_SHIELD_PEN,
  lifetimeTicks: GOBLIN_LIFETIME_TICKS,
  spawnTicks: 30,
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: GOBLIN_ATTACK_RANGE,
  attackCadenceTicks: GOBLIN_ATTACK_CADENCE_TICKS,
  attackFireTick: GOBLIN_ATTACK_FIRE_TICK,
  attackChargeEngageTick: 0,
  persistent: true,
  chewsConnectors: false,
  hopSpeedMul: 0.45,
  maxAccel: Math.round(GOBLIN_MAX_ACCEL * 0.45), // the ladder, made REAL (S153 P5c)
  selfExplode: false,
  targetsStructures: true,
};

/**
 * HOUND (Circle) — the glass sprinter. Top goblin ATK with zero defence, so it trades perfectly
 * evenly with anything that gets to swing back. Fastest hopSpeedMul of the six.
 * Stats are owner R77, transcribed verbatim; see the constants for the sentence each came from.
 */
export const GOBLIN_HOUND_CONFIG: CreatureConfig = {
  type: 'goblinHound',
  hp: GOBLIN_HOUND_HP,
  def: GOBLIN_HOUND_DEF,
  atk: GOBLIN_HOUND_ATK,
  pen: GOBLIN_HOUND_PEN,
  lifetimeTicks: GOBLIN_LIFETIME_TICKS,
  spawnTicks: 30,
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: GOBLIN_ATTACK_RANGE,
  attackCadenceTicks: GOBLIN_ATTACK_CADENCE_TICKS,
  attackFireTick: GOBLIN_ATTACK_FIRE_TICK,
  attackChargeEngageTick: 0,
  persistent: true,
  chewsConnectors: false,
  hopSpeedMul: 1.15,
  maxAccel: Math.round(GOBLIN_MAX_ACCEL * 1.15), // the ladder, made REAL (S153 P5c)
  selfExplode: false,
  targetsStructures: true,
};

/**
 * BAT RIDER (Spiral) — the owner's "flying goblin". Low ATK but the highest PEN on any goblin, so
 * he is the answer to the shield goblin specifically: penetration is what beats defence.
 * Stats are owner R77, transcribed verbatim; see the constants for the sentence each came from.
 */
export const GOBLIN_BAT_CONFIG: CreatureConfig = {
  type: 'goblinBat',
  hp: GOBLIN_BAT_HP,
  def: GOBLIN_BAT_DEF,
  atk: GOBLIN_BAT_ATK,
  pen: GOBLIN_BAT_PEN,
  lifetimeTicks: GOBLIN_LIFETIME_TICKS,
  spawnTicks: 30,
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: GOBLIN_ATTACK_RANGE,
  attackCadenceTicks: GOBLIN_ATTACK_CADENCE_TICKS,
  attackFireTick: GOBLIN_ATTACK_FIRE_TICK,
  attackChargeEngageTick: 0,
  persistent: true,
  chewsConnectors: false,
  hopSpeedMul: 1.15,
  maxAccel: Math.round(GOBLIN_MAX_ACCEL * 1.15), // the ladder, made REAL (S153 P5c)
  selfExplode: false,
  targetsStructures: true,
};

/**
 * SUICIDE (Dot) — the owner's "terrorist goblin": one attack, 4 ATK, in an area of effect.
 * ⚠ `selfExplode: true` routes it down the lightning drone's detonate-on-arrival path, so it DOES
 * die on contact today. The AoE SHAPE of the blast is deferred with the drone's own — see
 * GOBLIN_SUICIDE_BLAST_RADIUS, which is deliberately smaller than DRONE_EXPLODE_RADIUS per owner
 * R77 (*"the area of effect on the drones is larger then terrorist goblin"*).
 * Stats are owner R77, transcribed verbatim; see the constants for the sentence each came from.
 */
export const GOBLIN_SUICIDE_CONFIG: CreatureConfig = {
  type: 'goblinSuicide',
  hp: GOBLIN_SUICIDE_HP,
  def: GOBLIN_SUICIDE_DEF,
  atk: GOBLIN_SUICIDE_ATK,
  pen: GOBLIN_SUICIDE_PEN,
  lifetimeTicks: GOBLIN_LIFETIME_TICKS,
  spawnTicks: 30,
  despawningTicks: 30,
  fadeTicks: 15,
  attackRange: GOBLIN_SUICIDE_BLAST_RADIUS,
  attackCadenceTicks: GOBLIN_ATTACK_CADENCE_TICKS,
  attackFireTick: GOBLIN_ATTACK_FIRE_TICK,
  attackChargeEngageTick: 0,
  persistent: true,
  chewsConnectors: false,
  hopSpeedMul: 0.85,
  maxAccel: Math.round(GOBLIN_MAX_ACCEL * 0.85), // the ladder, made REAL (S153 P5c)
  selfExplode: true,
  targetsStructures: true,
};

export const CREATURE_CONFIGS: Readonly<Record<CreatureType, CreatureConfig>> = {
  voltkin: VOLTKIN_CONFIG,
  chewer: CHEWER_CONFIG,
  lightningDrone: LIGHTNING_DRONE_CONFIG,
  goblinMelee: GOBLIN_MELEE_CONFIG,
  goblinArcher: GOBLIN_ARCHER_CONFIG,
  goblinShield: GOBLIN_SHIELD_CONFIG,
  goblinHound: GOBLIN_HOUND_CONFIG,
  goblinBat: GOBLIN_BAT_CONFIG,
  goblinSuicide: GOBLIN_SUICIDE_CONFIG,
};

/**
 * Type-safe accessor — equivalent to `CREATURE_CONFIGS[type]` but the
 * function form is the public API surface so future indirection (cached
 * derived values, debug overlay, etc.) doesn't require a call-site sweep.
 */
export function getCreatureConfig(type: CreatureType): CreatureConfig {
  return CREATURE_CONFIGS[type];
}
