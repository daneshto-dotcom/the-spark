/**
 * SPARK — S168 (owner R149 / R150) — THE ORC WARLORD AND THE ARCHDEMON.
 *
 * The last two boss skill sets, which completes all six. Each test below is aimed at the specific
 * thing that would be wrong if the ruling had been read casually rather than exactly.
 */

import { describe, expect, it } from 'vitest';
import {
  ARCHDEMON_HELL_RADIUS,
  ARCHDEMON_HELL_THRESHOLD_PCT,
  ARCHDEMON_TELEPORT_INTERVAL_TICKS,
  DIREWOLF_MAX_PER_BOSS,
  DIREWOLF_SUMMON_COUNT,
  DIREWOLF_SUMMON_INTERVAL_TICKS,
  PLAYER_COLORS,
  WARLORD_RAGE_MULTIPLIER,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { rageMultiplier } from './creatures/creature.ts';
import { maxPoolFifths } from './damageOverTime.ts';
import { runWarlordDirewolves, runWarlordRage } from './bossSkillsWarlord.ts';
import { runArchdemonHell, runArchdemonTeleport } from './bossSkillsArchdemon.ts';
import { attackFifths } from './stats.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId, type SpawnerId } from '../types.ts';
import type { CreatureType } from './creatures/creature.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function bossWorld(type: CreatureType): { world: World; id: CreatureId } {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: type,
    ownerPlayerId: P0,
    pos: { x: 900, y: 500 },
    targetPos: { x: 900, y: 500 },
  });
  const boss = [...world.creatures.values()].find((c) => c.type === type)!;
  return { world, id: boss.id };
}

/*
 * ⚠ `sourceSpawnerId` IS NON-NULL ON PURPOSE, and finding out why cost a failing test.
 *
 * `applySpawnCreature` refuses a second live NULL-spawner creature of the same (owner, type). A
 * fixture that spawned six goblinShields for one seat therefore got ONE, silently, and the crowd
 * this suite needs never existed — the loneliness test passed its target assertion and then failed
 * on the position, because every "crowd member" was the same creature.
 *
 * Routing them through a spawner id puts them under `underGoblinCaps` (10 per spawner) instead,
 * which is the population bound a crowd is supposed to answer to. It is also the exact gate the
 * DIREWOLF had to be exempted from — see `applySpawnCreature` — so the fixture bug and the product
 * decision are the same fact seen from two sides.
 */
let nextFakeSpawner = 1;
function addUnit(world: World, seat: typeof P0, x: number, y: number): CreatureId {
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: 'goblinShield',
    ownerPlayerId: seat,
    pos: { x, y },
    targetPos: { x, y },
    sourceSpawnerId: nextFakeSpawner++ as unknown as SpawnerId,
  });
  return [...world.creatures.values()].filter((c) => c.type === 'goblinShield').at(-1)!.id;
}

/** Advance world.tick to the next tick on which `(tick + id) % interval === 0`. */
function alignTo(world: World, id: CreatureId, interval: number): void {
  while ((world.tick + (id as number)) % interval !== 0) world.tick++;
}

