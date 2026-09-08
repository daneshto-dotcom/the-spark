/**
 * SPARK — creature entity type surface (S25 P0 scaffold; S26 P0 adds targetPos +
 * CREATURE_SPAWN_TICKS for Phase 2B physics + locomotion).
 *
 * Per S24 Council-approved Voltkin Phase 2 blueprint (`.claude/plans/voltkin_phase2_blueprint_v1.md`):
 *   - Q1 Verlet body in NEW `world.creatures: Map<CreatureId, Creature>` (NOT bond solver list).
 *   - Q2 Hand-rolled FSM with 4 states. S25 used SPAWNING + DESPAWNING; S26 P0 wires the
 *     SPAWNING → SEEKING transition at `ticksInState >= CREATURE_SPAWN_TICKS`. ATTACKING
 *     remains reserved for S27. Full union landed in S25.
 *   - Q5 Time-only lifecycle: `despawnAtTick = spawnedAtTick + 480` (8s @ 60Hz).
 *   - Q7 SPAWNING animation window: 60 ticks (1s) before SEEKING activates.
 *   - Q8 DESPAWNING state lasts 60 ticks (1s); the last 30 ticks (~500ms) are the alpha fade.
 *
 * S26 P0 — Council R1 + PRIME-AUDIT Δ5: each creature carries a `targetPos: Vec2`
 * computed deterministically by `computeStubTargetPos(spawnedAtTick, ownerPlayerId)`
 * in `src/physics/creatureVerlet.ts` and passed via the SPAWN_CREATURE action payload
 * (Council Q1 unanimous: caller computes). S27 mutates this field per AI target
 * selection (nearest enemy bond / fallback own).
 */

import type { BondId, PlayerId, PrimitiveId, Vec2, SpawnerId } from '../../types.ts';
import type { CreatureId } from '../../types.ts';
import { VOLTKIN_CONFIG, type CreatureConfig } from './voltkin-config.ts';
import { unitPoolFifths } from '../stats.ts';
import { WARLORD_RAGE_MULTIPLIER } from '../../constants.ts';

export { asCreatureId, type CreatureId } from '../../types.ts';

/**
 * S34 P2-20 — per-type constants moved to `voltkin-config.ts` (Gemini Q2
 * carry-forward from S26+S27+S28, deferred until Anvil prereq). All exports
 * below are now derived from `VOLTKIN_CONFIG.*` to preserve the existing
 * call-site API (8 importing files unchanged). Future creatures consume the
 * same surface via `CREATURE_CONFIGS[type].*` or `getCreatureConfig(type).*`.
 *
 * **Byte-exact preservation:** literal values were 480 / 60 / 60 / 30 / 180 /
 * 60 / 30; VOLTKIN_CONFIG is constructed with those same literals; therefore
 * `VOLTKIN_CONFIG.lifetimeTicks === 480` etc. by construction. The S33 P1-12
 * replay-determinism test (`save.replay.test.ts`) is the empirical guard.
 */

/**
 * Lifetime: total ticks a creature exists in `world.creatures` after SPAWN_CREATURE.
 * 480 @ 60Hz = 8 seconds. Locked by blueprint Q5; sourced from VOLTKIN_CONFIG.
 */
export const VOLTKIN_LIFETIME_TICKS = VOLTKIN_CONFIG.lifetimeTicks;

/**
 * DESPAWNING-state duration: how many ticks before `despawnAtTick` the creature
 * enters DESPAWNING. 60 @ 60Hz = 1 second. Locked by blueprint Q5 + Q8.
 *
 * Note: this constant CURRENTLY equals `VOLTKIN_CONFIG.despawningTicks` because
 * only Voltkin exists. If S35+ Anvil ships with a different despawn duration,
 * callers should switch to `getCreatureConfig(creature.type).despawningTicks`.
 */
export const CREATURE_DESPAWNING_TICKS = VOLTKIN_CONFIG.despawningTicks;

/**
 * SPAWNING-state duration before SEEKING activates. 60 @ 60Hz = 1 second of
 * "materializing" animation window during which the creature is force-free
 * (computeSteeringAccel returns ZERO_ACCEL — Council R1 + PRIME-AUDIT Δ4).
 * Locked by blueprint Q7. S35+ Anvil may need a different SPAWN_TICKS — at
 * that point callers should switch to per-type `getCreatureConfig(...).spawnTicks`.
 */
export const CREATURE_SPAWN_TICKS = VOLTKIN_CONFIG.spawnTicks;

/**
 * Alpha-fade window inside DESPAWNING: the last N ticks of DESPAWNING tween alpha
 * 1.0 → 0.0. 30 @ 60Hz = 500 ms. Locked by blueprint Q8. Must be ≤ CREATURE_DESPAWNING_TICKS.
 */
export const CREATURE_FADE_TICKS = VOLTKIN_CONFIG.fadeTicks;

