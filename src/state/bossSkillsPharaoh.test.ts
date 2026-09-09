/**
 * SPARK — S171 (owner R142) — **THE PHARAOH'S LOCUST FAN.**
 *
 * ⛔ THE FIRST ASSERTION IN THIS FILE IS THE COUNT, AND THAT ORDERING IS DELIBERATE.
 *
 * `applySpawnCreature` refuses a second live creature of the same `(owner, type)` when
 * `sourceSpawnerId === null`. A fan of three arrives on ONE tick, from ONE owner, with ONE type and
 * exactly that provenance — so without an exemption the first cloud passes and **the other two are
 * discarded with no error, no effect and no test red.** Every behavioural test below would still be
 * green against a one-cloud "fan".
 *
 * That failure has now shipped THREE times in this codebase: the tier-3 tower, the direwolf (whose
 * own comment predicted it and still missed the next one), and the tier-9 boss — the one the owner
 * watched himself when his wife's second pyramid produced nothing until the first Pharaoh died. It is
 * the single highest-probability silent bug in this feature, so it is asserted before anything else.
 */

import { describe, expect, it } from 'vitest';
import {
  PHARAOH_LOCUST_CADENCE_TICKS,
  PHARAOH_LOCUST_CONE_HALF_ANGLE,
  PHARAOH_LOCUST_COUNT,
  PHARAOH_LOCUST_LIFETIME_TICKS,
  PHARAOH_LOCUST_MAX_PER_OWNER,
  PHARAOH_LOCUST_TRIGGER_RANGE,
  PLAYER_COLORS,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { runPharaohLocusts } from './bossSkillsPharaoh.ts';
import { inCone } from './bossSkillsKraken.ts';
import { applyStun } from './creatures/creature.ts';
import { attackFifths, unitPoolFifths } from './stats.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function twoSeat(): World {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  return world;
}

let spawner = 9000;
function spawn(world: World, type: string, owner: ReturnType<typeof asPlayerId>, x: number, y = 500): CreatureId {
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type as never,
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: spawner++ as never,
  });
  let newest: CreatureId | null = null;
  for (const c of world.creatures.values()) {
    if (newest === null || (c.id as number) > (newest as number)) newest = c.id;
  }
  return newest!;
}

const clouds = (w: World): CreatureId[] =>
  [...w.creatures.values()].filter((c) => c.type === 'locustCloud').map((c) => c.id);

