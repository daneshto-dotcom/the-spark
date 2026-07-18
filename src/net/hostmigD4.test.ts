/**
 * SPARK — S124 P1 (host-migration D4): production-ON unit matrix.
 *
 * Locks the four pure mechanisms D4 added on top of the D3 claim machinery:
 *   • the CLAIM LADDER (computeClaimDelayMs) — rank-based fire delays that retire the D3
 *     exact-successor deadlock (a wedged-but-transport-alive rank-0 no longer stalls the match);
 *   • the ACCEPTANCE DECISION (claimAcceptDecision) — monotonic-forward epochs + lowest-seat-wins
 *     downward re-latch, host-loss-gated on epoch advances (S122 Council L3, generalized);
 *   • FAIL-CLOSED stamping (stampOrReject) — the S62 "unknown peer → apply as-is" leniency is
 *     closed on both host paths (original + migrated successor);
 *   • the ClientSync setEpoch WATERMARK RESET — the demoted-adopter/new-term admission hardening
 *     (S124 Council R2 GEMINI QD, refuted-then-hardened), with the zombie fence intact.
 * Plus one integration lock: a takeover hostSeats built from the FULL roster (minus self) flows
 * dead peers — including the dead host's seat 0 — into the S82 drop-bench sweep (the D3
 * roster ∩ alive construction left the dead host's avatar ghosting forever).
 */

import { describe, expect, it } from 'vitest';
import {
  CLAIM_LADDER_MS,
  claimAcceptDecision,
  computeClaimDelayMs,
} from './succession.ts';
import { stampOrReject } from './intentStamp.ts';
import { ClientSync } from './sync.ts';
import { netSnapshot, type NetSnapshot } from '../state/save.ts';
import type { NetSnapshotMsg } from './protocol.ts';
import type { SuccessionWarrant } from './successionWarrant.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { SpatialGrid } from '../physics/spatial.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld, type GameAction } from '../state/world.ts';
import { asPlayerId, type PlayerId } from '../types.ts';
import {
  PEER_DROP_BENCH_TICKS,
  PEER_DROP_GRACE_TICKS,
  PLAYER_COLORS,
} from '../constants.ts';
import type { Controls } from '../input/controls.ts';

const warrant = (...seats: number[]): SuccessionWarrant => ({
  epoch: 0,
  seats: seats.map((seat) => ({ seat, spkiB64: `key-${seat}` })),
  sigB64: 'unused-in-these-tests',
});

describe('S124 P1 — claim ladder (computeClaimDelayMs)', () => {
  const L = 1500;

  it('rank 0 (lowest warranted-alive seat) fires at delay 0 — the D3-equivalent path', () => {
    expect(computeClaimDelayMs(warrant(1, 2, 3), new Set([1, 2, 3]), 1, L)).toBe(0);
  });

  it('ranks ascend by warranted-alive seat order: k·ladderMs', () => {
    const w = warrant(1, 2, 3);
    const alive = new Set([1, 2, 3]);
    expect(computeClaimDelayMs(w, alive, 2, L)).toBe(1 * L);
    expect(computeClaimDelayMs(w, alive, 3, L)).toBe(2 * L);
  });

  it('a DEAD lower seat shifts every survivor one rung down (the stuck-successor cure)', () => {
    const w = warrant(1, 2, 3);
    // Seat 1 died with the host: seat 2 is now rank 0, seat 3 rank 1.
    const alive = new Set([2, 3]);
    expect(computeClaimDelayMs(w, alive, 2, L)).toBe(0);
    expect(computeClaimDelayMs(w, alive, 3, L)).toBe(1 * L);
  });

  it('warrant-order independence: the ladder sorts by seat, not by warrant array order', () => {
    const shuffled: SuccessionWarrant = {
      epoch: 0,
      seats: [
        { seat: 3, spkiB64: 'k3' },
        { seat: 1, spkiB64: 'k1' },
        { seat: 2, spkiB64: 'k2' },
      ],
      sigB64: 'x',
    };
    const alive = new Set([1, 2, 3]);
    expect(computeClaimDelayMs(shuffled, alive, 1, L)).toBe(0);
    expect(computeClaimDelayMs(shuffled, alive, 3, L)).toBe(2 * L);
  });

  it('an UNWARRANTED seat can never claim (null), nor can a warranted-but-dead one', () => {
    const w = warrant(1, 2);
    expect(computeClaimDelayMs(w, new Set([1, 2, 5]), 5, L)).toBe(null); // not warranted
    expect(computeClaimDelayMs(w, new Set([1]), 2, L)).toBe(null); // warranted, not alive
  });

  it('CLAIM_LADDER_MS sits in the Council-derived band (above p95 verify+propagation ~940ms)', () => {
    expect(CLAIM_LADDER_MS).toBeGreaterThanOrEqual(1000);
    expect(CLAIM_LADDER_MS).toBeLessThanOrEqual(2000);
  });
});

