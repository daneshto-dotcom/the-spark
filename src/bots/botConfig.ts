/**
 * SPARK — S87: per-difficulty bot tuning table (LAZY chunk).
 *
 * Single source of truth for everything that makes NOOB feel like your
 * little cousin and IMBA feel unfair. All values are playtest knobs — tune
 * here, never inline in the controller/brain.
 *
 * Reference speeds (px/tick @60Hz): hunter cap 5.25 / terminal ≈ 4.5 (S89 P4, was 4.2) ·
 * pooped-cruiser chase 7 · a deliberate human mouse sweep ≈ 8-20. NOOB (3.2) is slower than the
 * hunter (catchable, comedic); MID (5.0) still edges it; HARD/IMBA out-run everything but a human.
 */

import type { BotDifficulty } from './botTypes.ts';

export interface BotConfig {
  /** Max virtual-cursor speed, px/tick. */
  readonly cursorSpeed: number;
  /** Cursor acceleration, px/tick². Low accel = lumbering wind-up. */
  readonly cursorAccel: number;
  /** Decide a new goal every N ticks while idle (staggered by seat). */
  readonly thinkEveryTicks: number;
  /** Min ticks between completed builds (the bot dawdles in between). */
  readonly buildCooldownTicks: number;
  /** Gaussian-ish aim error applied to chosen build points, px. */
  readonly aimJitterPx: number;
  /** Perpendicular travel sway amplitude, px/tick (human-hand wobble). */
  readonly wobble: number;
  /** May spend disruption charges severing enemy bonds. */
  readonly canSever: boolean;
  /** Chance per think-decision to go severing when eligible. */
  readonly severChance: number;
  /** Runs from a hunter that is chasing THIS bot. */
  readonly fleesHunter: boolean;
  /** Walks over its own structure-splats to clean them (income restore). */
  readonly cleansSplats: boolean;
  /** Races to click rainbows. */
  readonly claimsRainbow: boolean;
  readonly rainbowChance: number;
  /** IMBA: grabs free potatoes and plants them on enemy structures. */
  readonly usesPotato: boolean;
  /** IMBA: spends a charge on SHRINK_TERRITORY when holding max charges. */
  readonly usesShrink: boolean;
  /** Frontier-aware placement (bond-density toward the 1.5×prim cap) vs
   *  random own-prim growth. */
  readonly smartPlacement: boolean;
  /**
   * ⭐ S154 P3 (owner R86) — may this bot BANK toward a tower and stamp one?
   *
   * Owner, re-reporting it this session: *"bots still not building towers.... medium bots should at
   * least build some"* — which is a DIFFICULTY FLOOR, not just a feature. NOOB is left out
   * deliberately: it is *"your little cousin"*, and a cousin who fields a laser turret is not that.
   *
   * ⚠ IT COSTS MORE THAN A FLAG, AND THE FLAG ALONE WOULD HAVE BEEN A NO-OP. A bot's whole supply
   * is gatherer → bank → porch → place, and `chooseGoal`'s PULL branch empties the bank one shape at
   * a time to feed the next single placement — so a bot NEVER holds the 4-8 shapes a blueprint bill
   * needs, and `planBlueprintPayment` would have returned null forever. The HOARD rule in
   * `chooseGoal` is the load-bearing half; this field only says who is allowed to use it.
   */
  readonly buildsTowers: boolean;
  /**
   * ⭐ S154 AMENDMENT A (owner) — HOW MANY RUNGS OF THE TOWER LADDER THIS TIER CLIMBS.
   *
   * Owner: *"there should be a clear different between each bot level"*. `buildsTowers` said only
   * WHETHER a tier builds; this says WHAT it reaches for. Blueprints are ranked cheapest-first from
   * the registry, and a tier may pursue the first `towerTiers` of them — so the ladder is derived and
   * a new recipe slots in without touching this table.
   *
   * The result the owner can SEE across a lobby: MID fields the cheap utility tower and nothing else;
   * HARD reaches the mid-cost defences; IMBA goes for the top of the registry. It also composes with
   * `BOT_INTELLIGENCE_DESIGN.md` §3, which ranks blueprints per tier for the same reason — that
   * document's matrix starts blueprints at HARD, and the owner's later ruling (*"medium bots should at
   * least build some"*) moves the floor down to MID. Later ruling wins; the ladder keeps the SPREAD
   * the matrix was after.
   */
  readonly towerTiers: number;
}

export const BOT_CONFIGS: Record<BotDifficulty, BotConfig> = {
  NOOB: {
    cursorSpeed: 3.2,
    cursorAccel: 0.12,
    thinkEveryTicks: 48,
    buildCooldownTicks: 360,
    aimJitterPx: 60,
    wobble: 2.5,
    canSever: false,
    severChance: 0,
    fleesHunter: false,
    cleansSplats: false,
    claimsRainbow: false,
    rainbowChance: 0,
    usesPotato: false,
    usesShrink: false,
    smartPlacement: false,
    buildsTowers: false,
    towerTiers: 0,
  },
  MID: {
    cursorSpeed: 5.0,
    cursorAccel: 0.25,
    thinkEveryTicks: 30,
    buildCooldownTicks: 210,
    aimJitterPx: 28,
    wobble: 1.5,
    canSever: true,
    severChance: 0.25,
    fleesHunter: true,
    cleansSplats: false,
    claimsRainbow: true,
    rainbowChance: 0.3,
    usesPotato: false,
    usesShrink: false,
    smartPlacement: false,
    buildsTowers: true,
    towerTiers: 2,
  },
  HARD: {
    cursorSpeed: 7.0,
    cursorAccel: 0.4,
    thinkEveryTicks: 18,
    buildCooldownTicks: 130,
    aimJitterPx: 10,
    wobble: 0.8,
    canSever: true,
    severChance: 0.6,
    fleesHunter: true,
    cleansSplats: true,
    claimsRainbow: true,
    rainbowChance: 0.7,
    usesPotato: false,
    usesShrink: false,
    smartPlacement: true,
    buildsTowers: true,
    towerTiers: 4,
  },
  IMBA: {
    cursorSpeed: 10.5,
    cursorAccel: 0.7,
    thinkEveryTicks: 6,
    buildCooldownTicks: 70,
    aimJitterPx: 2,
    wobble: 0.3,
    canSever: true,
    severChance: 0.9,
    fleesHunter: true,
    cleansSplats: true,
    claimsRainbow: true,
    rainbowChance: 0.95,
    usesPotato: true,
    usesShrink: true,
    smartPlacement: true,
    buildsTowers: true,
    towerTiers: 7,
  },
};
