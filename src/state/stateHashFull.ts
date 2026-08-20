/**
 * SPARK — WIDE determinism hash + the World COVERAGE CONTRACT (S133 P1).
 *
 * ============================ WHY THIS FILE EXISTS ============================
 * `hashWorldState` (stateHash.ts) is a SIX-field `Pick`: tick, primitives, bonds,
 * freeSparks, scoreProgress, scoreByPlayer. Every other entity family — creatures,
 * spawners, defenders, bombs, hunters, potatoes, rainbows, seagulls, poops,
 * fouledPrimitives — is INVISIBLE to it, as is every world scalar including
 * `rngSeed`. A desync in any of them produced an identical hash on both sides, so
 * four differential harnesses that assert hash equality (two independently-seeded
 * sims every tick; main-vs-worker across 300 frames; two replay suites) were
 * structurally unable to see it.
 *
 * S133 A.0 also found there was NO forcing function on either determinism site:
 * `stateHash.test.ts` never constructs a creature/defender/spawner, and
 * `structuralSignature` has exactly ONE assertion repo-wide (a negative one).
 * Adding a family to one mechanism and not the other failed ZERO tests.
 *
 * ===================== WHY TWO HASHES INSTEAD OF ONE WIDE ONE =================
 * Council S133 decision #1 (SYNTHESIS). `hashWorldState` has a PRODUCTION call
 * site (main.ts's `hashWorldState(world)` call site, per worker batch). Widening it in place would have made a
 * per-entity string projection run on the worker hot path — and for no runtime
 * benefit, because that call site compares the main-thread mirror against the
 * WORKER'S OWN snapshot hash: both sides derive from a SINGLE authority, so it is
 * an apply-fidelity check, not a two-simulation desync check (its own comment says
 * so). Therefore:
 *
 *   • `hashWorldState`     — NARROW, production, cost UNCHANGED by this file.
 *   • `hashWorldStateFull` — WIDE, test-only. Never imported by main.ts, so it
 *                            contributes ZERO bytes to the prod entry chunk
 *                            (verified: entry chunk went DOWN 100 B in S133).
 *
 * ⚠ TWO-ORACLE HAZARD, NAMED SO IT CANNOT SURPRISE ANYONE. Green differential
 * tests now prove more than the production oracle can see. If the narrow hash is
 * ever repurposed for host-migration validation, telemetry or anti-cheat, it will
 * be blind to everything below. It is a PARTIAL apply-fidelity check, not a
 * determinism hash — treat it as such. Drift between the two is closed
 * structurally: `NARROW_HASHED_FAMILIES` is a runtime list that `HashableWorld`
 * derives FROM, and `stateHashFull.test.ts` asserts every entry is `'hashed'`
 * here.
 *
 * ⚠ CORRECTED AFTER CHECK (S133). The first version of this contract derived its
 * key set from "collection-shaped" fields (`Map | Set | readonly unknown[]`).
 * RALPH:PATROL broke that with a repro: `Record<K,V>` object-maps, `ReadonlyMap`,
 * `WeakMap` and typed arrays (`Float64Array` — already used by the S122 worker
 * positions buffer) ALL escaped it silently, and every world SCALAR was outside
 * the contract by construction, `rngSeed` included. Shape-detection was the wrong
 * idea. `FIELD_COVERAGE` below is now keyed on `keyof World`, so EVERY field of
 * ANY shape must be classified or `tsc` fails by name. That is the only version
 * of this claim that is actually true.
 */

import type { World } from './worldTypes.ts';
import { fnv1a32 } from './stateHash.ts';

/* ========================================================================== *
 *                          THE COVERAGE CONTRACT                             *
 * ========================================================================== */

/**
 * ⛔ EVERY field of `World` must appear here — not just collections. This is the
 * FORCING FUNCTION (S133 P1b; field granularity per Council decision #5, whole-
 * World keying after the CHECK repro above).
 *
 * Add ANY field to `World` and omit it here ⇒ **`tsc` fails**, naming the missing
 * key. `'hashed'` means `hashWorldStateFull` projects it below; `'acknowledged'`
 * means it is deliberately excluded AND the reason is written down. An exclusion
 * is allowed — an UNDOCUMENTED one is not.
 */
