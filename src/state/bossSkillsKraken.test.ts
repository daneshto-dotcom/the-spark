/**
 * SPARK — S169 (owner R139) — THE KRAKEN'S SONAR WAVE.
 *
 * > *"Sonar wave - spat from his mouth: stuns and pushes back all enemies in a cone around him."*
 *
 * S167 costed this as *"the largest engineering surface of the three"* — stun, knockback and cone,
 * none of which the sim had. STUN shipped separately as a general condition (R152); this file pins
 * the other two and, more importantly, their COMPOSITION: a stun that hard-stopped the victim would
 * silently eat the shove, and both halves come from one owner sentence.
 *
 * The geometry is tested as a PURE function first (`inCone`) and only then through the runner, so a
 * failure says whether the maths or the wiring is wrong rather than leaving both suspect.
 */

import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  GOBLIN_ATTACK_RANGE,
  KRAKEN_SONAR_COS_HALF_ANGLE,
  KRAKEN_SONAR_INTERVAL_TICKS,
  KRAKEN_SONAR_RANGE,
  KRAKEN_SONAR_STUN_TICKS,
  PHYSICS_SUBSTEPS,
  PLAYER_COLORS,
  VELOCITY_DAMPING,
  WORLD_EDGE_MARGIN,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import {
  KRAKEN_SONAR_KNOCKBACK_PX,
  KRAKEN_SONAR_SHOVE_PER_SUBSTEP,
  applySonarShove,
  inCone,
  nearestEnemyFor,
  runKrakenSonar,
} from './bossSkillsKraken.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import { applyStun, isStunned } from './creatures/creature.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';
import { computeSteeringAccel, creatureVerletStep, ZERO_ACCEL } from '../physics/creatureVerlet.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const RSQ = KRAKEN_SONAR_RANGE * KRAKEN_SONAR_RANGE;

function krakenWorld(): { world: World; bossId: CreatureId } {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: T9_BOSS_TYPE.nagas as never,
    ownerPlayerId: P0,
    pos: { x: 500, y: 500 },
    targetPos: { x: 500, y: 500 },
  });
  const boss = [...world.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.nagas)!;
  return { world, bossId: boss.id };
}

/*
 * ⛔⛔ EVERY ENEMY CARRIES A `sourceSpawnerId`, AND THE FIRST DRAFT OF THIS HELPER DID NOT — WHICH
 * QUIETLY MADE THREE TESTS TEST ONE CREATURE.
 *
 * A `SPAWN_CREATURE` with no spawner goes down `applySpawnCreature`'s NULL-SPAWNER branch, whose
 * gate is "one live creature per (owner, type)" — the very latch this session exempted the tier-9
 * boss from (S169, the two-pharaohs bug). So the SECOND `goblinMelee` for P1 was silently refused,
 * `spawnEnemy` handed back the FIRST one again, and the "unit behind the Kraken" WAS the unit in
 * front of it. The behind-test failed with "expected true to be false" and was right to.
 *
 * A spawner id routes the spawn down the goblin-population path (10 per spawner, 200 global)
 * instead, so a fixture can field a crowd. The post-condition below makes a silent refusal
 * impossible to miss again — a fixture that returns a duplicate must throw, not mislead.
 */
let nextSpawner = 1;
function spawnEnemy(world: World, x: number, y: number, owner = P1): CreatureId {
  const before = world.creatures.size;
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: 'goblinMelee' as never,
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: nextSpawner++ as never,
  });
  if (world.creatures.size !== before + 1) {
    throw new Error('fixture: the spawn was REFUSED — a population gate ate it, so this test would silently reuse an existing creature');
  }
  let newest: CreatureId | null = null;
  for (const c of world.creatures.values()) {
    if (c.type === 'goblinMelee' && (newest === null || (c.id as number) > (newest as number))) newest = c.id;
  }
  return newest!;
}

