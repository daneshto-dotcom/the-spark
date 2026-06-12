/**
 * SPARK — S87: bot-mode shared types (DELIBERATELY tiny).
 *
 * This module is imported by the ALWAYS-LOADED ui surfaces (botSetupOverlay,
 * main.ts wiring) AND by the LAZY bots chunk (botManager/botBrain), so it must
 * stay a few hundred bytes: types + the difficulty name table only. All
 * behavior/tuning lives in botConfig.ts inside the lazy chunk (bundle charter:
 * index chunk < 550 KiB, S85 remediation pattern).
 */

/** Difficulty tiers — user-named (S87 verbatim: "noob, mid, hard, and imba/op"). */
export type BotDifficulty = 'NOOB' | 'MID' | 'HARD' | 'IMBA';

/** Cycle order for the setup overlay's per-bot difficulty buttons. */
export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['NOOB', 'MID', 'HARD', 'IMBA'];

/** Accent colors for difficulty labels (calm → menacing). UI-only. */
export const BOT_DIFFICULTY_COLORS: Record<BotDifficulty, number> = {
  NOOB: 0x44ff5e,
  MID: 0xffe23b,
  HARD: 0xff8c1a,
  IMBA: 0xff3b6b,
};
