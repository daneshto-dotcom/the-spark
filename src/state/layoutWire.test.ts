/**
 * SPARK — S148: THE BOARD MUST SURVIVE THE WIRE. A pre-multiplayer-playtest guard.
 *
 * ⚠ WHY THIS FILE EXISTS. `world.layout` decides where every castle stands, and `castleAnchor` is
 * hashed host-authoritative state that gatherer spawn positions derive from. If a JOINING CLIENT
 * failed to receive it, `applyNetSnapshot` would fall back to `PITCH_2P` while a 4-player host ran
 * `QUADRANTS_4P` — the client would draw and hit-test every keep in the goalmouths while the host
 * had them in the corners, and the two would diverge on the first gatherer purchase.
 *
 * That failure is invisible to the existing gates, which is the point of adding these:
 *   · `workerSim.differential` compares netSnapshot JSON between two rigs that BOTH adopt the world
 *     from the disk `snapshot()`. A field missing from `netSnapshot` is missing from both sides
 *     equally, so they agree and the gate stays green.
 *   · `save.replay` round-trips the DISK snapshot, which is a different function.
 *
 * So the wire path had no coverage at all, and "I read the code and it looked fine" is not the
 * standard to hand a multiplayer playtest. These assert it.
 */
import { describe, expect, it } from 'vitest';

import { applyNetSnapshot, netSnapshot } from './save.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { zoneCount, type ZoneLayout } from './zones.ts';

/** A PLAYING world seated for `seats` players. */
function seated(seats: number): World {
  const world = makeWorld(0x148ab1e);
  world.gameState = 'TITLE';
  const roster = Array.from({ length: seats }, (_, seat) => ({ seat, color: 0x111111 * (seat + 1) }));
  dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
  return world;
}

describe('S148 — world.layout survives the NETWORK snapshot', () => {
  it.each([
    [2, 'PITCH_2P'],
    [4, 'QUADRANTS_4P'],
  ] as Array<[number, ZoneLayout]>)(
    '%i seats — the host stamps %s and the wire carries it',
    (seats, expected) => {
      const host = seated(seats);
      expect(host.layout).toBe(expected);
      // The field is actually PRESENT on the wire object — not merely defaulted on the far side.
      const snap = netSnapshot(host);
      expect(snap.layout, 'layout must be emitted by netSnapshot, not only by the disk snapshot').toBe(expected);
    },
  );

  it('⭐ a JOINER adopts the host board — the 4-player desync this guards against', () => {
    const host = seated(4);
    expect(host.layout).toBe('QUADRANTS_4P');

    // A fresh client starts on the makeWorld default, which is deliberately the OTHER board — so a
    // silent failure to transmit shows up as a wrong value here rather than a coincidental match.
    const client = makeWorld(0xc0ffee);
    expect(client.layout).toBe('PITCH_2P');

    applyNetSnapshot(netSnapshot(host), client);
    expect(client.layout).toBe('QUADRANTS_4P');
  });

  it('⭐ and therefore both peers agree on EVERY castle position', () => {
    // The reason the field matters at all: anchors are hashed state that gatherer spawns derive
    // from. Positions, not just the enum, are what must match.
    const host = seated(4);
    const client = makeWorld(0xc0ffee);
    applyNetSnapshot(netSnapshot(host), client);

    for (let seat = 0; seat < zoneCount(host.layout); seat++) {
      expect(castleAnchor(seat, client.layout), `seat ${seat}`).toEqual(castleAnchor(seat, host.layout));
    }
  });

  it('a joiner on the 2-player pitch is not silently upgraded to quadrants either', () => {
    // The inverse direction, so the test cannot pass merely because QUADRANTS_4P is "sticky".
    const host = seated(2);
    const client = makeWorld(0xc0ffee);
    client.layout = 'QUADRANTS_4P'; // pretend it came from a previous match
    applyNetSnapshot(netSnapshot(host), client);
    expect(client.layout).toBe('PITCH_2P');
  });
});
