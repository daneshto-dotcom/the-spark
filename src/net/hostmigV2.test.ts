/**
 * SPARK — S125 P1 (host-migration v2): the deposed ORIGINAL host auto-rejoins as a client
 * (LOCKED §13.21 v2) instead of the v1 terminal overlay.
 *
 * The rejoin ORCHESTRATION lives in a main() closure (demoteToClient reestablishTransport:
 * null the ClientSync → disconnect → connectAsClient → setEpoch), validated over real WebRTC in
 * e2e/hostmigration.spec.ts. What is UNIT-testable — and is the correctness core the rejoin
 * rests on — is the ClientSync lifecycle that path produces:
 *
 *   1. connectAsClient mints a FRESH ClientSync (empty buffer, epoch 0, seq 0) because the
 *      original host never had one; setEpoch(N) then fences the term.
 *   2. That fresh, fenced sync ADMITS the successor's epoch-N snapshot at its MIGRATION_SEQ_JUMP
 *      seq base (so the ex-host follows the new host with no reset handshake), and
 *   3. DROPS the zombie's OWN residual epoch-0 frames at any seq (the split-brain fence Grok R1
 *      flagged — a late epoch-0 snapshot the old transport delivers can never re-take the world),
 *   4. advancing lastAcceptedAt (the starvation/overlay-clear signal) only on the successor frame.
 *
 * This pins the exact invariant with the production seq magnitudes; the generic epoch gate is
 * separately pinned in sync.epoch.test.ts.
 */

import { describe, expect, it } from 'vitest';
import { ClientSync } from './sync.ts';
import { MIGRATION_SEQ_JUMP } from './migrationClaim.ts';
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

describe('S125 P1 — host-migration v2: rejoined-client ClientSync lifecycle', () => {
  it('a fresh rejoin sync (epoch 0/seq 0) admits the successor epoch-1 snapshot at the +JUMP seq base', () => {
    // Exactly what connectAsClient hands the deposed original host, then setEpoch(1) fences.
    const c = new ClientSync();
    c.setEpoch(1);
    const successorSeqBase = MIGRATION_SEQ_JUMP + 1; // HostSync(initialSeq=+JUMP) → first msg is +JUMP+1
    expect(c.receive(msg(successorSeqBase, 1), 100)).toBe(true);
    expect(c.lastAcceptedAt()).toBe(100);
  });

  it('fences the zombie’s OWN residual epoch-0 frames at any seq (split-brain guard)', () => {
    const c = new ClientSync();
    c.setEpoch(1);
    // A late epoch-0 snapshot the old (host) transport delivers post-disconnect — even at a huge
    // seq — must NEVER be admitted, and must not advance the seq watermark.
    expect(c.receive(msg(MIGRATION_SEQ_JUMP + 5, 0), 100)).toBe(false); // explicit epoch 0
    expect(c.receive(msg(MIGRATION_SEQ_JUMP + 5), 100)).toBe(false); // absent epoch = 0
    expect(c.lastAcceptedAt()).toBe(0); // no accept happened
    // …and the real successor frame at the same magnitude still lands afterward.
    expect(c.receive(msg(MIGRATION_SEQ_JUMP + 5, 1), 200)).toBe(true);
    expect(c.lastAcceptedAt()).toBe(200);
  });

  it('follows a further migration (successor also dies → epoch 2) as a plain client', () => {
    // After rejoin the ex-host is an ordinary client; a cascading migration just raises the floor.
    const c = new ClientSync();
    c.setEpoch(1);
    expect(c.receive(msg(MIGRATION_SEQ_JUMP + 1, 1), 100)).toBe(true); // follows successor (epoch 1)
    // Successor dies; next-lowest warranted seat claims epoch 2 at its own +JUMP base.
    c.setEpoch(2);
    expect(c.receive(msg(MIGRATION_SEQ_JUMP + 2, 1), 200)).toBe(false); // old term dropped
    expect(c.receive(msg(2 * MIGRATION_SEQ_JUMP, 2), 300)).toBe(true); // epoch-2 host followed
    expect(c.lastAcceptedAt()).toBe(300);
  });
});