describe('S124 P1 — acceptance decision (claimAcceptDecision)', () => {
  it('epoch advance requires locally-observed host loss (S122 Council L3, generalized)', () => {
    expect(claimAcceptDecision(1, 1, 0, null, true)).toBe('advance');
    expect(claimAcceptDecision(1, 1, 0, null, false)).toBe('reject'); // healthy host → never
  });

  it('is MONOTONIC-FORWARD, not strict +1: a rejoiner that missed N terms still converges', () => {
    // Slept through epochs 1 and 2; the epoch-3 echo claim must land.
    expect(claimAcceptDecision(3, 2, 0, null, true)).toBe('advance');
  });

  it('rejects older and same terms from equal/higher seats (zombie + replay fencing)', () => {
    expect(claimAcceptDecision(1, 1, 2, 1, true)).toBe('reject'); // older term
    expect(claimAcceptDecision(2, 2, 2, 2, true)).toBe('reject'); // same term, same seat
    expect(claimAcceptDecision(2, 3, 2, 2, true)).toBe('reject'); // same term, HIGHER seat
  });

  it('same-epoch LOWER seat re-latches DOWNWARD without any host-loss observation', () => {
    // Ladder race: latched seat 2 first, seat 1's claim arrives late. Pure reconciliation —
    // hostGone is false (seat 2 is alive and hosting) and the re-latch must still happen.
    expect(claimAcceptDecision(1, 1, 1, 2, false)).toBe('relatch-down');
  });

  it('defensive null latch at the same epoch accepts downward (no better claimant to defend)', () => {
    expect(claimAcceptDecision(1, 2, 1, null, false)).toBe('relatch-down');
  });
});

describe('S124 P1 — fail-closed stamping (stampOrReject)', () => {
  const act = (playerId: PlayerId): GameAction =>
    ({ type: 'BENCH_OFFLINE_PLAYER', playerId, untilTick: 100 }) as GameAction;

  it('stamps a seated sender over whatever the wire claimed', () => {
    const stamped = stampOrReject(act(asPlayerId(5)), asPlayerId(2));
    expect(stamped).not.toBeNull();
    expect((stamped as { playerId: PlayerId }).playerId).toBe(2);
  });

  it('REJECTS (null) an unseated sender — the S62 apply-as-is leniency is closed', () => {
    expect(stampOrReject(act(asPlayerId(5)), undefined)).toBe(null);
  });
});

describe('S124 P1 — ClientSync.setEpoch watermark reset (demoted-adopter hardening)', () => {
  const snap: NetSnapshot = netSnapshot(makeWorld(0));
  const msg = (seq: number, epoch?: number): NetSnapshotMsg => ({
    kind: 'NETSNAPSHOT',
    snapshotSeq: seq,
    snapshot: snap,
    ...(epoch !== undefined ? { epoch } : {}),
  });

  it('an epoch ADVANCE resets the seq watermark: the new term is admitted by construction', () => {
    const c = new ClientSync();
    expect(c.receive(msg(500), 100)).toBe(true); // followed the old term to seq 500
    c.setEpoch(1); // claim accepted → new term
    // The new host's seq numbering is its own; even a LOWER absolute seq must land.
    expect(c.receive(msg(1, 1), 200)).toBe(true);
  });

  it('the epoch fence still drops zombie frames BEFORE the seq gate (no watermark poisoning)', () => {
    const c = new ClientSync();
    c.setEpoch(1);
    expect(c.receive(msg(99_999, 0), 100)).toBe(false); // zombie, huge seq — dropped
    expect(c.receive(msg(1, 1), 200)).toBe(true); // its seq never advanced the watermark
  });

  it('a SAME/LOWER setEpoch does not reset the watermark (stale-seq protection intact)', () => {
    const c = new ClientSync();
    expect(c.receive(msg(500, 0), 100)).toBe(true);
    c.setEpoch(0); // no advance
    expect(c.receive(msg(400, 0), 200)).toBe(false); // stale seq still rejected
  });
});

describe('S124 P1 — roster-complete takeover hostSeats feed the S82 drop-bench sweep', () => {
  const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

  it('the DEAD host seat (and any dead peer) is rolling-benched; alive peers are not', () => {
    const world = makeWorld(7);
    world.gameState = 'TITLE';
    const roster = Array.from({ length: 3 }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat] }));
    dispatch(world, { type: 'START_GAME', mode: '1v1', isHost: true, roster });
    // The successor (seat 1) built hostSeats from the FULL frozen roster minus self:
    // the dead ORIGINAL HOST (seat 0) is present with a transport-dead peerId.
    const deps: HostTickDeps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
      grid: new SpatialGrid(32),
      controls: stubControls,
      botManager: null,
      gameStateExtras: makeGameStateExtras(),
      alivePeerIds: new Set(['peer-seat2']), // only seat 2 is transport-alive
      hostSeats: new Map<string, PlayerId>([
        ['peer-dead-host', asPlayerId(0)],
        ['peer-seat2', asPlayerId(2)],
      ]),
    };
    const state = makeHostTickState(world);
    for (let t = 0; t < PEER_DROP_GRACE_TICKS + 2; t++) runHostTick(world, deps, state);
    const deadHost = world.players.get(asPlayerId(0));
    const alivePeer = world.players.get(asPlayerId(2));
    expect(deadHost).toBeDefined();
    expect(alivePeer).toBeDefined();
    // Rolling re-stamp: benched out past the current tick by the bench window.
    expect(deadHost!.benchedUntilTick).toBeGreaterThan(world.tick);
    expect(deadHost!.benchedUntilTick).toBeLessThanOrEqual(world.tick + PEER_DROP_BENCH_TICKS);
    expect(alivePeer!.benchedUntilTick ?? 0).toBeLessThanOrEqual(0);
  });
});
