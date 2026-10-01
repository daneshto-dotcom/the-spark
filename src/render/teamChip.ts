/**
 * SPARK — ⭐ S192 (owner R192-T4) — the TEAM chip's colour, shared by the bot lobby and the multiplayer
 * lobby. Four team colours chosen apart from the six race colours' hues so a chip never reads as a race;
 * grey for "no team" (its own side). Render-only — the sim never sees a colour for a team.
 */
import { isTeamIndex } from '../state/teams.ts';

export const TEAM_CHIP_COLORS: readonly number[] = [0xff5a5a, 0x4fb3ff, 0x5ee08a, 0xffc44d];
export const NO_TEAM_CHIP_COLOR = 0x888888;

export function teamChipColor(pick: number | undefined): number {
  return isTeamIndex(pick) ? TEAM_CHIP_COLORS[pick]! : NO_TEAM_CHIP_COLOR;
}
