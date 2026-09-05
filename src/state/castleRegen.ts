/**
 * SPARK — S164 P1 (owner R128–R131): **THE CASTLE HEALS ITSELF, IF YOU PAID FOR IT.**
 *
 * This is V6-2.4's "repair" half, and the mechanic is the owner's rather than the spec's.
 *
 * ## ⛔ WHY THE SPEC'S VERSION WAS NOT BUILT
 *
 * `SPARK_v0.6_DESIGN.md` and `SPARK_Blueprint.md` both say repair works by *"attaching connectors"*
 * to rebuild what was destroyed. **That is unimplementable against the shipped castle.** A bond's
 * endpoints are typed `PrimitiveId` (`physics/bonds.ts`), and a castle is not a primitive: it is one
 * scalar on `Player` (`castleHp`) drawn at `castleAnchor(seat, layout)`, with nothing in
 * `world.primitives` to attach to. Making it bondable would mean giving the castle real geometry —
 * a slot of its own, and one that would reopen `castleHp` as the source of truth.
 *
 * Shown that, the owner replaced the model outright (R128): *"spend victory points on castle
 * upgrades (same as gatherer upgrades). 100vp on hp regeneration. upgrade lv 1 = +1% hp reg, lv 2 =
 * 1.2%, lv 3 1.4%, lv 4 1.6%"*. Which is what `constants.ts`'s R88 note had predicted all along —
 * *"later we will add castle upgrades like we have for the gatherers … points from `scoreByPlayer`,
 * a level, a cap"*. The two docs are annotated where they still describe the connector version.
 *
 * ## ⭐ NO WIRE FIELD FOR THE SCHEDULE, AND NO FLOAT ANYWHERE
 *
 * The cadence is a pure function of `(seat, tick)`, exactly like `castleFiresOnTick` next door and
 * for the same reason: a schedule both peers can re-derive needs no `world.effects` push and no
 * serialized timer. Only the purchased LEVEL rides the wire, additive-optional.
 *
 * And the rate is **integer HP**, which is not a happy accident — it is why this design is safe.
 * `CASTLE_MAX_HP` is 1500, so 1.0/1.2/1.4/1.6/1.8 % come out as **15/18/21/24/27** HP exactly. Regen
 * is therefore applied once per second as a whole number, never as a per-tick fraction accumulated
 * into a float. This project forbids float accumulators in the sim, and here there is not even a
 * rounding rule to get wrong.
 *
 * ## ⚠ THE RATE IS PER SECOND, AND THAT WAS RULED (R130), NOT ASSUMED
 *
 * The brief said "per tick". At 1 % of max per TICK the castle regains 900 HP/s against a goblin's
 * 6 HP/s — it out-heals **150 simultaneous attackers**, so the castle becomes unkillable at level 1
 * and the second victory condition stops existing. The arithmetic went to the owner and per-SECOND
 * was chosen. Level 1 offsets 2.5 goblins; a committed push of five still takes the keep.
 *
 * ## ⚠ IT RUNS IN BUILD TOO, AND THAT PART IS MINE
 *
 * Not an owner ruling. Damage only lands in FIGHT (the creature fan-out is FIGHT-gated), so regen
 * during BUILD is what actually turns a beating into a comeback rather than a slow death: a 90 s
 * BUILD at level 1 restores 1350 HP, so a mauled castle can come back between rounds, while a 45 s
 * FIGHT at level 1 offsets only ~2.5 attackers. If that proves too generous the dial is the level
 * ladder, not this gate — but the measurement is recorded here so the next reader can argue with the
 * number rather than guess at the intent.
 */

import {
  CASTLE_MAX_HP,
  CASTLE_MAX_REGEN_LEVEL,
  CASTLE_REGEN_UPGRADE_PRICE,
  CASTLE_REGEN_PCT_BASE,
  CASTLE_REGEN_PCT_PER_LEVEL,
  PHYSICS_HZ,
} from '../constants.ts';
import type { PlayerId } from '../types.ts';
import { spendScore } from './gameMode.ts';
import type { World } from './world.ts';

/** CLIENT INTENT (R129: purchasable in any phase). Mirrors `UpgradeGathererSpeedAction`. */
export interface UpgradeCastleRegenAction {
  readonly type: 'UPGRADE_CASTLE_REGEN';
  readonly playerId: PlayerId;
}

/**
 * HP regained per SECOND at `level`. Pure, integer, and **0 at level 0** — the ladder starts when
 * you buy it, so the first 100 VP buys a real effect rather than a marginal one (R128).
 *
 * Clamped to `[0, CASTLE_MAX_REGEN_LEVEL]` so a malformed level can never mint HP; the reducer
 * enforces the cap too, and this is the backstop for anything that reaches a rehydrated value.
 */
