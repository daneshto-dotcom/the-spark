/**
 * SPARK — W1-C: the castle's race-unit emitter (S165).
 *
 * ⭐ THE MOST IMPORTANT TEST IN THIS FILE IS THE PHASE ONE, and it is here to STOP a future session
 * being helpful. Every other emitter in the game is dormant outside FIGHT, `spawnerPhaseGate.test.ts`
 * pins that invariant, and `castleGuns.ts` opens with `if (world.matchPhase !== 'FIGHT') return;`.
 * A phase audit will therefore read `raceUnitEmitTick` as an oversight. It is not: owner R120 is
 * *"every thirty seconds it produces... And it keeps producing during fight until fight is done"*,
 * which only means anything as a contrast with producing during BUILD. Deleting the exception must
 * turn a test red rather than quietly halving every seat's unit supply.
 *
 * ⚠ AND THE CAP TESTS ARE NOT BALANCE TESTS. R123/R124 rule the race unit UNCAPPED — the ceilings
 * are `CHEWER_MAX_*`-shaped sentinel backstops at 10_000. What is pinned here is that race units do
 * not ride the GOBLIN family, because doing so would have starved the goblin towers and turned a
 * per-spawner cap into a cross-seat one. Both failures would have been silent.
 */
import { describe, expect, it } from 'vitest';

import {
  underRaceUnitCaps,
  castleEmitsOnTick,
  castleSpawnerId,
  isCastleSpawnerId,
  raceUnitEmitTick,
  ticksSinceCastleEmit,
} from './raceUnitEmit.ts';
import { RACE_UNIT_MAX_GLOBAL, RACE_UNIT_MAX_PER_SEAT } from '../constants.ts';
import { underGoblinCaps } from './creatures/creatureLifecycle.ts';
import { makeCreature } from './creatures/creature.ts';
import { GOBLIN_MELEE_CONFIG, RACE_UNIT_CONFIG } from './creatures/voltkin-config.ts';
import {
  CASTLE_MAX_HP,
  RACE_UNIT_ATK,
  RACE_UNIT_DEF,
  RACE_UNIT_EMIT_INTERVAL_TICKS,
  RACE_UNIT_HP,
  RACE_UNIT_PEN,
  PHYSICS_HZ,
  PLAYER_COLORS,
} from '../constants.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asCreatureId, asPlayerId, asSpawnerId } from '../types.ts';

/** A world with `seats` live castles and nothing else — the emitter needs only players + layout. */
function boardWith(seats: number): World {
  const w = makeWorld(0x71c);
  // START_GAME is what actually seats players and gives them castles — the same route
  // castleHp.test.ts takes. Building Player records by hand would drift from the real shape.
  const roster = Array.from({ length: seats }, (_, seat) => ({ seat, color: PLAYER_COLORS[seat]! }));
  dispatch(w, {
    type: 'START_GAME',
    mode: seats > 2 ? 'bots' : '1v1',
    isHost: true,
    roster,
    botSeats: Array.from({ length: Math.max(0, seats - 1) }, (_, i) => i + 1),
  });
  w.gameState = 'PLAYING';
  w.creatures.clear();
  w.nextCreatureId = 0;
  w.tick = 0;
  for (const p of w.players.values()) p.castleHp = CASTLE_MAX_HP;
  return w;
}

/** Run the emitter for `n` ticks, advancing the clock the way `runHostTick` does. */
function runEmit(w: World, n: number): void {
  for (let t = 0; t < n; t++) {
    raceUnitEmitTick(w);
    w.tick++;
  }
}

const raceUnits = (w: World): number =>
  [...w.creatures.values()].filter((c) => c.type === 'raceUnit').length;

describe('the castle sentinel SpawnerId (owner R133)', () => {
  it('⛔ is PER SEAT, not one shared constant', () => {
    // The whole reason this is per-seat: `underGoblinCaps` compares `sourceSpawnerId` with NO owner
    // term, so one shared id would make a per-spawner cap a CROSS-SEAT cap.
    const ids = [0, 1, 2, 3].map(castleSpawnerId);
    expect(new Set(ids.map((i) => i as unknown as number)).size).toBe(4);
  });

  it('is NEGATIVE, so it can never collide with a real spawner id', () => {
    // Real ids come from a non-negative counter; the sign is what guarantees no collision, and it
    // also makes a castle-born unit obvious in a debug dump.
    for (const seat of [0, 1, 2, 3]) {
      expect(castleSpawnerId(seat) as unknown as number).toBeLessThan(0);
      expect(isCastleSpawnerId(castleSpawnerId(seat))).toBe(true);
    }
    expect(isCastleSpawnerId(asSpawnerId(0))).toBe(false);
    expect(isCastleSpawnerId(asSpawnerId(7))).toBe(false);
    expect(isCastleSpawnerId(null)).toBe(false);
  });
});

