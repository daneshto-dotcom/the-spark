/**
 * SPARK — S154 AMENDMENT B (owner): the ground marker is the OWNER'S colour, on every creature.
 *
 * Owner: *"i think it makes sense to have shadows in the color of the player that created them (i am
 * red player so its red for me blue players would have blue shadows for their spawn). that way when
 * there are a lot of soldiers on the map you can tell who they belong too. but then it has to be
 * consistent across ALL spawned creatures."*
 *
 * The consistency half is structural — one exported `drawGroundMarker`, called from all three
 * creature renderers, so there is nothing else to call. What needs asserting is the COLOUR rule,
 * because that is the part that decides whether the owner can actually tell two armies apart.
 */

import { describe, expect, it } from 'vitest';

import { GROUND_RX, GROUND_RY, ownerTint } from './creatureLift.ts';
import { PLAYER_COLORS } from '../constants.ts';
import { asPlayerId } from '../types.ts';

const seat = (n: number) => asPlayerId(n);

describe('S154 AMENDMENT B — the marker names its owner', () => {
  it('two different seats get two different colours', () => {
    const players = new Map([
      [seat(0), { color: PLAYER_COLORS[0]! }],
      [seat(1), { color: PLAYER_COLORS[1]! }],
    ]);
    const a = ownerTint(players, seat(0), PLAYER_COLORS);
    const b = ownerTint(players, seat(1), PLAYER_COLORS);
    expect(a).not.toBe(b);
    // …and they are the seats' real colours, not an arbitrary pair.
    expect(a).toBe(PLAYER_COLORS[0]);
    expect(b).toBe(PLAYER_COLORS[1]);
  });

  it('⭐ reads the LIVE player colour, so it survives a rainbow colour-shuffle', () => {
    // The shuffle remaps `player.color` mid-match. A marker painted from the static palette would
    // then label every creature with the colour its seat USED to be — worse than no cue at all,
    // because it would be confidently wrong. Same resolution order `isEnemyBond` uses.
    const shuffled = 0x123456;
    const players = new Map([[seat(0), { color: shuffled }]]);
    expect(ownerTint(players, seat(0), PLAYER_COLORS)).toBe(shuffled);
    expect(ownerTint(players, seat(0), PLAYER_COLORS)).not.toBe(PLAYER_COLORS[0]);
  });

  it('falls back to the palette when the owner is absent, and never returns undefined', () => {
    const empty = new Map<ReturnType<typeof seat>, { color: number }>();
    for (let s = 0; s < 4; s++) {
      const c = ownerTint(empty, seat(s), PLAYER_COLORS);
      expect(typeof c).toBe('number');
      expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('the marker is wider than tall, so it reads as lying flat on the board', () => {
    expect(GROUND_RX).toBeGreaterThan(GROUND_RY);
  });
});
