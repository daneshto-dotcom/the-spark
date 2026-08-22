/**
 * SPARK — S141 P1: THE STINK TOWER's behaviour, in its own module.
 *
 * Why a separate module rather than three more branches inside `defenderLifecycle.ts`: that file is
 * already 316 lines and its FSM has SIX branches keyed on `d.kind` with no default. Adding a third
 * kind's worth of throwing, aura and blast logic inline would make the sixth branch the seventh
 * through eleventh. Everything here is a PURE function of `(world, defender)` — no RNG stream, no
 * wall-clock — and `defenderLifecycle` calls into it at exactly two points.
 *
 * ## The design, in one paragraph
 *
 * A Stink Tower is a cheap 4-shape emplacement with a MAGAZINE. It lobs one bag every
 * `STINK_THROW_INTERVAL_TICKS` at the nearest enemy creature in range, splashing
 * `STINK_BAG_DAMAGE` over `STINK_BAG_RADIUS` and sparing everything its owner owns. When the
 * magazine runs dry it does not become useless — it becomes a passive AREA DENIER, ticking
 * `STINK_AURA_DAMAGE` on the shared `DOT_CADENCE_TICKS` beat over a wider radius, and it PULLS
 * AGGRO so enemy creatures come to it. And when it dies it detonates in proportion to the bags it
 * never got to throw: full magazine is a bomb, spent magazine is nearly harmless. That is the whole
 * tactical read — starve it before you kill it, or eat the blast.
 *
 * ## Determinism rules this file obeys
 *
 * - No `Math.random`, no `performance.now`, no seeded-RNG stream. Reaching into a `mulberry32`
 *   stream would perturb DRAW ORDER for every other consumer of that stream — a documented desync
 *   hazard — so burst directions come from `pseudoRand(mix32(defenderId, tick), index)`: stateless,
 *   replay-safe, and unable to disturb anything else.
 * - Every damage number is an INTEGER. `damageEntity` THROWS on a fraction, by design, because the
 *   owner-ruled DoT model is authored as a percentage of a 1000-hp scale.
 * - Aura damage is applied on a shared cadence keyed off `world.tick`, never accumulated in a float.
 */

import {
  DOT_CADENCE_TICKS,
  STINK_AURA_DAMAGE,
  STINK_AURA_RADIUS,
  STINK_BAG_DAMAGE,
  STINK_BAG_RADIUS,
  STINK_DEATH_BLAST_BASE_DAMAGE,
  STINK_DEATH_BLAST_BASE_RADIUS,
  STINK_DEATH_BLAST_PER_BAG_DAMAGE,
  STINK_DEATH_BLAST_PER_BAG_RADIUS,
  STINK_DEATH_BLAST_SHARDS,
  STINK_TOWER_BAGS,
  STINK_BAG_ATK,
  STINK_BAG_PEN,
  STINK_DEATH_BLAST_ATK,
  STINK_DEATH_BLAST_PEN,
} from '../../constants.ts';
import type { PlayerId, Vec2 } from '../../types.ts';
import type { DamageSource } from '../damage.ts';
import { attackFifths } from '../stats.ts';
import { mix32, pseudoRand } from '../rng.ts';
import type { World } from '../worldTypes.ts';
import type { Defender } from './defender.ts';

/**
 * The signature of the radial-damage bridge. Taken as a PARAMETER rather than imported, purely to
 * keep the module graph acyclic: the bridge lives in `state/damage.ts`, which imports this module
 * for `stinkDeathBlast`, so importing it back would close a cycle. This is the whole reason for the
 * indirection — it is not an extension point, and there is exactly one implementation.
 */
export type RadialDamageFn = (
  world: World,
  cx: number,
  cy: number,
  radius: number,
  /** On the 1000-per-shape scale. */
  primitiveAmount: number,
  /** On the stat ladder, in fifths — see `state/stats.ts`. NOT interchangeable with the above. */
  unitAmountFifths: number,
  source: DamageSource,
  sparePlayerId: PlayerId | null,
) => unknown;

/** PURE — is this defender an out-of-ammo Stink Tower? */
export function stinkIsDepleted(d: Defender): boolean {
  return d.kind === 'stinkTower' && d.bagsRemaining <= 0;
}