/**
 * S27 P0 — attack range for SEEKING → ATTACKING transition. When the creature's
 * `targetBondId` resolves to a bond whose midpoint is within this distance of
 * `creature.pos`, the FSM transitions SEEKING → ATTACKING. Locked by blueprint
 * Q9 (180 px ≈ 3× prim radius — "ranged lightning arc", not melee touch). Squared
 * comparisons in the AI module avoid sqrt — see VOLTKIN_ATTACK_RANGE_SQ.
 */
export const VOLTKIN_ATTACK_RANGE = VOLTKIN_CONFIG.attackRange;

/**
 * S27 P0 — pre-squared attack range for distSq comparisons. Avoids sqrt in the
 * hot AI path (called once per CREATURE_TICK during SEEKING per Council R1 Q3
 * UNANIMOUS A — every-tick re-selection, ~80 prims × 60Hz = 4800 checks/s).
 *
 * PRIME-AUDIT Δ2 (S34 P2-20): NOT a field on CreatureConfig — derived here
 * to prevent drift between attackRange and attackRangeSq.
 */
export const VOLTKIN_ATTACK_RANGE_SQ = VOLTKIN_CONFIG.attackRange * VOLTKIN_CONFIG.attackRange;

/**
 * S27 P0 — total duration of the ATTACKING state in ticks. The creature stays
 * in ATTACKING for this many ticks then transitions back to SEEKING (Council
 * R1 Q5 UNANIMOUS creature-only ⇒ ~18 attacks at 1/sec cadence over the 18s
 * active window (S58 #4 — 2.5× lifetime) — `(VOLTKIN_LIFETIME_TICKS - CREATURE_DESPAWNING_TICKS - CREATURE_SPAWN_TICKS) / VOLTKIN_ATTACK_CADENCE_TICKS = (1200-60-60)/60 = 18`
 * full attack cycles). 60 @ 60Hz = 1 second.
 */
export const VOLTKIN_ATTACK_CADENCE_TICKS = VOLTKIN_CONFIG.attackCadenceTicks;

/**
 * ⭐ S168 (owner R149) — **RAGE, AS ONE MULTIPLIER READ IN TWO PLACES.**
 *
 * *"he becomes enraged when drops to 25% health and attacks and moves x2 quicker for the rest of his
 * lifetime."* — so "quicker" has two meanings and both are wired from here:
 *   · MOVES quicker → `physics/creatureVerlet.ts` scales `config.maxAccel` by this;
 *   · ATTACKS quicker → `creatures/creatureLifecycle.ts` DIVIDES `config.attackCadenceTicks` by it.
 *
 * ⚠ Defined once rather than written at both call sites, because a x2 that was applied to movement
 * and forgotten at the cadence is a bug nothing in the suite would name — the Warlord would simply
 * feel wrong. The LATCH itself lives in `state/bossSkills.ts`; this is only the read.
 */
export function rageMultiplier(c: Pick<Creature, 'enraged'>): number {
  return c.enraged === true ? WARLORD_RAGE_MULTIPLIER : 1;
}

/**
 * S27 P0 — Council R1 Q2 COMPROMISE (Grok-A tick-0 vs Gemini-B tick-30) → middle
 * (tick 30). The CREATURE_ATTACK action dispatches when ATTACKING.ticksInState ===
 * VOLTKIN_ATTACK_FIRE_TICK (in main.ts post-CREATURE_TICK fan-out). Ticks 0-29 are
 * wind-up (S28 will animate); tick 30 fires the zap (severs target bond + emits
 * ARC_FLASH); ticks 31-59 are recovery (S28 will animate); tick 60 transitions
 * back to SEEKING. Exposed as a constant so S28 animation retuning is single-LOC.
 * Δ4 (PRIME-AUDIT): if `targetBondId` is invalid at tick FIRE_TICK, transition
 * straight back to SEEKING instead of going through the recovery half.
 */
export const VOLTKIN_ATTACK_FIRE_TICK = VOLTKIN_CONFIG.attackFireTick;

/**
 * S37 P7 — wind-up tick at which the lion-form `charge` sprite engages AND
 * the procedural Web Audio CHARGE SFX fires (`applyCreatureTick` emits
 * `CREATURE_CHARGE` GameEffect at this tick boundary). Shared by:
 *  - `voltkinFrames.currentFrameKey` — sprite swap chibi→lion
 *  - `voltkinFrames.flashIntensity` — 2-tick transformation flash
 *  - `applyCreatureTick` — CREATURE_CHARGE emit + audioManager drain → SFX
 * Promoted from a render-local constant to voltkin-config so all three
 * call-sites read the same source (Council R1 D1 DRY fix).
 */
export const VOLTKIN_ATTACK_CHARGE_ENGAGE_TICK = VOLTKIN_CONFIG.attackChargeEngageTick;

