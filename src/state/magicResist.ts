/**
 * SPARK — S192 (owner R192-M1..M7) — **MAGIC RESISTANCE (MRES): ONE MORE STAT ON THE ONE LADDER.**
 *
 * Owner, S192: *"magic resistance, which is basically on the same ladder as defense levels. One magic
 * resistant level is 1.2, two … 1.4, these 1.6, etc."* · *"the defense against a magic attack will look
 * rather than the enemies or the tower's defense, it would look at the tower's magic resistance … it will
 * look the same, but it'll be calculated differently."* · *"nothing makes magic stronger, it's just
 * different."* · *"towers will inherently have the same magic resistance as their regular defense."*
 *
 * ## The arithmetic (spec: `.claude/plans/S192_MAGIC_SPEC.md` §a)
 *
 * DEF is folded into the POOL (`HP × (5 + DEF)`), never subtracted from a hit, and a unit has ONE bar.
 * Against magic that bar must behave as if it were `HP × (5 + MRES)` long, so a magic hit of `A` lands
 * on it as `A × (5 + DEF) / (5 + MRES)` — the HP cancels. Floored, never below 1 on a real hit (the
 * castle's bought DEF already does exactly this). ⭐ At MRES = DEF the product is divisible, so the hit is
 * `A` exactly: today, byte for byte.
 *
 * ⚠ A ONE-FIFTH DoT TICK CANNOT USE THAT FLOOR — `floor(1 × …)` with the floor-at-one is 1 whenever
 * MRES ≥ DEF, so MRES would defend against none of the four DoT sources. A DoT tick is spread over its
 * victim's own beats instead (`magicDotFifths`, a stateless Bresenham): exact on average, deterministic
 * from the beat number and the id, and exactly 1 per beat at MRES = DEF. ⚠ MINE (spec Q-D): at MRES > DEF
 * some beats land 0 — a slower burn, never immunity.
 *
 * ## Determinism / wire
 *
 * No state, no float accumulator, no RNG. MRES is a pure function of the creature TYPE and — for
 * `raceUnit` only — the owner's `raceId`, which is already serialized and hashed. Nothing new rides the
 * wire; the RULE does, so it earns a protocol bump at merge (both peers compute it — the S186 test).
 */
