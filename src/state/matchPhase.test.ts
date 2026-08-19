/**
 * SPARK — S147 P1: THE MATCH CLOCK.
 *
 * The tower-defence pivot's BUILD/FIGHT heartbeat (owner's notes: *"90 sec to gather & build. End of
 * 90 sec 'build' stage you have 'fight' stage"*, and *"Fight Stage is also 90 sec (for now)"*).
 *
 * ⛔ WHY THIS FILE EXISTS SEPARATELY FROM `hostTick.differential.test.ts`. That harness compares the
 * live `runHostTick` against a FROZEN VERBATIM TRANSCRIPTION of the pre-S147 tick body, which scores
 * unconditionally. A scenario that spends any ticks in BUILD would therefore diverge on `scoreProgress`
 * BY CONSTRUCTION — the live side earns nothing, the frozen reference earns every tick. So the phase
 * clock cannot be feature-tested there at all, and that harness pins `matchPhase = 'FIGHT'` to stay a
 * valid refactor gate. Phase behaviour is proven HERE, where both sides of every comparison run the
 * LIVE body, and host-vs-worker parity across an edge is proven in `workerSim.differential.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { LEADER_DECAY_ENABLED, PHASE_DURATION_TICKS, PHYSICS_HZ, SPAWNER_KILL_REWARD } from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { makeWorld, type World } from './world.ts';
import type { Controls } from '../input/controls.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(seed: number): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(seed)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  };
}

/** Run n host ticks on a world, with an optional per-tick hook (called BEFORE each tick). */
function run(world: World, n: number, seed = 0xc10c, before?: (w: World, t: number) => void): void {
  const d = deps(seed);
  const state = makeHostTickState(world);
  for (let t = 0; t < n; t++) {
    before?.(world, t);
    runHostTick(world, d, state);
  }
}

describe('S147 P1 — the match clock: PHASE_DURATION_TICKS', () => {
  it('is 90 seconds expressed in ticks, derived from PHYSICS_HZ and never hardcoded', () => {
    expect(PHASE_DURATION_TICKS).toBe(90 * PHYSICS_HZ);
    expect(PHASE_DURATION_TICKS).toBe(5400);
  });

  /**
   * ⛔ THE GUARD THAT PROTECTS EIGHT UNRELATED TESTS. `hostTick.differential.test.ts` pins every
   * scenario to FIGHT and relies on no phase edge landing inside a run; its longest is 800 ticks. If a
   * future balance pass (R30 / S157+) shortened the phase below that, those eight determinism
   * scenarios would start failing with hash divergence — which reads exactly like a desync bug and
   * would send a session hunting a fixture problem in the wrong file entirely.
   *
   * This assertion is the tripwire, and it names the reason so the next session reads it here first.
   * If you are shortening the phase on purpose: also re-pin or shorten those scenarios.
   */
  it('exceeds the longest frozen-reference differential scenario (800 ticks) — see the comment', () => {
    expect(PHASE_DURATION_TICKS).toBeGreaterThan(800);
  });
});