/**
 * S28 P0 — convert wall-clock cinematic duration (ms) to a tick count for the
 * tick-deterministic pending-spawn schedule (replaces S25's wall-clock setTimeout
 * in cutsceneOverlay.ts:152 — Council Q2 UNANIMOUS A single-slot pending). Uses
 * `Math.round` (PRIME-AUDIT Δ4) for closest-fit at non-multiple-of-60 cinematic
 * durations: 4000→240, 4017→241, 4008→240. PHYSICS_DT is fixed 1/60s so 60 ticks
 * per second. Pure function; trivially unit-testable.
 */
export function cinematicMsToTicks(ms: number): number {
  return Math.round(ms / 1000 * 60);
}

/**
 * S25 v1 creature type. S29+ will add `'anvil'` and `'pacPredator'`. The type discriminates
 * spritesheet, FSM transition table, attack range, etc. (see blueprint § "Creature type config").
 *
 * S100 P1 (TD Phase 1a) — `'chewer'`: the persistent tower-defense swarm creature
 * emitted by a spawner-structure. Generalizes the Voltkin substrate (see
 * `CHEWER_CONFIG` in voltkin-config.ts). Adding it here forces a CREATURE_CONFIGS
 * entry (exhaustiveness) and a CHEWER branch wherever a CreatureConfig is consumed.
 */