/** Advance to the next tick on which a boss with `bossId` is due to fire. */
function fireOnce(world: World, bossId: CreatureId): void {
  for (let i = 0; i < KRAKEN_SONAR_INTERVAL_TICKS + 2; i++) {
    world.tick++;
    if ((world.tick + (bossId as number)) % KRAKEN_SONAR_INTERVAL_TICKS === 0) {
      runKrakenSonar(world);
      return;
    }
  }
  throw new Error('fixture: never reached a due tick');
}

describe('S169 R139 — the cone geometry, as a pure function', () => {
  const apex = { x: 0, y: 0 };
  const axis = { x: 1, y: 0 }; // pointing +x

  it('⭐ a target straight down the axis is inside', () => {
    expect(inCone(apex, axis, { x: 100, y: 0 }, KRAKEN_SONAR_COS_HALF_ANGLE, RSQ)).toBe(true);
  });

  it('⛔⛔ the MIRROR of the cone, directly BEHIND the apex, is OUTSIDE', () => {
    // The whole reason the implementation keeps a positive-dot guard: squaring both sides of the
    // half-angle test loses the sign, so without it the Kraken would spit backwards as well.
    expect(inCone(apex, axis, { x: -100, y: 0 }, KRAKEN_SONAR_COS_HALF_ANGLE, RSQ)).toBe(false);
  });

  it('⭐ the 120° cone accepts ±59° and rejects ±61° — the boundary, from both sides', () => {
    // cos 60° = 0.5 is the constant, so the half-angle is 60° and the full cone 120°.
    const at = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      return { x: Math.cos(r) * 100, y: Math.sin(r) * 100 };
    };
    for (const d of [0, 30, 59, -30, -59]) {
      expect(inCone(apex, axis, at(d), KRAKEN_SONAR_COS_HALF_ANGLE, RSQ), `${d}° inside`).toBe(true);
    }
    for (const d of [61, 90, 120, -61, -90, 179]) {
      expect(inCone(apex, axis, at(d), KRAKEN_SONAR_COS_HALF_ANGLE, RSQ), `${d}° outside`).toBe(false);
    }
  });

  it('⭐ range still applies — dead ahead but too far is outside', () => {
    expect(inCone(apex, axis, { x: KRAKEN_SONAR_RANGE + 1, y: 0 }, KRAKEN_SONAR_COS_HALF_ANGLE, RSQ)).toBe(false);
    expect(inCone(apex, axis, { x: KRAKEN_SONAR_RANGE - 1, y: 0 }, KRAKEN_SONAR_COS_HALF_ANGLE, RSQ)).toBe(true);
  });

  it('⭐ degenerate inputs are decided, not accidental: apex hits, zero axis misses', () => {
    expect(inCone(apex, axis, { x: 0, y: 0 }, KRAKEN_SONAR_COS_HALF_ANGLE, RSQ), 'on the apex').toBe(true);
    expect(inCone(apex, { x: 0, y: 0 }, { x: 10, y: 0 }, KRAKEN_SONAR_COS_HALF_ANGLE, RSQ), 'no axis').toBe(false);
  });

  it('⛔ NO TRIGONOMETRY on the sim path — the module calls no transcendental for the test', () => {
    // `Math.sqrt` is used once, for the knockback UNIT VECTOR, which is not the cone test. acos/atan2
    // would be the determinism hazard `creatureVerlet`'s Δ7 note already flags.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const src = readFileSync(join(process.cwd(), 'src', 'state', 'bossSkillsKraken.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    for (const bad of ['Math.acos', 'Math.atan2', 'Math.cos', 'Math.sin', 'Math.random']) {
      expect(src.includes(bad), `${bad} must not reach the sim`).toBe(false);
    }
  });
});

