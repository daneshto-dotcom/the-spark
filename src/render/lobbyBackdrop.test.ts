/**
 * SPARK — S173 B1: the lobby backdrop's LAYOUT ARITHMETIC.
 *
 * > Owner, live 2-player playtest: *"the multiplayer lobby only shows player one background ...
 * > However many people are in the lobby has to split the background into the zones or quadrants
 * > just like the game has ... And then if there's more joining, then it splits into four."*
 *
 * The lobby is Pixi and cannot be driven in the node env, so this follows the house
 * #test-via-pure-helper-export pattern (`lobbyGeometry`, `seatRack`, `codexOverlay`): the
 * seat-count → rectangle arithmetic is exported pure and asserted here, and the Pixi projection
 * over it is boot-smoke + e2e territory.
 *
 * ⭐ THE LOAD-BEARING CASE IS THE LAST DESCRIBE BLOCK — that the region a seat gets in the LOBBY is
 * the zone it will own on the BOARD. Two independent notions of "which quadrant is seat N" would
 * drift, and the symptom would be a player warming up on one side of the screen and playing on the
 * other.
 */

import { describe, expect, it } from 'vitest';

import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_PLAYERS } from '../constants.ts';
import { layoutForSeatCount, zoneOwner, type ZoneLayout } from '../state/zones.ts';
import { defaultRaceForSeat, type RaceId } from '../state/races.ts';
import { zoneRect } from './zoneBackgroundRenderer.ts';
import type { SeatView } from './lobbyStateMachine.ts';
import {
  coverFit,
  lobbyBackdropRegions,
  lobbyZoneArtUrl,
  orientationFor,
  type LobbyRegion,
} from './lobbyBackdrop.ts';

/** Build the MAX_PLAYERS-long projection `lobbyView` hands the rack, with the given seats filled. */
function seatsWith(occupied: readonly number[], races: Readonly<Record<number, RaceId>> = {}): SeatView[] {
  const out: SeatView[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const isOccupied = occupied.includes(i);
    out.push({
      index: i,
      color: 0x000000,
      occupied: isOccupied,
      isHost: isOccupied && i === 0,
      isYou: isOccupied && i === 0,
      // lobbyView ALWAYS resolves an occupied seat to a race (roster `?? defaultRaceForSeat`, and
      // the count-based fallback does the same), so the fixture does too.
      raceId: isOccupied ? (races[i] ?? defaultRaceForSeat(i)) : undefined,
    });
  }
  return out;
}

function rectsOverlap(a: LobbyRegion, b: LobbyRegion): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function totalArea(regions: readonly LobbyRegion[]): number {
  return regions.reduce((sum, r) => sum + r.w * r.h, 0);
}

/** Every region inside the canvas, and no two of them overlapping. */
function expectDisjointAndOnCanvas(regions: readonly LobbyRegion[]): void {
  for (const r of regions) {
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(CANVAS_WIDTH);
    expect(r.y + r.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
  }
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      expect(
        rectsOverlap(regions[i]!, regions[j]!),
        `regions for seats ${regions[i]!.seat} and ${regions[j]!.seat} must not overlap`,
      ).toBe(false);
    }
  }
}

const CANVAS_AREA = CANVAS_WIDTH * CANVAS_HEIGHT;