export const FIELD_COVERAGE: Readonly<Record<keyof World, 'hashed' | 'acknowledged'>> = {
  // ---- narrow-hash surface (MUST stay 'hashed' — the drift test enforces it) ----
  tick: 'hashed',
  primitives: 'hashed',
  bonds: 'hashed',
  freeSparks: 'hashed',
  scoreProgress: 'hashed',
  scoreByPlayer: 'hashed',

  // ---- entity families S133 made visible for the first time ----
  creatures: 'hashed',
  creatureSpawners: 'hashed',
  defenders: 'hashed',
  // V6-1.1 — bought gatherer units. Hashed HERE (the wide oracle), deliberately NOT added to
  // stateHash.ts NARROW_HASHED_FAMILIES (R1: the narrow set stays narrow — it is on the prod hot path).
  gatherers: 'hashed',
  // S136 P1 (V6-1.3) — the castle bank. Hashed HERE (the wide oracle) on the same rationale as
  // gatherers, and deliberately NOT added to stateHash.ts NARROW_HASHED_FAMILIES (R1: the narrow
  // set is on the prod hot path and stays narrow). This field is what a hauled shape BECOMES, so a
  // successor that inherited a world without it would silently lose every banked shape — the exact
  // failure class the S135 hunter-lifetime work existed to close.
  castleBanks: 'hashed',
  // S141 P2 (V6-1.4) — the per-player gatherer order queue. HASHED, and not optional: the queue is
  // an authoritative input to `pickGathererTarget`, so two sims holding different queues will send
  // their gatherers to different sparks and diverge within a tick. This is exactly the class the
  // wide oracle exists to catch, so it must contribute.
  gathererOrders: 'hashed',
  bombs: 'hashed',
  hunters: 'hashed',
  potatoes: 'hashed',
  rainbows: 'hashed',
  seagulls: 'hashed',
  poops: 'hashed',
  fouledPrimitives: 'hashed',
  discoveredCombos: 'hashed',
  godlyFiredThisMatch: 'hashed',

  // ---- world scalars: sim-authoritative, and previously outside ANY contract ----
  /** The canonical desync root. Its absence from every oracle was CHECK finding F8. */
  rngSeed: 'hashed',
  gameState: 'hashed',
  // S147 P1 — THE MATCH CLOCK. Both hashed: the phase gates scoring (and, from S149 on, walls,
  // gatherer shelter, tower dormancy and castle guns), so a peer that disagreed about either would
  // simulate a different game. `phaseEndsAtTick` is hashed as well as the phase because the DEADLINE
  // is what a joiner and a promoted successor have to agree on — matching phases with mismatched
  // deadlines diverges one tick later.
  matchPhase: 'hashed',
  phaseEndsAtTick: 'hashed',
  // ⭐ S148 P1 — THE BOARD. Every castle anchor derives from it, every gatherer spawn derives from
  // the anchor, and `canBuildAt` reads it to decide whose ground a pixel is. A peer that disagreed
  // about the layout would place its keeps somewhere else and enforce different borders — this is
  // the single highest-consequence scalar in the World, so it is hashed rather than acknowledged.
  layout: 'hashed',
  lastWinnerId: 'hashed',
  hunterSpawned: 'hashed',
  rainbowSwitchTick: 'hashed',
  sudokuFiredThisMatch: 'hashed',
  activeCinematicPlayerId: 'hashed',
  // Allocator cursors — two sims that allocated different id counts have diverged
  // even when the surviving entities happen to match.
  nextPrimitiveId: 'hashed',
  nextBondId: 'hashed',
  nextPulledSparkId: 'hashed',
  nextCreatureId: 'hashed',
  nextSpawnerId: 'hashed',
  nextDefenderId: 'hashed',
  nextGathererId: 'hashed',
  nextBombId: 'hashed',
  nextHunterId: 'hashed',
  nextPotatoId: 'hashed',
  nextRainbowId: 'hashed',
  nextSeagullId: 'hashed',
  nextPoopId: 'hashed',
  /** The NONET trial FREEZES the sim, so its presence and identity are sim state. */
  sudoku: 'hashed',
  /** A queued spawn is pending sim work, not presentation. Discriminant only (see body). */
  pendingCreatureSpawn: 'hashed',

  // ---- ACKNOWLEDGED, each with its reason ----
  /**
   * `players` is the one family where main-thread divergence from authority is BY
   * DESIGN: main.ts's worker-result apply block documents a deliberate drag-preserve restore that
   * "diverges the locked spark from authority (the S56 client-prediction
   * posture)". Hashing avatar state would make the oracle report client
   * prediction as a desync. `scoreByPlayer` (the authoritative per-seat scalar) IS
   * hashed, so seat scoring stays covered.
   * ⚠ Re-open when V6-1.5 lands: deleting `CarryingPlayer` reshapes the union.
   */
  players: 'acknowledged',
  /**
   * Per-FRAME render telemetry, wiped every frame by `effectsRenderer.sync`
   * (`world.effects.length = 0`). Its lifetime is shorter than a tick, so both
   * sides legitimately hold different contents at any instant.
   */
  effects: 'acknowledged',
  /** Presentation sequencing; the authoritative gate (`godlyFiredThisMatch`) IS hashed. */
  pendingCinematics: 'acknowledged',
  /** Presentation-only; `activeCinematicPlayerId` carries the sim-visible part. */
  currentCinematicEvent: 'acknowledged',
  /** Display strings derived from `discoveredCombos`, which is hashed. */
  lastDiscoveredComboNames: 'acknowledged',
  /** Presentation timer for the combo toast; no sim branch reads it. */
  comboToastTick: 'acknowledged',
  /**
   * ⛔ MUST stay acknowledged — `isHost` and `localPlayerId` differ between host
   * and client BY DEFINITION. Hashing either would make every host-vs-client
   * comparison fail and destroy the oracle.
   */
  isHost: 'acknowledged',
  localPlayerId: 'acknowledged',
  /** Match configuration, fixed at match start and never mutated in-tick. */
  botSeats: 'acknowledged',
  gameMode: 'acknowledged',
  /** A client-side rendering preference; not sim state. */
  cinematicsEnabled: 'acknowledged',
  /**
   * Host-local diagnostic counters (`raceRejects`, `rejectReasons`, the pickup-failure
   * tallies, `territoryBlockRejects`, `intentThrottled` … all NESTED inside this one
   * field). Not sim state: they count REJECTED actions, so a host that rejected an
   * intent and a client that never saw it legitimately differ.
   * ⚠ Being one field means the contract does NOT force new counters to be classified.
   * That is acceptable precisely because the whole subtree is non-sim telemetry — but if
   * anything sim-authoritative is ever added under `diagnostics`, it escapes silently.
   */
  diagnostics: 'acknowledged',
};