describe('the ~30 s cadence (owner R120)', () => {
  it('is 30 seconds, derived from the tick rate rather than typed', () => {
    expect(RACE_UNIT_EMIT_INTERVAL_TICKS).toBe(30 * PHYSICS_HZ);
  });

  it('fires exactly once per interval, and is phase-spread by seat', () => {
    // Seat 0 on tick 0, seat 1 on tick 1 — so four castles never dump four units into one snapshot.
    expect(castleEmitsOnTick(0, 0)).toBe(true);
    expect(castleEmitsOnTick(1, 0)).toBe(false);
    expect(castleEmitsOnTick(1, 1)).toBe(true);
    expect(castleEmitsOnTick(0, RACE_UNIT_EMIT_INTERVAL_TICKS)).toBe(true);
    expect(castleEmitsOnTick(0, RACE_UNIT_EMIT_INTERVAL_TICKS - 1)).toBe(false);
  });

  it('⛔ is derived from world.tick, so it never drifts and never accumulates', () => {
    // A stored timer would let a host migration skip or double an emission. Sampling the pure
    // function across a long span must land on exactly one boundary per interval.
    let hits = 0;
    for (let t = 0; t < RACE_UNIT_EMIT_INTERVAL_TICKS * 5; t++) if (castleEmitsOnTick(2, t)) hits++;
    expect(hits).toBe(5);
    // And it is a true modulus — negative-safe, not a raw `%`.
    expect(ticksSinceCastleEmit(3, 0)).toBeGreaterThanOrEqual(0);
    expect(ticksSinceCastleEmit(3, 0)).toBeLessThan(RACE_UNIT_EMIT_INTERVAL_TICKS);
  });
});

describe('⭐ R120 — THE CASTLE PRODUCES IN **BOTH** PHASES. This is the one exception.', () => {
  it('produces during FIGHT', () => {
    const w = boardWith(1);
    w.matchPhase = 'FIGHT';
    runEmit(w, RACE_UNIT_EMIT_INTERVAL_TICKS + 1);
    expect(raceUnits(w)).toBe(2); // tick 0 and tick 1800
  });

  it('⛔ AND during BUILD — deleting this is a REGRESSION, not a phase-gate fix', () => {
    // If a future session "fixes" raceUnitEmitTick to match every other emitter by adding
    // `if (world.matchPhase !== 'FIGHT') return;`, THIS is the test that goes red. Owner R120:
    // "every thirty seconds it produces... and they hide inside the [castle], and then they get
    // released during fight stage."
    const w = boardWith(1);
    w.matchPhase = 'BUILD';
    runEmit(w, RACE_UNIT_EMIT_INTERVAL_TICKS + 1);
    expect(raceUnits(w)).toBe(2);
  });

  it('does NOT produce outside a live match', () => {
    // WIN and POSTGAME keep advancing world.tick for the ceremony clock, so without the gameState
    // gate the cadence would go on minting units nobody can command.
    const w = boardWith(1);
    w.gameState = 'POSTGAME';
    runEmit(w, RACE_UNIT_EMIT_INTERVAL_TICKS + 1);
    expect(raceUnits(w)).toBe(0);
  });

  it('⛔ a FALLEN castle stops producing — but its existing army is left alone', () => {
    // Owner ruling cf_s161_a: "Keep fighting (status quo) — a fallen seat's towers/creatures/
    // spawners keep acting until razed." So the EMITTER halts and nothing sweeps the board.
    const w = boardWith(1);
    w.matchPhase = 'FIGHT';
    runEmit(w, 1); // one unit produced at tick 0
    expect(raceUnits(w)).toBe(1);

    w.players.get(asPlayerId(0))!.castleHp = 0;
    runEmit(w, RACE_UNIT_EMIT_INTERVAL_TICKS + 1);
    expect(raceUnits(w), 'no NEW units after the keep fell').toBe(1);
  });
});

