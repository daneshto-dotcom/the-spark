/**
 * SPARK — S87: per-difficulty bot tuning table (LAZY chunk).
 *
 * Single source of truth for everything that makes NOOB feel like your
 * little cousin and IMBA feel unfair. All values are playtest knobs — tune
 * here, never inline in the controller/brain.
 *
 * Reference speeds (px/tick @60Hz): hunter max 4.2 · pooped-cruiser chase 7 ·
 * a deliberate human mouse sweep ≈ 8-20. NOOB is slower than the hunter
 * (catchable, comedic); IMBA out-runs everything but a panicked human.
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
  },
};
