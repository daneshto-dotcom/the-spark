/**
 * SPARK — S168 P7 (owner R140) — VLAD'S LIFE SAP.
 *
 * Owner: *"Also vlad can use a life sap ability that heals him 20% of his health. He can use it 3
 * times when his health drops below 40%."*
 *
 * Three numbers, all his, and the interesting property is that they are EXACTLY INTEGRAL against
 * his pool — `unitPoolFifths(10, 4)` = 90 fifths, so 20% is 18 and 40% is 36. That is why this
 * skill could ship while the zombie's 3%/s aura could not: `damageEntity` throws on a fractional
 * amount by design and float accumulators are banned in the sim.
 */

import { describe, expect, it } from 'vitest';
import {
  PHYSICS_HZ,
  PLAYER_COLORS,
  VLAD_LIFE_SAP_HEAL_PCT,
  VLAD_LIFE_SAP_TRIGGER_PCT,
  VLAD_LIFE_SAP_USES,
  ZOMBIE_AURA_PER_MILLE,
  ZOMBIE_AURA_RADIUS,
} from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { bossMaxPoolFifths, runVladLifeSap, runZombieRotAura, type SapLedger } from './bossSkills.ts';
import { dotIntervalTicks, maxPoolFifths } from './damageOverTime.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import type { CreatureType } from './creatures/creature.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asPlayerId, type CreatureId } from '../types.ts';

const P0 = asPlayerId(0);

function worldWithVlad(): { world: World; id: CreatureId; max: number } {
  const world = makeWorld(0);
  world.isHost = true;
  world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  world.matchPhase = 'FIGHT';
  world.phaseEndsAtTick = world.tick + 1_000_000;
  dispatch(world, {
    type: 'SPAWN_CREATURE',
    creatureType: T9_BOSS_TYPE.vampires,
    ownerPlayerId: P0,
    pos: { x: 500, y: 500 },
    targetPos: { x: 500, y: 500 },
  });
  const vlad = [...world.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.vampires);
  if (vlad === undefined) throw new Error('fixture: Vlad did not spawn');
  return { world, id: vlad.id, max: bossMaxPoolFifths(vlad.type) };
}

describe('S168 P7 — Vlad life sap (R140)', () => {
  it('CONTROL — his pool makes both of the owner percentages whole numbers', () => {
    const { max } = worldWithVlad();
    expect(max, 'unitPoolFifths(10,4)').toBe(90);
    expect((max * VLAD_LIFE_SAP_HEAL_PCT) % 100, '20% of the pool is exact').toBe(0);
    expect((max * VLAD_LIFE_SAP_TRIGGER_PCT) % 100, '40% of the pool is exact').toBe(0);
  });

  it('⛔ does NOT fire at full health', () => {
    const { world, id, max } = worldWithVlad();
    const ledger: SapLedger = new Map();
    runVladLifeSap(world, ledger);
    expect(world.creatures.get(id)!.ehp).toBe(max);
    expect(ledger.get(id) ?? 0).toBe(0);
  });

  it('⛔ does NOT fire at exactly the threshold — "drops BELOW 40%" is strict', () => {
    const { world, id, max } = worldWithVlad();
    world.creatures.get(id)!.ehp = (max * VLAD_LIFE_SAP_TRIGGER_PCT) / 100; // exactly 36
    runVladLifeSap(world, new Map());
    expect(world.creatures.get(id)!.ehp, 'still 36, untouched').toBe(36);
  });

  it('⭐ fires below the threshold and heals exactly 20% of his FULL pool', () => {
    const { world, id, max } = worldWithVlad();
    const heal = (max * VLAD_LIFE_SAP_HEAL_PCT) / 100;
    world.creatures.get(id)!.ehp = 30; // 33% — below 40%
    runVladLifeSap(world, new Map());
    // Expressed through `max` rather than hardcoded to 90, so a future stat retune moves the
    // expectation with the pool instead of failing for the wrong reason.
    expect(world.creatures.get(id)!.ehp, `30 + ${heal}`).toBe(30 + heal);
  });

  /*
   * ⭐ 20% OF HIS FULL POOL, NOT OF WHAT IS LEFT. "heals him 20% of his health" is ambiguous in
   * English and the two readings diverge fast: percent-of-CURRENT shrinks every use and can never
   * restore him, percent-of-MAX is a flat 18 every time. Pinned so the reading is a decision on the
   * books rather than an accident of whichever line someone edits next.
   */
  it('⭐ the 20% is of MAX, not of current — a flat 18 whatever his health is', () => {
    for (const start of [1, 10, 20, 35]) {
      const { world, id } = worldWithVlad();
      world.creatures.get(id)!.ehp = start;
      runVladLifeSap(world, new Map());
      expect(world.creatures.get(id)!.ehp, `from ${start}`).toBe(start + 18);
    }
  });

  it('⭐ three uses and no more', () => {
    const { world, id } = worldWithVlad();
    const ledger: SapLedger = new Map();
    for (let i = 0; i < 10; i++) {
      world.creatures.get(id)!.ehp = 10; // shove him back under the threshold every time
      runVladLifeSap(world, ledger);
    }
    expect(ledger.get(id), 'spent exactly the ruled number of charges').toBe(VLAD_LIFE_SAP_USES);
  });

  it('⭐ the fourth attempt genuinely does nothing — the cap is not just a counter', () => {
    const { world, id } = worldWithVlad();
    const ledger: SapLedger = new Map();
    for (let i = 0; i < VLAD_LIFE_SAP_USES; i++) {
      world.creatures.get(id)!.ehp = 10;
      runVladLifeSap(world, ledger);
    }
    world.creatures.get(id)!.ehp = 10;
    runVladLifeSap(world, ledger);
    expect(world.creatures.get(id)!.ehp, 'no heal on the fourth').toBe(10);
  });

  it('never overheals past his full pool', () => {
    const { world, id, max } = worldWithVlad();
    // 35 is under the 36 threshold, so the sap fires; 35 + 18 = 53, comfortably inside the pool.
    // The assertion is the CLAMP, so this also guards a future retune where heal > the deficit.
    world.creatures.get(id)!.ehp = 35;
    runVladLifeSap(world, new Map());
    expect(world.creatures.get(id)!.ehp).toBeLessThanOrEqual(max);
  });

  it('⛔ a corpse is not a patient — ehp 0 does not resurrect him', () => {
    const { world, id } = worldWithVlad();
    world.creatures.get(id)!.ehp = 0;
    runVladLifeSap(world, new Map());
    expect(world.creatures.get(id)!.ehp, 'a dead Vlad stays dead').toBe(0);
  });

  it('⛔ only VLAD saps — the other five bosses have their own skills', () => {
    const world = makeWorld(0);
    world.isHost = true;
    world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + 1_000_000;
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: T9_BOSS_TYPE.nagas,
      ownerPlayerId: P0,
      pos: { x: 500, y: 500 },
      targetPos: { x: 500, y: 500 },
    });
    const kraken = [...world.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.nagas)!;
    kraken.ehp = 5;
    runVladLifeSap(world, new Map());
    expect(kraken.ehp, 'the Kraken does not heal').toBe(5);
  });

  it('is inert outside PLAYING', () => {
    const { world, id } = worldWithVlad();
    world.creatures.get(id)!.ehp = 10;
    world.gameState = 'TITLE';
    runVladLifeSap(world, new Map());
    expect(world.creatures.get(id)!.ehp).toBe(10);
  });
});