/** Resolves to `true` only when `U` is `never`; otherwise a branded error object. */
type NoUncovered<U> = [U] extends [never] ? true : { ERROR_UNCOVERED_FIELD: U };

/**
 * Field-level guards (Council decision #5 — Gemini's catch: a family-level guard
 * would let a NEW FIELD on an already-hashed family slip through silently).
 *
 * ⚠ EXTENDED AFTER CHECK (S133): `primitives`, `bonds` and `freeSparks` — the
 * three families that PREDATE this file — originally had no field guard at all,
 * and RALPH:PATROL proved the consequence with a repro: adding `hp?: number` to
 * `Primitive`, which is EXACTLY the owner-ruled next slot this priority exists to
 * prepare for, passed tsc and every test. They are guarded now.
 */
type ElemOf<M> = NonNullable<ReturnType<M extends { get: (k: never) => infer R } ? () => R : never>>;
type PrimitiveF = keyof ElemOf<World['primitives']>;
type BondF = keyof ElemOf<World['bonds']>;
type SparkF = keyof ElemOf<World['freeSparks']>;
type CreatureF = keyof ElemOf<World['creatures']>;
type SpawnerF = keyof ElemOf<World['creatureSpawners']>;
type DefenderF = keyof ElemOf<World['defenders']>;
type BombF = keyof ElemOf<World['bombs']>;
type HunterF = keyof ElemOf<World['hunters']>;
type PotatoF = keyof ElemOf<World['potatoes']>;
type RainbowF = keyof ElemOf<World['rainbows']>;
type SeagullF = keyof ElemOf<World['seagulls']>;
type PoopF = keyof ElemOf<World['poops']>;
type GathererF = keyof ElemOf<World['gatherers']>;

