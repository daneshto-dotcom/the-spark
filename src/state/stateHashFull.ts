/**
 * SPARK — WIDE determinism hash + the entity-family COVERAGE CONTRACT (S133 P1).
 *
 * ============================ WHY THIS FILE EXISTS ============================
 * `hashWorldState` (stateHash.ts) is a SIX-field `Pick`: tick, primitives, bonds,
 * freeSparks, scoreProgress, scoreByPlayer. Every other entity family — creatures,
 * spawners, defenders, bombs, hunters, potatoes, rainbows, seagulls, poops,
 * fouledPrimitives — is INVISIBLE to it. A desync in any of them produces an
 * identical hash on both sides, so four differential harnesses that assert hash
 * equality (two independently-seeded sims every tick; main-vs-worker across 300
 * frames; two replay suites) were structurally unable to see it.
 *
 * S133 A.0 also found there was NO forcing function on either determinism site:
 * `stateHash.test.ts` never constructs a creature/defender/spawner, and
 * `structuralSignature` has exactly ONE assertion repo-wide (a negative one).
 * Adding a family to one mechanism and not the other failed ZERO tests.
 *
 * ===================== WHY TWO HASHES INSTEAD OF ONE WIDE ONE =================
 * Council S133 decision #1 (SYNTHESIS). `hashWorldState` has a PRODUCTION call
 * site (main.ts:1706, per worker batch). Widening it in place would have made a
 * per-entity string projection run on the worker hot path — and for no runtime
 * benefit, because that call site compares the main-thread mirror against the
 * WORKER'S OWN snapshot hash: both sides derive from one authority, so it is an
 * apply-fidelity check, not a two-simulation desync check (its own comment says
 * so). Therefore:
 *
 *   • `hashWorldState`     — NARROW, production, cost UNCHANGED by this file.
 *   • `hashWorldStateFull` — WIDE, test-only. Never imported by main.ts, so it
 *                            contributes ZERO bytes to the prod entry chunk.
 *
 * The obvious failure mode of a two-function split is DRIFT (Grok's
 * R-ORACLE-FRAGILITY). That is closed structurally, not by convention: every
 * family the NARROW hash covers must be marked `'hashed'` in FAMILY_COVERAGE
 * below, and `stateHashFull.test.ts` asserts the narrow hash's own key set is a
 * strict subset of the wide one's. The two cannot silently diverge.
 *
 * ⚠ `players` is deliberately ACKNOWLEDGED rather than hashed — see the entry.
 */

import type { World } from './worldTypes.ts';
import { fnv1a32 } from './stateHash.ts';

/* ========================================================================== *
 *                          THE COVERAGE CONTRACT                             *
 * ========================================================================== */

/**
 * Every collection-valued key of `World`, DERIVED from the type rather than
 * listed by hand. This is the load-bearing trick: a new `gatherers: Map<…>` or
 * `castles: Map<…>` field on World appears in this union AUTOMATICALLY, which
 * makes `FAMILY_COVERAGE` below non-exhaustive and fails `tsc` by name.
 *
 * Covers Map, Set AND array fields — an array-valued family would otherwise be
 * exactly the silent gap this contract exists to prevent.
 */
type CollectionKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends Map<unknown, unknown> | Set<unknown> | readonly unknown[]
    ? K
    : never;
}[keyof T];

/** Every entity/collection family on World. Derived — never edit by hand. */
export type WorldFamily = CollectionKeys<World>;

/**
 * ⛔ EVERY family must appear here. This is the FORCING FUNCTION (S133 P1b,
 * field granularity added by Council decision #5).
 *
 * Add a collection to `World` and omit it here ⇒ **`tsc` fails**, naming the
 * missing key. `'hashed'` means `hashWorldStateFull` projects it below;
 * `'acknowledged'` means it is deliberately excluded AND the reason is written
 * down. An exclusion is allowed — an UNDOCUMENTED one is not.
 */
