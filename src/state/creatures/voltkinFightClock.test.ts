/**
 * SPARK — S155 P3: **VOLTKIN'S 20 SECONDS ARE 20 SECONDS OF FIGHTING.**
 *
 * ## The report, and why it was arithmetically inevitable
 *
 * Owner: *"voltkin has a timedown but it is counted from when you've build him and not from fight
 * start. he should start from fight start. my friend played with bots and built voltkins and by the
 * time the fight started voltkin had dissapeared..."*
 *
 * Three shipped numbers make that a certainty rather than bad luck:
 *   · `VOLTKIN_CONFIG.lifetimeTicks` = 1200 = **20 s** at `PHYSICS_HZ` 60;
 *   · `PHASE_DURATION_TICKS` (BUILD) = 5400 = **90 s**;
 *   · and the whole creature fan-out is gated on `matchPhase === 'FIGHT'` (`hostTick.ts`), so a
 *     creature raised in BUILD **neither acts nor is watched** while its clock burns down.
 *
 * So a Voltkin summoned with more than 20 s of BUILD remaining spends its entire life dormant and is
 * gone before the fight it was built for. The player pays a full godly combo for nothing.
 *
 * ## ⛔ THE FIX IS ONE STEP, AND THE SECOND STEP WOULD HAVE BEEN AN EXPLOIT
 *
 * My first redesign made the lifetime measure *"20 seconds of ACTIVE COMBAT TIME"* — the clock
 * skipping EVERY BUILD gap, which sounded more honest and which GEMINI-AUDITOR had argued for. In
 * Council Round 2 the same seat killed it as the point it would *"die on"*:
 *
 * > *"If a Voltkin survives a FIGHT phase, its clock pauses for the next 90 seconds. This turns the
 * > BUILD phase into a stasis chamber. Players will instantly realize the meta: spam Voltkins in the
 * > last 5 seconds of a FIGHT phase, let their clocks freeze, build MORE during the 90-second BUILD
 * > phase, and enter the next FIGHT phase with double or triple the intended Voltkin mass."*
 *
 * That is correct and it would have broken the unit economy while looking like a bug fix. So the
 * deferral is **ONE STEP ONLY**: a `'fight'`-clock creature born during BUILD anchors to the start of
 * its FIRST fight, and from then on the clock runs ABSOLUTELY and never pauses again.
 *
 * ⭐ AND THE SIMPLER FORM ALSO DISSOLVED GROK-ANALYST's OBJECTIONS, which is why it is the design and
 * not a compromise. The multi-phase version had to walk the BUILD/FIGHT schedule, which (a) baked the
 * tuning constants into a serialized computed field — a future `PHASE_DURATION_TICKS` re-tune would
 * silently invalidate every saved creature — and (b) had to replicate the phase accumulator's
 * multi-flip boundary semantics exactly, including after a NONET freeze. The one-step form walks no
 * schedule and bakes no constant: the only value it reads is `world.phaseEndsAtTick`, which during
 * BUILD simply *is* the tick FIGHT begins, and which is already hashed and already on the wire. No
 * new field, no `PROTOCOL_VERSION` bump, and `despawnAtTick` stays an absolute tick computed ONCE at
 * construction and serialized as itself — so a save/restore or a host migration carries the integer
 * rather than recomputing it.
 *
 * A balance objection and a correctness objection converged on the same, smaller change. That is what
 * the second Council round was for.
 */

import { describe, expect, it } from 'vitest';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature, makeVoltkinCreature } from './creature.ts';
import {
  LIGHTNING_DRONE_CONFIG,
  VOLTKIN_CONFIG,
  getCreatureConfig,
} from './voltkin-config.ts';
import { FIGHT_PHASE_TICKS, PHASE_DURATION_TICKS, PLAYER_COLORS } from '../../constants.ts';
import { asPlayerId } from '../../types.ts';

const P1 = asPlayerId(0);
const ORIGIN = { x: 100, y: 100 };

/** A PLAYING world seated for one player, with the match clock in a known phase. */
function worldAt(phase: 'BUILD' | 'FIGHT', tick: number): World {
  const w = makeWorld(0x5155);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: 'solo',
    isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }],
  });
  w.tick = tick;
  w.matchPhase = phase;
  // Mirror of the live invariant: during BUILD the deadline IS the FIGHT-start tick; during FIGHT it
  // is the FIGHT-end tick. Set from `tick` so each test states its own position in the phase.
  w.phaseEndsAtTick = tick + (phase === 'BUILD' ? PHASE_DURATION_TICKS : FIGHT_PHASE_TICKS);
  return w;
}

function spawnVoltkin(w: World): { despawnAtTick: number; spawnedAtTick: number } {
  dispatch(w, {
    type: 'SPAWN_CREATURE',
    creatureType: 'voltkin',
    ownerPlayerId: P1,
    pos: ORIGIN,
    targetPos: { x: 900, y: 540 },
  });
  const c = [...w.creatures.values()].find((x) => x.type === 'voltkin');
  if (c === undefined) throw new Error('no voltkin spawned');
  return { despawnAtTick: c.despawnAtTick, spawnedAtTick: c.spawnedAtTick };
}