export function castleRegenPerSecond(level: number): number {
  const lvl = Math.max(0, Math.min(CASTLE_MAX_REGEN_LEVEL, Math.trunc(level)));
  if (lvl === 0) return 0;
  const pct = CASTLE_REGEN_PCT_BASE + CASTLE_REGEN_PCT_PER_LEVEL * lvl;
  // Exact for every shipped level (see the file docblock); `round` is a guard against a future
  // CASTLE_MAX_HP that does not divide cleanly, not a live rounding rule.
  return Math.round((CASTLE_MAX_HP * pct) / 100);
}

/**
 * Is THIS seat's castle scheduled to regenerate on THIS tick? Once per second, **phase-spread by
 * seat** so four castles do not all heal on the same frame — the `castleFiresOnTick` idiom, and the
 * same reason: a total order that does not depend on `Map` iteration.
 */
export function castleRegensOnTick(seat: number, tick: number): boolean {
  const i = PHYSICS_HZ;
  return tick % i === (((Math.trunc(seat) % i) + i) % i);
}

/**
 * Host-side, once per tick.
 *
 * ⛔ **A FALLEN CASTLE NEVER REGENERATES (R131).** `castleHp <= 0` is the elimination predicate
 * itself (`elimination.ts`), so healing from zero would make elimination self-reversing — and worse,
 * `eliminatedAtTick` is write-once, so a revived seat would carry a stale stamp and sort BELOW every
 * seat it went on to beat. `elimination.ts` left a note asking whoever built a healing path to
 * decide this; this is that decision, and it is "no".
 *
 * ⛔ **AND IT CLAMPS AT `CASTLE_MAX_HP`, WHICH IS NOT COSMETIC.** `save.ts` emits `castleHp` only
 * when it is BELOW max and rehydrates an absent value as `CASTLE_MAX_HP`, so a host holding 1700
 * would emit nothing and every peer would read 1500 — a silent divergence on the number that ends
 * the match, invisible to both hash oracles because `stateHashFull` marks `players:'acknowledged'`.
 */
export function castleRegenTick(world: World): void {
  if (world.gameState !== 'PLAYING') return;

  // Explicit id order, for the reason castleGuns.ts gives: Map order must not decide anything.
  const seats = [...world.players.keys()].sort(
    (a, b) => (a as unknown as number) - (b as unknown as number),
  );
  for (const seat of seats) {
    if (!castleRegensOnTick(seat as unknown as number, world.tick)) continue;
    const p = world.players.get(seat);
    if (p === undefined) continue;
    if (p.castleHp <= 0) continue; // fallen stays fallen — R131
    if (p.castleHp >= CASTLE_MAX_HP) continue; // nothing to do, and never overheal
    const gain = castleRegenPerSecond(p.castleRegenLevel);
    if (gain <= 0) continue;
    p.castleHp = Math.min(CASTLE_MAX_HP, p.castleHp + gain);
  }
}

/**
 * Buy ONE castle-regen level for `CASTLE_REGEN_UPGRADE_PRICE` victory points.
 *
 * A verbatim mirror of `applyUpgradeGathererSpeed`, including its posture: **no-op, never throw**.
 * Every refusal returns `world` untouched, so a client intent that arrives unaffordable or capped
 * costs the sender nothing and cannot desync the host.
 *
 * ⚠ NO PHASE GATE, and that is R129 rather than an oversight: *"whenever you want you can upgrade
 * castle regen"*. `FIX` is BUILD-only under R19, so this deliberately diverges — the point of the
 * upgrade is to survive a fight you are already losing, which a BUILD-only purchase cannot do.
 *
 * ⛔ IT IS NOT IN `PREDICTABLE_ACTIONS` AND MUST NOT BE. Two rendered surfaces read `castleHp` every
 * frame (the HP bar and the castle art-state cut), so an optimistic local apply would flash the
 * castle back to intact and then snap it to damaged when the host's snapshot lands — the S144 P3
 * lesson `main.ts` records for FIX and SCRAP.
 */
export function applyUpgradeCastleRegen(world: World, action: UpgradeCastleRegenAction): World {
  const buyer = world.players.get(action.playerId);
  if (buyer === undefined) return world;
  // A fallen seat buys nothing — it can never regenerate anyway (R131), so taking its points would
  // be a pure tax. The intent policies deny this too; this is the reducer-side backstop.
  if (buyer.castleHp <= 0) return world;
  if (buyer.castleRegenLevel >= CASTLE_MAX_REGEN_LEVEL) return world;
  const score = world.scoreByPlayer.get(action.playerId) ?? 0;
  if (score < CASTLE_REGEN_UPGRADE_PRICE) return world;
  spendScore(world, action.playerId, CASTLE_REGEN_UPGRADE_PRICE);
  buyer.castleRegenLevel++;
  return world;
}