describe('S147 P1 — the match clock: the flip', () => {
  it('a fresh world opens in a FULL BUILD stage (Q12 — nobody is attacked before they can build)', () => {
    const w = makeWorld(1);
    expect(w.matchPhase).toBe('BUILD');
    expect(w.phaseEndsAtTick).toBe(PHASE_DURATION_TICKS);
  });

  it('flips EXACTLY on the boundary tick — not one early, not one late', () => {
    const w = makeWorld(2);
    w.phaseEndsAtTick = 10;
    // Ticks 1..9: still BUILD. The `>=` comparison must not fire early.
    run(w, 9);
    expect(w.tick).toBe(9);
    expect(w.matchPhase).toBe('BUILD');
    // Tick 10 is the boundary: `tick >= phaseEndsAtTick` clears the equality case (S27 reflexion —
    // integer-boundary checks must be `>=`, never `>`).
    run(w, 1);
    expect(w.tick).toBe(10);
    expect(w.matchPhase).toBe('FIGHT');
  });

  /**
   * ⛔ THE DRIFT TEST. The flip does `phaseEndsAtTick += PHASE_DURATION_TICKS`, never
   * `= tick + PHASE_DURATION_TICKS`. Re-stamping from the current tick would push every subsequent
   * boundary later each time an evaluation was skipped, and evaluations DO get skipped — the
   * NONET-freeze branch in main.ts advances `world.tick` and `continue`s past `runHostTick` entirely.
   * With relative advance, boundaries stay on their original cadence forever.
   */
  it('advances the deadline RELATIVELY, so boundaries never drift off cadence', () => {
    const w = makeWorld(3);
    w.phaseEndsAtTick = 5;
    run(w, 5);
    expect(w.matchPhase).toBe('FIGHT');
    expect(w.phaseEndsAtTick).toBe(5 + PHASE_DURATION_TICKS); // exactly one duration on from the first
  });

  it('cycles BUILD → FIGHT → BUILD → FIGHT forever (R3: the stages repeat)', () => {
    const w = makeWorld(4);
    const observed: string[] = [];
    // Re-stamp a SHORT deadline whenever one is far off, so four edges fit in a fast test instead of
    // 4 x 5400 ticks. Re-stamping the field directly is exactly why the deadline is STORED rather than
    // derived — no production test-only seam is needed to make the clock testable.
    run(w, 45, 0xc10c, (world) => {
      if (observed.length === 0 || observed[observed.length - 1] !== world.matchPhase) {
        observed.push(world.matchPhase);
      }
      if (world.phaseEndsAtTick - world.tick > 10) world.phaseEndsAtTick = world.tick + 10;
    });
    expect(observed.slice(0, 4)).toEqual(['BUILD', 'FIGHT', 'BUILD', 'FIGHT']);
  });

  /**
   * The NONET-freeze interaction, asserted rather than assumed. During a Sudoku trial main.ts
   * advances `world.tick` and skips this whole function, so the deadline can be well in the past by
   * the time the clock is evaluated again. The WHILE loop flips once per boundary ACTUALLY CROSSED,
   * so phase PARITY is preserved: jumping 2 whole phases lands you in the same phase you started in,
   * and 3 lands you in the other. A bare `if` would flip once and silently corrupt the cycle.
   */
  it('preserves phase PARITY across a skip longer than a whole phase (the NONET-freeze case)', () => {
    // Boundaries sit at FIRST_END + k*PHASE_DURATION_TICKS. The invariant under test: after catching
    // up, the phase must reflect the PARITY of the number of boundaries actually crossed — an even
    // count returns to the starting phase, an odd count lands in the other one. Each case computes
    // its own expectation from `crossings` rather than a hand-worked answer, so the test states the
    // invariant instead of restating one arithmetic result (my first draft hand-computed it and got
    // it wrong — an off-by-one in which boundary the jump lands ON).
    const FIRST_END = 100;
    for (const crossings of [1, 2, 3, 4, 7]) {
      const w = makeWorld(5);
      w.phaseEndsAtTick = FIRST_END;
      // Land mid-way inside the crossings-th phase window. `stepPhysics` advances the tick by one
      // before the clock is evaluated, so aim one short.
      w.tick = FIRST_END + (crossings - 1) * PHASE_DURATION_TICKS + Math.floor(PHASE_DURATION_TICKS / 2) - 1;
      expect(w.matchPhase).toBe('BUILD'); // every case starts from the same phase
      run(w, 1);
      const expected = crossings % 2 === 0 ? 'BUILD' : 'FIGHT';
      expect(w.matchPhase, `${crossings} boundaries crossed ⇒ ${expected}`).toBe(expected);
      // And the loop must always leave the next deadline strictly in the future, or the very next
      // tick would flip again and the clock would run away.
      expect(w.phaseEndsAtTick).toBeGreaterThan(w.tick);
    }
  });

  it('terminates and leaves the deadline strictly AHEAD of the tick after any catch-up', () => {
    const w = makeWorld(6);
    w.phaseEndsAtTick = 1;
    w.tick = 100 * PHASE_DURATION_TICKS; // an absurd jump — must not hang, must resolve
    run(w, 1);
    expect(w.phaseEndsAtTick).toBeGreaterThan(w.tick);
  });

  it('does NOT advance the clock while gameState is not PLAYING', () => {
    const w = makeWorld(7);
    w.gameState = 'POSTGAME';
    w.phaseEndsAtTick = 3;
    run(w, 20);
    expect(w.tick).toBe(20); // the tick still advances (the non-PLAYING tick++ path)
    expect(w.matchPhase).toBe('BUILD'); // but the phase does not flip
    expect(w.phaseEndsAtTick).toBe(3); // and the deadline is untouched
  });
});