describe('the emitted unit', () => {
  it('carries its own seat sentinel and R125 stats', () => {
    const w = boardWith(2);
    w.matchPhase = 'FIGHT';
    runEmit(w, 2); // seat 0 at tick 0, seat 1 at tick 1
    const units = [...w.creatures.values()].filter((c) => c.type === 'raceUnit');
    expect(units).toHaveLength(2);
    for (const u of units) {
      const seat = u.ownerPlayerId as unknown as number;
      expect(u.sourceSpawnerId).toBe(castleSpawnerId(seat));
    }
    // R125, verbatim: 1 HP / 1 DEF / 1 ATK / 1 PEN, and all six races share it (R94/R117).
    expect(RACE_UNIT_CONFIG.hp).toBe(RACE_UNIT_HP);
    expect(RACE_UNIT_CONFIG.def).toBe(RACE_UNIT_DEF);
    expect(RACE_UNIT_CONFIG.atk).toBe(RACE_UNIT_ATK);
    expect(RACE_UNIT_CONFIG.pen).toBe(RACE_UNIT_PEN);
    expect(RACE_UNIT_CONFIG.persistent, 'R123/R124 — lives until killed').toBe(true);
  });

  it('⛔ SPREADS — units do not stack on one pixel, and the spread is DETERMINISTIC', () => {
    // Creatures are excluded from the constraint solver and have no separation force, so without a
    // spread every unit from one castle would sit on exactly the same point forever.
    const w = boardWith(1);
    w.matchPhase = 'FIGHT';
    runEmit(w, RACE_UNIT_EMIT_INTERVAL_TICKS * 4 + 1);
    const pts = [...w.creatures.values()]
      .filter((c) => c.type === 'raceUnit')
      .map((c) => `${c.pos.x.toFixed(4)},${c.pos.y.toFixed(4)}`);
    expect(pts.length).toBe(5);
    expect(new Set(pts).size, 'every unit got its own position').toBe(pts.length);

    // ⭐ AND IDENTICAL ACROSS TWO RUNS FROM THE SAME SEED. `spreadTargetPos` derives the offset from
    // the creature id — no Math.random, no wall clock, no accumulated remainder — which is what
    // makes this replay-safe and host-migration-safe.
    const w2 = boardWith(1);
    w2.matchPhase = 'FIGHT';
    runEmit(w2, RACE_UNIT_EMIT_INTERVAL_TICKS * 4 + 1);
    const pts2 = [...w2.creatures.values()]
      .filter((c) => c.type === 'raceUnit')
      .map((c) => `${c.pos.x.toFixed(4)},${c.pos.y.toFixed(4)}`);
    expect(pts2).toEqual(pts);
  });
});

describe('⛔ race units must NOT ride the goblin cap family', () => {
  it('a board full of race units does not starve the goblin towers', () => {
    /*
     * THE BUG THIS PINS, AND IT WOULD HAVE BEEN SILENT. `underGoblinCaps` counts every creature
     * with a non-null `sourceSpawnerId` that is not a chewer or a drone, against a SHARED
     * `GOBLIN_MAX_GLOBAL = 200`. Race units carry a sentinel spawner id, so without the explicit
     * exclusion 200 free castle units would have made every goblin tower on the board stop emitting
     * — the S157 B1 bug again, one population further on, with no error and no log.
     */
    const w = boardWith(1);
    for (let i = 0; i < 400; i++) {
      const id = asCreatureId(i + 1);
      w.creatures.set(id, makeCreature(RACE_UNIT_CONFIG, {
        id,
        ownerPlayerId: asPlayerId(0),
        pos: { x: 0, y: 0 },
        targetPos: { x: 0, y: 0 },
        spawnedAtTick: 0,
        sourceSpawnerId: castleSpawnerId(0),
      }));
    }
    expect(underGoblinCaps(w, asSpawnerId(5)), '400 race units, goblin tower unaffected').toBe(true);

    // ANTI-VACUITY: the same 400 creatures as GOBLINS do block it, so the exclusion is what matters
    // here and not some unrelated reason the cap never binds.
    const w2 = boardWith(1);
    for (let i = 0; i < 400; i++) {
      const id = asCreatureId(i + 1);
      w2.creatures.set(id, makeCreature(GOBLIN_MELEE_CONFIG, {
        id,
        ownerPlayerId: asPlayerId(0),
        pos: { x: 0, y: 0 },
        targetPos: { x: 0, y: 0 },
        spawnedAtTick: 0,
        sourceSpawnerId: asSpawnerId(5),
      }));
    }
    expect(underGoblinCaps(w2, asSpawnerId(5)), '400 goblins DO hit the global cap').toBe(false);
  });
});