// Every field name below is projected by hashWorldStateFull. Keep in lockstep.
type PrimitiveHashed =
  | 'id' | 'type' | 'pos' | 'prevPos' | 'placerColor' | 'placedBy' | 'ownerColor'
  | 'lastOwnershipChange' | 'radius' | 'createdTick' | 'bonds' | 'hp'
  // S152 — blueprint provenance. HASHED because it is a sim INPUT, not decoration: it decides
  // whether REPAIR_STRUCTURE can run at all and which bill it pays, so a host and a worker mirror
  // that disagreed about it would disagree about the next build stage's whole economy.
  | 'origin';
type BondHashed =
  | 'id' | 'aId' | 'bId' | 'restLength' | 'stiffnessTier' | 'createdTick'
  | 'stiffnessMultiplier' | 'a' | 'b';
type SparkHashed =
  | 'id' | 'type' | 'pos' | 'prevPos' | 'radius' | 'createdTick' | 'state' | 'poopyUntilTick'
  | 'escrow';
type CreatureHashed =
  | 'id' | 'type' | 'ownerPlayerId' | 'pos' | 'prevPos' | 'targetPos' | 'targetBondId'
  | 'targetCreatureId' | 'targetPrimitiveId' | 'state' | 'ticksInState' | 'killCount' | 'spawnedAtTick'
  | 'despawnAtTick' | 'sourceSpawnerId' | 'chewProgress' | 'hp' | 'poopyUntilTick';
type SpawnerHashed =
  | 'id' | 'ownerPlayerId' | 'anchorPrimitiveId' | 'recipeId' | 'nextSpawnTick'
  | 'lastValidatedTick' | 'spawnedCount' | 'ignitedAtTick';
// ⚠ ADDING A NAME HERE IS NOT ENOUGH — IT ONLY SILENCES `tsc`. The projection below is a
// hand-written string template with NO executable link to this union, so a field listed here but
// absent from the template compiles clean, passes every existing test, and leaves the wide
// determinism oracle BLIND to that field diverging between host and worker/replay. Both must move
// together, and `stateHashFull.test.ts` now carries a per-field contribution test for exactly this.
type DefenderHashed =
  | 'id' | 'kind' | 'ownerPlayerId' | 'anchorPrimitiveId' | 'recipeId' | 'pos' | 'prevPos'
  | 'walkTargetPos' | 'state' | 'ticksInState' | 'hp' | 'nextFireTick' | 'targetCreatureId'
  | 'lastStrikePos' | 'bagsRemaining';
type BombHashed = 'id' | 'pos' | 'radius' | 'spawnedAtTick' | 'dissipateAtTick';
type HunterHashed =
  | 'id' | 'pos' | 'prevPos' | 'state' | 'ticksInState' | 'targetPlayerId' | 'spawnedAtTick'
  | 'despawnAtTick';
type PotatoHashed =
  | 'id' | 'pos' | 'prevPos' | 'state' | 'carrierId' | 'spawnedAtTick' | 'detonateAtTick'
  | 'carriedAtTick';
type RainbowHashed = 'id' | 'pos' | 'spawnedAtTick' | 'dissipateAtTick';
type SeagullHashed = 'id' | 'pos' | 'prevPos' | 'vx' | 'baseY' | 'spawnedAtTick' | 'lastPoopTick';
type PoopHashed =
  | 'id' | 'pos' | 'prevPos' | 'state' | 'spawnedAtTick' | 'landedAtTick' | 'fouledPrimId';
// V6-1.1 — the cosmetic shapeshift is NOT here because it is NOT world state (renderer-only,
// a pure fn of (tick, gathererId)). Every field the entity DOES carry is hashed.
type GathererHashed =
  | 'id' | 'ownerPlayerId' | 'pos' | 'spawnedAtTick' | 'state' | 'targetSparkId'
  | 'carriedSparkId' | 'speedLevel' | 'preferredType';

