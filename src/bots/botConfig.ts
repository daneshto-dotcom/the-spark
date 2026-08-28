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
  /**
   * ⭐ S154 AMENDMENT A (owner) — does this tier SPEND POINTS ON ITS ECONOMY?
   *
   * Owner, after playing three difficulties: *"they are not upgrading their gatherer - hard and imma
   * should be at least upgrading the gatherer speed right away no? i cant see differece."* Both halves
   * of that are true: no bot has ever emitted `UPGRADE_GATHERER_SPEED` or `BUY_GATHERER` — the intents
   * have been allowlisted for many sessions and only the human ever used them — and an economy a bot
   * never invests in is a tier difference the player cannot see.
   *
   * It is the most legible difference available, because it COMPOUNDS: a faster hauler means more
   * shapes, which means more towers, which is exactly the ladder `towerTiers` describes. A HARD bot
   * that upgrades on its first affordable tick pulls away from a MID one that never does, visibly,
   * without either of them being handed anything.
   */
  readonly upgradesGatherer: boolean;
  /**
   * ⭐ S154 AMENDMENT A — and does it buy a SECOND hauler? IMBA only: `GATHERER_PRICE` is 105 against
   * a 50-point speed upgrade, so a second body is the late, expensive play and the end-boss is the
   * only tier that should be making it.
   */
  readonly buysSecondGatherer: boolean;
  /**
   * ⭐ S156 P5 (owner ruling) — does this bot RUSH its first tower?
   *
   * Owner: *"bot in hard and imba should build the first tower whenever the tower they want to build
   * is available!!! can even be 30 sec!"*
   *
   * The S154 duty cycle has a bot spend shapes for 30 s of every 60 s, and the measurement that
   * matters is why that is fatal to a FIRST tower specifically: a bill wants 4 of ONE type and the
   * hauler delivers roughly one shape every 11 s, so the loose-build window spends exactly the
   * shapes the bill is accumulating and the pool is repeatedly reset to zero before it can reach 4.
   * S156's baseline on the real four-seat clock: HARD's first tower landed at tick 10 370 (~2.9 min)
   * and IMBA's never landed at all inside five sim-minutes.
   *
   * When true, the bot holds its shapes CONTINUOUSLY — no duty cycle — but only until its first
   * structure is stamped. After that the S154 cycle resumes unchanged, so the restraint is bounded
   * and a bot cannot spend the whole match standing still.
   *
   * ⚠ The passivity this trades away is the cost S154 priced the hold against (*"a bot that saves
   * for a minute looks passive"*). The owner has since removed that cost directly — *"a saving bot
   * doesnt need to look passive he can explore the map"* — which is the scouting work, and they
   * overrode the timing concern explicitly with *"can even be 30 sec"*.
   *
   * HARD and IMBA only, matching the ruling verbatim. MID keeps the duty cycle and stays the
   * difficulty floor between a NOOB that never builds towers and a HARD that rushes them.
   */
  readonly rushesFirstTower: boolean;
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
    upgradesGatherer: false,
    buysSecondGatherer: false,
    rushesFirstTower: false,
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
    upgradesGatherer: false,
    buysSecondGatherer: false,
    rushesFirstTower: false,
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
    upgradesGatherer: true,
    buysSecondGatherer: false,
    rushesFirstTower: true,
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
    upgradesGatherer: true,
    buysSecondGatherer: true,
    rushesFirstTower: true,
  },
};