/**
 * PURE — the blast radius and damage for a tower dying with `bags` unthrown.
 *
 * Exported and pure so tests can sweep every bag count (0..STINK_TOWER_BAGS) without a world, and
 * so the renderer can size its debris burst from the same numbers the damage uses. Both scale
 * LINEARLY: linear is legible to a player counting the bags on the tower's side, whereas a curve
 * would make "is it worth killing now" unreadable.
 */
export function stinkBlastFor(bags: number): { damage: number; radius: number } {
  const n = Math.max(0, Math.min(STINK_TOWER_BAGS, Math.floor(bags)));
  return {
    damage: STINK_DEATH_BLAST_BASE_DAMAGE + n * STINK_DEATH_BLAST_PER_BAG_DAMAGE,
    radius: STINK_DEATH_BLAST_BASE_RADIUS + n * STINK_DEATH_BLAST_PER_BAG_RADIUS,
  };
}

/**
 * PURE — the unit direction of debris shard `index` for a tower dying at `tick`.
 *
 * Deterministic and stateless: `pseudoRand(mix32(defenderId, tick), index)` returns the same value
 * on the host, on the `?worker=1` mirror and in a replay. The shards are spread on an EVEN base ring
 * and then jittered, so a burst always reads as a burst rather than occasionally clumping to one
 * side — pure randomness at 9 samples clumps often enough to look broken.
 *
 * ⚠ NOT copied from `gathererMorphShape` / `keepRainbowTint`. Those are render-only and rest their
 * purity argument on being cosmetic; this feeds a burst the client and host must agree on.
 */
