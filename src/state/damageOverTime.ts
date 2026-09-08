/**
 * SPARK — S168 — **DAMAGE OVER TIME, AS A MECHANIC RATHER THAN AS ONE BOSS'S SPECIAL CASE.**
 *
 * Owner, correcting my first cut of the zombie aura: *"no for the zombie boss aura it has to be 2.5%
 * of the enemy that is effected - essentially we need to build a new mechanic - debuff OR damage over
 * time. its not fair if its 2.5% of his own health..."*
 *
 * He is right on both counts, and the second one is the interesting half.
 *
 * ## ⭐ Why percent-of-VICTIM is the fair one, measured
 *
 * A percentage of the BOSS's pool is a FLAT rate — 3 fifths a second for everybody — so it deletes
 * small units and barely troubles large ones. A percentage of the VICTIM's own pool is a UNIFORM
 * TIME-TO-KILL: at 2.5%/s everything dies in 100/2.5 = **40 seconds**, whatever it is.
 *
 *      unit            pool   flat rate (wrong)   percent-of-victim (his ruling)
 *      chewer             5             1.7 s                    40.0 s
 *      tier-3 warband    24             8.0 s                    40.0 s
 *      Pharaoh          143            47.7 s                    40.5 s
 *
 * ## ⛔ The problem that makes this a MECHANIC and not a multiplication
 *
 * 2.5% of a 5-fifth chewer is 0.125 fifths a second. `damageEntity` throws on a fractional amount BY
 * DESIGN, and a float accumulator to carry the remainder is BANNED in this sim — it is exactly how a
 * host and its `?worker=1` mirror drift apart invisibly. Percent-of-victim is fractional for almost
 * every unit in the game, so it cannot be written the obvious way at all.
 *
 * ⭐ **SO THE ARITHMETIC IS INVERTED: the tick always deals exactly ONE FIFTH, and the RATE carries
 * the percentage.** A victim's interval is `HZ / (pool × rate)`, derived per victim from its own
 * pool. Rounding that interval to whole ticks costs at most **1.3%** of the time-to-kill across the
 * entire shipped roster (measured: 40.0 s–40.5 s against a nominal 40.0 s), and it costs **zero**
 * precision in the damage itself, which is always the integer 1.
 *
 * ## ⚠ What this is NOT, yet
 *
 * This is an AURA mechanic: the damage lands only while the victim is inside the source's radius.
 * A true lingering DEBUFF — one that keeps ticking after the victim walks out — needs per-creature
 * state, which is serialized and hashed and therefore owes the four-sites tax and a protocol bump.
 * He named *"debuff OR damage over time"* and the aura only requires the second, so that is what is
 * built. The lingering variant is a deliberate non-goal until he asks for it.
 */

import { PHYSICS_HZ } from '../constants.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { unitPoolFifths } from './stats.ts';
import type { CreatureType } from './creatures/creature.ts';

/** A creature type's FULL pool in fifths — the denominator every percentage here is taken of. */
export function maxPoolFifths(type: CreatureType): number {
  const cfg = getCreatureConfig(type);
  return unitPoolFifths(cfg.hp, cfg.def);
}

/**
 * Ticks between single-fifth hits, for a damage-over-time of `perMille` of the victim's own pool
 * per second.
 *
 * ⚠ `perMille` rather than a percentage so that a ".5" — which is what the owner ruled — is itself
 * an integer and no float enters the sim.
 *
 * Returns `Infinity` for a victim with no pool or a zero rate, so callers can skip rather than
 * divide by zero.
 */
export function dotIntervalTicks(victimPoolFifths: number, perMille: number): number {
  if (victimPoolFifths <= 0 || perMille <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.round((PHYSICS_HZ * 1000) / (victimPoolFifths * perMille)));
}

/**
 * Is this victim due a single-fifth tick of DoT right now?
 *
 * ⚠ PHASE-SPREAD BY THE VICTIM'S OWN ID — the standing rule in this codebase, and the right axis
 * here: each victim carries its own clock, so a crowd inside one aura does not flash as a single
 * synchronised pulse. It also means a victim that leaves and re-enters the radius cannot re-phase
 * to dodge damage, because the phase is a function of `world.tick` and the id, never of a
 * per-victim accumulator.
 */
export function dotDueThisTick(
  tick: number,
  victimId: number,
  victimType: CreatureType,
  perMille: number,
): boolean {
  const interval = dotIntervalTicks(maxPoolFifths(victimType), perMille);
  if (!Number.isFinite(interval)) return false;
  return (tick + victimId) % interval === 0;
}
