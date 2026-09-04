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
import { isNetworked } from './gameMode.ts';
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
  it('⭐ THE FIXTURE ITSELF — networked, hosting, 3 seats, past the forfeit window', () => {
    /*
     * Anti-vacuity for every case below. `tickGameState`'s offline path only runs for a NETWORKED
     * world (`gameMode !== 'solo'`) and `markFallenSeats` is gated on `world.isHost`, so a fixture
     * that quietly failed either condition would make all five cases pass for the wrong reason —
     * the S163 audit asked exactly this question of this file.
     */
    const { w, hostSeats } = board();
    expect(isNetworked(w)).toBe(true);
    expect(w.isHost).toBe(true);
    expect(w.players.size).toBe(3);
    expect(hostSeats.size).toBe(2);
    expect(w.tick).toBeGreaterThanOrEqual(PEER_DROP_FORFEIT_TICKS);
  });

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

  it('⛔ alivePeerIds === null OMITS the predicate — the pre-S162 path, byte for byte', () => {
    /*
     * ⛔ S163 CHECK — THIS CASE COULD NOT FAIL AND ITS TITLE WAS WRONG. It seeded NO absence
     * stamps, so the predicate returned false for every seat whether it was passed or omitted; it
     * held identically with `hasWitness` forced true, forced false, or the guard deleted. And it
     * called itself "solo / vs-bots — no transport" while running a 3-seat networked board with a
     * populated `hostSeats`.
     *
     * Now it seeds an EXPIRED stamp, so the assertion depends on the predicate genuinely being
     * omitted: pass the predicate here and seat 1 forfeits and the match ends. That is the real
     * `alivePeerIds === null` contract — no transport means no absence knowledge, which is exactly
     * the pre-S162 behaviour solo and vs-bots have always had.
     */
    const { w, state, hostSeats } = board();
    w.players.get(P(2))!.castleHp = 0;
    state.peerAbsentSinceTick.set('p1', 0); // long expired — and must be IGNORED
    runHostTick(w, deps(null, hostSeats), state);
    expect(w.gameState).toBe('PLAYING');
    expect(w.lastWinnerId).toBeNull();
  });

  it('⛔ THE HEAL TICK — a partition that RECOVERS must not crown the host either', () => {
    /*
     * ⛔ S163 CHECK — THE FIRST CUT OF THIS GUARD ONLY DEFERRED THE BUG, and an adversarial audit
     * of the same day's work caught it. `hasWitness` is evaluated at the TOP of `runHostTick`, but
     * the sweep that CLEARS `peerAbsentSinceTick` for a present peer runs at the very END of the
     * same function, a thousand lines later. So on the tick a partition heals, `alivePeerIds` is
     * already non-empty again — main.ts rebuilds it from `netTransport.peerIds()` every frame —
     * while the stamps still hold the partition-era values. The predicate then read every
     * reconnecting seat as absent, `contenders` collapsed to the host, and WIN_TRIGGER fired on
     * the very tick the opponents came back.
     *
     * The guard had moved the self-crown from t+20s to t+heal, which is arguably worse: it fires
     * exactly when the peers are present to see it.
     *
     * Two ticks, one state object, because that is the only way to express it: tick 1 partitioned,
     * tick 2 healed.
     */
    const { w, state, hostSeats } = board();
    w.players.get(P(2))!.castleHp = 0;
    state.peerAbsentSinceTick.set('p1', 0);
    state.peerAbsentSinceTick.set('p2', 0);

    // Tick 1 — fully partitioned. Already covered above, asserted here as the precondition.
    runHostTick(w, deps(new Set<string>(), hostSeats), state);
    expect(w.gameState).toBe('PLAYING');

    // Tick 2 — the peers are BACK. The stamps are still stale at the moment the win check runs.
    runHostTick(w, deps(new Set(['p1', 'p2']), hostSeats), state);
    expect(w.gameState, 'a reconnecting peer is present, not absent').toBe('PLAYING');
    expect(w.lastWinnerId).toBeNull();
  });

  it('⭐ …and a peer that is STILL gone after a partial heal is still a forfeit', () => {
    // Anti-vacuity for the case above: the fix must key on "is this peer present NOW", not on
    // "ignore the stamps whenever anyone reconnects". p1 comes back, p2 stays gone and its castle
    // is the one standing, so seat 0 vs seat 1 resolves legitimately.
    const { w, state, hostSeats } = board();
    w.players.get(P(1))!.castleHp = 0;
    state.peerAbsentSinceTick.set('p2', 0);
    runHostTick(w, deps(new Set(['p1']), hostSeats), state);
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(0));
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

/**
 * ⛔ S163 CHECK — **THE ACCEPTED COST OF THE GUARD, PINNED SO IT IS VISIBLE RATHER THAN SILENT.**
 *
 * The host cannot distinguish "my uplink died" from "everyone else quit": both empty
 * `alivePeerIds`. The guard therefore refuses a forfeit win in BOTH, which re-opens — for the
 * narrow all-peers-gone case — the match-hang S162 P4 closed.
 *
 * This is deliberate, and the reasoning is at the guard in `hostTick.ts`: the two failures are not
 * equal. A wrongly-refused win strands one player on a board they can leave with BACK TO MAIN. A
 * wrongly-GRANTED win produces two live outcomes for one match and corrupts the result for
 * everyone. Refusing is the recoverable direction.
 *
 * ⚠ This test asserts the LIMITATION, not a desirable behaviour. If the owner rules on abandonment
 * (the standing question this shares a root with), this case is the one that should change — and it
 * will go red and say so, which is the entire point of writing it down.
 */
describe('S163 CHECK — the known limitation the witness rule buys', () => {
  it('⚠ ACCEPTED: every peer genuinely quitting leaves the match un-winnable, not won', () => {
    const { w, state, hostSeats } = board();
    w.players.get(P(2))!.castleHp = 0; // seat 2 was eliminated, then everyone left
    state.peerAbsentSinceTick.set('p1', 0);
    state.peerAbsentSinceTick.set('p2', 0);
    runHostTick(w, deps(new Set<string>(), hostSeats), state);
    // Pre-S163 this was a WIN for seat 0 after 20 s. It is now a hang — knowingly.
    expect(w.gameState).toBe('PLAYING');
    expect(w.lastWinnerId).toBeNull();
  });
});