describe('S173 B1 — the lobby backdrop splits by OCCUPIED SEAT COUNT', () => {
  it('no occupied seats (the SELECT screen) paints nothing at all', () => {
    // With no roster there is no seat to partition by, and inventing one is the bug being fixed.
    expect(lobbyBackdropRegions(seatsWith([]))).toEqual([]);
  });

  it('one player gets the WHOLE canvas — the owner reported the half-black screen', () => {
    const regions = lobbyBackdropRegions(seatsWith([0]));
    expect(regions).toHaveLength(1);
    expect(regions[0]).toMatchObject({ seat: 0, boardSeat: 0, x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT });
    // 1920x1080 is 16:9, so it wants the LANDSCAPE art, not the pitch's portrait half.
    expect(regions[0]!.orientation).toBe('landscape');
  });

  it('two players get two halves that tile the canvas exactly', () => {
    const regions = lobbyBackdropRegions(seatsWith([0, 1]));
    expect(regions).toHaveLength(2);
    expectDisjointAndOnCanvas(regions);
    expect(totalArea(regions)).toBe(CANVAS_AREA);
    // The pitch splits on ONE VERTICAL line: left half, then right half.
    expect(regions[0]).toMatchObject({ x: 0, y: 0, w: CANVAS_WIDTH / 2, h: CANVAS_HEIGHT });
    expect(regions[1]).toMatchObject({ x: CANVAS_WIDTH / 2, y: 0, w: CANVAS_WIDTH / 2, h: CANVAS_HEIGHT });
    for (const r of regions) expect(r.orientation).toBe('portrait');
  });

  it('four players get four quadrants that tile the canvas exactly', () => {
    const regions = lobbyBackdropRegions(seatsWith([0, 1, 2, 3]));
    expect(regions).toHaveLength(4);
    expectDisjointAndOnCanvas(regions);
    expect(totalArea(regions)).toBe(CANVAS_AREA);
    for (const r of regions) expect(r.orientation).toBe('landscape');
  });

  it('THREE players: three quadrants, and the empty one is the BOTTOM-LEFT', () => {
    /*
     * R2 — there is no 3-player map. Three seats play the quadrant board with one quadrant empty,
     * and the lobby previews exactly that: dense seats 0/1/2 take the clock-order zones TL/TR/BR,
     * so zone 3 (bottom-left) has no region and stays the backing's cosmos black.
     */
    const regions = lobbyBackdropRegions(seatsWith([0, 1, 2]));
    expect(regions).toHaveLength(3);
    expectDisjointAndOnCanvas(regions);
    expect(totalArea(regions)).toBe((CANVAS_AREA * 3) / 4);

    const empty = zoneRect(3, 'QUADRANTS_4P');
    expect(empty).toEqual({ x: 0, y: CANVAS_HEIGHT / 2, w: CANVAS_WIDTH / 2, h: CANVAS_HEIGHT / 2 });
    for (const r of regions) {
      expect(
        rectsOverlap(r, { ...empty, seat: -1, boardSeat: -1, raceId: null, orientation: 'landscape' }),
        'no seat may be given the empty quadrant',
      ).toBe(false);
    }
    // The three regions plus the empty quadrant still tile the canvas — no gap anywhere else.
    expect(totalArea(regions) + empty.w * empty.h).toBe(CANVAS_AREA);
  });

  it('each occupied seat carries its OWN race into its own region', () => {
    const regions = lobbyBackdropRegions(
      seatsWith([0, 1], { 0: 'orcs', 1: 'zombies' }),
    );
    expect(regions.map((r) => r.raceId)).toEqual(['orcs', 'zombies']);
  });

  it('a seat that has not opened the picker shows the race it will actually PLAY', () => {
    // Not a placeholder and not blank: `lobbyView` resolves an absent wire raceId to the seat's
    // default, which is the race that seat gets if nobody ever touches the menu.
    const regions = lobbyBackdropRegions(seatsWith([0, 1]));
    expect(regions.map((r) => r.raceId)).toEqual([defaultRaceForSeat(0), defaultRaceForSeat(1)]);
  });

  it('an occupied seat with NO race resolves to cosmos black, never to a guessed race', () => {
    const seats = seatsWith([0, 1]);
    const seat1 = { ...seats[1]!, raceId: undefined };
    const regions = lobbyBackdropRegions([seats[0]!, seat1, seats[2]!, seats[3]!]);
    // It keeps its RECTANGLE (the split is still a two-way split) and loses only its art.
    expect(regions).toHaveLength(2);
    expect(regions[1]!.raceId).toBeNull();
    expect(regions[1]!.w).toBe(CANVAS_WIDTH / 2);
  });

  it('does not mutate the caller\'s seat array', () => {
    const seats = seatsWith([3, 1, 0]);
    const before = seats.map((s) => s.index);
    lobbyBackdropRegions(seats);
    expect(seats.map((s) => s.index)).toEqual(before);
  });
});

