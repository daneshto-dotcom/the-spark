/**
 * SPARK — S118 P1 (host-migration D2): HostSync epoch stamp + ClientSync epoch gate & arrival-time.
 *
 * The epoch rides the NETSNAPSHOT envelope so a survivor can fence out a deposed zombie host (D3+). In
 * D2 the epoch is ALWAYS 0, so:
 *   • HostSync omits it (wire byte-identical to pre-D2);
 *   • the ClientSync receive gate `epoch < currentEpoch` is PROVABLY inert (0 < 0 is false → every
 *     snapshot still accepted exactly as before).
 * These tests pin that inertness, the D3-ready behavior once setEpoch raises the floor, and that
 * lastAcceptedAt (which the starvation detector reads) advances only on an ACCEPTED frame.
 */

import { describe, expect, it } from 'vitest';
import { HostSync, ClientSync } from './sync.ts';
import { makeWorld } from '../state/world.ts';
import { netSnapshot, type NetSnapshot } from '../state/save.ts';
import type { NetSnapshotMsg } from './protocol.ts';

const snap: NetSnapshot = netSnapshot(makeWorld(0));
const msg = (seq: number, epoch?: number): NetSnapshotMsg => ({
  kind: 'NETSNAPSHOT',
  snapshotSeq: seq,
  snapshot: snap,
  ...(epoch !== undefined ? { epoch } : {}),
});

describe('S118 P1 — D2: HostSync stamps epoch (omitted at 0 → wire byte-identical)', () => {
  it('epoch 0 (default / original term) is OMITTED from the envelope', () => {
    const h = new HostSync();
    const w = makeWorld(0);
    expect('epoch' in h.buildSnapshotMessage(w)).toBe(false);
    expect('epoch' in h.buildSnapshotMessage(w, 0)).toBe(false);
  });

  it('a positive epoch (D3+ migrated term) is stamped', () => {
    const h = new HostSync();
    const m = h.buildSnapshotMessage(makeWorld(0), 2);
    expect(m.epoch).toBe(2);
  });
});

describe('S118 P1 — D2: ClientSync epoch gate is INERT at epoch 0', () => {
  it('accepts absent-epoch and epoch-0 snapshots (0 < 0 is false)', () => {
    const c = new ClientSync();
    expect(c.receive(msg(1), 100)).toBe(true); // absent epoch
    expect(c.receive(msg(2, 0), 200)).toBe(true); // explicit epoch 0
  });
});

describe('S118 P1 — D2: ClientSync epoch gate fences an older term once raised (D3-ready)', () => {
  it('drops snapshots below the current epoch, accepts at/above it', () => {
    const c = new ClientSync();
    c.setEpoch(2);
    expect(c.receive(msg(1), 100)).toBe(false); // absent = 0 < 2 → dropped
    expect(c.receive(msg(2, 1), 200)).toBe(false); // epoch 1 < 2 → dropped (a zombie host)
    expect(c.receive(msg(3, 2), 300)).toBe(true); // epoch 2 → accepted
    expect(c.receive(msg(4, 3), 400)).toBe(true); // a newer term is fine too
  });

  it('a dropped (stale-epoch) snapshot does NOT advance the seq watermark', () => {
    const c = new ClientSync();
    c.setEpoch(5);
    expect(c.receive(msg(9, 1), 100)).toBe(false); // stale epoch — must not consume seq 9
    c.setEpoch(0); // (contrived) drop the floor; seq 9 must still be acceptable
    expect(c.receive(msg(9, 5), 200)).toBe(true);
  });
});

describe('S118 P1 — D2: ClientSync.lastAcceptedAt (starvation detector input)', () => {
  it('is 0 before any accept, then tracks the last ACCEPTED frame time', () => {
    const c = new ClientSync();
    expect(c.lastAcceptedAt()).toBe(0);
    c.receive(msg(1), 111);
    expect(c.lastAcceptedAt()).toBe(111);
    c.receive(msg(2), 222);
    expect(c.lastAcceptedAt()).toBe(222);
  });

  it('does NOT advance on a rejected (stale-seq) frame', () => {
    const c = new ClientSync();
    c.receive(msg(5), 500);
    expect(c.receive(msg(3), 999)).toBe(false); // stale seq
    expect(c.lastAcceptedAt()).toBe(500); // unchanged
  });

  it('reset() clears the arrival time and the epoch floor', () => {
    const c = new ClientSync();
    c.setEpoch(3);
    c.receive(msg(1, 3), 700);
    c.reset();
    expect(c.lastAcceptedAt()).toBe(0);
    // Epoch floor back to 0 → an absent-epoch snapshot is accepted again.
    expect(c.receive(msg(1), 800)).toBe(true);
  });
});