/**
 * S141 P3 — THE CASTLE-BANK PROJECTION GUARD.
 *
 * `castleBanks` is `Map<PlayerId, Spark[]>`, so the `ElemOf` trick above cannot reach the `Spark`
 * inside it — the element type is an ARRAY, not the entity. The consequence was a real hole: adding a
 * field to `Spark` fires `_sparkComplete` (via `freeSparks`) and is therefore forced into
 * `SparkHashed`, but NOTHING forced it into the BANK projection, which hashes only id/type. Two worlds
 * whose banked shapes differed in that new field would hash EQUAL — the wide oracle blind exactly
 * where the S136 bank work put a whole entity family out of the live map.
 *
 * The fix is a second classification of the SAME field set, from the bank's point of view. Every
 * `Spark` field must be named either as hashed-in-the-bank or as deliberately excluded WITH a reason,
 * and a new field satisfies neither until someone decides which it is.
 */
type BankedSparkHashed = 'id' | 'type';
/**
 * Deliberately EXCLUDED from the bank projection, each for a stated reason:
 *  - `pos`/`prevPos`: a stored shape has no meaningful position. It is out of `freeSparks` so nothing
 *    reads them, and `applyPullFromBank` overwrites both from the porch slot on the way out. Hashing a
 *    dead field would make two functionally identical worlds disagree.
 *  - `state`: always `Free` for a banked shape (the deposit path sets it, the pull path re-sets it).
 *  - `escrow`: cleared on deposit and re-set on pull; it describes transit, not storage.
 *  - `radius`: derived from `type`, which IS hashed.
 *  - `createdTick`: rewritten to the pull tick on the way out, so the stored value is not observable.
 *  - `poopyUntilTick`: a hazard timer on a world-resident shape; a banked shape is not in the world.
 */
type BankedSparkAcknowledged =
  | 'pos' | 'prevPos' | 'state' | 'escrow' | 'radius' | 'createdTick' | 'poopyUntilTick';

/* eslint-disable @typescript-eslint/no-unused-vars */
const _bankedSparkComplete: NoUncovered<
  Exclude<SparkF, BankedSparkHashed | BankedSparkAcknowledged>
> = true;
void _bankedSparkComplete;
const _primComplete: NoUncovered<Exclude<PrimitiveF, PrimitiveHashed>> = true;
const _bondComplete: NoUncovered<Exclude<BondF, BondHashed>> = true;
const _sparkComplete: NoUncovered<Exclude<SparkF, SparkHashed>> = true;
const _creatureComplete: NoUncovered<Exclude<CreatureF, CreatureHashed>> = true;
const _spawnerComplete: NoUncovered<Exclude<SpawnerF, SpawnerHashed>> = true;
const _defenderComplete: NoUncovered<Exclude<DefenderF, DefenderHashed>> = true;
const _bombComplete: NoUncovered<Exclude<BombF, BombHashed>> = true;
const _hunterComplete: NoUncovered<Exclude<HunterF, HunterHashed>> = true;
const _potatoComplete: NoUncovered<Exclude<PotatoF, PotatoHashed>> = true;
const _rainbowComplete: NoUncovered<Exclude<RainbowF, RainbowHashed>> = true;
const _seagullComplete: NoUncovered<Exclude<SeagullF, SeagullHashed>> = true;
const _poopComplete: NoUncovered<Exclude<PoopF, PoopHashed>> = true;
const _gathererComplete: NoUncovered<Exclude<GathererF, GathererHashed>> = true;
void _primComplete; void _bondComplete; void _sparkComplete; void _creatureComplete;
void _spawnerComplete; void _defenderComplete; void _bombComplete; void _hunterComplete;
void _potatoComplete; void _rainbowComplete; void _seagullComplete; void _poopComplete;
void _gathererComplete;
/* eslint-enable @typescript-eslint/no-unused-vars */

/* ========================================================================== *
 *                              THE WIDE HASH                                 *
 * ========================================================================== */

const n = (id: { valueOf?: () => number } | number | undefined | null): string =>
  id === undefined || id === null ? '_' : String(id as unknown as number);