// S113 Batch C — `'lightningDrone'`: the self-exploding suicide drone emitted by a lightningHub
// spawner. Generalizes the Voltkin substrate (same FSM / Verlet / SEVER_BOND choke point) with a
// NEW `selfExplode` config discriminator (see LIGHTNING_DRONE_CONFIG in voltkin-config.ts). Adding
// it here forces a CREATURE_CONFIGS entry (exhaustiveness) + a drone branch wherever a CreatureConfig
// is consumed (the main.ts fan-out explode hook + the drone FSM gating).
// S139 P2 — 'goblinMelee' is the first FREE, NON-GODLY unit and the first creature that attacks
// STRUCTURES (primitives) rather than connectors. It follows the `lightningDrone` precedent exactly:
// a new member here forces a CREATURE_CONFIGS entry (that Record is compile-time exhaustive), and the
// behaviour is selected by a CONFIG DISCRIMINATOR (`targetsStructures`, cf. the drone's
// `selfExplode`) rather than by branching on `sourceSpawnerId`. That distinction matters — A.0b
// measured FIVE separate places where `sourceSpawnerId === null` is overloaded to mean "is a
// Voltkin", and adding a fourth type by riding that overload would have inherited Voltkin's
// own-bond fallback, its phantom centre-repulse and its un-raidability all at once.
// ⚠ This literal is SERIALIZED (`deserializeCreature` writes `type: s.type` with no whitelist), so
// it forces a PROTOCOL_VERSION bump — the same class as 'lightningDrone', which bumped 13→14.
export type CreatureType =
  /* ── S168 (owner R149) — THE ORC WARLORD'S DIREWOLF ──────────────────────────────────────────
   * *"Orc warlors summons 3 direwolves every 15 sec with stats 3, 3, 3, 3 each direworlf
   * (i will generate the image for him.)"*
   *
   * ⛔ A SUMMON WITH ITS OWN STATS CANNOT BE ANYTHING BUT ITS OWN LITERAL, for the reason the
   * `t3*` block below states in full: `serializeCreature` emits `hp` only when a creature is
   * DAMAGED, so an undamaged one carries no stats on the wire and the receiving peer rebuilds them
   * from its OWN `CREATURE_CONFIGS`, keyed by TYPE. Distinct stats are therefore only expressible
   * as a distinct type. It is SERIALIZED, so it takes PROTOCOL_VERSION 44 -> 45 on exactly the same
   * grounds as 'lightningDrone' (13->14) and 'raceUnit' (41->42).
   *
   * ⚠ It is a SUMMON, not a spawner output: it carries `sourceSpawnerId: null` like the Voltkin,
   * because no CreatureSpawner mints it. Its population ceiling is therefore its own, not the
   * goblin family's. */
  | 'direwolf'
  | 'voltkin'
  | 'chewer'
  | 'lightningDrone'
  /* ── S151 P3 — THE SIX GOBLIN KINDS (owner R70 shape map, owner R77 stats) ────────────────────
   * One tower, six outputs: feed it ONE shape and it spawns the goblin that shape maps to.
   *   Dot → suicide · Line → archer · Triangle → melee · Square → shield · Circle → hound ·
   *   Spiral → bat rider.
   * `goblinMelee` predates the tower (it was the free starter unit) and IS the Triangle output, so
   * only five members are new. Every one of them is a SERIALIZED literal, which is why P3 costs its
   * own PROTOCOL_VERSION bump — see net/protocol.ts. */
  | 'goblinMelee'
  | 'goblinArcher'
  | 'goblinShield'
  | 'goblinHound'
  | 'goblinBat'
  /** Owner calls this "the terrorist goblin"; the project's own roadmap (Q1) named it `suicide`,
   *  which is the vocabulary already used for the lightning drone, so that name is kept. */
  | 'goblinSuicide'
  /* ── W1-C (S165) — THE CASTLE'S RACE UNIT (owner R107/R125/R133/R134) ─────────────────────────
   * The free soldier every castle emits on a ~30 s timer. ⭐ ONE literal for all SIX races, not
   * six: R94/R117 make them stat-identical forever, and the RACE is read off the owner's
   * `player.raceId` — which has been on the wire since PROTOCOL 39 — purely to pick an atlas.
   * Six stat-identical literals would have been six places for one stat line to drift apart, and
   * six more entries in every exhaustive Record for no decision gained.
   * ⛔ SERIALIZED, so it costs a PROTOCOL_VERSION bump (41 -> 42) on the same grounds as
   * 'lightningDrone' (13->14) and the five goblins (29->30): `deserializeCreature` writes
   * `type: s.type` with no whitelist, so a stale peer would accept the literal and then find
   * `CREATURE_CONFIGS[unknown] === undefined` on its own mirror. */
  | 'raceUnit'
  /* ── S166 — THE TIER-3 TOWER'S SIX UNITS (owner R119/R134/R135) ───────────────────────
   * ⛔ SIX LITERALS, AND UNLIKE `raceUnit` THAT IS FORCED RATHER THAN CHOSEN. The castle mints ONE
   * type for all six races because R125 makes them stat-IDENTICAL, and the note above says why six
   * would have been wrong there. R135 makes THESE stats vary per race — and `serializeCreature`
   * emits `hp` only when a creature is DAMAGED, so an undamaged one carries no stats on the wire at
   * all and the receiving peer reconstructs them from its OWN `CREATURE_CONFIGS`, keyed by TYPE
   * (`net/protocol.ts`, the 27->28 entry, which bumped for exactly this reason). Per-race stats are
   * therefore only expressible as per-race TYPES: one literal plus a race lookup would desync the
   * moment two peers disagreed about a piranha's HP.
   *
   * ⚠ A DIFFERENT POPULATION FROM `raceUnit`, NOT A TIER OF IT (R134). The castle emits humanoid
   * soldiers; the tower emits these creatures. The `t3` prefix keeps that split visible at every
   * call site and mirrors the art on disk (`/art/race-tier3-units/t3-<race>-<unit>`).
   *
   * ⛔ SERIALIZED, so they cost a PROTOCOL_VERSION bump (42 -> 43) on exactly the grounds the five
   * goblins did (29->30): `deserializeCreature` writes `type: s.type` with no whitelist, so a stale
   * peer ACCEPTS the literal and then finds `CREATURE_CONFIGS[unknown] === undefined`. */
  | 't3Hound'
  | 't3Scarab'
  | 't3Piranha'
  | 't3Bat'
  | 't3Warband'
  | 't3Souleater'
  /* ── S167 — THE SIX TIER-9 BOSSES (`RACE_ZONES_AND_BOSS_TOWERS.md` §B) ────────────────────
   * One per race, released by the tier-9 tower and named by the owner: Vlad · Kraken · Pharaoh ·
   * Whopper · Warlord · Archdemon.
   *
   * ⛔ SIX LITERALS FOR THE SAME REASON THE TIER-3 UNITS NEEDED SIX, and here the reason is even
   * stronger: six bosses with six different stat lines and six different silhouettes are the whole
   * point of the feature. `serializeCreature` emits `hp` only when a creature is DAMAGED, so the
   * receiving peer rebuilds stats from its OWN `CREATURE_CONFIGS` keyed by TYPE — one literal plus
   * a race lookup would desync the moment two peers disagreed about the Kraken's HP.
   *
   * ⛔ KEYED BY RACE, NOT BY BOSS NAME. These are serialized wire literals and one of the six names
   * is still an open trademark question with the owner ("Whopper"). The NAMES live in
   * `T9_BOSS_NAMES` (`state/t9BossIds.ts`), where changing one is free; a name in the literal would
   * cost a protocol bump. See that file's docblock for the full argument.
   *
   * ⭐ SPAWNED WITH `sourceSpawnerId: null`, WHICH IS A DESIGN DECISION AND NOT AN OMISSION. That
   * routes the boss to `applySpawnCreature`'s null branch, whose one-live-per-(owner, type) gate
   * (`creatureLifecycle.ts:166`) IS the spec's *"only ONE of a seat's bosses alive at a time"* — for
   * free, with no new cap family. A non-null id would instead route it to `underGoblinCaps` and
   * share `GOBLIN_MAX_GLOBAL = 200` with every goblin tower, which is the S157 B1 / S165 W1-C defect
   * a third time.
   *
   * ⛔ SERIALIZED, so they cost the PROTOCOL_VERSION bump (43 -> 44) on exactly the grounds the five
   * goblins (29->30) and the six tier-3 units (42->43) did. */
  | 't9BossVampires'
  | 't9BossNagas'
  | 't9BossMummies'
  | 't9BossZombies'
  | 't9BossOrcs'
  | 't9BossDemons';

