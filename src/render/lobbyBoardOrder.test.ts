/**
 * SPARK — ⭐⭐ S195 (R194-19, RULED *"the lobby must match the board"*; R195-T2) — **THE RACK IS THE BOARD.**
 *
 * The seat rack is clock order like `zones.ts` (0 NW · 1 NE · 2 SE · 3 SW), and every occupied tile stands on
 * the quadrant `arrangeTeamZones` will give its seat at Begin — the same function `applyStartGame` stamps.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getSeatRect } from './lobbyGeometry.ts';
import { initialLobbyState, lobbyView, seatBoardSlots, type LobbyState } from './lobbyStateMachine.ts';
import { zoneRect } from './zoneBackgroundRenderer.ts';
import { layoutForMatch } from '../state/teams.ts';
import { zoneOwner } from '../state/zones.ts';

const U = undefined;
const occ = (team?: number, slotPref?: number) => ({ occupied: true, team, slotPref });
const empty = { occupied: false };

describe('S195 — the rack geometry is the board\'s clock order', () => {
  it('each rack slot sits in the same corner as the board quadrant of that index', () => {
    const rackCx = (getSeatRect(0).x + getSeatRect(1).x + getSeatRect(0).w) / 2;
    const rackCy = (getSeatRect(0).y + getSeatRect(3).y + getSeatRect(0).h) / 2;
    for (let z = 0; z < 4; z++) {
      const r = getSeatRect(z);
      const b = zoneRect(z, 'QUADRANTS_4P');
      expect(r.x + r.w / 2 < rackCx, `slot ${z} west?`).toBe(b.x + b.w / 2 < 960);
      expect(r.y + r.h / 2 < rackCy, `slot ${z} north?`).toBe(b.y + b.h / 2 < 540);
    }
  });
});

describe('S195 — seatBoardSlots previews the board the match will be played on', () => {
  it('⛔ NEGATIVE — FFA nobody moved: the identity (seat i on slot i)', () => {
    expect(seatBoardSlots([occ(), occ(), occ(), occ()])).toEqual([0, 1, 2, 3]);
    expect(seatBoardSlots([occ(), occ(), empty, empty])).toEqual([0, 1, 2, 3]);
  });
  it('⭐ 3v1 with the host in the trio: the solo (seat 3) is drawn top-left, the host top-right', () => {
    expect(seatBoardSlots([occ(0), occ(0), occ(0), occ()])).toEqual([1, 2, 3, 0]);
  });
  it('⭐ 2v1, host in the pair: the solo top-left, the pair down the east side; the empty tile takes SW', () => {
    expect(seatBoardSlots([occ(0), occ(0), occ(), empty])).toEqual([1, 2, 0, 3]);
  });
  it('⭐ agrees with the board applyStartGame stamps (dense roster, every shape)', () => {
    for (const teams of [[0, 1, 0, 1], [0, 0, 1, 1], [U, 1, 1, 1], [0, 0, U, U], [U, U, U, U]] as (number | undefined)[][]) {
      const slots = seatBoardSlots(teams.map((t) => occ(t)));
      const layout = layoutForMatch(4, teams);
      teams.forEach((_, s) => expect(slots[s], `${teams} seat ${s}`).toBe(zoneOwner(s, layout)));
    }
  });
  it('REACH — lobbyView stamps every seat view with its slot from the presence roster', () => {
    const state: LobbyState = {
      ...initialLobbyState(),
      mode: 'hosting',
      presenceRoster: [
        { seat: 0, color: 1, isYou: true, team: 0 },
        { seat: 1, color: 2, isYou: false, team: 0 },
        { seat: 2, color: 3, isYou: false, team: 0 },
        { seat: 3, color: 4, isYou: false },
      ],
    };
    expect(lobbyView(state).seats.map((s) => s.slot)).toEqual([1, 2, 3, 0]);
  });
  it('REACH (source) — seatRack positions each tile from its view\'s slot', () => {
    const src = readFileSync(new URL('./seatRack.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/const at = getSeatRect\(seat\?\.slot \?\? i\);\s*c\.cell\.position\.set\(at\.x \+ SEAT_W \/ 2, at\.y \+ SEAT_H \/ 2\);/);
  });
});