/** Optional scalar → stable token (`_` for absent, never `undefined`/`null` text). */
const o = (v: number | string | boolean | undefined | null): string =>
  v === undefined || v === null ? '_' : String(v);

/** Optional Vec2 → stable token. */
const v2 = (p: { x: number; y: number } | undefined | null): string => (p ? `${p.x},${p.y}` : '_');

/** Sorted numeric id list from a Set of branded ids. */
const idSet = (s: ReadonlySet<unknown>): string =>
  [...s]
    .map((i) => Number(i))
    .sort((a, b) => a - b)
    .join(',');

/**
 * The parts list behind `hashWorldStateFull`, exported so tests can assert that a
 * family marked `'hashed'` actually CONTRIBUTES — CHECK finding F4: the label was
 * a hand-written string with no executable link to this body, and deleting an
 * entire projection loop left tsc at 0 and every test green.
 *
 * TEST-ONLY. Collections are sorted by stable numeric id so the result is
 * invariant to Map insertion order, matching `hashWorldState`'s posture. Sets of
 * ids are sorted numerically; string Sets lexicographically.
 */
export function determinismParts(world: World): string[] {
  const parts: string[] = [
    `t${world.tick}`,
    `sp${world.scoreProgress}`,
    // World scalars (CHECK F8 — rngSeed is the canonical desync root and was
    // invisible to BOTH channels of the worker HARD GATE before S133).
    `rs${world.rngSeed}`,
    `gs${world.gameState}`,
    // S147 P1 — the match clock. `mp` is the phase, `pe` the absolute end-of-phase tick. Both are
    // in the WIDE hash, so a differential or worker-parity run fails the moment two peers disagree
    // about which half of the cycle they are in, or about when it ends.
    `mp${world.matchPhase}`,
    `pe${world.phaseEndsAtTick}`,
    // S148 P1 — the board. In the WIDE hash so a differential or worker-parity run fails the moment
    // two peers disagree about which board they are on, rather than one keep-position later.
    `ly${world.layout}`,
    `lw${n(world.lastWinnerId)}`,
    `hs${o(world.hunterSpawned)}`,
    `rw${o(world.rainbowSwitchTick)}`,
    `sf${o(world.sudokuFiredThisMatch)}`,
    `ac${n(world.activeCinematicPlayerId)}`,
    `nx${world.nextPrimitiveId},${world.nextBondId},${world.nextCreatureId},` +
      `${world.nextSpawnerId},${world.nextDefenderId},${world.nextBombId},` +
      `${world.nextHunterId},${world.nextPotatoId},${world.nextRainbowId},` +
      `${world.nextSeagullId},${world.nextPoopId},${world.nextGathererId},` +
      // S146 P2 — the descending negative allocator for reducer-minted (pulled) sparks.
      `${world.nextPulledSparkId}`,
    // `sudoku` freezes the sim, so its presence and identity are sim state. Stringified
    // wholesale: it is a small flat record, only non-null during a NONET trial, and its
    // key order is fixed by its construction site.
    `sk${world.sudoku === null ? '_' : JSON.stringify(world.sudoku)}`,
    // A queued spawn is pending sim work. Discriminant only — the spawn's payload is
    // consumed on the next tick and lands in `creatures`, which is hashed in full.
    `pc${world.pendingCreatureSpawn === null ? '_' : '1'}`,
  ];

  const scores = [...world.scoreByPlayer.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [id, s] of scores) parts.push(`P${n(id)}=${s}`);

  const prims = [...world.primitives.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const p of prims) {
    // CHECK F3 repro B: before S133's remediation this projected id+pos ONLY, so a
    // rainbow's global colour derangement — which drives territory and cross-colour bond
    // segregation — was invisible to the oracle.
    // S138 P1 — `hp` is projected HERE (the wide oracle) and deliberately NOT in stateHash.ts's
    // narrow prod projection, which stays `p{id}:{x},{y}` on the main.ts's `hashWorldState(world)` call site hot path (R1: the
    // narrow set stays narrow). This is what makes the host-vs-worker differential able to see a
    // NON-LETHAL damage divergence — without it the rig would only notice on the tick a primitive
    // finally died, because a collection SIZE is the one thing structuralSignature can observe.
    parts.push(
      `p${n(p.id)}:${p.type}:${p.pos.x},${p.pos.y}:${v2(p.prevPos)}:pc${p.placerColor}` +
        `:pb${n(p.placedBy)}:oc${p.ownerColor}:lo${p.lastOwnershipChange}:r${p.radius}` +
        `:ct${p.createdTick}:bn${idSet(p.bonds)}:hp${o(p.hp)}` +
        // S152 — `_` for a hand-placed shape, `<blueprintId>#<nodeIndex>` for a stamped one. Named
        // rather than positional so a future third provenance field cannot silently collide with
        // this one's encoding.
        `:og${p.origin === null ? '_' : `${p.origin.blueprintId}#${p.origin.nodeIndex}`}`,
    );
  }

  const bonds = [...world.bonds.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const b of bonds) {
    // `a`/`b` are object references to primitives already hashed above; their IDENTITY is
    // captured by aId/bId, so they are covered without a second traversal.
    parts.push(
      `b${n(b.id)}:${n(b.aId)}-${n(b.bId)}:rl${b.restLength}:st${b.stiffnessTier}` +
        `:ct${b.createdTick}:sm${o(b.stiffnessMultiplier)}`,
    );
  }

  const sparks = [...world.freeSparks.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const s of sparks) {
    parts.push(
      `s${n(s.id)}:${s.type}:${s.pos.x},${s.pos.y}:${v2(s.prevPos)}:r${s.radius}` +
        `:ct${s.createdTick}:st${JSON.stringify(s.state)}:pu${o(s.poopyUntilTick)}` +
        `:es${o(s.escrow)}`,
    );
  }

  const creatures = [...world.creatures.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const c of creatures) {
    parts.push(
      `c${n(c.id)}:${c.type}:${c.pos.x},${c.pos.y}:${v2(c.prevPos)}:${v2(c.targetPos)}` +
        `:${c.state}:${c.ticksInState}:hp${o(c.hp)}:cw${o(c.chewProgress)}` +
        `:tb${n(c.targetBondId)}:tc${n(c.targetCreatureId)}:tp${n(c.targetPrimitiveId)}` +
        `:ss${n(c.sourceSpawnerId)}` +
        `:ow${n(c.ownerPlayerId)}:sa${o(c.spawnedAtTick)}:da${o(c.despawnAtTick)}` +
        `:kc${o(c.killCount)}:pu${o(c.poopyUntilTick)}`,
    );
  }

  const spawners = [...world.creatureSpawners.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const s of spawners) {
    parts.push(
      `cs${n(s.id)}:${n(s.ownerPlayerId)}:${n(s.anchorPrimitiveId)}:${s.recipeId}` +
        `:ns${s.nextSpawnTick}:lv${s.lastValidatedTick}:sc${s.spawnedCount}:ig${o(s.ignitedAtTick)}`,
    );
  }

  const defenders = [...world.defenders.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const d of defenders) {
    parts.push(
      `d${n(d.id)}:${d.kind}:${n(d.ownerPlayerId)}:${n(d.anchorPrimitiveId)}:${d.recipeId}` +
        `:${d.pos.x},${d.pos.y}:${v2(d.prevPos)}:${v2(d.walkTargetPos)}` +
        `:${d.state}:${d.ticksInState}:hp${o(d.hp)}:nf${o(d.nextFireTick)}` +
        `:tc${n(d.targetCreatureId)}:ls${v2(d.lastStrikePos)}:bg${o(d.bagsRemaining)}`,
    );
  }

  const gatherers = [...world.gatherers.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const g of gatherers) {
    parts.push(
      `ga${n(g.id)}:${n(g.ownerPlayerId)}:${g.pos.x},${g.pos.y}:sa${o(g.spawnedAtTick)}` +
        `:${g.state}:tg${n(g.targetSparkId)}:cy${n(g.carriedSparkId)}:sl${g.speedLevel}` +
        `:pf${o(g.preferredType)}`,
    );
  }

  // S146 P2 — castle inventories, seat-sorted, hashed as the per-type TALLY.
  //
  // ⭐ ORDER IS NO LONGER A STATE DIMENSION, AND THAT IS A SIMPLIFICATION, NOT A LOSS. The old bank
  // was an ordered array of whole Sparks and this comment used to argue the order was significant
  // because "the player pulls BY INDEX". Pulls are TYPE-addressed now, so two castles holding the
  // same multiset genuinely ARE the same state and must hash equal — which the tally gives for free.
  //
  // The tally is a FIXED-LENGTH array indexed by SparkType, so this projection is positional and
  // needs no sort: a `Map` would have made the hash depend on the order shapes happened to arrive in
  // (see castleBank.ts). Seats are still sorted, because `castleBanks` itself is a Map.
  const bankSeats = [...world.castleBanks.keys()].sort((a, b) => Number(a) - Number(b));
  for (const seat of bankSeats) {
    const bank = world.castleBanks.get(seat) ?? [];
    parts.push(`cb${n(seat)}:${bank.map((c) => n(c)).join('.')}`);
  }

  // S141 P2 — the gatherer order queues, seat-sorted. ORDER IS THE WHOLE POINT and is hashed as-is:
  // this is a consumed LIST, not a set, so [Square, Circle] and [Circle, Square] send the player's
  // gatherers to different sparks and are genuinely different states.
  const orderSeats = [...world.gathererOrders.keys()].sort((a, b) => Number(a) - Number(b));
  for (const seat of orderSeats) {
    const q = world.gathererOrders.get(seat) ?? [];
    parts.push(`go${n(seat)}:${q.map((t) => o(t)).join('.')}`);
  }

  const bombs = [...world.bombs.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const b of bombs) {
    parts.push(`bo${n(b.id)}:${b.pos.x},${b.pos.y}:r${b.radius}:sa${b.spawnedAtTick}:da${b.dissipateAtTick}`);
  }

  const hunters = [...world.hunters.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const h of hunters) {
    parts.push(
      `h${n(h.id)}:${h.pos.x},${h.pos.y}:${v2(h.prevPos)}:${h.state}:${h.ticksInState}` +
        `:tp${n(h.targetPlayerId)}:sa${o(h.spawnedAtTick)}:da${o(h.despawnAtTick)}`,
    );
  }

  const potatoes = [...world.potatoes.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const p of potatoes) {
    parts.push(
      `po${n(p.id)}:${p.pos.x},${p.pos.y}:${v2(p.prevPos)}:${p.state}:ca${n(p.carrierId)}` +
        `:sa${o(p.spawnedAtTick)}:de${o(p.detonateAtTick)}:ct${o(p.carriedAtTick)}`,
    );
  }

  const rainbows = [...world.rainbows.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const r of rainbows) {
    parts.push(`ra${n(r.id)}:${r.pos.x},${r.pos.y}:sa${r.spawnedAtTick}:da${r.dissipateAtTick}`);
  }

  const seagulls = [...world.seagulls.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const g of seagulls) {
    parts.push(
      `sg${n(g.id)}:${g.pos.x},${g.pos.y}:${v2(g.prevPos)}:vx${g.vx}:by${g.baseY}` +
        `:sa${o(g.spawnedAtTick)}:lp${o(g.lastPoopTick)}`,
    );
  }

  const poops = [...world.poops.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const p of poops) {
    parts.push(
      `pp${n(p.id)}:${p.pos.x},${p.pos.y}:${v2(p.prevPos)}:${p.state}` +
        `:sa${o(p.spawnedAtTick)}:la${o(p.landedAtTick)}:fp${n(p.fouledPrimId)}`,
    );
  }

  parts.push(`fo:${idSet(world.fouledPrimitives)}`);
  parts.push(`dc:${[...world.discoveredCombos].map(String).sort().join(',')}`);
  parts.push(`gf:${[...world.godlyFiredThisMatch].map(String).sort().join(',')}`);

  return parts;
}

/** WIDE deterministic 32-bit fingerprint — every family/scalar marked `'hashed'`. */
export function hashWorldStateFull(world: World): number {
  return fnv1a32(determinismParts(world).join('|'));
}