describe('S169 R139 — the axis is chosen by a TOTAL ORDER', () => {
  it('⛔⛔ two enemies at IDENTICAL distance resolve by id, never by Map order', () => {
    // Map iteration is insertion order, and letting it settle a tie is how S155 N1 handed one seat
    // every melee exchange for a whole match. Same distance, opposite sides: the LOWER id must win
    // regardless of which was inserted first.
    const a = krakenWorld();
    const first = spawnEnemy(a.world, 600, 500);
    const second = spawnEnemy(a.world, 400, 500);
    const boss = a.world.creatures.get(a.bossId)!;
    const picked = nearestEnemyFor(a.world, boss, RSQ)!;
    expect(picked.id).toBe(Math.min(first as number, second as number) as never);
  });

  it('⭐ a strictly nearer enemy wins over a lower id', () => {
    const { world, bossId } = krakenWorld();
    spawnEnemy(world, 700, 500); // farther, lower id
    const near = spawnEnemy(world, 520, 500); // nearer, higher id
    const boss = world.creatures.get(bossId)!;
    expect(nearestEnemyFor(world, boss, RSQ)!.id).toBe(near);
  });

  it('⭐ own units are never the axis, and out-of-range enemies are ignored', () => {
    const { world, bossId } = krakenWorld();
    spawnEnemy(world, 520, 500, P0); // friendly, very close
    const boss = world.creatures.get(bossId)!;
    expect(nearestEnemyFor(world, boss, RSQ), 'a friendly may not aim the wave').toBeNull();

    spawnEnemy(world, 500 + KRAKEN_SONAR_RANGE + 50, 500, P1); // enemy, out of reach
    expect(nearestEnemyFor(world, boss, RSQ)).toBeNull();
  });
});

describe('S169 R139 — the wave stuns and pushes back', () => {
  it('⭐⭐ an enemy in the cone is STUNNED for the full duration', () => {
    const { world, bossId } = krakenWorld();
    const victim = spawnEnemy(world, 620, 500);
    fireOnce(world, bossId);
    const v = world.creatures.get(victim)!;
    expect(isStunned(v, world.tick), 'stunned now').toBe(true);
    expect(v.stunnedUntilTick).toBe(world.tick + KRAKEN_SONAR_STUN_TICKS);
  });

  it('⭐⭐ and PUSHED BACK — as an impulse (prevPos moves), not a teleport (pos does not)', () => {
    const { world, bossId } = krakenWorld();
    const victim = spawnEnemy(world, 620, 500);
    const before = { ...world.creatures.get(victim)!.pos };
    const prevBefore = { ...world.creatures.get(victim)!.prevPos };
    fireOnce(world, bossId);
    const v = world.creatures.get(victim)!;
    expect(v.pos, 'position is NOT teleported').toEqual(before);
    // prevPos dragged TOWARD the Kraken ⇒ implicit velocity points AWAY from it.
    expect(v.prevPos.x).toBeLessThan(prevBefore.x);
    expect(v.pos.x - v.prevPos.x, 'outward velocity').toBeGreaterThan(0);
  });

  it('⛔ a unit BEHIND the Kraken is untouched — neither stunned nor shoved', () => {
    const { world, bossId } = krakenWorld();
    const aim = spawnEnemy(world, 620, 500); // in front: this sets the axis
    const behind = spawnEnemy(world, 380, 500); // directly opposite
    fireOnce(world, bossId);
    expect(isStunned(world.creatures.get(aim)!, world.tick), 'the aimed unit IS hit').toBe(true);
    const b = world.creatures.get(behind)!;
    expect(isStunned(b, world.tick), 'the unit behind is NOT hit').toBe(false);
    expect(b.prevPos.x, 'and not shoved either').toBe(b.pos.x);
  });

  it('⛔⛔ NO FRIENDLY FIRE — his own escort standing in the cone is untouched', () => {
    const { world, bossId } = krakenWorld();
    spawnEnemy(world, 620, 500); // the enemy that aims it
    const friend = spawnEnemy(world, 600, 500, P0); // his own, squarely inside the cone
    fireOnce(world, bossId);
    expect(isStunned(world.creatures.get(friend)!, world.tick)).toBe(false);
  });

  it('⭐ several enemies across the cone are all caught in one wave', () => {
    /*
     * ⚠ THE GEOMETRY IS DELIBERATE, AND THE FIRST DRAFT GOT IT WRONG IN AN INSTRUCTIVE WAY.
     *
     * It placed enemies at 0°, +31° and -31° and expected all three. But the +31° one was NEARER
     * than the one dead ahead, so IT became the axis, the cone swung to centre on +31°, and the
     * -31° enemy fell outside its -29° edge. The code was right and the test's assumption was
     * wrong: this cone SELF-AIMS, so "all enemies in the cone" always depends on which enemy aimed
     * it — which is worth knowing about the skill, not just about the test.
     *
     * The aim target is now unambiguously closest (dead ahead, 100 px) and the other two sit FARTHER
     * out at ±23°, comfortably inside the ±60° half-angle of an axis they cannot steal.
     */
    const { world, bossId } = krakenWorld();
    const ids = [
      spawnEnemy(world, 600, 500), // 0°, 100 px — the axis
      spawnEnemy(world, 640, 560), // +23°, 152 px
      spawnEnemy(world, 640, 440), // -23°, 152 px
    ];
    fireOnce(world, bossId);
    for (const id of ids) {
      expect(isStunned(world.creatures.get(id)!, world.tick), `victim ${id}`).toBe(true);
    }
  });

  it('⚠ a STUNNED Kraken spits nothing — two of them cannot lock each other and still clear the board', () => {
    const { world, bossId } = krakenWorld();
    const victim = spawnEnemy(world, 620, 500);
    applyStun(world.creatures.get(bossId)!, world.tick + 10_000);
    fireOnce(world, bossId);
    expect(isStunned(world.creatures.get(victim)!, world.tick)).toBe(false);
  });

  it('⭐ no enemy in reach ⇒ no wave at all (no axis, nothing to aim at)', () => {
    const { world, bossId } = krakenWorld();
    expect(() => fireOnce(world, bossId)).not.toThrow();
    expect([...world.creatures.values()].every((c) => c.stunnedUntilTick === undefined)).toBe(true);
  });
});