/**
 * ⭐⭐ S168 — THE ZOMBIE BOSS'S ROT AURA (R138, as the owner amended it this session).
 *
 * *"not 3% of the enemies health but i think we can do 3% because its in fifths right? need to do
 * 2.5%"* — and he was right. 2.5% of his own 120-fifth pool is exactly 3 fifths a second; 3% is 3.6
 * and `damageEntity` throws on a fraction by design. The first test below is that arithmetic,
 * because it is the entire reason this skill could be built at all.
 */
describe('S168 — the zombie rot aura (R138 amended)', () => {
  function worldWithWhopper(): { world: World; id: CreatureId } {
    const world = makeWorld(0);
    world.isHost = true;
    world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]!));
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + 1_000_000;
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: T9_BOSS_TYPE.zombies,
      ownerPlayerId: P0,
      pos: { x: 500, y: 500 },
      targetPos: { x: 500, y: 500 },
    });
    const boss = [...world.creatures.values()].find((c) => c.type === T9_BOSS_TYPE.zombies)!;
    return { world, id: boss.id };
  }

  function addUnit(world: World, seat: ReturnType<typeof asPlayerId>, dx: number): CreatureId {
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'goblinShield', // 16 fifths — survives several pulses, so decay is observable
      ownerPlayerId: seat,
      pos: { x: 500 + dx, y: 500 },
      targetPos: { x: 500 + dx, y: 500 },
      sourceSpawnerId: null,
    });
    return [...world.creatures.values()].filter((c) => c.type === 'goblinShield').at(-1)!.id;
  }

  /*
   * ⭐⭐ THE PROPERTY HIS CORRECTION IS ABOUT, ASSERTED DIRECTLY.
   *
   * *"it has to be 2.5% of the enemy that is effected … its not fair if its 2.5% of his own
   * health"*. A percentage of the BOSS is a FLAT rate and punishes small units enormously; a
   * percentage of the VICTIM is a UNIFORM time-to-kill. This test is the difference, and it is the
   * one that would have caught my first implementation.
   */
  it('⭐⭐ every unit on the board takes the SAME time to rot — that is the fairness', () => {
    const ROSTER: CreatureType[] = [
      'chewer',
      'raceUnit',
      'goblinMelee',
      'goblinShield',
      't3Warband',
      't3Scarab',
      'voltkin',
      T9_BOSS_TYPE.mummies,
    ];
    const seconds = ROSTER.map((t) => {
      const pool = maxPoolFifths(t);
      return (pool * dotIntervalTicks(pool, ZOMBIE_AURA_PER_MILLE)) / PHYSICS_HZ;
    });
    // 100 / 2.5 = 40 s, nominal. Integer ticks cost at most ~1.3% across the whole roster.
    for (const [i, sec] of seconds.entries()) {
      expect(sec, `${ROSTER[i]} time-to-rot`).toBeGreaterThan(39.5);
      expect(sec, `${ROSTER[i]} time-to-rot`).toBeLessThan(41);
    }
    // And the spread across a 5-fifth chewer and a 143-fifth Pharaoh is nearly nothing.
    expect(Math.max(...seconds) - Math.min(...seconds), 'spread across the roster').toBeLessThan(1);
  });

  it('⛔ NEGATIVE CONTROL — a FLAT rate would NOT have this property', () => {
    // What I shipped first: 3 fifths/s for everyone. Stated as a test so the regression is named.
    const flat = 3;
    const chewer = maxPoolFifths('chewer') / flat;
    const pharaoh = maxPoolFifths(T9_BOSS_TYPE.mummies) / flat;
    expect(pharaoh / chewer, 'a flat rate is ~28x less punishing to the Pharaoh').toBeGreaterThan(20);
  });

  it('the per-victim cadence is HZ / (pool x rate), in whole ticks', () => {
    expect(dotIntervalTicks(5, ZOMBIE_AURA_PER_MILLE), 'chewer: 2400/5').toBe(480);
    expect(dotIntervalTicks(24, ZOMBIE_AURA_PER_MILLE), 't3 warband: 2400/24').toBe(100);
    expect(dotIntervalTicks(120, ZOMBIE_AURA_PER_MILLE), 'whopper: 2400/120').toBe(20);
    expect(dotIntervalTicks(0, ZOMBIE_AURA_PER_MILLE), 'no pool, no division').toBe(Infinity);
  });

  it('⭐ an enemy in range rots — and by exactly one fifth per pulse', () => {
    const { world } = worldWithWhopper();
    const victim = addUnit(world, asPlayerId(1), 40);
    const before = world.creatures.get(victim)!.ehp;
    let hits = 0;
    for (let t = 0; t < 200; t++) {
      world.tick++;
      const pre = world.creatures.get(victim)?.ehp ?? 0;
      runZombieRotAura(world);
      const post = world.creatures.get(victim)?.ehp ?? 0;
      if (post < pre) {
        expect(pre - post, 'every pulse is exactly ONE fifth').toBe(1);
        hits++;
      }
    }
    expect(hits, 'it actually fired').toBeGreaterThan(0);
    expect(world.creatures.get(victim)?.ehp ?? 0).toBeLessThan(before);
  });

  it('⛔ a FRIENDLY unit is untouched — "damages ENEMIES around him"', () => {
    const { world } = worldWithWhopper();
    const friend = addUnit(world, P0, 40);
    const before = world.creatures.get(friend)!.ehp;
    for (let t = 0; t < 200; t++) {
      world.tick++;
      runZombieRotAura(world);
    }
    expect(world.creatures.get(friend)!.ehp, 'his own units are safe').toBe(before);
  });

  it('⛔ an enemy OUT of range is untouched', () => {
    const { world } = worldWithWhopper();
    const far = addUnit(world, asPlayerId(1), ZOMBIE_AURA_RADIUS + 50);
    const before = world.creatures.get(far)!.ehp;
    for (let t = 0; t < 200; t++) {
      world.tick++;
      runZombieRotAura(world);
    }
    expect(world.creatures.get(far)!.ehp).toBe(before);
  });

  it('⛔ only the ZOMBIE has an aura', () => {
    const world = makeWorld(0);
    world.isHost = true;
    world.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
    world.players.set(asPlayerId(1), makeIdlePlayer(asPlayerId(1), PLAYER_COLORS[1]!));
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + 1_000_000;
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: T9_BOSS_TYPE.nagas,
      ownerPlayerId: P0,
      pos: { x: 500, y: 500 },
      targetPos: { x: 500, y: 500 },
    });
    const victim = addUnit(world, asPlayerId(1), 40);
    const before = world.creatures.get(victim)!.ehp;
    for (let t = 0; t < 200; t++) {
      world.tick++;
      runZombieRotAura(world);
    }
    expect(world.creatures.get(victim)!.ehp, 'the Kraken has no aura').toBe(before);
  });

  it('is inert outside PLAYING', () => {
    const { world } = worldWithWhopper();
    const victim = addUnit(world, asPlayerId(1), 40);
    const before = world.creatures.get(victim)!.ehp;
    world.gameState = 'TITLE';
    for (let t = 0; t < 200; t++) {
      world.tick++;
      runZombieRotAura(world);
    }
    expect(world.creatures.get(victim)!.ehp).toBe(before);
  });
});