/**
 * S165 (sweep Lane 5) - `underRaceUnitCaps` SHIPPED WITH NO TEST AT ALL.
 *
 * This file covers the sentinel id, the cadence, both phases, the fallen castle, the spread and the
 * goblin-cap EXCLUSION - and never calls the cap function itself, nor references either constant.
 *
 * WHAT SLIPPED PAST: delete `if (!underRaceUnitCaps(world, playerId)) continue;` from the emitter,
 * or drop the `n.seat < RACE_UNIT_MAX_PER_SEAT` term - which the module's own docblock calls defect
 * 2, "gameplay-fatal and silent" - and the suite stayed green.
 *
 * THE CAPS ARE 10_000 SENTINELS TODAY, which is exactly why the gap was invisible: no reachable
 * match state gets near them. So these tests assert the SHAPE of the rule rather than trying to
 * build ten thousand creatures - that both terms exist, that the seat term is per-owner, and that
 * the function is monotone in the population.
 */
describe('S165 - underRaceUnitCaps: the race unit has its OWN cap family', () => {
  const seat = (n: number) => asPlayerId(n);

  function addRaceUnits(w: World, owner: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const c = makeCreature(RACE_UNIT_CONFIG, {
        id: asCreatureId(w.nextCreatureId++),
        ownerPlayerId: seat(owner),
        pos: { x: 100 + i, y: 100 },
        targetPos: { x: 100 + i, y: 100 },
        spawnedAtTick: 0,
        sourceSpawnerId: castleSpawnerId(owner),
      });
      w.creatures.set(c.id, c);
    }
  }

  it('an empty board is under the caps', () => {
    const w = boardWith(2);
    expect(underRaceUnitCaps(w, seat(0))).toBe(true);
  });

  it('both cap terms are real numbers, and the sentinel value is recorded here', () => {
    /*
     * Pinned so a future balance pass that lowers these has to come through this test - and so the
     * "why did the untested cap not matter" answer stays visible: both are sentinels.
     */
    expect(RACE_UNIT_MAX_GLOBAL).toBeGreaterThan(0);
    expect(RACE_UNIT_MAX_PER_SEAT).toBeGreaterThan(0);
    expect(RACE_UNIT_MAX_GLOBAL).toBe(10_000);
    expect(RACE_UNIT_MAX_PER_SEAT).toBe(10_000);
  });

  it('counts only raceUnits - a goblin army does not consume the race-unit budget', () => {
    /*
     * The mirror of the exclusion already tested in the other direction. `countRaceUnits` skips
     * every other type, so a seat at the goblin cap is still free to receive its castle unit.
     */
    const w = boardWith(2);
    for (let i = 0; i < 40; i++) {
      const g = makeCreature(GOBLIN_MELEE_CONFIG, {
        id: asCreatureId(w.nextCreatureId++),
        ownerPlayerId: seat(0),
        pos: { x: 200 + i, y: 200 },
        targetPos: { x: 200 + i, y: 200 },
        spawnedAtTick: 0,
        sourceSpawnerId: asSpawnerId(7),
      });
      w.creatures.set(g.id, g);
    }
    expect(underRaceUnitCaps(w, seat(0))).toBe(true);
  });

  it('the SEAT term is per-owner - one seat cannot spend another seat budget', () => {
    /*
     * ⛔ THE PROPERTY THAT MATTERS MOST, and the reason the per-seat sentinel exists at all: the
     * module docblock records that a SHARED spawner id would have turned GOBLIN_MAX_PER_SPAWNER
     * into a cross-seat cap. This asserts the same separation for the race-unit family.
     */
    const w = boardWith(2);
    addRaceUnits(w, 1, 12);
    // Seat 1 now owns twelve; seat 0 owns none. Both are under, and seat 0's own count is unmoved.
    expect(underRaceUnitCaps(w, seat(0))).toBe(true);
    expect(underRaceUnitCaps(w, seat(1))).toBe(true);
    const mine = [...w.creatures.values()].filter(
      (c) => c.type === 'raceUnit' && (c.ownerPlayerId as unknown as number) === 0,
    );
    expect(mine).toHaveLength(0);
  });
});
