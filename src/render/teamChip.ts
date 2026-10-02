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

/**
 * ⭐ S193 (audit F1, teams spec Q2) — the ONE wording for "this lobby cannot start: no enemy". Shown by the
 * bot lobby under START MATCH and by the multiplayer lobby under Begin, so the two never drift.
 */
export const TEAMS_UNPLAYABLE_HINT = 'everyone is on one team — pick at least two sides';

/** Begin is drawn at full opacity when a match can start, at this one when it cannot. ⚠ MINE. */
export const BEGIN_DIMMED_ALPHA = 0.4;

/**
 * ⭐ S193 (audit F1) — how the multiplayer lobby paints Begin. Pure, so a test can see the exact rule the
 * renderer applies. Quickmatch has no manual Begin at all (S87 P4). When every occupied seat is on one team
 * (`teamsPlayable` false) Begin stays VISIBLE but dimmed, with the hint under it — `main.ts`'s handler
 * refuses the press with the same predicate, so it no longer looks live while doing nothing.
 */
export function beginButtonPaint(
  v: { readonly beginVisible: boolean; readonly teamsPlayable: boolean },
  quickmatch: boolean,
): { visible: boolean; alpha: number; hintVisible: boolean } {
  const visible = quickmatch ? false : v.beginVisible;
  const blocked = visible && !v.teamsPlayable;
  return { visible, alpha: blocked ? BEGIN_DIMMED_ALPHA : 1, hintVisible: blocked };
}