export const FAMILY_COVERAGE: Readonly<Record<WorldFamily, 'hashed' | 'acknowledged'>> = {
  // ---- narrow-hash families (MUST stay 'hashed' — the subset test enforces it) ----
  primitives: 'hashed',
  bonds: 'hashed',
  freeSparks: 'hashed',
  scoreByPlayer: 'hashed',

  // ---- families S133 made visible for the first time ----
  creatures: 'hashed',
  creatureSpawners: 'hashed',
  defenders: 'hashed',
  bombs: 'hashed',
  hunters: 'hashed',
  potatoes: 'hashed',
  rainbows: 'hashed',
  seagulls: 'hashed',
  poops: 'hashed',
  fouledPrimitives: 'hashed',
  discoveredCombos: 'hashed',
  godlyFiredThisMatch: 'hashed',

  /**
   * ACKNOWLEDGED — `players` is the one family where main-thread divergence from
   * authority is BY DESIGN: main.ts:1701-1704 documents a deliberate
   * drag-preserve restore that "diverges the locked spark from authority (the
   * S56 client-prediction posture)". Hashing avatar state would therefore make
   * the oracle report client prediction as a desync. `scoreByPlayer` (the
   * authoritative per-seat scalar) IS hashed, so seat scoring is still covered.
   * ⚠ Re-open this when V6-1.5 lands: deleting `CarryingPlayer` reshapes the
   * union, and carry state moving to the bank may make it hashable.
   */
  players: 'acknowledged',

  /**
   * ACKNOWLEDGED — `effects` is per-FRAME render telemetry, wiped every frame by
   * `effectsRenderer.sync` (`world.effects.length = 0`). It is not sim state and
   * its lifetime is shorter than a tick, so both sides legitimately hold
   * different contents at any instant.
   */
  effects: 'acknowledged',

  /**
   * ACKNOWLEDGED — cinematic queue is presentation sequencing consumed by the
   * renderer; the authoritative gating scalar (`godlyFiredThisMatch`) IS hashed.
   */
  pendingCinematics: 'acknowledged',

  /** ACKNOWLEDGED — display strings derived from `discoveredCombos`, which is hashed. */
  lastDiscoveredComboNames: 'acknowledged',

  /** ACKNOWLEDGED — match configuration, fixed at match start and never mutated in-tick. */
  botSeats: 'acknowledged',
};

/** Resolves to `true` only when `U` is `never`; otherwise a branded error object. */
type NoUncovered<U> = [U] extends [never] ? true : { ERROR_UNCOVERED_FIELD: U };

/**
 * Field-level guard (Council decision #5 — Gemini's catch: a family-level guard
 * would let a NEW FIELD on an already-hashed family slip through silently, e.g.
 * `creature.armor`). Each assertion below fails `tsc` **naming the new field**.
 */
type CreatureF = keyof NonNullable<ReturnType<World['creatures']['get']>>;
type SpawnerF = keyof NonNullable<ReturnType<World['creatureSpawners']['get']>>;
type DefenderF = keyof NonNullable<ReturnType<World['defenders']['get']>>;
type BombF = keyof NonNullable<ReturnType<World['bombs']['get']>>;
type HunterF = keyof NonNullable<ReturnType<World['hunters']['get']>>;
type PotatoF = keyof NonNullable<ReturnType<World['potatoes']['get']>>;
type RainbowF = keyof NonNullable<ReturnType<World['rainbows']['get']>>;
type SeagullF = keyof NonNullable<ReturnType<World['seagulls']['get']>>;
type PoopF = keyof NonNullable<ReturnType<World['poops']['get']>>;

// Every field name below is projected by hashWorldStateFull. Keep in lockstep.
type CreatureHashed =
  | 'id' | 'type' | 'ownerPlayerId' | 'pos' | 'prevPos' | 'targetPos' | 'targetBondId'
  | 'targetCreatureId' | 'state' | 'ticksInState' | 'killCount' | 'spawnedAtTick'
  | 'despawnAtTick' | 'sourceSpawnerId' | 'chewProgress' | 'hp' | 'poopyUntilTick';
type SpawnerHashed =
  | 'id' | 'ownerPlayerId' | 'anchorPrimitiveId' | 'recipeId' | 'nextSpawnTick'
  | 'lastValidatedTick' | 'spawnedCount' | 'ignitedAtTick';
type DefenderHashed =
  | 'id' | 'kind' | 'ownerPlayerId' | 'anchorPrimitiveId' | 'recipeId' | 'pos' | 'prevPos'
  | 'walkTargetPos' | 'state' | 'ticksInState' | 'hp' | 'nextFireTick' | 'targetCreatureId'
  | 'lastStrikePos';
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

