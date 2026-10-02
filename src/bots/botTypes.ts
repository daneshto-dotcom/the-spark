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

/**
 * ⭐ S193 (owner R193-AI) — BOT PERSONALITIES: *"not just smarter, but … make them different … you can
 * choose to play against an aggressive bot, a defensive bot … five personalities, and then per level."*
 *
 * Difficulty says how WELL a bot plays; personality says WHAT it builds and WHEN (the C&C 3 / Age of
 * Mythology / StarCraft II split — `S193_BOTS_RESEARCH.md`). The knobs live in the lazy chunk
 * (`botPersonality.ts`); this always-loaded module carries only the names the lobby draws.
 * ⚠ The five names are MINE (spec Q-D), not the owner's.
 */
export type BotPersonality = 'BALANCED' | 'WARMONGER' | 'FORTRESS' | 'TYCOON' | 'SABOTEUR';
/** What the lobby can hold: a personality, or RANDOM (resolved per match from the seed). */
export type BotPersonalityChoice = BotPersonality | 'RANDOM';

export const BOT_PERSONALITIES: readonly BotPersonality[] = [
  'BALANCED', 'WARMONGER', 'FORTRESS', 'TYCOON', 'SABOTEUR',
];
/** Cycle order of the lobby's personality chip. BALANCED first = the default = today's bot. */
export const BOT_PERSONALITY_CHOICES: readonly BotPersonalityChoice[] = [...BOT_PERSONALITIES, 'RANDOM'];

/** Chip colours. UI-only. */
export const BOT_PERSONALITY_COLORS: Record<BotPersonalityChoice, number> = {
  BALANCED: 0x5b7cfa,
  WARMONGER: 0xe5484d,
  FORTRESS: 0x2f9e6a,
  TYCOON: 0xd99a00,
  SABOTEUR: 0x9b5de5,
  RANDOM: 0x9a9aa2,
};

/** The one-line identity printed under a bot's name in the lobby. UI-only. */
export const BOT_PERSONALITY_TAGLINES: Record<BotPersonalityChoice, string> = {
  BALANCED: 'plays the standard game',
  WARMONGER: 'army first, feeds units',
  FORTRESS: 'defence first, saves long',
  TYCOON: 'cheap towers, builds fast',
  SABOTEUR: 'eats links, hits leader', // audit LOW-2: was 32 chars and ran under the race chip
  RANDOM: 'one of the five, per match',
};

/** What a NOOB row's tagline reads (its chip is locked to BALANCED). UI-only. */
export const BOT_PERSONALITY_LOCKED_TAGLINE = 'personality unlocks at MID';

/**
 * ⭐ S193 audit LOW-2 — the longest tagline that clears the race chip, by arithmetic: the tagline starts
 * at row x = −PANEL_W/2 + 64 = −366 (PANEL_W 860), the race chip's left edge is RACE_X − 92 = −162
 * (RACE_X = PANEL_W/2 − 500), so 204 px are free; less an 8 px gap, 196 px. 12 px monospace advances
 * ≤ 0.6 em = 7.2 px a glyph, so 196 / 7.2 = 27 characters. `botPersonality.test.ts` pins every tagline.
 * ⭐ S194 (teams) — the panel widened 860 → 960 and the TEAM chip is now the leftmost (TEAM_X − 36 = −182);
 * the tagline starts at −416, so 226 px are free → 31 characters. 27 is kept: the cap still holds, 4 spare.
 */
export const BOT_TAGLINE_MAX_CHARS = 27;

/**
 * ⭐ PURE — resolve a lobby choice for bot `seat` in the match seeded `matchSeed`.
 *
 * ⛔ AN INTEGER HASH, NEVER THE BOT'S OWN mulberry32 STREAM. The host's BotManager and the worker's
 * (rebuilt from `workerBotInit`) must resolve RANDOM identically, and drawing from a bot's stream would
 * shift every later draw it makes. A Murmur3-style finaliser over (seed, seat) is a pure function of
 * the two inputs both sides already hold.
 */
export function resolvePersonality(choice: BotPersonalityChoice, matchSeed: number, seat: number): BotPersonality {
  if (choice !== 'RANDOM') return choice;
  let h = (matchSeed ^ Math.imul(seat + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return BOT_PERSONALITIES[h % BOT_PERSONALITIES.length]!;
}
