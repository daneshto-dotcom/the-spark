/**
 * SPARK — ⭐⭐ S195 (owner R195-T2/T3/T4/T5, N2, B-29) — **SEATING AND ZONES FOR EVERY TEAM SHAPE.**
 *
 * > *"if it's a one player, he will always be in the northwest corner. Same as player one"*; a TWO-player
 * > team always takes a whole SIDE *"because the image is generated that way"* — owner, R195-T2
 * > *"the solo side keeps his race quadrant. Yes, plus he also gets the other empty quadrant to play on.
 * > It's only fair"* — owner, B-29
 * > *"it doesn't matter where the host is in the lobby … modular enough to be able to move places."* — R195-T3
 *
 * The seat is identity (the host stays seat 0 on the wire); the BOARD moves it — `world.layout` carries the
 * zone → seat map (`QUADRANTS_4P:<owners>`), so every `f(seat, world.layout)` zone reader follows it.
 * Zones: 0 NW · 1 NE · 2 SE · 3 SW (clock order).
 */

import { describe, expect, it } from 'vitest';
import { dispatch, makeWorld, type World } from './world.ts';
import { arrangeTeamZones, layoutForMatch, teamZones } from './teams.ts';
import { canBuildAt, isZoneLayout, seatOfZone, zoneCastleAnchor, zoneOwner, zonesOfSeat, type ZoneLayout } from './zones.ts';
import { wallSegments, wallSeparatesSides } from './walls.ts';
import { applyNetSnapshot, netSnapshot } from './save.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { canReclaimNow } from './structureRepair.ts';
import { PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';

const NW = { x: 300, y: 300 };
const NE = { x: 1600, y: 300 };
const SE = { x: 1600, y: 800 };
const SW = { x: 300, y: 800 };
const U = undefined;

function start(teams: (number | undefined)[], slots?: (number | undefined)[]): World {
  const w = makeWorld(0x5195);
  const n = teams.length;
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: teams.map((t, s) => ({
      seat: s, color: PLAYER_COLORS[s]!,
      ...(t !== undefined ? { team: t } : {}),
      ...(slots?.[s] !== undefined ? { slot: slots[s] } : {}),
    })),
    botSeats: Array.from({ length: n - 1 }, (_, i) => i + 1),
  });
  return w;
}

describe('S195 — arrangeTeamZones: the owner\'s rules per shape (owners by zone NW, NE, SE, SW)', () => {
  it('2v1 — solo NW + the empty SW; the pair east (NE top, SE bottom)', () => {
    expect(arrangeTeamZones([U, 0, 0], 3)).toEqual([0, 1, 2, 0]);
    // the host in the pair: the solo (seat 2) takes NW — the host is NOT pinned to NW any more
    expect(arrangeTeamZones([0, 0, U], 3)).toEqual([2, 0, 1, 2]);
  });
  it('3v1 — solo NW; the trio NE → SE → SW in seat order (the MIDDLE seat gets the sheltered SE, R195-T4)', () => {
    expect(arrangeTeamZones([0, 0, 0, U], 4)).toEqual([3, 0, 1, 2]);
    expect(arrangeTeamZones([U, 1, 1, 1], 4)).toEqual([0, 1, 2, 3]);
  });
  it('1v1v2 — the pair east; the two solos NW then SW (one corner each)', () => {
    expect(arrangeTeamZones([0, 0, U, U], 4)).toEqual([2, 0, 1, 3]);
    expect(arrangeTeamZones([U, U, 1, 1], 4)).toEqual([0, 2, 3, 1]);
  });
  it('2v2 — one pair per side; ⚠ MINE the pair holding the lowest slot goes west', () => {
    expect(arrangeTeamZones([0, 1, 1, 0], 4)).toEqual([0, 1, 2, 3]);
    expect(arrangeTeamZones([0, 0, 1, 1], 4)).toEqual([0, 2, 3, 1]);
  });
  it('⭐ N16 slots steer the arrangement: the host re-seats seat 1 to slot 0 → seat 1\'s pair goes west, seat 1 on top', () => {
    expect(arrangeTeamZones([0, 1, 0, 1], 4, [1, 0, 2, 3])).toEqual([1, 0, 2, 3]);
    // FFA: everyone stands on his slot
    expect(arrangeTeamZones([U, U, U, U], 4, [3, 2, 1, 0])).toEqual([3, 2, 1, 0]);
    // a broken slot list (two on one slot) falls back to the identity, never a hole
    expect(arrangeTeamZones([U, U, U, U], 4, [0, 0, 1, 2])).toEqual([0, 1, 2, 3]);
  });
  it('⛔ NEGATIVE — FFA un-moved and the pitch keep the plain layouts (byte-identical)', () => {
    expect(layoutForMatch(4, [U, U, U, U])).toBe('QUADRANTS_4P');
    expect(layoutForMatch(3, [U, U, U])).toBe('QUADRANTS_4P');
    expect(layoutForMatch(2, [0, 1])).toBe('PITCH_2P');
    expect(layoutForMatch(4, [0, 1, 1, 0])).toBe('QUADRANTS_4P'); // already west/east
    expect(layoutForMatch(3, [U, 0, 0])).toBe('QUADRANTS_4P:0120');
  });
});