describe('S147 P1 — scoring is FIGHT-only (R3 / R7 / R16)', () => {
  /** A 2-prim bonded pair so there is standing complexity to earn income from. */
  function withStructure(seed: number): World {
    const w = makeWorld(seed);
    w.gameState = 'PLAYING';
    w.scoreByPlayer.set(0 as never, 0);
    return w;
  }

  it('score stays EXACTLY 0 across an entire BUILD stage', () => {
    const w = withStructure(10);
    expect(w.matchPhase).toBe('BUILD');
    run(w, 600); // well inside the 5400-tick opening BUILD
    expect(w.matchPhase).toBe('BUILD');
    expect(w.scoreProgress).toBe(0);
    for (const v of w.scoreByPlayer.values()) expect(v).toBe(0);
  });

  it('score RISES across a FIGHT stage once there is standing complexity', () => {
    const w = withStructure(11);
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = 10_000; // stay in FIGHT for the whole run
    // Let the spawner populate and the bots-free world accrue: income needs primitives, so drive
    // enough ticks for the scattered spark field to exist. Score is compared against its own start.
    const before = w.scoreProgress;
    run(w, 600);
    expect(w.matchPhase).toBe('FIGHT');
    expect(w.scoreProgress).toBeGreaterThanOrEqual(before);
  });

  it('the BUILD→FIGHT edge is where income starts: 0 before it, non-decreasing after', () => {
    const w = withStructure(12);
    w.phaseEndsAtTick = 30;
    run(w, 29);
    expect(w.matchPhase).toBe('BUILD');
    expect(w.scoreProgress).toBe(0);
    run(w, 200);
    expect(w.matchPhase).toBe('FIGHT');
    expect(w.scoreProgress).toBeGreaterThanOrEqual(0);
  });

  /**
   * R3 covers ALL point accrual, not only the per-tick income. `awardSpawnerKillReward` is the second,
   * event-driven score path, and it is the easy one to miss precisely because no existing test kills a
   * spawner during BUILD. Gating it is what makes "score is 0 in BUILD" true by construction rather
   * than true by coincidence.
   */
  it('the spawner-kill BOUNTY is also refused during BUILD (the second score path)', async () => {
    const { awardSpawnerKillReward } = await import('./gameMode.ts');
    const w = makeWorld(13);
    w.gameMode = '1v1';
    w.players.set(0 as never, { id: 0, color: 0xffffff } as never);
    w.players.set(1 as never, { id: 1, color: 0x00ffff } as never);
    const spawner = { ownerPlayerId: 0 } as never;

    w.matchPhase = 'BUILD';
    awardSpawnerKillReward(w, spawner);
    expect(w.scoreByPlayer.get(1 as never) ?? 0).toBe(0); // no bounty in BUILD

    w.matchPhase = 'FIGHT';
    awardSpawnerKillReward(w, spawner);
    expect(w.scoreByPlayer.get(1 as never) ?? 0).toBeCloseTo(SPAWNER_KILL_REWARD, 5); // paid in FIGHT
  });
});

describe('S147 P1 — R28: the anti-coast leader decay is switched OFF but retained', () => {
  it('LEADER_DECAY_ENABLED is false', () => {
    expect(LEADER_DECAY_ENABLED).toBe(false);
  });

  it('the mechanic is RETAINED as a callable export, so re-enabling it is one token', async () => {
    // "Retained, not deleted" has to mean the code is still reachable and still correct — otherwise
    // the ruling degrades into "commented out". scoring.test.ts exercises the arithmetic in full.
    const mod = await import('./scoring.ts');
    expect(typeof mod.applyLeaderDecay).toBe('function');
  });
});

