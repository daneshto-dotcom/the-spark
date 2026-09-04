/**
 * SPARK — S163 P1: **A HOST WHOSE OWN UPLINK DIES MUST NOT CROWN ITSELF.**
 *
 * S162 P4 gave the host an `isSeatOffline` predicate so a dropped peer's intact castle would stop
 * blocking the last-one-standing win. The predicate reads `peerAbsentSinceTick`, which is fed from
 * `deps.alivePeerIds` — i.e. from Trystero's `onPeerLeave`, which fires **identically whether the
 * peers left or THIS machine's uplink died.** The host has no discriminator.
 *
 * So a partitioned host saw every peer go absent, and 20 s later (`PEER_DROP_FORFEIT_TICKS`) it was
 * the sole contender and fired `WIN_TRIGGER` — while those same peers, seeing host loss, ran the
 * migration ladder and kept playing. **Two live outcomes for one match**, and the host's own
 * CONNECTION LOST overlay was dismissed and replaced by a clean "PLAYER 1 WINS".
 *
 * ⚠ THE MARGIN IS HALF A SECOND AT THE DEEP END, which is why the fix is a guard and not a longer
 * timer. A peer promotes at `RECONNECT_GRACE_MS + rank·CLAIM_LADDER_MS` = 15.0 s at rank 0 and
 * 19.5 s at rank 3, against this 20 s. ⛔ Do NOT compute that deadline from `HOST_STARVATION_MS`
 * (6 s) — that gates DETECTION, not promotion. S163's own state-discovery made exactly that error
 * first, concluded the peers were safely 11-14 s ahead, and had to be corrected.
 *
 * ⛔ THE PRECONDITIONS ARE NARROWER THAN THE INHERITED BUG REPORT, and these tests pin that too:
 * networked, **≥3 seats**, host alive, **≥1 castle already razed**, every living peer past the
 * clock. At 2 seats it is unreachable — `fallenCount` derives from `living`, so razing the only
 * opponent already wins legitimately, and razing the HOST leaves zero contenders, which ends
 * nothing. A 1v1 fixture cannot express this bug.
 */

import { describe, expect, it } from 'vitest';

import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { PEER_DROP_FORFEIT_TICKS, PLAYER_COLORS, phaseDurationTicks } from '../constants.ts';

const P = (n: number) => asPlayerId(n);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

/** A 3-seat NETWORKED host board in FIGHT, seats 1 and 2 owned by peers p1/p2. */
function board(): { w: World; state: HostTickState; hostSeats: Map<string, ReturnType<typeof P>> } {
  const w = makeWorld(0x5e1f);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  for (let i = 0; i < 3; i++) {
    if (!w.players.has(P(i))) {
      w.players.set(P(i), makeIdlePlayer(P(i), PLAYER_COLORS[i % PLAYER_COLORS.length]!));
    }
  }
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  // Past the forfeit window from tick 0, so a pre-seeded absence of 0 is already expired.
  w.tick = PEER_DROP_FORFEIT_TICKS + 10;
  const hostSeats = new Map<string, ReturnType<typeof P>>([
    ['p1', P(1)],
    ['p2', P(2)],
  ]);
  return { w, state: makeHostTickState(w), hostSeats };
}

function deps(alivePeerIds: ReadonlySet<string> | null, hostSeats: Map<string, ReturnType<typeof P>>): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds,
    hostSeats,
  } as unknown as HostTickDeps;
}

describe('S163 P1 — a forfeit-path win requires a witness', () => {
  it('⛔ THE BUG — with the host’s OWN uplink dead (no live peers) it must NOT crown itself', () => {
    const { w, state, hostSeats } = board();
    w.players.get(P(2))!.castleHp = 0; // a castle really did fall, so fallenCount > 0
    // Both peers vanished at tick 0 — which is what a dead LOCAL uplink looks like from here.
    state.peerAbsentSinceTick.set('p1', 0);
    state.peerAbsentSinceTick.set('p2', 0);
    runHostTick(w, deps(new Set<string>(), hostSeats), state);
    expect(w.gameState).toBe('PLAYING');
    expect(w.lastWinnerId).toBeNull();
  });

  it('⭐ CONTROL — with ONE peer still connected the S162 forfeit win still fires', () => {
    // Anti-vacuity: proves the guard refuses only the witness-less case and did not simply
    // switch OF-2 back off. p2's castle is down and p1 is long absent, but p2 is still on the
    // transport, so the host has a witness and seat 0 legitimately wins.
    const { w, state, hostSeats } = board();
    w.players.get(P(2))!.castleHp = 0;
    state.peerAbsentSinceTick.set('p1', 0);
    runHostTick(w, deps(new Set(['p2']), hostSeats), state);
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(0));
  });

  it('⭐ …and the witness does not have to be the surviving seat’s own peer', () => {
    // p1 is the witness AND the absent-clocked seat is p2 — the guard is about whether ANYONE
    // can still see us, never about which seat is winning.
    const { w, state, hostSeats } = board();
    w.players.get(P(1))!.castleHp = 0;
    state.peerAbsentSinceTick.set('p2', 0);
    runHostTick(w, deps(new Set(['p1']), hostSeats), state);
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(0));
  });

  it('solo / vs-bots (alivePeerIds === null) is untouched — no transport, no guard', () => {
    // `world.isHost` defaults true and a bot seat has no peer, so the offline path was never
    // reachable there. The guard must not change that in either direction.
    const { w, state, hostSeats } = board();
    w.players.get(P(2))!.castleHp = 0;
    runHostTick(w, deps(null, hostSeats), state);
    expect(w.gameState).toBe('PLAYING'); // two living seats, no predicate, nobody can win
  });

  it('⛔ an empty peer set with NO castle down still ends nothing — this is not abandonment', () => {
    // The guard must not be mistaken for a new way to end a match. `fallenCount` is still derived
    // from `living`, so a total partition with every castle intact is simply a hung host.
    const { w, state, hostSeats } = board();
    state.peerAbsentSinceTick.set('p1', 0);
    state.peerAbsentSinceTick.set('p2', 0);
    runHostTick(w, deps(new Set<string>(), hostSeats), state);
    expect(w.gameState).toBe('PLAYING');
  });
});