describe('S168 R149 — the Orc Warlord RAGE', () => {
  it('⛔ is not enraged at full health', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.orcs);
    runWarlordRage(world);
    expect(world.creatures.get(id)!.enraged).not.toBe(true);
  });

  it('⛔ is not enraged at exactly 25% — "drops to 25%" is read as strictly below', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.orcs);
    const max = maxPoolFifths(T9_BOSS_TYPE.orcs);
    world.creatures.get(id)!.ehp = (max * 25) / 100;
    runWarlordRage(world);
    expect(world.creatures.get(id)!.enraged).not.toBe(true);
  });

  it('⭐ enrages below 25%', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.orcs);
    world.creatures.get(id)!.ehp = 5;
    runWarlordRage(world);
    expect(world.creatures.get(id)!.enraged).toBe(true);
  });

  /*
   * ⭐⭐ THE ASSERTION THE RULING TURNS ON. *"for the rest of his lifetime"* — so a flag DERIVED from
   * current HP is wrong, and this game now HAS healing (Vlad's life sap shipped the same session),
   * so a derived flag would visibly switch off in play.
   */
  it('⭐⭐ LATCHES — healing him back over the line does NOT calm him down', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.orcs);
    const max = maxPoolFifths(T9_BOSS_TYPE.orcs);
    world.creatures.get(id)!.ehp = 5;
    runWarlordRage(world);
    expect(world.creatures.get(id)!.enraged).toBe(true);
    world.creatures.get(id)!.ehp = max; // fully healed
    runWarlordRage(world);
    expect(world.creatures.get(id)!.enraged, 'for the REST OF HIS LIFETIME').toBe(true);
  });

  it('⭐ rage is one multiplier, and it is the owner x2', () => {
    expect(rageMultiplier({ enraged: true })).toBe(WARLORD_RAGE_MULTIPLIER);
    expect(rageMultiplier({ enraged: false })).toBe(1);
    expect(rageMultiplier({}), 'undefined reads as not enraged').toBe(1);
    expect(WARLORD_RAGE_MULTIPLIER, 'x2 quicker').toBe(2);
  });

  it('⛔ only the WARLORD rages', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.nagas);
    world.creatures.get(id)!.ehp = 1;
    runWarlordRage(world);
    expect(world.creatures.get(id)!.enraged).not.toBe(true);
  });
});

describe('S168 R149 — the direwolf summon', () => {
  const wolves = (w: World): number =>
    [...w.creatures.values()].filter((c) => c.type === 'direwolf').length;

  it('⛔ summons nothing off the cadence', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.orcs);
    alignTo(world, id, DIREWOLF_SUMMON_INTERVAL_TICKS);
    world.tick++; // one tick PAST the due tick
    runWarlordDirewolves(world);
    expect(wolves(world)).toBe(0);
  });

  it('⭐ summons exactly three on the cadence', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.orcs);
    alignTo(world, id, DIREWOLF_SUMMON_INTERVAL_TICKS);
    runWarlordDirewolves(world);
    expect(wolves(world)).toBe(DIREWOLF_SUMMON_COUNT);
  });

  /*
   * ⭐ THE ONE-PER-TYPE GATE WOULD HAVE CAPPED THIS AT ONE. `applySpawnCreature` refuses a second
   * live null-spawner creature of the same (owner, type); a summon that arrives in threes cannot
   * pass it, and the failure is SILENT — the boss mints one wolf and the suite stays green. Exactly
   * the shape of the tier-3 tower defect found earlier in this same session.
   */
  it('⭐ three, not one — the null-spawner gate must not swallow the pack', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.orcs);
    alignTo(world, id, DIREWOLF_SUMMON_INTERVAL_TICKS);
    runWarlordDirewolves(world);
    expect(wolves(world), 'a silent cap at 1 is the defect this pins').toBeGreaterThan(1);
  });

  it('⭐ the pack is CAPPED — the ruling has no cap and unbounded it wins the game alone', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.orcs);
    for (let i = 0; i < 12; i++) {
      alignTo(world, id, DIREWOLF_SUMMON_INTERVAL_TICKS);
      runWarlordDirewolves(world);
      world.tick++;
    }
    expect(wolves(world)).toBe(DIREWOLF_MAX_PER_BOSS);
  });

  it('⭐ a direwolf is 3/3/3/3 — his numbers, on the fifths ladder', () => {
    expect(maxPoolFifths('direwolf'), '3 x (5+3)').toBe(24);
    expect(attackFifths(3, 3), '3 x (5+3)').toBe(24);
  });
});