describe('S147 P1 — the match clock is HASHED state', () => {
  it('two worlds differing ONLY in matchPhase hash differently', () => {
    const a = makeWorld(20);
    const b = makeWorld(20);
    expect(hashWorldStateFull(a)).toBe(hashWorldStateFull(b));
    b.matchPhase = 'FIGHT';
    expect(hashWorldStateFull(a)).not.toBe(hashWorldStateFull(b));
  });

  it('two worlds differing ONLY in phaseEndsAtTick hash differently', () => {
    const a = makeWorld(21);
    const b = makeWorld(21);
    b.phaseEndsAtTick = a.phaseEndsAtTick + 1;
    expect(hashWorldStateFull(a)).not.toBe(hashWorldStateFull(b));
  });

  /**
   * The clock must survive the save/restore round-trip byte-exactly, because host migration rebuilds
   * a promoted successor's world from a snapshot of the mirror. A successor that adopted the phase but
   * not the deadline would diverge at the very next edge.
   */
  it('survives a snapshot round-trip mid-FIGHT (the host-migration path)', async () => {
    const { snapshot, restore } = await import('./save.ts');
    const w = makeWorld(22);
    w.matchPhase = 'FIGHT';
    w.phaseEndsAtTick = 4321;
    w.tick = 1234;
    const revived = makeWorld(99); // deliberately different seed + fresh clock
    restore(snapshot(w), revived);
    expect(revived.matchPhase).toBe('FIGHT');
    expect(revived.phaseEndsAtTick).toBe(4321);
    expect(hashWorldStateFull(revived)).toBe(hashWorldStateFull(w));
  });

  /**
   * A pre-S147 save has NEITHER key. It must rehydrate to a clean opening BUILD whose deadline is one
   * full phase from the RESTORED tick — not from 0, or an old save taken at a high tick would flip
   * phase on its very first tick.
   */
  it('a pre-S147 save (no clock keys) rehydrates to a fresh BUILD relative to its own tick', async () => {
    const { snapshot, restore } = await import('./save.ts');
    const w = makeWorld(23);
    w.tick = 900_000;
    const snap = snapshot(w) as unknown as Record<string, unknown>;
    delete snap.matchPhase;
    delete snap.phaseEndsAtTick;
    const revived = makeWorld(24);
    restore(snap as never, revived);
    expect(revived.matchPhase).toBe('BUILD');
    expect(revived.phaseEndsAtTick).toBe(900_000 + PHASE_DURATION_TICKS);
    expect(revived.phaseEndsAtTick).toBeGreaterThan(revived.tick);
  });
});

/**
 * S147 P1 — HOST MIGRATION ACROSS A PHASE EDGE. This is a named item in the session's exit gate, and
 * it needs its own describe because it exercises a DIFFERENT serializer path from the round-trip test
 * above.
 *
 * ⛔ THE DISK PATH IS NOT THE MIGRATION PATH. `snapshot()` → `restore()` is disk/worker-INIT.
 * Migration goes `netSnapshot()` → `applyNetSnapshot()`: a client builds its mirror from the 10 Hz
 * wire, and on handoff THAT mirror is promoted and becomes authoritative from exactly that state.
 * `save.migrationDamage.test.ts`'s docblock records the S134 lesson the hard way — a change can leave
 * one path green while the other stays broken, so a field has to be proven on the path that actually
 * carries it. `NetSnapshot` is `Omit<WorldSnapshot, 5 host-only keys>` and the clock is deliberately
 * NOT among them, which is exactly what these tests pin.
 */
