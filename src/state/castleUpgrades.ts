/**
 * SPARK — CASTLE UPGRADES: buy HP, ATK, DEF or PEN for your keep with victory points.
 *
 * ⭐⭐ S187 (owner) — **HIS TABLE, AND HIS REASON FOR IT.**
 *
 * > *"Same as we have upgrade castle regen, we will have upgrade castle HP. Each a hundred victory
 * > points. If it's in the first five waves then by 250; if in the five to ten, then 350; ten to
 * > fifteen 450; fifteen to twenty 550; and twenty to twenty-five 650. With a maximum of ten upgrade
 * > points. And we'll also have a castle upgrade for attack as well, and for defense and for
 * > penetration, the same kind of scale."*
 *
 * ## ⭐ THIS IS THE ANSWER TO CANON §3b's UNRESOLVED CONSEQUENCE
 *
 * S186 raised the win bar with the wave (2,500 → 50,000) and left the castle at a flat 2,500, so the
 * canon recorded that *"the longer a match runs, the more decisively castle-rush becomes the correct
 * strategy"* — reported, not fixed, because he had not asked. He has now: the castle climbs too.
 *
 * ## ⛔ THE GAIN IS BAKED AT PURCHASE, NOT RECOMPUTED
 *
 * The HP amount depends on the wave you buy it ON — 250 early, 650 late. So the seat stores the
 * ACCUMULATED BONUS, not a level it re-derives. Recomputing from a level would silently re-price
 * every earlier purchase at the current band, so a wave-3 purchase would inflate to 650 by wave 21.
 * That is the same reason `Creature.maxEhp` is stored rather than derived, one system up.
 *
 * ⚠ **THE LEVEL COUNT IS STILL KEPT**, because the cap is on PURCHASES, not on the total. Ten
 * purchases at 250 and ten at 650 are both "ten upgrade points"; only the bonus differs.
 *
 * ## ⛔ AND THE CASTLE STAYS OFF THE LADDER, DELIBERATELY
 *
 * `SPARK_CANON.md` §2 records the castle as *"THE ONE DELIBERATE EXCEPTION"* — its pool is a raw
 * 2,500 rather than `HP × (5 + DEF)`. These upgrades do not change that. HP adds raw points; DEF
 * reduces incoming damage by the ladder's own ratio without converting the pool. Folding the castle
 * onto the ladder would retune every castle relationship measured in S181, which he has not asked
 * for and which this priority must not smuggle in.
 */

import { CASTLE_ATK, CASTLE_MAX_HP, CASTLE_PEN } from '../constants.ts';
import { FIFTHS, attackFifths } from './stats.ts';
import type { PlayerId } from '../types.ts';

/** The four things a keep can buy. */
export type CastleStat = 'hp' | 'atk' | 'def' | 'pen';

/** Every value, for the exhaustiveness tests and the wire validator. */
export const CASTLE_STATS: readonly CastleStat[] = ['hp', 'atk', 'def', 'pen'] as const;

/**
 * ⭐ HIS PRICE, matching the regen upgrade exactly: *"each a hundred victory points"*.
 * Deliberately the same constant value as `CASTLE_REGEN_UPGRADE_PRICE` rather than an alias of it —
 * the two are independent decisions that happen to agree, and aliasing would make a future change to
 * one silently move the other.
 */
export const CASTLE_UPGRADE_PRICE = 100;

/**
 * ⭐ HIS CAP: *"a maximum of ten upgrade points"*. Per axis, so a seat that pours everything into
 * one stat is bounded, and a seat that spreads is bounded on each.
 */
export const CASTLE_UPGRADE_MAX_LEVEL = 10;

/**
 * ⭐ HIS HP TABLE, by the wave the purchase is made on.
 *
 * The bands are the SAME FIVE the win bar and the quarry already use (canon §3b, §3c), which is not
 * a coincidence — he has now given three systems the same wave boundaries, so they are read from one
 * shared predicate rather than three copies that can drift apart.
 */
export const CASTLE_HP_GAIN_BY_BAND: readonly number[] = [250, 350, 450, 550, 650] as const;

/**
 * Which band a wave falls in: 0 for waves 1–5, 1 for 6–10, … 4 for 21–25 and beyond.
 *
 * ⚠ **CLAMPED AT THE TOP BAND, AND THAT IS MINE, NOT HIS.** He specified up to wave 25. Past it the
 * gain holds at 650 rather than climbing, for the same reason the win bar clamps at 50,000: a value
 * that kept climbing would quietly turn a long match into a different game, and one that fell back
 * would reward coasting. One line reverses it.
 */
