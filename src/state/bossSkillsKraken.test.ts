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
  KRAKEN_SONAR_COS_HALF_ANGLE,
  KRAKEN_SONAR_INTERVAL_TICKS,
  KRAKEN_SONAR_RANGE,
  KRAKEN_SONAR_STUN_TICKS,
  PLAYER_COLORS,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { inCone, nearestEnemyFor, runKrakenSonar } from './bossSkillsKraken.ts';
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