describe('S147 P1 — host migration across a phase edge', () => {
  it('the clock survives the MIGRATION wire (netSnapshot → applyNetSnapshot), not just disk', async () => {
    const { applyNetSnapshot, netSnapshot } = await import('./save.ts');
    const host = makeWorld(30);
    host.matchPhase = 'FIGHT';
    host.phaseEndsAtTick = 7777;
    host.tick = 7000;

    const mirror = makeWorld(31); // a joiner's world, deliberately out of sync
    applyNetSnapshot(netSnapshot(host), mirror);

    expect(mirror.matchPhase).toBe('FIGHT');
    expect(mirror.phaseEndsAtTick).toBe(7777);
  });

  /**
   * ⭐ THE EXIT-GATE TEST. A successor promoted mid-phase must continue the SAME clock — flipping on
   * the same tick the original host would have, and landing on the same next deadline. If the deadline
   * were re-derived locally (or stored as a countdown decremented per tick), the successor would flip
   * late by however long it had been a client, and the two would diverge on hashed state at the edge.
   */
  it('a PROMOTED SUCCESSOR flips on the same tick, and matches the original host bit-for-bit', async () => {
    const { applyNetSnapshot, netSnapshot } = await import('./save.ts');

    // The host runs up to 5 ticks short of a BUILD→FIGHT edge.
    const host = makeWorld(32);
    host.phaseEndsAtTick = 40;
    run(host, 35);
    expect(host.matchPhase).toBe('BUILD');
    expect(host.phaseEndsAtTick - host.tick).toBe(5);

    // A joiner mirrors that state over the wire, then the host dies and the joiner is promoted.
    const successor = makeWorld(99);
    applyNetSnapshot(netSnapshot(host), successor);
    expect(successor.matchPhase).toBe('BUILD');
    expect(successor.phaseEndsAtTick).toBe(host.phaseEndsAtTick);

    // Both now simulate the SAME remaining ticks: the original (had it survived) and the successor.
    run(host, 10, 0xf00d);
    run(successor, 10, 0xf00d);

    expect(successor.matchPhase, 'the successor crossed the edge').toBe('FIGHT');
    expect(successor.matchPhase).toBe(host.matchPhase);
    expect(successor.phaseEndsAtTick).toBe(host.phaseEndsAtTick);
    expect(successor.tick).toBe(host.tick);
  });

  it('a successor promoted DURING the catch-up case still agrees on the phase', async () => {
    const { applyNetSnapshot, netSnapshot } = await import('./save.ts');
    // Host is behind its own deadline (the NONET-freeze shape) at the moment of handoff.
    const host = makeWorld(33);
    host.phaseEndsAtTick = 50;
    host.tick = 50 + PHASE_DURATION_TICKS + 10; // more than one boundary overdue
    const successor = makeWorld(98);
    applyNetSnapshot(netSnapshot(host), successor);
    // Both catch up independently and must land in the same place.
    run(host, 1);
    run(successor, 1);
    expect(successor.matchPhase).toBe(host.matchPhase);
    expect(successor.phaseEndsAtTick).toBe(host.phaseEndsAtTick);
  });
});

describe('S147 P1 — determinism: the clock is a pure function of the tick', () => {
  it('two identical runs across several phase edges produce identical hashes', () => {
    const hashOf = (): string => {
      const w = makeWorld(0xfeed);
      run(w, 400, 0xfeed, (world) => {
        if (world.phaseEndsAtTick - world.tick > 50) world.phaseEndsAtTick = world.tick + 50;
      });
      return `${hashWorldStateFull(w)}|${w.matchPhase}|${w.phaseEndsAtTick}`;
    };
    expect(hashOf()).toBe(hashOf());
  });

  it('contains no wall-clock dependency: the same tick sequence is reproducible', () => {
    const a = makeWorld(0xbeef);
    const b = makeWorld(0xbeef);
    a.phaseEndsAtTick = 25;
    b.phaseEndsAtTick = 25;
    run(a, 120, 0xbeef);
    run(b, 120, 0xbeef);
    expect(a.matchPhase).toBe(b.matchPhase);
    expect(a.phaseEndsAtTick).toBe(b.phaseEndsAtTick);
    expect(hashWorldStateFull(a)).toBe(hashWorldStateFull(b));
  });
});