export function castleUpgradeBand(waveNumber: number): number {
  const w = Math.max(1, Math.trunc(waveNumber));
  return Math.min(CASTLE_HP_GAIN_BY_BAND.length - 1, Math.floor((w - 1) / 5));
}

/** The HP a single purchase adds, on the wave it is made. */
export function castleHpGainForWave(waveNumber: number): number {
  return CASTLE_HP_GAIN_BY_BAND[castleUpgradeBand(waveNumber)] as number;
}

/**
 * A seat's purchased castle upgrades.
 *
 * ⚠ ONE OBJECT RATHER THAN FIVE FIELDS ON `Player`: it is one hash projection, one additive-optional
 * wire entry and one thing to remember at the carry-FSM rebuilds, instead of five of each.
 */
export interface CastleUpgrades {
  /** Purchases made on the HP axis, capped at `CASTLE_UPGRADE_MAX_LEVEL`. */
  readonly hpLevel: number;
  /** ⛔ The ACCUMULATED HP, baked at each purchase. See the module docblock. */
  readonly hpBonus: number;
  readonly atkLevel: number;
  readonly defLevel: number;
  readonly penLevel: number;
}

/** A seat that has bought nothing. The correct opening value and the correct pre-S187 default. */
export function emptyCastleUpgrades(): CastleUpgrades {
  return { hpLevel: 0, hpBonus: 0, atkLevel: 0, defLevel: 0, penLevel: 0 };
}

/** The level on a given axis, for the cap check and the HUD. */
export function castleLevelOf(u: CastleUpgrades, stat: CastleStat): number {
  switch (stat) {
    case 'hp':
      return u.hpLevel;
    case 'atk':
      return u.atkLevel;
    case 'def':
      return u.defLevel;
    case 'pen':
      return u.penLevel;
  }
}

/** Is there room to buy another point on this axis? */
export function canBuyCastleStat(u: CastleUpgrades, stat: CastleStat): boolean {
  return castleLevelOf(u, stat) < CASTLE_UPGRADE_MAX_LEVEL;
}

/**
 * Apply one purchase. PURE — returns the next value and never mutates, so the reducer decides
 * whether the seat could afford it before anything changes.
 */
export function withCastlePurchase(
  u: CastleUpgrades,
  stat: CastleStat,
  waveNumber: number,
): CastleUpgrades {
  if (!canBuyCastleStat(u, stat)) return u;
  switch (stat) {
    case 'hp':
      // ⛔ The gain is read ONCE, here, on the wave of the purchase, and added to the stored total.
      return { ...u, hpLevel: u.hpLevel + 1, hpBonus: u.hpBonus + castleHpGainForWave(waveNumber) };
    case 'atk':
      return { ...u, atkLevel: u.atkLevel + 1 };
    case 'def':
      return { ...u, defLevel: u.defLevel + 1 };
    case 'pen':
      return { ...u, penLevel: u.penLevel + 1 };
  }
}

/**
 * ⛔ **THIS SEAT'S CASTLE CEILING.** Every site that treated `CASTLE_MAX_HP` as the maximum must read
 * this instead, or a seat that bought HP would heal to the OLD cap and the purchase would do nothing
 * above 2,500. That is the same failure mode `creatureMaxEhp` exists to prevent one system down.
 */
export function castleMaxHpFor(u: CastleUpgrades): number {
  return CASTLE_MAX_HP + u.hpBonus;
}

/**
 * This seat's castle shot, in fifths.
 *
 * ⭐ ATK and PEN are POINTS on the shared ladder, so a purchase is `+1 point` and the shot follows
 * `attackFifths` exactly as every other attacker does. Base is `attackFifths(5, 3)` = 40.
 */
export function castleShotFifthsFor(u: CastleUpgrades): number {
  return attackFifths(CASTLE_ATK + u.atkLevel, CASTLE_PEN + u.penLevel);
}

/**
 * ⛔ **DAMAGE THIS CASTLE ACTUALLY TAKES, AFTER ITS PURCHASED DEFENCE.**
 *
 * The ladder says DEF multiplies effective HP by `(5 + def) / 5`. The castle's pool is a raw number
 * rather than a ladder pool (canon §2), so the identical relationship is applied to the INCOMING
 * amount instead: `floor(amount × 5 / (5 + def))`. A castle with DEF 5 takes half damage, which is
 * exactly what `unitPoolFifths` would have given it by doubling the pool.
 *
 * ⚠ **FLOORED, AND NEVER BELOW 1 ON A REAL HIT.** Integer division is what keeps this out of the
 * float path — `damageEntity` throws on a non-integer. The floor-at-one is the owner's own S187
 * rule for the draft, applied here for the same reason: a big DEF must not make a seat immune to
 * small hits, which would make a chewer swarm literally unable to ever fell a keep.
 */