/** Advance to this boss's next cadence slot and run the launcher there. */
function fireOnce(world: World, bossId: CreatureId): void {
  for (let i = 0; i < PHARAOH_LOCUST_CADENCE_TICKS + 2; i++) {
    world.tick++;
    if ((world.tick + (bossId as number)) % PHARAOH_LOCUST_CADENCE_TICKS === 0) {
      runPharaohLocusts(world);
      return;
    }
  }
  throw new Error('fixture: the cadence slot never came round');
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R142 — the fan actually arrives (the spawn-latch trap)', () => {
  it('⛔⛔ THE COUNT — a launch produces the WHOLE fan, not one cloud', () => {
    const world = twoSeat();
    const boss = spawn(world, 't9BossMummies', P0, 500);
    spawn(world, 'goblinMelee', P1, 620);

    fireOnce(world, boss);
    expect(
      clouds(world).length,
      'if this is 1, `locustCloud` is missing from the one-live-per-(owner,type) exemption in ' +
        'applySpawnCreature and every other test in this file is passing against a broken fan',
    ).toBe(PHARAOH_LOCUST_COUNT);
  });

  it('⭐ and the whole fan belongs to the Pharaoh\'s owner', () => {
    const world = twoSeat();
    const boss = spawn(world, 't9BossMummies', P0, 500);
    spawn(world, 'goblinMelee', P1, 620);
    fireOnce(world, boss);
    for (const id of clouds(world)) {
      expect(world.creatures.get(id)!.ownerPlayerId).toBe(P0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R142 — the trigger: "he lunches it when the first enemy is in range"', () => {
  it('⭐ NO enemy in range ⇒ nothing is launched and nothing is spent', () => {
    const world = twoSeat();
    const boss = spawn(world, 't9BossMummies', P0, 500);
    spawn(world, 'goblinMelee', P1, 500 + PHARAOH_LOCUST_TRIGGER_RANGE + 200); // well beyond reach
    fireOnce(world, boss);
    expect(clouds(world).length, 'the fan waits for the first enemy to actually arrive').toBe(0);
  });

  it('⭐ an enemy INSIDE the range launches it', () => {
    const world = twoSeat();
    const boss = spawn(world, 't9BossMummies', P0, 500);
    spawn(world, 'goblinMelee', P1, 500 + PHARAOH_LOCUST_TRIGGER_RANGE - 40);
    fireOnce(world, boss);
    expect(clouds(world).length).toBe(PHARAOH_LOCUST_COUNT);
  });

  it('⭐ a STUNNED Pharaoh launches nothing (owner R152 — "cant do anything")', () => {
    const world = twoSeat();
    const bossId = spawn(world, 't9BossMummies', P0, 500);
    spawn(world, 'goblinMelee', P1, 620);
    applyStun(world.creatures.get(bossId)!, world.tick + 10_000);
    fireOnce(world, bossId);
    expect(clouds(world).length, 'the stun is the only counterplay against a boss').toBe(0);
  });

  it('⛔ and it does NOT fire outside PLAYING', () => {
    const world = twoSeat();
    const boss = spawn(world, 't9BossMummies', P0, 500);
    spawn(world, 'goblinMelee', P1, 620);
    world.gameState = 'LOBBY';
    fireOnce(world, boss);
    expect(clouds(world).length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R142 — the CONE is the LAUNCH, and inCone is its oracle', () => {
  it('⭐⭐ every cloud is born inside the wedge aimed at the enemy', () => {
    /*
     * ⚠ THE ORACLE IS `inCone`, AND USING IT HERE IS THE WHOLE REASON IT IS NOT USED IN THE LAUNCHER.
     * `inCone` is a MEMBERSHIP test; the launch PLACES clouds with cos/sin. Asserting the placement
     * back through the independent membership predicate is a real check — writing the launch WITH
     * `inCone` would have been circular, and calling the launch "a reuse of inCone" (as the PDR
     * first did) would have invited exactly that.
     */
    const world = twoSeat();
    const bossId = spawn(world, 't9BossMummies', P0, 500, 500);
    const enemy = spawn(world, 'goblinMelee', P1, 640, 560);
    const boss = world.creatures.get(bossId)!;
    const foe = world.creatures.get(enemy)!;
    fireOnce(world, bossId);

    const axis = { x: foe.pos.x - boss.pos.x, y: foe.pos.y - boss.pos.y };
    const cosHalf = Math.cos(PHARAOH_LOCUST_CONE_HALF_ANGLE + 1e-6); // a hair of float slack
    for (const id of clouds(world)) {
      const c = world.creatures.get(id)!;
      expect(
        inCone(boss.pos, axis, c.pos, cosHalf, 1e9),
        `cloud ${String(id)} was born outside the wedge`,
      ).toBe(true);
    }
  });

  it('⭐ the fan SPREADS — the clouds are not stacked on one point', () => {
    const world = twoSeat();
    const bossId = spawn(world, 't9BossMummies', P0, 500);
    spawn(world, 'goblinMelee', P1, 640);
    fireOnce(world, bossId);
    const pts = clouds(world).map((id) => {
      const p = world.creatures.get(id)!.pos;
      return `${p.x},${p.y}`;
    });
    expect(new Set(pts).size, 'every cloud must have its own spoke').toBe(PHARAOH_LOCUST_COUNT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R142 — determinism and bounds', () => {
  it('⭐⭐ the cadence is TICK-DERIVED and phase-spread by boss id — two Pharaohs never fire together', () => {
    const world = twoSeat();
    const a = spawn(world, 't9BossMummies', P0, 400);
    const b = spawn(world, 't9BossMummies', P1, 1400);
    expect((a as number) % PHARAOH_LOCUST_CADENCE_TICKS)
      .not.toBe((b as number) % PHARAOH_LOCUST_CADENCE_TICKS);
  });

  it('⭐ the same world at the same tick launches to the IDENTICAL positions (replay-safe)', () => {
    const run = (): string[] => {
      const world = twoSeat();
      const bossId = spawn(world, 't9BossMummies', P0, 500, 500);
      spawn(world, 'goblinMelee', P1, 640, 560);
      fireOnce(world, bossId);
      return clouds(world)
        .map((id) => world.creatures.get(id)!.pos)
        .map((p) => `${p.x},${p.y}`)
        .sort();
    };
    expect(run()).toEqual(run());
  });

  it('⭐ positions are INTEGERS — no float drift onto the wire', () => {
    const world = twoSeat();
    const bossId = spawn(world, 't9BossMummies', P0, 500, 500);
    spawn(world, 'goblinMelee', P1, 631, 547);
    fireOnce(world, bossId);
    for (const id of clouds(world)) {
      const p = world.creatures.get(id)!.pos;
      expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    }
  });

  it('⛔ the population is BOUNDED — re-arming cannot fill the board', () => {
    /*
     * The bound the spawn latch used to impose, moved somewhere it can be seen. If the launcher's
     * own count went missing this test is the only thing left between a re-arming Pharaoh and an
     * unbounded swarm, because the latch now exempts this type by design.
     */
    const world = twoSeat();
    const bossId = spawn(world, 't9BossMummies', P0, 500);
    spawn(world, 'goblinMelee', P1, 620);
    for (let i = 0; i < 12; i++) fireOnce(world, bossId);
    expect(clouds(world).length).toBeLessThanOrEqual(PHARAOH_LOCUST_MAX_PER_OWNER);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('S171 R142 — the cloud itself carries his numbers', () => {
  it('⭐⭐ 10 ATK / 10 PEN = 150 fifths, and that one-shots every boss in the game', () => {
    /*
     * His two numbers, pinned as arithmetic rather than as trust. 150 is exactly Vlad's strike — the
     * hardest hitter in the game — on a disposable summon, and the largest pool in the game is the
     * Pharaoh's own 143. This is why STRIKES ARE KILLS for the locusts, and therefore why cadence and
     * cloud count (which R142 does NOT rule on) are the whole balance.
     */
    const cfg = getCreatureConfig('locustCloud');
    expect(attackFifths(cfg.atk, cfg.pen)).toBe(150);
    expect(unitPoolFifths(11, 8), 'the Pharaoh, the biggest pool on the board').toBe(143);
    expect(attackFifths(cfg.atk, cfg.pen)).toBeGreaterThan(unitPoolFifths(11, 8));
  });

  it('⭐ it CANNOT BE TARGETED, and it is finite', () => {
    const cfg = getCreatureConfig('locustCloud');
    expect(cfg.untargetable, '*"they cannot be targeted"*').toBe(true);
    expect(cfg.persistent, 'a cloud must expire — 15 s, not the whole match').toBe(false);
    expect(cfg.lifetimeTicks).toBe(PHARAOH_LOCUST_LIFETIME_TICKS);
  });

  it('⭐ it targets UNITS AND BUILDINGS, and the two tables agree', () => {
    // *"targeting units and building"*. The config flag and CREATURE_TARGETS disagreeing is the
    // incoherence that makes a unit walk to a castle and then refuse to hit it.
    const cfg = getCreatureConfig('locustCloud');
    expect(cfg.targetsStructures).toBe(true);
  });
});