import type { CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import type { RaceId } from './races.ts';
import type { CastleUpgrades } from './castleUpgrades.ts';
import { dotIntervalTicks, maxPoolFifths } from './damageOverTime.ts';

/**
 * ⭐ A DoT tick's class: magic, rescaled across its beats. `beat` is the source's due-count for this
 * victim (consecutive from one due tick to the next); the funnel adds the target's id for phase spread.
 */
export interface MagicDot {
  readonly kind: 'magicDot';
  readonly beat: number;
}

/**
 * ⛔⛔ THE ATTACK CLASS — a REQUIRED argument of every damage funnel (`damageEntity`, `damageConnector`,
 * `applyRadialDamage` / `RadialDamageFn`), never optional and never defaulted. An optional class would let
 * every existing and future site compile as "physical" by silence — the tolerant-default defect CLAUDE.md
 * lesson 7 records. Required means `tsc` enumerated all 29 sites and every new one must answer.
 * `src/state/magicResist.callSites.test.ts` pins the answers.
 */
export type DamageClass = 'physical' | 'magic' | MagicDot;

/** A magic DoT tick at `beat` (see `MagicDot`). */
export function magicDot(beat: number): MagicDot {
  return { kind: 'magicDot', beat };
}

/**
 * The beat number of a percent-of-victim DoT (`damageOverTime.ts`) on a due tick: `(tick + id) / interval`
 * is an integer exactly when `dotDueThisTick` is true, and consecutive dues give consecutive beats.
 */
export function dotBeat(tick: number, victimId: number, victimType: CreatureType, perMille: number): number {
  const interval = dotIntervalTicks(maxPoolFifths(victimType), perMille);
  return Number.isFinite(interval) ? Math.floor((tick + victimId) / interval) : 0;
}

export function isMagicClass(cls: DamageClass): boolean {
  return cls !== 'physical';
}

/**
 * A magic hit of `amount` fifths on a target of `def` / `mres`: `floor(amount × (5+def) / (5+mres))`,
 * never below 1 on a real hit. Exact (= `amount`) whenever `mres === def`.
 */
export function magicHitFifths(amount: number, def: number, mres: number): number {
  if (amount <= 0) return 0;
  const num = amount * (5 + def);
  const den = 5 + mres;
  return Math.max(1, Math.floor(num / den));
}

/**
 * A magic DoT tick of `amount` fifths at beat `b`: `floor((b+1)·r) − floor(b·r)` with `r = amount ×
 * (5+def) / (5+mres)` in exact integer arithmetic. Averages `r` per beat over any run of consecutive
 * beats; exactly `amount` on every beat when `mres === def`; may be 0 when `mres > def`.
 */
export function magicDotFifths(amount: number, def: number, mres: number, beat: number): number {
  if (amount <= 0) return 0;
  const num = amount * (5 + def);
  const den = 5 + mres;
  const b = Math.max(0, Math.trunc(beat));
  return Math.floor(((b + 1) * num) / den) - Math.floor((b * num) / den);
}

/**
 * THE ONE CONVERSION every funnel calls: what a hit of class `cls` actually lands on a target whose
 * DEF is `def` and MRES is `mres`. `phase` is the target's id (DoT phase spread).
 */
export function landedFifths(amount: number, cls: DamageClass, def: number, mres: number, phase: number): number {
  if (cls === 'physical') return amount;
  // ⚠ NO `mres === def` SHORTCUT, deliberately: at equality both formulas below are exact, and running
  // them is what lets the MRES = DEF differential prove the arithmetic rather than skip it.
  if (cls === 'magic') return magicHitFifths(amount, def, mres);
  return magicDotFifths(amount, def, mres, cls.beat + phase);
}

// ── THE TABLE (spec §b) — every number ⚠ MINE until the owner rules ─────────────────────────────

/**
 * ⚠ MINE — his ordering (R192-M6): *"the highest magic resistance will be by probably demons and mummies
 * and then vampires and then nagas and then Orcs and then zombies"*, as one level per race.
 */
export const RACE_MRES_LEVEL: Readonly<Record<RaceId, number>> = {
  demons: 4,
  mummies: 4,
  vampires: 3,
  nagas: 2,
  orcs: 1,
  zombies: 0,
};

/** ⚠ MINE — a tier-9 boss resists `6 + 2 × level` (Archdemon / Pharaoh 14 … zombie boss 6). */
export function bossMres(race: RaceId): number {
  return 6 + 2 * RACE_MRES_LEVEL[race];
}

/**
 * How each creature type gets its MRES. An exhaustive `Record` so a new type fails `tsc` until someone
 * decides. `'def'` = a GLOBAL unit, MRES = its own DEF (⚠ MINE, spec Q-G); `'ownerRace'` = the castle
 * soldier, one type for six races (⚠ MINE, spec Q9 — departs from R94/R117 per R192-M6); a race = that
 * race's level (tier-3) ; `{ boss }` = `bossMres`.
 *
 * ⚠ The ELITE PIRANHA and the BAT SWARM keep their BASE unit's level — "every stat ×N" was ruled before
 * MRES existed, and multiplied the swarm would be near magic-immune (spec Q-E).
 */
type MresRule = 'def' | 'ownerRace' | RaceId | { readonly boss: RaceId };
export const CREATURE_MRES: Readonly<Record<CreatureType, MresRule>> = {
  direwolf: 'def', // the Warlord's summon — "not orcs" (canon §3e)
  locustCloud: 'def',
  voltkin: 'def',
  chewer: 'def',
  lightningDrone: 'def',
  goblinMelee: 'def',
  goblinArcher: 'def',
  goblinShield: 'def',
  goblinHound: 'def',
  goblinBat: 'def',
  goblinSuicide: 'def',
  raceUnit: 'ownerRace',
  t3Hound: 'zombies',
  t3Scarab: 'mummies',
  t3Piranha: 'nagas',
  t3PiranhaElite: 'nagas',
  t3Bat: 'vampires',
  t3BatSwarm: 'vampires',
  t3Warband: 'orcs',
  t3Souleater: 'demons',
  t9BossVampires: { boss: 'vampires' },
  t9BossNagas: { boss: 'nagas' },
  t9BossMummies: { boss: 'mummies' },
  t9BossZombies: { boss: 'zombies' },
  t9BossOrcs: { boss: 'orcs' },
  t9BossDemons: { boss: 'demons' },
};

/**
 * A creature's MRES. `ownerRace` is read only for `raceUnit`; `null` (no such seat) falls back to the
 * soldier's own DEF, so the function is total.
 */
export function mresFor(type: CreatureType, ownerRace: RaceId | null): number {
  const rule = CREATURE_MRES[type];
  if (rule === 'def') return getCreatureConfig(type).def;
  if (rule === 'ownerRace') return ownerRace === null ? getCreatureConfig(type).def : RACE_MRES_LEVEL[ownerRace];
  if (typeof rule === 'string') return RACE_MRES_LEVEL[rule];
  return bossMres(rule.boss);
}

/** R192-M5 — *"towers will inherently have the same magic resistance as their regular defense. So, like,
 *  per connector"*: a structure of `n` connectors has DEF `n` and MRES `n`. */
export function structureMres(connectors: number): number {
  return connectors;
}

/** ⚠ MINE (spec Q2) — the keep's MRES level is its bought DEF level, the towers' rule. */
export function castleMresLevel(u: CastleUpgrades): number {
  return u.defLevel;
}

/** ⚠ MINE (spec Q-G) — a defender with a pool (Helga) resists magic with its own DEF. */
export function defenderMres(unitStats: { readonly def: number }): number {
  return unitStats.def;
}

/**
 * ⚠ MINE (spec Q-V) — a unit's OWN strike class. Every swing, shot and bite is physical (R192-M3);
 * the Voltkin's zap is the first link of its chain lightning (R192-M2), so it is magic like the hops.
 */
export function strikeClassFor(type: CreatureType): DamageClass {
  return type === 'voltkin' ? 'magic' : 'physical';
}