/**
 * Full 4-state FSM per blueprint Q2. S25 only USES SPAWNING + DESPAWNING; SEEKING + ATTACKING
 * are reserved-but-unused (TypeScript erases unused members; full union from start saves S26
 * type churn — Council R1 unanimous).
 */
export type CreatureState = 'SPAWNING' | 'SEEKING' | 'ATTACKING' | 'DESPAWNING';

/**
 * Authoritative creature record. `pos / prevPos` shape mirrors Verlet bodies for free
 * implicit-velocity in `creatureVerlet.ts` substep integration. `state + ticksInState`
 * drives FSM transitions and renderer animation-frame selection (S28). `targetPos` is
 * the destination point in canvas space the creature steers toward during SEEKING
 * (S26 stub via `computeStubTargetPos`; S27 will overwrite with AI-selected enemy bond
 * midpoints per blueprint Q9). `targetBondId` for the per-attack target is reserved
 * for S27 (additive field, default null when introduced).
 */
export interface Creature {
  readonly id: CreatureId;
  readonly type: CreatureType;
  readonly ownerPlayerId: PlayerId;
  pos: Vec2;
  prevPos: Vec2;
  /** S26 P0 — destination point in canvas space for SEEKING-state steering. Mutable
   *  so S27 AI target selection rewrites per tick from nearest-bond midpoint
   *  (Council R1 Q3 UNANIMOUS A — every-tick re-selection during SEEKING). */
  targetPos: Vec2;
  /**
   * S27 P0 — bond targeted by the AI for the next ATTACKING cycle. Mutable; set
   * by `findNearestBondTarget` in `src/state/creatures/creatureAI.ts` during
   * SEEKING fan-out (main.ts post-CREATURE_TICK loop). `null` when no targetable
   * bond exists OR creature is in SPAWNING/DESPAWNING (no AI). Cleared on
   * SEEKING ↔ ATTACKING transitions so the next state-entry re-selects fresh.
   * NOT serialized in S27 — host-authoritative until S28 NetSnapshot v2.
   * NetSnapshot v2 (S28) MAY include `targetBondId` so client renderer can draw
   * a "lock-on" indicator; for S27 client.world.creatures stays empty so the
   * field is host-only.
   */
  targetBondId: BondId | null;
  /**
   * S103 #8 — creature this one is zapping THIS attack cycle, or `null`. Parallel to
   * `targetBondId` but for the creature population (a Voltkin opportunistically zapping an
   * enemy chewer that wandered within its attackRange — Council MF3: bonds drive navigation,
   * a creature is only struck when already in range). Set by the main.ts SEEKING fan-out
   * (`findNearestEnemyCreature`), consumed by the FSM (SEEKING→ATTACKING also enters on a
   * creature-in-range) + the attack-fire (creature-first → `damageCreature`). Cleared on every
   * SEEKING/ATTACKING/DESPAWNING transition alongside `targetBondId`. `0`/chewers never set it.
   *
   * HOST-ONLY — STRIPPED from the wire (`trimMirrorCreature`) and emitted-when-non-null through
   * the host save path (the `targetBondId`/`chewProgress` precedent). The 1v1 client needs no
   * creature-reticle: it sees the synced ATTACKING animation + the victim vanishing from the
   * snapshot (the render-driven goo/cloud death-watcher), so this never rides the snapshot →
   * P1 adds ZERO wire surface and needs NO protocol bump (Council MF6).
   */
  targetCreatureId: CreatureId | null;
  /**
   * S139 P2 — the committed enemy PRIMITIVE for a structure-attacking creature (the goblin).
   *
   * A PARALLEL NULLABLE FIELD, deliberately, rather than widening `targetCreatureId` into a target
   * union. That follows the shipped precedent standing two lines above: `Creature` already carries
   * `targetBondId` AND `targetCreatureId` side by side, each independently serialized and hashed.
   * Widening the existing field instead would have forced a new hash ENCODING (the projection uses
   * `n()`, which expects a numeric id) and touched ~18 read/write sites for no behavioural gain.
   *
   * Why it is stored at all rather than re-derived: three separate sites need to agree on which shape
   * the goblin is committed to — the SEEKING→ATTACKING range test, the attack-fire guard in the
   * hostTick fan-out, and the strike itself. Re-deriving "nearest enemy primitive" independently in
   * each could let them disagree within a single tick (a nearer shape appearing between the range
   * test and the strike), which is precisely the class of drift that desyncs a host from its mirror.
   *
   * `null` for every existing creature type, so all three are byte-identical.
   */
  targetPrimitiveId: PrimitiveId | null;
  state: CreatureState;
  /** Ticks elapsed since entering current `state`. Resets on transition. */
  ticksInState: number;
  /**
   * S36 P3 — count of bonds this creature has successfully severed during
   * its lifetime. Increments in `applyCreatureAttack` AFTER the
   * `!world.bonds.has(action.bondId)` post-dispatch confirmation (true
   * success path; defense-in-depth guards against a hypothetical future
   * canSeverBond policy that rejects 'creature' severance). Drives the
   * DESPAWNING victory/hurt frame branch in `voltkinFrames.currentFrameKey`:
   * killCount > 0 → victory (chibi, triumphant); killCount === 0 → hurt
   * (chibi, dazed — creature never connected). Tick-deterministic
   * increment (dispatched from CREATURE_ATTACK in main.ts fan-out) so
   * `save.replay.test.ts` byte-equivalence stays green. Mutable. Serialized
   * additively in `save.ts` (pre-S36 saves rehydrate as 0).
   */
  killCount: number;
  /** Tick at which SPAWN_CREATURE was applied. Determines despawnAtTick. */
  readonly spawnedAtTick: number;
  /** Tick at which the creature is auto-removed from `world.creatures`. */
  readonly despawnAtTick: number;
  /**
   * S100 P1 (TD Phase 1a) — provenance / population discriminant. `null` for a
   * Voltkin (lifetime-bound, summoned via the godly cinematic single-slot);
   * a `SpawnerId` for a chewer (persistent, emitted by that spawner-structure).
   *
   * ⚠ CORRECTED S134 — NO LONGER stripped from the wire. It was host-save-only (the
   * SerializedBomb.dissipateAtTick precedent), which meant a promoted successor lost every
   * creature's provenance: the per-spawner caps silently degraded to the global cap and a
   * rehydrated chewer/drone was mis-counted as its owner's Voltkin, blocking their summon.
   * Now round-trips on BOTH the save and the wire. Drives:
   *   - the split max-1 cap (Voltkin `null`-population counted independently of
   *     the chewer `SpawnerId`-population) so a swarm never blocks a summon (R10);
   *   - FFA target-spread (`mix32(creatureId, sourceSpawnerId)`);
   *   - scoped target-stickiness (`sourceSpawnerId != null && chewProgress > 0`)
   *     so Voltkin's every-tick re-selection stays byte-identical.
   * Mutable-free (readonly): set once at construction. Later layers wire the cap
   * split / targeting / save round-trip; this layer only declares + defaults it.
   */
  readonly sourceSpawnerId: SpawnerId | null;
  /**
   * S100 P1 (TD Phase 1a) — incremental chew accumulator vs the CURRENT committed
   * bond (`targetBondId`). A chewer in ATTACKING increments this once per
   * `CHEW_INTERVAL_TICKS` and severs (dispatches `CREATURE_ATTACK` → `SEVER_BOND`)
   * only when it reaches the config's `chewHits` (5). While `chewProgress > 0`
   * the chewer does NOT re-run `findNearestBondTarget` — it commits to the bond
   * (R9). Resets to 0 only when `world.bonds.has(targetBondId)` is false.
   *
   * ⚠ AMENDED S133 — NO LONGER STRIPPED FROM THE WIRE. It was, and that meant a
   * host-migration successor inherited every chew reset to zero; since `CONNECTOR_HP`
   * IS this counter, that silently reverted all bond damage on every handoff. Still
   * ROUND-TRIPPED through host save/load so a mid-chew chewer survives a save (R3).
   * `0` for Voltkin (it never chews).
   * Mutable. Later layers own the increment/reset logic; this layer declares it
   * and the factory defaults it to 0.
   */
  chewProgress: number;
  /**
   * ⭐⭐ S168 (owner R149) — **THE ORC WARLORD IS ENRAGED.** *"he becomes enraged when drops to 25%
   * health and attacks and moves x2 quicker for the rest of his lifetime."*
   *
   * ⚠ IT LATCHES, AND THAT IS WHY IT IS A FIELD RATHER THAN A PREDICATE. *"for the rest of his
   * lifetime"* is explicit: a flag derived from current HP would switch OFF again the moment he was
   * healed back over the line, which is the opposite of the ruling.
   *
   * ⛔ **DELIBERATELY NOT SERIALIZED AND NOT HASHED**, and that is a decision rather than an
   * oversight. It is DERIVED state: both the host and its `?worker=1` mirror compute it from the
   * same `ehp` against the same threshold on the same tick, so it can never disagree between the
   * two sims that `hashWorldStateFull` actually compares. The client never simulates — it renders
   * positions from snapshots — so it has no use for the flag either. Putting it on the wire would
   * buy nothing and cost the four-sites tax plus a `FIELD_COVERAGE` entry.
   *
   * ⚠ THE COST, NAMED: a HOST MIGRATION rebuilds creatures from a snapshot, so an enraged Warlord
   * calms down under the new host until he next crosses the threshold — and if he is already below
   * it, that is the very next tick. Same tradeoff as the life-sap ledger, and the same reasoning.
   *
   * ⚠ ADDITIVE-OPTIONAL rather than required, and that is also deliberate: a required field
   * would force `enraged: false` into roughly twenty hand-built Creature fixtures across the
   * suite that have no opinion about rage, which is churn with no signal in it. `=== true` is
   * the only read, so `undefined` and `false` mean the same thing everywhere.
   */
  enraged?: boolean;
  /**
   * ⭐ S151 P2 — REMAINING EFFECTIVE HIT POINTS, **IN FIFTHS**. Renamed from `hp`, and the rename is
   * load-bearing rather than cosmetic.
   *
   * Owner R72 put HP and DEF on one ladder, where a unit's pool is `hp × (1 + 0.2·DEF)`. Since DEF
   * steps by fifths, the runtime pool has to be stored in fifths for the arithmetic to stay exact —
   * so this field holds `unitPoolFifths(config.hp, config.def)` (chewer 1×5 = 5, Voltkin 8×5 = 40).
   *
   * ⛔ **WHY IT COULD NOT KEEP THE NAME `hp`.** The field kept its type and its position on the wire
   * while its UNIT changed — a v28 peer reading `hp: 40` would see forty hit points where a v29 host
   * means eight. Same name, same type, different meaning is the failure mode a version bump alone
   * does not make visible to a reader, and both Council seats flagged it independently. Renaming
   * turns every unconverted call site into a COMPILE error instead of a silent forty-fold buff.
   *
   * A "hit" (player RAID, Voltkin zap, laser beam, HELGA slap) subtracts `attackFifths(atk, pen)`
   * via `damageCreature`; at ≤ 0 the creature despawns with its death VFX (chewer → green goo;
   * Voltkin → lightning-cloud). Mutable. ROUND-TRIPPED through host save/load, emitted only when
   * damaged (see `serializeCreature`).
   */
  ehp: number;
  /**
   * S109 P2 — tick until which a seagull-pooped creature crawls at POOP_SLOW_MULTIPLIER speed
   * ("still in effect but slowed if poop hits them"). undefined / past = not slowed (self-heals
   * at expiry). Consumed by `computeSteeringAccel` (scales the steering accel while live).
   *
   * ⛔ S165 (sweep Lane 2) — THIS SAID "HOST-ONLY — NOT serialized" AND IT IS SERIALIZED. S142 P1
   * added it to `SerializedCreature` and `serializeCreature` emits it (`save.ts:1922`, conditionally
   * so an un-pooped creature stays byte-identical), with `deserializeCreature` restoring it
   * (`save.ts:2283`). S142's own story is that the debuff did NOT survive a round-trip and had to be
   * put on the wire — so the field's two halves have been asserting opposite things ever since.
   *
   * ON THE WIRE, conditionally: zero surface for an un-pooped creature, which is what preserves the
   * Voltkin/chewer replay-equivalence guard, and what let it land without a protocol bump under the
   * additive-optional rule. Mutable; defaults undefined (no factory change).
   */
  poopyUntilTick?: number;
}