export function stinkShardDir(defenderId: number, tick: number, index: number): Vec2 {
  const seed = mix32(defenderId, tick);
  const base = (index / STINK_DEATH_BLAST_SHARDS) * Math.PI * 2;
  const jitter = pseudoRand(seed, index) * (Math.PI / STINK_DEATH_BLAST_SHARDS);
  const a = base + jitter;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/**
 * The DEATH BLAST — the owner's "bigger cooler explosion", scaled by the unthrown magazine.
 *
 * Called from `destroyDefender` in `state/damage.ts`, and ONLY when that function has established
 * the tower was DESTROYED rather than deconstructed. See the discriminator comment there: an
 * accidental Stink Tower removing itself because the player kept building must not detonate.
 *
 * ⚠ CENTRED ON `d.pos`, NEVER ON THE ANCHOR. On the recipe-break path the anchor primitive has
 * already been purged from `world.primitives`, so there is no anchor position left to read — the
 * blast would silently land at the origin, or crash. `d.pos` is refreshed from the anchor on every
 * tick the tower is alive, so it is the anchor's last known position and is always present.
 *
 * ⚠ The owner filter is the tower's OWN seat: a dying tower never damages the structures of the
 * player who built it. Being killed is punishment enough without also demolishing your own base.
 */
export function stinkDeathBlast(world: World, d: Defender, radialDamage: RadialDamageFn): void {
  const { damage, radius } = stinkBlastFor(d.bagsRemaining);
  // The visible burst, pushed BEFORE the damage so its position is recorded independently of what
  // the damage then razes — the same ordering rule razePrimitives documents for SEVER_ERASE.
  world.effects.push({
    kind: 'BOMB_EXPLODE',
    tick: world.tick,
    pos: { x: d.pos.x, y: d.pos.y },
    radius,
  });
  // S151 P2 — the detonation hits UNITS hard (a laser-weight 6 ATK); it is a one-off death blast,
  // not the tower's chip damage, so it is the one stink effect that is not on the bag's 1 ATK.
  radialDamage(
    world, d.pos.x, d.pos.y, radius,
    damage, attackFifths(STINK_DEATH_BLAST_ATK, STINK_DEATH_BLAST_PEN),
    'hazard', d.ownerPlayerId,
  );
}

/**
 * THE THROW — one bag at the current target. Called from the FSM's FIRE entry.
 *
 * Returns true if a bag was actually thrown, so the caller can decide the FSM consequence rather
 * than having it decided here. Decrements the magazine; a depleted tower throws nothing and simply
 * falls through to the aura.
 */
export function stinkThrowBag(world: World, d: Defender, at: Vec2, radialDamage: RadialDamageFn): boolean {
  if (d.bagsRemaining <= 0) return false;
  d.bagsRemaining--;
  world.effects.push({
    kind: 'BOMB_EXPLODE',
    tick: world.tick,
    pos: { x: at.x, y: at.y },
    radius: STINK_BAG_RADIUS,
  });
  // ⭐ S151 P2 — the bag finally deals what the roster says it deals. Its `atk` has been 1 since
  // S148 ("the AREA weapon … giving it single-target punch would make it strictly better than both")
  // but the splash was passing STINK_BAG_DAMAGE = 150 to creatures, which one-shot everything.
  radialDamage(
    world, at.x, at.y, STINK_BAG_RADIUS,
    STINK_BAG_DAMAGE, attackFifths(STINK_BAG_ATK, STINK_BAG_PEN),
    'hazard', d.ownerPlayerId,
  );
  return true;
}

/**
 * THE DEPLETED AURA — a spent tower becomes a passive area denier instead of a dead prop.
 *
 * Ticks on the SHARED `DOT_CADENCE_TICKS` beat rather than a private timer, so every damage-over-
 * time source in the game lands on the same 0.5 s grid and a player can read one rhythm instead of
 * several. Phase-spread by defender id so six spent towers do not all pulse on the same tick, which
 * would spike the frame and read as a stutter.
 *
 * ⚠ The cadence test is on `world.tick`, NOT on an accumulator — an accumulated float would drift
 * between the host and the worker mirror, and drift in a damage cadence is a desync.
 */
export function stinkAuraTick(world: World, d: Defender, radialDamage: RadialDamageFn): boolean {
  if (!stinkIsDepleted(d)) return false;
  const phase = (d.id as unknown as number) % DOT_CADENCE_TICKS;
  if (world.tick % DOT_CADENCE_TICKS !== phase) return false;
  radialDamage(
    world, d.pos.x, d.pos.y, STINK_AURA_RADIUS,
    STINK_AURA_DAMAGE, attackFifths(STINK_BAG_ATK, STINK_BAG_PEN),
    'aura', d.ownerPlayerId,
  );
  return true;
}

/**
 * THE AGGRO PULL — a depleted tower taunts nearby enemy creatures into attacking it.
 *
 * Returns the ids of enemy creatures inside the aura that should retarget onto this tower, sorted
 * for determinism. It returns rather than mutates so the FSM owns the write and this file stays a
 * pure read of the world.
 *
 * ⚠ WHAT THIS ACTUALLY PULLS TODAY — measured, and narrower than the S139 note implies.
 *
 * The S139 Council finding (carried forward, not re-derived) is that the `chewProgress` stickiness
 * which would block a taunt is PROVENANCE-gated: only spawner-sourced creatures are glued, while
 * Voltkin and the free goblin are null-spawner and re-select every tick. True — but insufficient on
 * its own. `targetPrimitiveId` is read by exactly ONE consumer, the structure-attack path, and that
 * path is gated on the per-type `targetsStructures` flag. So the taunt is only ACTED ON by a creature
 * that attacks structures, which today means the GOBLIN and nothing else — a Voltkin handed a
 * `targetPrimitiveId` will ignore it and keep hunting bonds.
 *
 * That is fine for now (the goblin is the unit every seat is granted for free, so it is the most
 * common thing walking past a tower), and the caller enforces BOTH gates so no field is written that
 * nothing will read. But do not describe this as a general taunt. When PRODUCER towers land and start
 * emitting spawner-sourced units, the provenance gate will exclude those too, and the fix Gemini
 * prescribed in S139 — forcibly zeroing `chewProgress` — collides with the 6-attack invariant. Decide
 * it deliberately then; do not patch it in passing.
 */
export function stinkAggroTargets(world: World, d: Defender): number[] {
  if (!stinkIsDepleted(d)) return [];
  const r2 = STINK_AURA_RADIUS * STINK_AURA_RADIUS;
  const out: number[] = [];
  for (const [cid, c] of world.creatures) {
    if (c.ownerPlayerId === d.ownerPlayerId) continue;
    const dx = c.pos.x - d.pos.x;
    const dy = c.pos.y - d.pos.y;
    if (dx * dx + dy * dy <= r2) out.push(cid as unknown as number);
  }
  out.sort((a, b) => a - b);
  return out;
}
