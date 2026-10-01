/**
 * ⭐ S193 (audit F1, teams spec Q2) — **A BEGIN THAT CANNOT START A MATCH NO LONGER LOOKS LIVE.**
 *
 * The multiplayer lobby's Begin handler (`main.ts` `onBeginMatch`) refuses a room where every seat is on one
 * team, but the button stayed at full strength and the press silently did nothing. The view now computes the
 * SAME predicate (`teamsPlayable` over the occupied seats) and the renderer dims Begin with the bot lobby's
 * hint (`beginButtonPaint`). The real-renderer REACH check is in `e2e/teams-lobby.spec.ts` (it reads the
 * live Begin's alpha and the hint's visibility from `getDebugState`, then presses Begin and stays in LOBBY).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialLobbyState, lobbyReduce, lobbyView, type LobbyState } from './lobbyStateMachine.ts';
import { beginButtonPaint, BEGIN_DIMMED_ALPHA, TEAMS_UNPLAYABLE_HINT } from './teamChip.ts';

function hostingWith(teams: (number | undefined)[]): LobbyState {
  let s = lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: 'ABCDEF' });
  s = lobbyReduce(s, { type: 'PEER_STATUS', peerCount: teams.length - 1 });
  return lobbyReduce(s, {
    type: 'PRESENCE',
    roster: teams.map((team, seat) => ({ seat, color: 0x111111 * (seat + 1), isYou: seat === 0, ...(team !== undefined ? { team } : {}) })),
  });
}

describe('S193 F1 — the lobby view knows whether Begin can start a match', () => {
  it('⛔ every seat on ONE team → not playable; Begin dimmed, hint shown', () => {
    const v = lobbyView(hostingWith([0, 0, 0]));
    expect(v.beginVisible, 'anti-vacuity: Begin is revealed (a peer joined)').toBe(true);
    expect(v.teamsPlayable).toBe(false);
    expect(beginButtonPaint(v, false)).toEqual({ visible: true, alpha: BEGIN_DIMMED_ALPHA, hintVisible: true });
  });

  it('CONTROL — two sides, or nobody picked (free-for-all), or one seat unpicked → playable, full strength', () => {
    for (const teams of [[0, 0, 1], [undefined, undefined, undefined], [0, 0, undefined]]) {
      const v = lobbyView(hostingWith(teams));
      expect(v.teamsPlayable, JSON.stringify(teams)).toBe(true);
      expect(beginButtonPaint(v, false)).toEqual({ visible: true, alpha: 1, hintVisible: false });
    }
  });

  it('quickmatch has no manual Begin, so no hint either; a room with no Begin yet shows no hint', () => {
    const one = lobbyView(hostingWith([1, 1]));
    expect(beginButtonPaint(one, true)).toEqual({ visible: false, alpha: 1, hintVisible: false });
    const alone = lobbyView(lobbyReduce(initialLobbyState(), { type: 'HOST_START', code: 'ABCDEF' }));
    expect(beginButtonPaint(alone, false).hintVisible).toBe(false);
  });

  it('⛔ GUARD — the view and the Begin handler ask the SAME predicate, and the two lobbies share one hint', () => {
    const strip = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const main = strip(readFileSync(new URL('../main.ts', import.meta.url), 'utf8'));
    const begin = main.slice(main.indexOf('const onBeginMatch'), main.indexOf('const onBeginMatch') + 600);
    expect(begin, 'main.ts refuses Begin with the session predicate').toMatch(/if \(!sessionTeamsPlayable\(session\)\) return;/);
    const qm = strip(readFileSync(new URL('../net/quickmatchGate.ts', import.meta.url), 'utf8'));
    expect(qm, 'which is teamsPlayable over the same picks').toMatch(/return teamsPlayable\(picks, picks\.length\);/);
    const view = strip(readFileSync(new URL('./lobbyStateMachine.ts', import.meta.url), 'utf8'));
    expect(view).toMatch(/teamsPlayable: teamsPlayable\(picks, picks\.length\)/);
    const screen = strip(readFileSync(new URL('./lobbyScreen.ts', import.meta.url), 'utf8'));
    expect(screen).toMatch(/beginButtonPaint\(v, this\.quickmatch\)/);
    const bots = readFileSync(new URL('./botSetupOverlay.ts', import.meta.url), 'utf8');
    expect(bots).toContain('text: TEAMS_UNPLAYABLE_HINT');
    expect(TEAMS_UNPLAYABLE_HINT).toBe('everyone is on one team — pick at least two sides');
  });

  it('⭐ MUTATION — a paint rule that ignored teamsPlayable would be caught by the first case', () => {
    const broken = (v: { beginVisible: boolean }, qm: boolean) => ({ visible: qm ? false : v.beginVisible, alpha: 1, hintVisible: false });
    const v = lobbyView(hostingWith([2, 2]));
    expect(broken(v, false)).not.toEqual(beginButtonPaint(v, false));
  });
});