export function castleDamageAfterDefence(amount: number, u: CastleUpgrades): number {
  if (amount <= 0) return 0;
  const reduced = Math.floor((amount * FIFTHS) / (FIFTHS + u.defLevel));
  return Math.max(1, reduced);
}

/** For the HUD: what the next purchase on this axis would buy, in the player's own words. */
export function castleUpgradePreview(
  u: CastleUpgrades,
  stat: CastleStat,
  waveNumber: number,
): string {
  if (!canBuyCastleStat(u, stat)) return 'MAX';
  switch (stat) {
    case 'hp':
      return `+${castleHpGainForWave(waveNumber)} HP`;
    case 'atk': {
      const now = castleShotFifthsFor(u);
      const next = attackFifths(CASTLE_ATK + u.atkLevel + 1, CASTLE_PEN + u.penLevel);
      return `+${next - now} DAMAGE`;
    }
    case 'pen': {
      const now = castleShotFifthsFor(u);
      const next = attackFifths(CASTLE_ATK + u.atkLevel, CASTLE_PEN + u.penLevel + 1);
      return `+${next - now} DAMAGE`;
    }
    case 'def':
      // The honest phrasing: DEF is a ratio, so it is a percentage the player can act on.
      return `-${Math.round((1 - FIFTHS / (FIFTHS + u.defLevel + 1)) * 100)}% TAKEN`;
  }
}

/** CLIENT INTENT, the `UPGRADE_CASTLE_REGEN` posture: host-authoritative, no-op-never-throw. */
export interface UpgradeCastleStatAction {
  readonly type: 'UPGRADE_CASTLE_STAT';
  readonly playerId: PlayerId;
  readonly stat: CastleStat;
}

/**
 * Host-side purchase. Modelled line-for-line on `applyUpgradeCastleRegen`, including the order of
 * its guards, so the two upgrades cannot drift into different affordability semantics.
 *
 * ⛔ A FALLEN SEAT BUYS NOTHING (R131). Its keep is at zero and elimination is not reversible, so
 * taking its points would be a pure tax. The intent policies deny it too; this is the backstop.
 *
 * ⚠ THE WAVE IS READ FROM THE WORLD, NOT FROM THE ACTION. A client that could name its own wave
 * could buy a 650-point upgrade on wave 1. The host decides when "now" is.
 */
export function applyUpgradeCastleStat(world: {
  players: Map<PlayerId, { castleHp: number; castleUpgrades: CastleUpgrades }>;
  scoreByPlayer: Map<PlayerId, number>;
  waveNumber: number;
}, action: UpgradeCastleStatAction, spend: (seat: PlayerId, amount: number) => void): void {
  const buyer = world.players.get(action.playerId);
  if (buyer === undefined) return;
  if (buyer.castleHp <= 0) return;
  if (!CASTLE_STATS.includes(action.stat)) return; // a malformed wire value buys nothing
  if (!canBuyCastleStat(buyer.castleUpgrades, action.stat)) return;
  const score = world.scoreByPlayer.get(action.playerId) ?? 0;
  if (score < CASTLE_UPGRADE_PRICE) return;
  spend(action.playerId, CASTLE_UPGRADE_PRICE);
  const before = buyer.castleUpgrades;
  buyer.castleUpgrades = withCastlePurchase(before, action.stat, world.waveNumber);
  /*
   * ⭐⭐ S188 P3 — AN HP PURCHASE HEALS BY WHAT IT BUYS, NOT ONLY RAISES THE CEILING.
   *
   * > *"each a hundred victory points will upgrade the castle by … 250"* — owner (S187 table:
   * > *"Each a hundred victory points. If it's in the first five waves then by 250 …"*)
   *
   * He is buying 250 HP, and a keep that paid for it must HAVE it. Raising only `hpBonus` moved the
   * ceiling and left `castleHp` where it stood, so without regen the purchase changed nothing but
   * the bar's max — 2500 / 2750, a keep no stronger than before it paid.
   *
   * ⚠ THE GAIN IS THE BAKED DELTA (`hpBonus` after − before), so it is the same number the ceiling
   * rose by, read ONCE on the purchase wave. Capped at the new ceiling as a guard (it cannot exceed
   * it: `castleHp ≤ old max`, and the ceiling rose by the same gain). ⛔ Never on a fallen keep —
   * `castleHp <= 0` returned above (R131), so a purchase cannot revive an eliminated seat.
   */
  const gained = buyer.castleUpgrades.hpBonus - before.hpBonus;
  if (gained > 0) {
    buyer.castleHp = Math.min(castleMaxHpFor(buyer.castleUpgrades), buyer.castleHp + gained);
  }
}