/**
 * S100 P1 (TD Phase 1a) — generic creature factory. `makeVoltkinCreature` is now a
 * thin wrapper over this so existing Voltkin call sites + tests stay byte-identical
 * (the wrapper passes `VOLTKIN_CONFIG` and the Voltkin defaults `sourceSpawnerId:null`
 * / `chewProgress:0`). A chewer spawn (later layer) calls `makeCreature(CHEWER_CONFIG, …)`
 * with a non-null `sourceSpawnerId`.
 *
 * `prevPos` snaps to `pos` so the first Verlet substep sees zero initial implicit
 * velocity. `despawnAtTick` is fixed at construction from `config.lifetimeTicks` —
 * deterministic from this point (for a persistent chewer the FSM `!config.persistent`
 * gate, not this tick, governs removal; the sentinel lifetime is defense-in-depth).
 * `targetPos` is supplied by the caller (Council Q1: the caller computes it).
 */
/**
 * ⭐ S155 P3 — the tick a creature's lifetime STARTS counting from.
 *
 * Pure, and the ONLY place the rule lives. For an `'absolute'`-clock creature (every creature but
 * Voltkin, and the default when the field is omitted) that is its birth tick — byte-identical to the
 * pre-S155 behaviour. For a `'fight'`-clock creature born during BUILD it is the start of its FIRST
 * fight, which during BUILD is exactly what `phaseEndsAtTick` holds.
 *
 * ⛔ ONE STEP, NEVER A RUNNING PAUSE. Read the `lifetimeClock` docblock in voltkin-config.ts for the
 * stasis-chamber exploit that bounds this: pausing across every BUILD would let a player bank Voltkins
 * through the build phase and enter the next fight with multiples of the intended mass.
 *
 * `clock` is optional so the hundreds of existing factory calls (and every locked replay guard) keep
 * the absolute behaviour with no edit — omitting it can only ever mean "count from birth".
 */
