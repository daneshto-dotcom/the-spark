/**
 * SPARK — ⭐ S193 (owner R193-AI) — THE PERSONALITY KNOB TABLE (LAZY chunk).
 *
 * Owner: *"make the AI bots smarter, so not just smarter, but um, make them different … five
 * personalities, and then per level, so the … imba bot or the hard bot on offensive will be different."*
 * Spec: `S193_BOTS_SPEC.md` (owner view: `S193_BOTS_SPEC.html`). Research: `S193_BOTS_RESEARCH.md`.
 *
 * ## The two rules this table obeys
 *
 * 1. **A personality never grants a capability its tier lacks** and never touches a tier's skill knobs
 *    (speed, think cadence, aim, scouting, gatherer investment, first-tower rush, raid rate). It only
 *    re-orders and re-weights what the tier can already do — so the same personality naturally plays
 *    differently at HARD and at IMBA, which is the owner's "per level".
 * 2. **Every ruling in `BOT_INTELLIGENCE_DESIGN.md` §10 stays ruled.** Q2 (raids): `severChance`, the
 *    raid-point currency and the concurrency are identical for all five — a personality chooses only
 *    WHO is raided, between the two targets the owner named in S156 (*"the leader OR the nearest enemy
 *    whose score sits closest above"*). Q3/Q7: no personality severs its own bonds. Q1: gatherer
 *    investment stays tier-owned. Q4: EVERY IMBA personality opens with the goblin tower and feeds at
 *    least its leftovers (Council S193, Gemini M1). Q6: IMBA adapts at the bell, whatever its style.
 *
 * ## Determinism
 *
 * Pure data, read by pure brain functions. ZERO rng draws are added anywhere, so the bot's mulberry32
 * draw ORDER is unchanged and BALANCED below IMBA replays byte-for-byte as it did before S193 (pinned by
 * a hash taken from master a638565b in `botPersonality.test.ts`).
 */

import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { isRaceTowerId } from '../state/raceTowerIds.ts';
import type { BotDifficulty, BotPersonality } from './botTypes.ts';

/** What a tower DOES (canon §5): ARMY emits units, DEFENCE shoots. */
export type TowerRole = 'race' | 'stink' | 'goblin' | 'pentagram' | 'hub' | 'helga' | 'laser' | 'voltkin';

export const ARMY_ROLES: ReadonlySet<TowerRole> = new Set(['race', 'goblin', 'pentagram', 'hub', 'voltkin']);
export const DEFENCE_ROLES: ReadonlySet<TowerRole> = new Set(['stink', 'helga', 'laser']);

/** PURE — the role of a blueprint, or null for one no bot climbs (the tier-9 boss towers). */
export function towerRoleOf(id: GodlyId): TowerRole | null {
  if (isRaceTowerId(id)) return 'race';
  switch (id) {
    case 'stinkTower': return 'stink';
    case 'goblinTower': return 'goblin';
    case 'pentagram': return 'pentagram';
    case 'lightningHub': return 'hub';
    case 'helga': return 'helga';
    case 'laserTurret': return 'laser';
    case 'voltkin': return 'voltkin';
    default: return null;
  }
}

export interface PersonalityKnobs {
  readonly personality: BotPersonality;
  /**
   * The order the tier's reachable rungs are climbed in. Roles listed first are pursued first; roles
   * not listed keep their cheapest-first position AFTER the listed ones. Empty = pure cost order (the
   * pre-S193 bot). ⚠ MINE except IMBA's leading `goblin` (Q4).
   */
  readonly towerOrder: readonly TowerRole[];
  /** With every rung raised: build another of the LAST rung in the order (pre-S193) or the FIRST. ⚠ MINE. */
  readonly repeatTower: 'last' | 'first';
  /**
   * FEED_TOWER policy. `never`; `leftovers` = only banked shapes beyond the target tower's bill (Q4's
   * *"buy goblins with leftover shapes"*); `eager` = in FIGHT, every banked shape (towers cannot be
   * stamped then), and leftovers in BUILD. ⚠ `eager` is MINE.
   */
  readonly feed: 'never' | 'leftovers' | 'eager';
  /** Of each 3600-tick BUILD save cycle, how many ticks shapes are held for a tower. 1800 = pre-S193. ⚠ MINE. */
  readonly saveHoldTicks: number;
  /** Multiplier on the tier's loose-build cooldown, rounded to whole ticks. 1 = pre-S193. ⚠ MINE. */
  readonly buildCooldownScale: number;
  /** WHO is raided: one rung up the score ladder (S156 default) or the leader. Both are the owner's words. */
  readonly raidTarget: 'ladder' | 'leader';
  /** POWER OF RA: rank aims near my own castle (pre-S193) or near my raid target's castle. ⚠ MINE. */
  readonly raAim: 'home' | 'front';
  /**
   * Q6 (owner S154): *"imba would adapt to build what he can before the build phase ends"*. A TIER rule —
   * true for every IMBA personality, false below (HARD waits). Carried here because the brain reads its
   * config, not its tier name.
   */
  readonly adaptsAtBell: boolean;
}