/* eslint-disable @typescript-eslint/no-unused-vars */
const _creatureComplete: NoUncovered<Exclude<CreatureF, CreatureHashed>> = true;
const _spawnerComplete: NoUncovered<Exclude<SpawnerF, SpawnerHashed>> = true;
const _defenderComplete: NoUncovered<Exclude<DefenderF, DefenderHashed>> = true;
const _bombComplete: NoUncovered<Exclude<BombF, BombHashed>> = true;
const _hunterComplete: NoUncovered<Exclude<HunterF, HunterHashed>> = true;
const _potatoComplete: NoUncovered<Exclude<PotatoF, PotatoHashed>> = true;
const _rainbowComplete: NoUncovered<Exclude<RainbowF, RainbowHashed>> = true;
const _seagullComplete: NoUncovered<Exclude<SeagullF, SeagullHashed>> = true;
const _poopComplete: NoUncovered<Exclude<PoopF, PoopHashed>> = true;
void _creatureComplete; void _spawnerComplete; void _defenderComplete; void _bombComplete;
void _hunterComplete; void _potatoComplete; void _rainbowComplete; void _seagullComplete;
void _poopComplete;
/* eslint-enable @typescript-eslint/no-unused-vars */

/* ========================================================================== *
 *                              THE WIDE HASH                                 *
 * ========================================================================== */

const n = (id: { valueOf?: () => number } | number | undefined | null): string =>
  id === undefined || id === null ? '_' : String(id as unknown as number);

/** Optional scalar → stable token (`_` for absent, never `undefined`/`null` text). */
const o = (v: number | string | undefined | null): string => (v === undefined || v === null ? '_' : String(v));

/** Optional Vec2 → stable token. */
const v2 = (p: { x: number; y: number } | undefined | null): string => (p ? `${p.x},${p.y}` : '_');

/**
 * WIDE deterministic 32-bit fingerprint — every family marked `'hashed'` above.
 *
 * TEST-ONLY. Collections are sorted by stable numeric id so the result is
 * invariant to Map insertion order, matching `hashWorldState`'s posture. Sets of
 * ids are sorted numerically; `discoveredCombos` is a string Set, sorted
 * lexicographically.
 */
export function hashWorldStateFull(world: World): number {
  const parts: string[] = [`t${world.tick}`, `sp${world.scoreProgress}`];

  const scores = [...world.scoreByPlayer.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [id, s] of scores) parts.push(`P${n(id)}=${s}`);

  const prims = [...world.primitives.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const p of prims) parts.push(`p${n(p.id)}:${p.pos.x},${p.pos.y}`);

  const bonds = [...world.bonds.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const b of bonds) parts.push(`b${n(b.id)}:${n(b.aId)}-${n(b.bId)}`);

  const sparks = [...world.freeSparks.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const s of sparks) parts.push(`s${n(s.id)}:${s.pos.x},${s.pos.y}`);

  // ---- families S133 added ----

  const creatures = [...world.creatures.values()].sort((a, b) => Number(a.id) - Number(b.id));
  for (const c of creatures) {
    parts.push(
      `c${n(c.id)}:${c.type}:${c.pos.x},${c.pos.y}:${v2(c.prevPos)}:${v2(c.targetPos)}` +
        `:${c.state}:${c.ticksInState}:hp${o(c.hp)}:cw${o(c.chewProgress)}` +
        `:tb${n(c.targetBondId)}:tc${n(c.targetCreatureId)}:ss${n(c.sourceSpawnerId)}` +
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
        `:tc${n(d.targetCreatureId)}:ls${v2(d.lastStrikePos)}`,
    );
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

  const fouled = [...world.fouledPrimitives].map((i) => Number(i)).sort((a, b) => a - b);
  parts.push(`fo:${fouled.join(',')}`);

  const combos = [...world.discoveredCombos].map(String).sort();
  parts.push(`dc:${combos.join(',')}`);

  const godly = [...world.godlyFiredThisMatch].map(String).sort();
  parts.push(`gf:${godly.join(',')}`);

  return fnv1a32(parts.join('|'));
}