export function lifetimeStartTick(
  config: Pick<CreatureConfig, 'lifetimeClock'>,
  spawnedAtTick: number,
  clock?: { matchPhase: 'BUILD' | 'FIGHT'; phaseEndsAtTick: number },
): number {
  if (config.lifetimeClock !== 'fight' || clock === undefined) return spawnedAtTick;
  return clock.matchPhase === 'BUILD' ? clock.phaseEndsAtTick : spawnedAtTick;
}

export function makeCreature(
  config: CreatureConfig,
  args: {
    id: CreatureId;
    ownerPlayerId: PlayerId;
    pos: Vec2;
    targetPos: Vec2;
    spawnedAtTick: number;
    /** S100 P1 — null = Voltkin (lifetime-bound); SpawnerId = chewer (persistent). */
    sourceSpawnerId?: SpawnerId | null;
    /**
     * ⭐ S155 P3 — the live match clock, for `lifetimeClock: 'fight'` creatures. `World` satisfies it
     * structurally, so the reducer just passes `world`.
     *
     * OMITTING IT IS SAFE AND MEANS "absolute": that is what preserves byte-equivalence for every
     * existing call site and for the locked replay guards. Both fields it reads are already hashed and
     * already on the wire, so this needs no new wire field and no PROTOCOL_VERSION bump.
     */
    clock?: { matchPhase: 'BUILD' | 'FIGHT'; phaseEndsAtTick: number };
  },
): Creature {
  return {
    id: args.id,
    type: config.type,
    ownerPlayerId: args.ownerPlayerId,
    pos: { x: args.pos.x, y: args.pos.y },
    prevPos: { x: args.pos.x, y: args.pos.y },
    targetPos: { x: args.targetPos.x, y: args.targetPos.y },
    targetBondId: null,
    targetCreatureId: null, // S103 #8 — set opportunistically (Voltkin) by the main.ts fan-out
    targetPrimitiveId: null, // S139 P2 — set only for a structure-attacker (goblin)
    state: 'SPAWNING',
    ticksInState: 0,
    enraged: false, // S168 R149 — latched by `runWarlordRage`; see the field's note.
    killCount: 0,
    spawnedAtTick: args.spawnedAtTick,
    // ⭐ S155 P3 — computed ONCE, here, and stored as an ABSOLUTE tick. That is what keeps it
    // restore- and migration-safe: `despawnAtTick` is itself serialized, so a snapshot or a
    // host takeover carries the integer rather than recomputing it against a clock that may have
    // moved on. A later mutation of `phaseEndsAtTick` cannot retroactively change a live creature.
    despawnAtTick:
      lifetimeStartTick(config, args.spawnedAtTick, args.clock) + config.lifetimeTicks,
    sourceSpawnerId: args.sourceSpawnerId ?? null,
    chewProgress: 0,
    // S151 P2 — the pool is HP POINTS x the DEF multiplier, in fifths. def is 0 across the
    // shipped roster, so this is exactly the old hit count x5 and every kill count is unchanged.
    ehp: unitPoolFifths(config.hp, config.def),
  };
}

/**
 * Factory for a freshly-spawned Voltkin creature in SPAWNING state. Thin wrapper over
 * `makeCreature(VOLTKIN_CONFIG, …)` (S100 P1) — the call-site API is unchanged, and a
 * Voltkin always gets `sourceSpawnerId:null` / `chewProgress:0`. `despawnAtTick` resolves
 * to `spawnedAtTick + VOLTKIN_LIFETIME_TICKS` exactly as before (VOLTKIN_CONFIG.lifetimeTicks
 * === VOLTKIN_LIFETIME_TICKS by construction), preserving the locked replay byte-equivalence.
 */
export function makeVoltkinCreature(args: {
  id: CreatureId;
  ownerPlayerId: PlayerId;
  pos: Vec2;
  targetPos: Vec2;
  spawnedAtTick: number;
  /**
   * S155 P3 — forwarded to `makeCreature` so a Voltkin summoned during BUILD starts its 20 s at
   * FIGHT. Optional, so every existing call (and the replay guards) keeps the absolute clock.
   */
  clock?: { matchPhase: 'BUILD' | 'FIGHT'; phaseEndsAtTick: number };
}): Creature {
  return makeCreature(VOLTKIN_CONFIG, { ...args, sourceSpawnerId: null });
}