describe('S169 R139 — stun and knockback COMPOSE (the reason gate 2 coasts)', () => {
  it('⭐⭐ the shoved victim keeps sliding while stunned — the stun does not eat the impulse', () => {
    // ⛔ THIS IS THE ASSERTION THE WHOLE DESIGN TURNS ON. STUN gate 2 returns ZERO_ACCEL, which the
    // verlet module documents as COAST-not-stop. Had it hard-stopped instead, "stuns AND pushes
    // back" would have cancelled itself and the wave would look like a pure stun.
    const { world, bossId } = krakenWorld();
    const victim = spawnEnemy(world, 620, 500);
    fireOnce(world, bossId);
    const v = world.creatures.get(victim)!;
    expect(isStunned(v, world.tick), 'precondition: stunned').toBe(true);
    const startX = v.pos.x;

    // Integrate the victim forward exactly as the physics loop does — and crucially, feed it the
    // accel the STUN GATE returns, not zero by assumption. That is what makes this a composition
    // test rather than two separate ones sitting next to each other.
    for (let i = 0; i < 40; i++) {
      creatureVerletStep(v, 1 / 480, computeSteeringAccel(v, world.tick));
    }

    expect(v.pos.x, 'it slid OUTWARD despite being stunned').toBeGreaterThan(startX);
  });

  it('CONTROL — the gate really is returning ZERO_ACCEL here, so the slide is the IMPULSE', () => {
    // Without this, the test above would still pass if the stun gate were removed and the victim
    // simply steered away under its own power — the opposite of what is being claimed.
    const { world, bossId } = krakenWorld();
    const victim = spawnEnemy(world, 620, 500);
    fireOnce(world, bossId);
    const v = world.creatures.get(victim)!;
    expect(computeSteeringAccel(v, world.tick)).toBe(ZERO_ACCEL);
  });
});