describe('S155 P3 — a Voltkin built during BUILD survives to fight', () => {
  it('⭐ THE OWNER BUG: raised at the very start of BUILD, it is ALIVE when FIGHT begins', () => {
    const w = worldAt('BUILD', 0);
    const fightStartsAt = w.phaseEndsAtTick; // 5400
    const { despawnAtTick } = spawnVoltkin(w);
    // Pre-S155 this was 0 + 1200 = 1200 — dead 4200 ticks (70 s) before the fight it was built for.
    expect(despawnAtTick).toBe(fightStartsAt + VOLTKIN_CONFIG.lifetimeTicks);
    expect(despawnAtTick).toBeGreaterThan(fightStartsAt);
  });

  it('gets its FULL lifetime of fighting no matter WHEN in BUILD it was raised', () => {
    // The whole point: summoning early must not be punished. Two Voltkins raised 80 s apart in the
    // same BUILD both get the identical 20 s of fight.
    for (const tick of [0, 1200, 3000, 4800]) {
      const w = worldAt('BUILD', tick);
      const fightStartsAt = w.phaseEndsAtTick;
      const { despawnAtTick } = spawnVoltkin(w);
      expect(despawnAtTick - fightStartsAt).toBe(VOLTKIN_CONFIG.lifetimeTicks);
    }
  });

  it('raised DURING a fight, it is unchanged — the clock is already running', () => {
    const w = worldAt('FIGHT', 6000);
    const { despawnAtTick, spawnedAtTick } = spawnVoltkin(w);
    expect(spawnedAtTick).toBe(6000);
    expect(despawnAtTick).toBe(6000 + VOLTKIN_CONFIG.lifetimeTicks);
  });
});

describe('S155 P3 — ⛔ NO STASIS CHAMBER (the Council R2 exploit)', () => {
  it('⭐ once the clock starts it NEVER pauses again, even if the despawn falls in the next BUILD', () => {
    /*
     * The exploit this forbids, verbatim from GEMINI-AUDITOR: *"spam Voltkins in the last 5 seconds
     * of a FIGHT phase, let their clocks freeze, build MORE during the 90-second BUILD phase, and
     * enter the next FIGHT phase with double or triple the intended Voltkin mass."*
     *
     * Raised 10 s before this FIGHT ends, a Voltkin's 20 s runs 10 s into the following BUILD and it
     * dies THERE. It must not be banked. That is the assertion.
     */
    const fightEndsAt = 10_000;
    const w = worldAt('FIGHT', fightEndsAt - 600); // 10 s of fight left
    w.phaseEndsAtTick = fightEndsAt;
    const { despawnAtTick } = spawnVoltkin(w);
    expect(despawnAtTick).toBe(fightEndsAt - 600 + VOLTKIN_CONFIG.lifetimeTicks);
    // ...and that instant is INSIDE the next BUILD, which is exactly what must NOT be deferred.
    expect(despawnAtTick).toBeGreaterThan(fightEndsAt);
  });

  it('the deferral is a ONE-STEP anchor, not a running pause — it reads phaseEndsAtTick once', () => {
    // Constructed once and never revisited: mutating the phase clock AFTERWARDS cannot move an
    // already-born creature's despawn. This is also what makes save/restore and host migration safe —
    // the serialized integer travels, rather than being recomputed against a different clock.
    const w = worldAt('BUILD', 0);
    const { despawnAtTick } = spawnVoltkin(w);
    w.phaseEndsAtTick = 99_999;
    w.matchPhase = 'FIGHT';
    const c = [...w.creatures.values()][0];
    expect(c.despawnAtTick).toBe(despawnAtTick);
  });
});

describe('S155 P3 — only creatures that OPT IN are deferred', () => {
  it('⚠ the lightning DRONE stays absolute — its 8 s is a FLIGHT FUSE, not a battery', () => {
    // Deferring a fuse would make a drone effectively immortal for the whole of BUILD. The
    // distinction is DECLARED in the config table rather than special-cased in code, so the next
    // creature has to state which kind of clock it has.
    expect(LIGHTNING_DRONE_CONFIG.lifetimeClock ?? 'absolute').toBe('absolute');
    expect(VOLTKIN_CONFIG.lifetimeClock).toBe('fight');
  });

  it('every OTHER creature type keeps an absolute clock (no silent behaviour change)', () => {
    for (const t of ['chewer', 'lightningDrone', 'goblinMelee'] as const) {
      expect(getCreatureConfig(t).lifetimeClock ?? 'absolute').toBe('absolute');
    }
  });

  it('BACK-COMPAT: makeCreature with NO clock is byte-identical to the pre-S155 behaviour', () => {
    // Every existing test and every replay guard calls the factory without a clock. That path must
    // remain `spawnedAtTick + lifetimeTicks`, or the locked replay equivalence shifts.
    const c = makeCreature(VOLTKIN_CONFIG, {
      id: asCreatureId(1),
      ownerPlayerId: P1,
      pos: ORIGIN,
      targetPos: ORIGIN,
      spawnedAtTick: 777,
    });
    expect(c.despawnAtTick).toBe(777 + VOLTKIN_CONFIG.lifetimeTicks);
    const v = makeVoltkinCreature({
      id: asCreatureId(2),
      ownerPlayerId: P1,
      pos: ORIGIN,
      targetPos: ORIGIN,
      spawnedAtTick: 777,
    });
    expect(v.despawnAtTick).toBe(777 + VOLTKIN_CONFIG.lifetimeTicks);
  });
});