describe('S195 — the mapped layout through the zone readers', () => {
  it('isZoneLayout accepts the plain and mapped boards, refuses garbage', () => {
    for (const ok of ['PITCH_2P', 'QUADRANTS_4P', 'QUADRANTS_4P:0120', 'QUADRANTS_4P:3012', 'QUADRANTS_4P:20-1']) expect(isZoneLayout(ok)).toBe(true);
    for (const bad of ['QUADRANTS_4P:012', 'QUADRANTS_4P:0129', 'X', 4, null]) expect(isZoneLayout(bad)).toBe(false);
    // ⛔ S195 audit L9 — every seated player must own ground: nobody, a skipped seat, or a 2-seat map is refused
    for (const bad of ['QUADRANTS_4P:----', 'QUADRANTS_4P:30-2', 'QUADRANTS_4P:0011']) expect(isZoneLayout(bad), bad).toBe(false);
    expect(isZoneLayout('QUADRANTS_4P:0120', 3)).toBe(true);
    expect(isZoneLayout('QUADRANTS_4P:0120', 4), 'a 3-seat map on a 4-seat snapshot').toBe(false);
  });
  it('zoneOwner = the HOME (lowest owned) zone; zonesOfSeat lists both of the 2v1 solo\'s zones', () => {
    const L: ZoneLayout = 'QUADRANTS_4P:2012';
    expect(zoneOwner(2, L)).toBe(0);
    expect(zonesOfSeat(2, L)).toEqual([0, 3]);
    expect(zoneOwner(0, L)).toBe(1);
    expect(seatOfZone(3, L)).toBe(2);
    expect(zoneCastleAnchor(2, L)).toEqual({ x: 130, y: 130 });
  });
});