/*
 * ⭐⭐ S189 C10 (owner) — **A SHORT KNOCKBACK, HELD TO THE BOARD, AND A STUN.**
 *
 * > *"the Kraken sonar sends units flying … outside the map … it should like move them … knock them
 * > back a little bit … and stun them"* — owner, S189
 *
 * The old `KRAKEN_SONAR_KNOCKBACK = 26` was a displacement used as a per-SUBSTEP velocity: a coasting
 * stunned unit travelled ≈ 425× it (~11,000 px) and stopped only at the board edge. The shove is now
 * DERIVED from a distance (`KRAKEN_SONAR_KNOCKBACK_PX`, 70 px — MINE) so the stunned coast covers
 * exactly that. ⭐ MUTATION-TESTED: restoring the 26 px/substep impulse turns the host-tick case red.
 */
describe('S189 C10 — the sonar knocks back a LITTLE, stays on the board, and stuns', () => {
  it('the arithmetic: the impulse coasts exactly KRAKEN_SONAR_KNOCKBACK_PX over the stun', () => {
    expect(KRAKEN_SONAR_KNOCKBACK_PX).toBe(2 * GOBLIN_ATTACK_RANGE);
    const n = KRAKEN_SONAR_STUN_TICKS * PHYSICS_SUBSTEPS;
    let sum = 0;
    let f = 1;
    for (let k = 0; k < n; k++) {
      f *= VELOCITY_DAMPING;
      sum += f;
    }
    expect(KRAKEN_SONAR_SHOVE_PER_SUBSTEP * sum).toBeCloseTo(KRAKEN_SONAR_KNOCKBACK_PX, 9);
    // And a unit really moves that far under the real integrator with the stun gate's ZERO_ACCEL.
    const { world } = krakenWorld();
    const v = world.creatures.get(spawnEnemy(world, 900, 500))!;
    v.prevPos.x = v.pos.x;
    v.prevPos.y = v.pos.y; // at rest
    const x0 = v.pos.x;
    applySonarShove(v, 1, 0);
    for (let k = 0; k < n; k++) creatureVerletStep(v, 1 / 480, ZERO_ACCEL);
    expect(v.pos.x - x0).toBeCloseTo(KRAKEN_SONAR_KNOCKBACK_PX, 6);
    // ⛔ the regression, in one number: the old shove was over a hundred times this one.
    expect(26 / KRAKEN_SONAR_SHOVE_PER_SUBSTEP).toBeGreaterThan(100);
  });

  /** A 1v1 through START_GAME so the real host tick has a layout, with the Kraken for seat 0. */
  function hostKrakenBoard(): { world: World; bossId: CreatureId } {
    const world = makeWorld(0xc10);
    world.gameState = 'TITLE';
    dispatch(world, {
      type: 'START_GAME',
      mode: '1v1',
      isHost: true,
      roster: [
        { seat: 0, color: PLAYER_COLORS[0] },
        { seat: 1, color: PLAYER_COLORS[1] },
      ],
    } as never);
    world.gameState = 'PLAYING';
    world.isHost = true;
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + 1_000_000;
    world.creatures.clear();
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: T9_BOSS_TYPE.nagas as never,
      ownerPlayerId: P0,
      pos: { x: 700, y: 540 },
      targetPos: { x: 700, y: 540 },
    });
    const boss = [...world.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.nagas)!;
    return { world, bossId: boss.id };
  }

  const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
  function hostDeps(): HostTickDeps {
    return {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
      controls: stubControls,
      botManager: null,
      gameStateExtras: makeGameStateExtras(),
      alivePeerIds: null,
      hostSeats: new Map(),
    } as unknown as HostTickDeps;
  }

  const onBoard = (p: { x: number; y: number }): boolean =>
    p.x >= WORLD_EDGE_MARGIN &&
    p.x <= CANVAS_WIDTH - WORLD_EDGE_MARGIN &&
    p.y >= WORLD_EDGE_MARGIN &&
    p.y <= CANVAS_HEIGHT - WORLD_EDGE_MARGIN;

  /**
   * Put the boss `lead` ticks from being due by moving the CLOCK, not by running up to it: a run-up can
   * take a whole 540-tick interval, and the Kraken marches off its mark in the meantime.
   */
  function runUntilDueIn(world: World, bossId: CreatureId, lead: number, d: HostTickDeps, s: ReturnType<typeof makeHostTickState>): void {
    while ((world.tick + lead + (bossId as number)) % KRAKEN_SONAR_INTERVAL_TICKS !== 0) world.tick += 1;
    world.phaseEndsAtTick = world.tick + 1_000_000;
    void d;
    void s;
  }

  /**
   * The REAL host tick: a victim is dropped in (at rest, SPAWNING = force-free) 10 ticks before the
   * Kraken is due, the wave hits it, then the loop runs through the whole stun. The Kraken is held by a
   * stun of its own AFTER it has spat, so it cannot walk up and kill the unit being measured.
   */
  function waveThroughHostTick(victimAt: { x: number; y: number }, bossX = 700): {
    start: { x: number; y: number };
    end: { x: number; y: number };
    offBoard: number;
    stunned: boolean;
  } {
    const { world, bossId } = hostKrakenBoard();
    const boss = world.creatures.get(bossId)!;
    boss.pos.x = bossX;
    boss.prevPos.x = bossX;
    const d = hostDeps();
    const s = makeHostTickState(world);
    runUntilDueIn(world, bossId, 10, d, s);
    const vid = spawnEnemy(world, victimAt.x, victimAt.y);
    let start: { x: number; y: number } | null = null;
    let stunned = false;
    for (let t = 0; t < 20 && start === null; t++) {
      runHostTick(world, d, s);
      const v = world.creatures.get(vid)!;
      if (v.stunnedUntilTick !== undefined) {
        start = { x: v.pos.x, y: v.pos.y };
        stunned = isStunned(v, world.tick);
        applyStun(world.creatures.get(bossId)!, world.tick + 10_000);
      }
    }
    if (start === null) throw new Error('fixture: the wave never reached the victim');
    const v = world.creatures.get(vid)!;
    const until = v.stunnedUntilTick!;
    let offBoard = 0;
    while (world.tick < until) {
      runHostTick(world, d, s);
      if (!onBoard(v.pos)) offBoard += 1;
    }
    return { start, end: { x: v.pos.x, y: v.pos.y }, offBoard, stunned };
  }

  it('⭐⭐ REACH, THROUGH THE REAL HOST TICK: a unit in the cone is stunned and slides ~70 px, not across the map', () => {
    const r = waveThroughHostTick({ x: 900, y: 540 }); // 200 px in front of the Kraken
    expect(r.stunned).toBe(true);
    const moved = Math.hypot(r.end.x - r.start.x, r.end.y - r.start.y);
    expect(moved).toBeGreaterThan(KRAKEN_SONAR_KNOCKBACK_PX * 0.9);
    expect(moved).toBeLessThan(KRAKEN_SONAR_KNOCKBACK_PX * 1.1);
    expect(r.end.x, 'pushed AWAY from the Kraken').toBeGreaterThan(r.start.x);
    expect(r.offBoard).toBe(0);
  });

  it('⭐ AT THE EDGE: a unit shoved toward the touchline is held on the board, pressed at the margin', () => {
    const hiX = CANVAS_WIDTH - WORLD_EDGE_MARGIN;
    const r = waveThroughHostTick({ x: hiX - 30, y: 540 }, 1690); // 30 px from the margin, dead ahead
    expect(r.stunned).toBe(true);
    expect(r.offBoard).toBe(0);
    // It reached the margin: the clamp was exercised, not merely present.
    expect(r.end.x).toBe(hiX);
  });

  it('negative — a unit BEHIND the Kraken, at rest, does not move at all through the wave', () => {
    const { world, bossId } = hostKrakenBoard();
    const d = hostDeps();
    const s = makeHostTickState(world);
    runUntilDueIn(world, bossId, 10, d, s);
    // ⚠ The aim unit must be the NEARER one, or the cone self-aims at the other (see the S169 note
    // above on the 'several enemies' case): 150 px ahead vs 180 px behind.
    const aim = spawnEnemy(world, 850, 540); // in front: sets the axis
    const behind = spawnEnemy(world, 520, 540); // directly opposite, inside the range
    const b0 = { ...world.creatures.get(behind)!.pos };
    let fired = false;
    for (let t = 0; t < 20 && !fired; t++) {
      runHostTick(world, d, s);
      fired = world.creatures.get(aim)!.stunnedUntilTick !== undefined;
    }
    expect(fired).toBe(true);
    const b = world.creatures.get(behind)!;
    expect(b.stunnedUntilTick).toBeUndefined();
    expect(b.pos).toEqual(b0); // still SPAWNING, force-free, and never shoved
  });

  /*
   * ⭐⭐ S189 audit U1 — **A UNIT WALKING INTO THE KRAKEN IS KNOCKED BACK TOO, NOT CARRIED THROUGH.**
   *
   * The first cut ADDED the shove to the victim's current velocity. Every test above used a victim at
   * rest, so none could see that a unit walking toward him faster than ~79 px/s — a plain goblin walks
   * ~146 px/s — kept coming, and ended the 2 s stun CLOSER (the audit's recurrence: −59 px for a goblin,
   * −115 px at Voltkin speed). The shove now REPLACES the velocity, so every victim coasts the same
   * `KRAKEN_SONAR_KNOCKBACK_PX` out. ⭐ Mutation-checked by restoring the additive form.
   */
  it('⭐⭐ REACH (audit U1): a goblin SEEKING at top speed INTO the Kraken ends ~70 px FARTHER away', () => {
    const { world, bossId } = hostKrakenBoard();
    const boss = world.creatures.get(bossId)!;
    const d = hostDeps();
    const s = makeHostTickState(world);
    // Hold the Kraken still and silent while the goblin walks in (a stunned boss neither moves nor spits).
    applyStun(boss, world.tick + 1_000_000);
    const vid = spawnEnemy(world, 1300, 540); // marching on seat 0's keep, straight through the Kraken
    let v = world.creatures.get(vid)!;
    let t = 0;
    for (; t < 2000; t++) {
      runHostTick(world, d, s);
      v = world.creatures.get(vid)!;
      if (v.state === 'SEEKING' && Math.hypot(v.pos.x - boss.pos.x, v.pos.y - boss.pos.y) < 240) break;
    }
    expect(t, 'fixture: the goblin never reached the wave').toBeLessThan(2000);
    // It is walking INTO him, at speed: the component of its velocity toward the Kraken, per second.
    const toward = { x: boss.pos.x - v.pos.x, y: boss.pos.y - v.pos.y };
    const tl = Math.hypot(toward.x, toward.y);
    const closing = (((v.pos.x - v.prevPos.x) * toward.x + (v.pos.y - v.prevPos.y) * toward.y) / tl) * 480;
    expect(closing, 'fixture: the goblin must be closing faster than the old break-even ~79 px/s').toBeGreaterThan(100);

    // Release the Kraken and make him due on the very next tick.
    delete boss.stunnedUntilTick;
    while ((world.tick + 1 + (bossId as number)) % KRAKEN_SONAR_INTERVAL_TICKS !== 0) world.tick += 1;
    world.phaseEndsAtTick = world.tick + 1_000_000;
    runHostTick(world, d, s);
    v = world.creatures.get(vid)!;
    expect(v.stunnedUntilTick, 'the wave hit the goblin').toBeDefined();
    const k = { x: boss.pos.x, y: boss.pos.y };
    const startDist = Math.hypot(v.pos.x - k.x, v.pos.y - k.y);
    applyStun(boss, world.tick + 1_000_000); // he may not walk up and kill what we are measuring
    const until = v.stunnedUntilTick!;
    while (world.tick < until - 1) runHostTick(world, d, s);
    const endDist = Math.hypot(v.pos.x - k.x, v.pos.y - k.y);
    expect(endDist - startDist).toBeGreaterThan(KRAKEN_SONAR_KNOCKBACK_PX * 0.9);
    expect(endDist - startDist).toBeLessThan(KRAKEN_SONAR_KNOCKBACK_PX * 1.1);
  });
});