describe('S173 B1 — the lobby region IS the board zone (the anti-drift contract)', () => {
  it.each([2, 3, 4])('%i seats: region i === zoneRect(zoneOwner(i, layoutForSeatCount(n)))', (n) => {
    const regions = lobbyBackdropRegions(seatsWith([...Array(n).keys()]));
    const layout = layoutForSeatCount(n);
    expect(regions).toHaveLength(n);
    for (let i = 0; i < n; i++) {
      const zone = zoneOwner(i, layout);
      expect(zone).not.toBeNull();
      const r = zoneRect(zone as number, layout);
      expect({ x: regions[i]!.x, y: regions[i]!.y, w: regions[i]!.w, h: regions[i]!.h }).toEqual(r);
      expect(regions[i]!.boardSeat).toBe(i);
    }
  });

  it('a HOLE in the rack maps to the DENSE seat, which is where that player will play', () => {
    /*
     * ⛔ THIS IS THE CASE THAT WOULD HAVE DRIFTED. Lobby seats are stable and non-compacting — a
     * departed peer leaves a hole (`lobbyRoster.ts`) — while `buildMatchRoster` COMPACTS to
     * contiguous seats at Begin. Rack seat 2 therefore begins the match as board seat 1, and its
     * lobby side must be board seat 1's side or the player warms up on the wrong half.
     */
    const regions = lobbyBackdropRegions(seatsWith([0, 2]));
    expect(regions.map((r) => r.seat)).toEqual([0, 2]);
    expect(regions.map((r) => r.boardSeat)).toEqual([0, 1]);
    expect(regions[1]).toMatchObject(zoneRect(1, 'PITCH_2P'));
  });

  it('reads seats in ascending rack order however the projection is ordered', () => {
    const seats = seatsWith([0, 1, 2, 3]);
    const shuffled = [seats[2]!, seats[0]!, seats[3]!, seats[1]!];
    expect(lobbyBackdropRegions(shuffled).map((r) => r.seat)).toEqual([0, 1, 2, 3]);
  });
});

describe('S173 B1 — art orientation agrees with the board\'s own zoneArtUrl', () => {
  /*
   * `zoneBackgroundRenderer`'s private `zoneArtUrl` keys on the LAYOUT (`PITCH_2P` → `-2p`,
   * `QUADRANTS_4P` → `-4p`). This file keys on the RECT, because the one-seat lobby paints a
   * rectangle no layout produces. These cases pin that the two rules agree everywhere a board zone
   * exists — the only place they could disagree silently.
   */
  const cases: ReadonlyArray<[ZoneLayout, number, 'portrait' | 'landscape']> = [
    ['PITCH_2P', 0, 'portrait'],
    ['PITCH_2P', 1, 'portrait'],
    ['QUADRANTS_4P', 0, 'landscape'],
    ['QUADRANTS_4P', 1, 'landscape'],
    ['QUADRANTS_4P', 2, 'landscape'],
    ['QUADRANTS_4P', 3, 'landscape'],
  ];
  it.each(cases)('%s zone %i is %s', (layout, zone, expected) => {
    const r = zoneRect(zone, layout);
    expect(orientationFor(r.w, r.h)).toBe(expected);
  });

  it('builds the twelve shipped paths and nothing else', () => {
    expect(lobbyZoneArtUrl('vampires', 'portrait')).toBe('/art/race-zones/zone-vampires-2p.png');
    expect(lobbyZoneArtUrl('vampires', 'landscape')).toBe('/art/race-zones/zone-vampires-4p.png');
    expect(lobbyZoneArtUrl('demons', 'landscape')).toBe('/art/race-zones/zone-demons-4p.png');
  });
});

describe('S173 B1 — coverFit', () => {
  it('the SHIPPED art overflows a lobby region by ZERO on every split', () => {
    // Measured: zone-*-2p.png is 480x540 (8:9) and zone-*-4p.png is 480x270 (16:9). Both match
    // their zone exactly, and the landscape one matches the whole canvas too — so nothing spills
    // across a seam and the lobby needs no per-frame mask. Art regenerated at another aspect would
    // bleed here exactly as it bleeds on the board, which is the same behaviour on purpose.
    const half = zoneRect(0, 'PITCH_2P');
    expect(coverFit(480, 540, half)).toEqual(half);
    const quad = zoneRect(2, 'QUADRANTS_4P');
    expect(coverFit(480, 270, quad)).toEqual(quad);
    const whole = { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
    expect(coverFit(480, 270, whole)).toEqual(whole);
  });

  it('covers rather than letterboxes, and centres the overflow', () => {
    // A square source into a 2:1 region: scale by the WIDTH ratio, so the height overflows and is
    // centred — never a bar of dead ground.
    const fit = coverFit(100, 100, { x: 10, y: 20, w: 200, h: 100 });
    expect(fit.w).toBe(200);
    expect(fit.h).toBe(200);
    expect(fit.x).toBe(10);
    expect(fit.y).toBe(20 + (100 - 200) / 2);
  });
});