/**
 * ⭐ Q6's window: in the last 15 s of a BUILD phase an IMBA bot whose target is unaffordable builds any
 * affordable rung instead of saving through the bell. ⚠ MINE — 15 s is one gatherer round-trip and a
 * bit, enough that the substitute's own legality sweep has time to land.
 */
export const IMBA_ADAPT_WINDOW_TICKS = 900;

/** The pre-S193 bot. A config with no `persona` behaves exactly as this. */
export const IDENTITY_KNOBS: PersonalityKnobs = {
  personality: 'BALANCED',
  towerOrder: [],
  repeatTower: 'last',
  feed: 'never',
  saveHoldTicks: 1800,
  buildCooldownScale: 1,
  raidTarget: 'ladder',
  raAim: 'home',
  adaptsAtBell: false,
};

type Overrides = Partial<Omit<PersonalityKnobs, 'personality'>>;

/** Per personality: the base, then per-tier overrides. NOOB never reaches here (it is locked to BALANCED). */
const TABLE: Record<BotPersonality, { base: Overrides; MID?: Overrides; HARD?: Overrides; IMBA?: Overrides }> = {
  BALANCED: {
    base: {},
    // Q4 — goblin tower first, then goblins from leftovers. The rest is the pre-S193 IMBA.
    IMBA: { towerOrder: ['goblin'], feed: 'leftovers' },
  },
  WARMONGER: {
    base: { towerOrder: ['goblin', 'race', 'pentagram', 'hub', 'voltkin'], repeatTower: 'first', saveHoldTicks: 1200, raAim: 'front' },
    MID: { feed: 'leftovers' },
    HARD: { feed: 'eager' },
    IMBA: { feed: 'eager', raidTarget: 'leader' },
  },
  FORTRESS: {
    base: { towerOrder: ['stink', 'laser', 'helga'], repeatTower: 'first', saveHoldTicks: 2700 },
    IMBA: { towerOrder: ['goblin', 'stink', 'laser', 'helga'], feed: 'leftovers' },
  },
  TYCOON: {
    // Empty order = cheapest first; repeating the FIRST = another cheap tower, many of them.
    base: { repeatTower: 'first', saveHoldTicks: 900, buildCooldownScale: 0.8 },
    IMBA: { towerOrder: ['goblin'], feed: 'leftovers' },
  },
  SABOTEUR: {
    base: { towerOrder: ['pentagram', 'hub'], repeatTower: 'first', raidTarget: 'leader', raAim: 'front' },
    HARD: { feed: 'leftovers' },
    IMBA: { towerOrder: ['goblin', 'pentagram', 'hub'], feed: 'leftovers' },
  },
};

/**
 * ⭐ PURE — the knobs for `personality` at `tier`.
 *
 * ⛔ NOOB RESOLVES TO BALANCED, whatever was picked (Council S193, Gemini M3): a NOOB builds no towers and
 * cannot raid, so a personality there would be a fake choice. The lobby greys the chip to match.
 */
export function personalityKnobs(personality: BotPersonality, tier: BotDifficulty): PersonalityKnobs {
  const p: BotPersonality = tier === 'NOOB' ? 'BALANCED' : personality;
  const row = TABLE[p];
  const perTier = tier === 'NOOB' ? undefined : row[tier];
  return {
    ...IDENTITY_KNOBS,
    ...row.base,
    ...(perTier ?? {}),
    personality: p,
    adaptsAtBell: tier === 'IMBA',
  };
}

/**
 * PURE — stable-sort `rungs` (already cheapest-first) by the personality's role order. Listed roles come
 * first in list order; unlisted roles keep their cost order behind them. A total order: ties fall back to
 * the input index, which is itself a total order (`TOWERS_BY_COST`).
 */
export function orderRungsByPersonality(rungs: readonly GodlyId[], order: readonly TowerRole[]): GodlyId[] {
  if (order.length === 0) return [...rungs];
  const rank = (id: GodlyId): number => {
    const role = towerRoleOf(id);
    const i = role === null ? -1 : order.indexOf(role);
    return i < 0 ? order.length : i;
  };
  return rungs
    .map((id, index) => ({ id, index, r: rank(id) }))
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map((e) => e.id);
}
