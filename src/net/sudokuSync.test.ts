/**
 * SPARK — S95 P0: the NONET trial must survive the host→client snapshot round-trip.
 *
 * The S93/S94 handoff flagged 1v1 NONET as "unit-tested but NOT live 2-peer tested", and a
 * live playtest then found the trial freezing the duel WITHOUT ever showing the Sudoku overlay
 * on the receiving peer. The overlay reads `world.sudoku.puzzle.givens` directly; if the client
 * ends up with a `world.sudoku` whose `puzzle` is missing/garbage, the overlay throws before it
 * can set `container.visible = true` (or never renders), which is exactly the "music swapped,
 * realm froze, but no board" symptom. The wire form omits `puzzle` by design — every peer
 * regenerates it from `seed` — so this test pins that reconstruction across the REAL
 * HostSync.buildSnapshotMessage → ClientSync.receive → interpolateInto path.
 */

import { describe, expect, it } from 'vitest';
import { HostSync, ClientSync } from './sync.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { startSudoku, resolveSudoku } from '../state/sudokuEvent.ts';
import { generateSudoku } from '../state/sudoku.ts';
import { asPlayerId } from '../types.ts';

function freshClient1v1() {
  const w = makeWorld(0);
  w.isHost = false;
  w.gameMode = '1v1';
  w.gameState = 'LOBBY';
  return w;
}

describe('S95 P0 — NONET trial survives the host→client snapshot round-trip', () => {
  it('client reconstructs a renderable puzzle (givens length 36, byte-identical to the seed)', () => {
    const hostWorld = makeWorld(0);
    dispatch(hostWorld, { type: 'START_GAME', mode: '1v1', isHost: true });
    startSudoku(hostWorld, asPlayerId(0), 12345);
    expect(hostWorld.sudoku).not.toBeNull();

    const clientWorld = freshClient1v1();
    const host = new HostSync();
    const client = new ClientSync();

    const msg = host.buildSnapshotMessage(hostWorld);
    expect(client.receive(msg, 1000)).toBe(true);
    client.interpolateInto(clientWorld, 1000, 100);

    // The overlay's first render does `ev.puzzle.givens.slice()` — these MUST be present.
    expect(clientWorld.sudoku).not.toBeNull();
    expect(clientWorld.sudoku!.puzzle).toBeDefined();
    expect(clientWorld.sudoku!.puzzle.givens.length).toBe(36);
    expect(clientWorld.sudoku!.puzzle.solution.length).toBe(36);
    expect(clientWorld.sudoku!.puzzle.givens).toEqual(generateSudoku(12345).givens);
    expect(clientWorld.sudoku!.seed).toBe(12345);
    expect(clientWorld.sudoku!.resolvedTick).toBeNull();
  });

  it('client clears the trial when the host snapshot omits it (trial ended)', () => {
    const hostWorld = makeWorld(0);
    dispatch(hostWorld, { type: 'START_GAME', mode: '1v1', isHost: true });
    startSudoku(hostWorld, asPlayerId(0), 777);

    const clientWorld = freshClient1v1();
    const host = new HostSync();
    const client = new ClientSync();

    // First snapshot: trial active → client mirrors it.
    expect(client.receive(host.buildSnapshotMessage(hostWorld), 1000)).toBe(true);
    client.interpolateInto(clientWorld, 1000, 100);
    expect(clientWorld.sudoku).not.toBeNull();

    // Host ends the trial (resolve + resume) → next snapshot omits it → client clears.
    resolveSudoku(hostWorld, asPlayerId(0));
    hostWorld.sudoku = null;
    expect(client.receive(host.buildSnapshotMessage(hostWorld), 2000)).toBe(true);
    client.interpolateInto(clientWorld, 2000, 100);
    expect(clientWorld.sudoku).toBeNull();
  });

  it('client mirrors a resolved (won) trial so the result banner can render', () => {
    const hostWorld = makeWorld(0);
    dispatch(hostWorld, { type: 'START_GAME', mode: '1v1', isHost: true });
    startSudoku(hostWorld, asPlayerId(0), 99);
    resolveSudoku(hostWorld, asPlayerId(1)); // P2 solved first

    const clientWorld = freshClient1v1();
    const host = new HostSync();
    const client = new ClientSync();
    expect(client.receive(host.buildSnapshotMessage(hostWorld), 1000)).toBe(true);
    client.interpolateInto(clientWorld, 1000, 100);

    expect(clientWorld.sudoku).not.toBeNull();
    expect(clientWorld.sudoku!.solvedBy).toBe(asPlayerId(1));
    expect(clientWorld.sudoku!.resolvedTick).not.toBeNull();
  });
});