describe('S168 R150 — the Archdemon takes enemies to hell', () => {
  it('⭐ executes an enemy below 5%', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.demons);
    const victim = addUnit(world, P1, 940, 500);
    world.creatures.get(victim)!.ehp = 0.5; // < 5% of a 16-fifth shield
    void id;
    runArchdemonHell(world);
    expect(world.creatures.has(victim), 'taken to hell').toBe(false);
  });

  it('⛔ leaves an enemy ABOVE the threshold alone', () => {
    const { world } = bossWorld(T9_BOSS_TYPE.demons);
    const victim = addUnit(world, P1, 940, 500);
    const max = maxPoolFifths('goblinShield');
    world.creatures.get(victim)!.ehp = (max * ARCHDEMON_HELL_THRESHOLD_PCT) / 100 + 1;
    runArchdemonHell(world);
    expect(world.creatures.has(victim)).toBe(true);
  });

  it('⛔ never takes a FRIENDLY unit — "any ENEMY around"', () => {
    const { world } = bossWorld(T9_BOSS_TYPE.demons);
    const friend = addUnit(world, P0, 940, 500);
    world.creatures.get(friend)!.ehp = 0.5;
    runArchdemonHell(world);
    expect(world.creatures.has(friend)).toBe(true);
  });

  it('⛔ never reaches outside the radius', () => {
    const { world } = bossWorld(T9_BOSS_TYPE.demons);
    const far = addUnit(world, P1, 900 + ARCHDEMON_HELL_RADIUS + 60, 500);
    world.creatures.get(far)!.ehp = 0.5;
    runArchdemonHell(world);
    expect(world.creatures.has(far)).toBe(true);
  });
});

describe('S168 R150 — the Archdemon teleports to the LONELIEST enemy', () => {
  /*
   * ⭐⭐ THE TEST THIS WHOLE SKILL EXISTS FOR. Every other acquisition scan in this codebase picks
   * the NEAREST thing. The ruling is explicit that this one does not: *"He always targets creatures
   * that have the least amount of their own teammates around him"*. So the fixture puts a CLOSE
   * target inside a crowd and a FAR one alone, and the demon must choose the far one.
   */
  it('⭐⭐ picks the isolated target over the nearer one in a crowd', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.demons);
    // A crowd 200 px away: one target plus four of its own teammates packed around it.
    const inCrowd = addUnit(world, P1, 1100, 500);
    addUnit(world, P1, 1120, 500);
    addUnit(world, P1, 1080, 500);
    addUnit(world, P1, 1100, 520);
    addUnit(world, P1, 1100, 480);
    // A loner far away, with nobody within the loneliness radius.
    const loner = addUnit(world, P1, 200, 100);

    alignTo(world, id, ARCHDEMON_TELEPORT_INTERVAL_TICKS);
    runArchdemonTeleport(world);

    const demon = world.creatures.get(id)!;
    expect(demon.targetCreatureId, 'the LONER, not the nearer crowd member').toBe(loner);
    expect(Math.abs(demon.pos.x - 200), 'and he actually moved there').toBeLessThan(60);
    void inCrowd;
  });

  /*
   * ⛔ THE BUG THAT WOULD HAVE SHIPPED WITHOUT THIS. The verlet integrator derives velocity from
   * `pos - prevPos`, so a teleport that leaves prevPos behind gives him a velocity equal to the
   * entire jump and flings him back across the map on the very next physics step.
   */
  it('⛔ prevPos moves WITH him — otherwise the integrator flings him back', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.demons);
    addUnit(world, P1, 200, 100);
    alignTo(world, id, ARCHDEMON_TELEPORT_INTERVAL_TICKS);
    runArchdemonTeleport(world);
    const demon = world.creatures.get(id)!;
    expect(demon.prevPos.x, 'zero implied velocity').toBe(demon.pos.x);
    expect(demon.prevPos.y).toBe(demon.pos.y);
  });

  it('⛔ does not teleport off the cadence', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.demons);
    addUnit(world, P1, 200, 100);
    alignTo(world, id, ARCHDEMON_TELEPORT_INTERVAL_TICKS);
    world.tick++;
    const before = { ...world.creatures.get(id)!.pos };
    runArchdemonTeleport(world);
    expect(world.creatures.get(id)!.pos).toEqual(before);
  });

  it('⛔ never chases a friendly', () => {
    const { world, id } = bossWorld(T9_BOSS_TYPE.demons);
    addUnit(world, P0, 200, 100); // his OWN unit, all alone
    alignTo(world, id, ARCHDEMON_TELEPORT_INTERVAL_TICKS);
    const before = { ...world.creatures.get(id)!.pos };
    runArchdemonTeleport(world);
    expect(world.creatures.get(id)!.pos, 'no enemy exists, so he stays put').toEqual(before);
  });
});