describe('S195 — REACH through the real START_GAME reducer', () => {
  it('⭐ 2v1, host in the pair: the solo\'s castle is NW, the host\'s NE; the solo builds on NW AND SW', () => {
    const w = start([0, 0, U]);
    expect(w.layout).toBe('QUADRANTS_4P:2012');
    expect(castleAnchor(2, w.layout)).toEqual({ x: 130, y: 130 });
    expect(castleAnchor(0, w.layout)).toEqual({ x: 1790, y: 130 });
    expect(castleAnchor(1, w.layout)).toEqual({ x: 1790, y: 950 });
    expect(canBuildAt(SW, 2, w.layout)).toBe(true); // ⭐ B-29 — the empty corner is his
    expect(canBuildAt(NW, 2, w.layout)).toBe(true);
    expect(canBuildAt(SW, 0, w.layout)).toBe(false);
    expect(canBuildAt(NE, 0, w.layout)).toBe(true);
    expect(canBuildAt(NE, 2, w.layout)).toBe(false);
    w.matchPhase = 'BUILD';
    expect(canReclaimNow(w, SW, asPlayerId(2))).toBe(true);
    // walls: none inside the solo's half (NW|SW) nor between the pair (NE|SE); the two halves are walled
    const up = wallSegments(w.layout).filter((s) => wallSeparatesSides(w, s)).map((s) => `${s.zoneA}|${s.zoneB}`);
    expect(up.sort()).toEqual(['0|1', '3|2']);
    // the fog lights his whole half
    expect(teamZones(w, 2)).toEqual([0, 3]);
  });

  it('⭐ 3v1, host in the trio: the solo (seat 3) stands NW; the host (seat 0) NE; walls only around the solo', () => {
    const w = start([0, 0, 0, U]);
    expect(w.layout).toBe('QUADRANTS_4P:3012');
    expect(castleAnchor(3, w.layout)).toEqual({ x: 130, y: 130 });
    expect(castleAnchor(0, w.layout)).toEqual({ x: 1790, y: 130 });
    expect(castleAnchor(1, w.layout)).toEqual({ x: 1790, y: 950 }); // the middle seat: sheltered SE
    expect(castleAnchor(2, w.layout)).toEqual({ x: 130, y: 950 });
    expect(canBuildAt(SE, 1, w.layout)).toBe(true);
    expect(canBuildAt(SE, 0, w.layout)).toBe(false); // v1: not in a teammate's zone (R192-T3)
    const up = wallSegments(w.layout).filter((s) => wallSeparatesSides(w, s)).map((s) => `${s.zoneA}|${s.zoneB}`);
    expect(up.sort()).toEqual(['0|1', '0|3']);
  });

  it('⛔ NEGATIVE — a 3-seat free-for-all keeps the empty SW nobody\'s; nobody builds there', () => {
    const w = start([U, U, U]);
    expect(w.layout).toBe('QUADRANTS_4P');
    expect(w.teams).toBeUndefined();
    for (const s of [0, 1, 2]) expect(canBuildAt(SW, s, w.layout)).toBe(false);
    expect(canBuildAt(NW, 0, w.layout)).toBe(true);
  });

  it('the mapped board rides the snapshot to a joiner; a malformed one is refused', () => {
    const host = start([0, 0, U]);
    const joiner = makeWorld(1);
    applyNetSnapshot(netSnapshot(host), joiner);
    expect(joiner.layout).toBe('QUADRANTS_4P:2012');
    applyNetSnapshot({ ...netSnapshot(host), layout: 'QUADRANTS_4P:99' as ZoneLayout }, joiner);
    expect(joiner.layout).toBe('QUADRANTS_4P');
    applyNetSnapshot({ ...netSnapshot(host), layout: 'QUADRANTS_4P:----' as ZoneLayout }, joiner);
    expect(joiner.layout, 'nobody owns anything → refused').toBe('QUADRANTS_4P');
    // ⭐ audit L9 — the fallback is the plain board for the SEAT COUNT: a 2-seat snapshot falls back to the pitch
    const two = start([U, U]);
    const j2 = makeWorld(1);
    applyNetSnapshot({ ...netSnapshot(two), layout: 'garbage' as ZoneLayout }, j2);
    expect(j2.layout).toBe('PITCH_2P');
  });
});

describe('S195 audit L6 — the empty corner has no castle, so no keep-out', () => {
  it('⭐ the 2v1 solo may build right on the SW anchor (no keep there); the NW keep still refuses', () => {
    const w = start([0, 0, U]); // solo seat 2 owns NW (home) + SW
    expect(canBuildAt({ x: 130, y: 950 }, 2, w.layout)).toBe(true);
    expect(canBuildAt({ x: 130, y: 130 }, 2, w.layout)).toBe(false);
  });
  it('⛔ NEGATIVE — the plain board keeps every anchor refusing (byte-identical)', () => {
    const w = start([U, U, U, U]);
    expect(canBuildAt({ x: 130, y: 950 }, 3, w.layout)).toBe(false);
  });
});
