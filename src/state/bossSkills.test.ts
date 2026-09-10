/**
 * SPARK — S168 P7 (owner R140) — VLAD'S LIFE SAP.
 *
 * Owner: *"Also vlad can use a life sap ability that heals him 20% of his health. He can use it 3
 * times when his health drops below 40%."*
 *
 * Three numbers, all his, and the interesting property is that they are EXACTLY INTEGRAL against
 * his pool. That is why this skill could ship while the zombie's 3%/s aura could not: `damageEntity`
 * throws on a fractional amount by design and float accumulators are banned in the sim.
 *
 * ## ⭐ S172 — THE DOUBLING, AND WHY R140's PERCENTAGES SURVIVED IT UNCHANGED
 *
 * Owner, this session: *"boss health is not good enough. Vlad died within, like, three seconds …
 * bosses should be a lot stronger. So let's double their health and defense, whatever it is right
 * now. Double it for all the bosses. Keep their damage as is."* Vlad went `hp 10→20`, `def 4→8`;
 * ATK and PEN were NOT touched, so R141's boss band is superseded only in its HP/DEF numbers.
 *
 * Because DEF is a MULTIPLIER, doubling both roughly TRIPLES the pool:
 * `unitPoolFifths(20, 8) = 20 × (5 + 8)` = **260** fifths, up from `unitPoolFifths(10, 4)` = 90.
 * R140's two percentages are percentages, so they moved with it and stayed whole:
 * **20% is 52** (was 18) and **40% is 104** (was 36). `260 × 20 % 100 === 0` and
 * `260 × 40 % 100 === 0` — the integrality that lets this skill exist survived the retune intact,
 * and the CONTROL test below is the assertion of exactly that.
 *
 * ⚠ `bossSkills.ts`'s own docblock still says *"`unitPoolFifths(10, 4) = 90` … 20% is 18 and 40%
 * is 36"*. That is production source and is out of this repair's scope — reported, not edited.
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
  /*
   * ⭐ S172 — STILL WHOLE AFTER THE DOUBLING, AND THAT WAS NOT GUARANTEED.
   *
   * `hp 10→20, def 4→8` took the pool 90 → `20 × (5 + 8)` = 260. 20% of 260 = **52**, 40% = **104**;
   * both exact, so nothing here had to be rounded and no fractional heal can reach `damageEntity`'s
   * integer guard. Had either landed fractional this test would have been a REAL FINDING about the
   * retune rather than a number to update — that is what it is here to catch.
   */
  it('CONTROL — his pool makes both of the owner percentages whole numbers', () => {
    const { max } = worldWithVlad();
    expect(max, 'unitPoolFifths(20,8) — S172 doubled hp 10→20 and def 4→8').toBe(260);
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
    // S172: the 40% line moved with the pool, 36 → 104 (40% of 260). Strictness is unchanged.
    world.creatures.get(id)!.ehp = (max * VLAD_LIFE_SAP_TRIGGER_PCT) / 100; // exactly 104
    runVladLifeSap(world, new Map());
    expect(world.creatures.get(id)!.ehp, 'still 104, untouched').toBe(104);
  });

  it('⭐ fires below the threshold and heals exactly 20% of his FULL pool', () => {
    const { world, id, max } = worldWithVlad();
    const heal = (max * VLAD_LIFE_SAP_HEAL_PCT) / 100;
    world.creatures.get(id)!.ehp = 30; // S172: 30/260 = 11.5% — was 33% of the old 90-fifth pool
    runVladLifeSap(world, new Map());
    // Expressed through `max` rather than hardcoded, so a stat retune moves the expectation with
    // the pool instead of failing for the wrong reason. S172 proved the point: this line survived
    // the doubling untouched while its hardcoded siblings did not.
    expect(world.creatures.get(id)!.ehp, `30 + ${heal}`).toBe(30 + heal);
  });

  /*
   * ⭐ 20% OF HIS FULL POOL, NOT OF WHAT IS LEFT. "heals him 20% of his health" is ambiguous in
   * English and the two readings diverge fast: percent-of-CURRENT shrinks every use and can never
   * restore him, percent-of-MAX is a flat 52 every time. Pinned so the reading is a decision on the
   * books rather than an accident of whichever line someone edits next.
   *
   * ⚠ S172 — the flat amount is 52, not 18: the doubling took his pool 90 → 260 and 20% with it.
   * The literal is kept HARDCODED rather than derived from `max` on purpose — it is the independent
   * cross-check on the `max`-derived expectation in the test above, and a derived one here would
   * agree with a wrong pool just as happily.
   */
  it('⭐ the 20% is of MAX, not of current — a flat 52 whatever his health is', () => {
    for (const start of [1, 10, 20, 35]) {
      const { world, id } = worldWithVlad();
      world.creatures.get(id)!.ehp = start;
      runVladLifeSap(world, new Map());
      expect(world.creatures.get(id)!.ehp, `from ${start}`).toBe(start + 52);
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
    // 35 is under the 104 threshold, so the sap fires; 35 + 52 = 87, comfortably inside the 260
    // pool. (S172: was "under the 36 threshold, 35 + 18 = 53" against the old 90-fifth pool — the
    // shape of the case is identical, every number in it tripled.)
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
 * 2.5%"* — and he was right. Against his pool AS IT WAS (120 fifths) 2.5% is exactly 3 fifths a
 * second while 3% is 3.6, and `damageEntity` throws on a fraction by design. The first test below
 * is that arithmetic, because it is the entire reason this skill could be built at all.
 *
 * ⚠ S172 — the zombie boss went `hp 12→24, def 5→10`, so HIS pool is now `24 × (5 + 10)` = **360**
 * fifths, not 120: 2.5% of it is 9 a second and 3% is 10.8. The quoted reasoning is preserved as he
 * gave it, with the old number named as old. It does not change the mechanic, because his ruling
 * moved the rate OFF his own pool and onto the VICTIM's — which is the next block down.
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
   *
   * ⚠⚠ S172 — THE FAIRNESS SURVIVED THE BOSS DOUBLING; ONLY THE BAND MOVED, AND HERE IS WHY.
   *
   * The Pharaoh went `hp 11→22, def 8→16`, so the only roster entry below that is a boss tripled:
   * `22 × (5 + 16)` = **462** fifths, up from 143. Nothing else in this ROSTER changed.
   *
   * The rate is carried by the INTERVAL, and the interval is whole ticks —
   * `round(60000 / (pool × 25))` — so the quantisation error is `pool × |round(x) − x| / 60`
   * seconds: it grows with the pool, because a bigger pool buys a SHORTER interval and rounding a
   * short interval costs relatively more. At 462 the interval is `round(5.195)` = **5** ticks, and
   * `462 × 5 / 60` = **38.5 s** against the 40 s nominal — a 3.75% shortfall, where the old
   * 143-fifth Pharaoh sat at 40.4 s. Measured across the whole roster:
   *
   *      chewer 5 → 480 t → 40.000 s      t3Warband 24 → 100 t → 40.000 s
   *      raceUnit 6 → 400 t → 40.000 s    t3Scarab  28 →  86 t → 40.133 s
   *      goblinMelee 7 → 343 t → 40.017 s voltkin   64 →  38 t → 40.533 s
   *      goblinShield 16 → 150 t → 40.000 s   PHARAOH 462 → 5 t → 38.500 s
   *
   * ⭐ SO THIS IS THE BOUNDARY MOVING, NOT A FAIRNESS BREAK. Every unit still rots in one band
   * around 40 s — the spread is 2.03 s (5.1%) where it was 0.53 s (1.3%) — and no unit is
   * singled out by TYPE, which is the property the owner's correction was about. The bounds below
   * widen to exactly the measured range plus the ~0.5 s slack the original line already carried
   * (39.5–41 around a measured 40.0–40.5); they are not loosened past that.
   *
   * ⛔ WHERE IT WOULD ACTUALLY BREAK, so a future retune has the number: `dotIntervalTicks` floors
   * at `Math.max(1, …)`, and the rounded interval reaches 1 tick at a pool above **1600** fifths.
   * Past that the pool no longer buys time at all and time-to-rot collapses toward `pool / 60` s.
   * The biggest pool on the board after this doubling is the Pharaoh's 462 (the Kraken is 408,
   * 40.8 s), so there is ~3.5× of headroom left. A further doubling would still be safe; a fourth
   * would not.
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
    // 100 / 2.5 = 40 s, nominal. Integer ticks cost at most 3.75% across the whole roster — S172,
    // and it is the 462-fifth Pharaoh alone that costs it (38.5 s); everything else is 40.0–40.5.
    // Was 39.5 / 41 around a 39.99–40.53 measured range; the lower bound moves by exactly the
    // Pharaoh's shortfall and keeps the same ~0.5 s of slack.
    for (const [i, sec] of seconds.entries()) {
      expect(sec, `${ROSTER[i]} time-to-rot`).toBeGreaterThan(38);
      expect(sec, `${ROSTER[i]} time-to-rot`).toBeLessThan(41);
    }
    // And the spread across a 5-fifth chewer and a 462-fifth Pharaoh is still small: 2.03 s on a
    // 40 s clock. (Was < 1 against a 143-fifth Pharaoh — same 0.47 s slack over the measurement.)
    expect(Math.max(...seconds) - Math.min(...seconds), 'spread across the roster').toBeLessThan(
      2.5,
    );
  });

  it('⛔ NEGATIVE CONTROL — a FLAT rate would NOT have this property', () => {
    // What I shipped first: 3 fifths/s for everyone. Stated as a test so the regression is named.
    const flat = 3;
    const chewer = maxPoolFifths('chewer') / flat;
    const pharaoh = maxPoolFifths(T9_BOSS_TYPE.mummies) / flat;
    // S172: the S172 doubling made the wrong reading WORSE, not better — the ratio is the pool
    // ratio, so 143/5 ≈ 28x became 462/5 ≈ 92x. The `> 20` floor is left where it is deliberately:
    // it is a "this is unfair by an order of magnitude" assertion, not a measurement of the day.
    expect(pharaoh / chewer, 'a flat rate is ~92x less punishing to the Pharaoh').toBeGreaterThan(20);
  });

  it('the per-victim cadence is HZ / (pool x rate), in whole ticks', () => {
    expect(dotIntervalTicks(5, ZOMBIE_AURA_PER_MILLE), 'chewer: 2400/5').toBe(480);
    expect(dotIntervalTicks(24, ZOMBIE_AURA_PER_MILLE), 't3 warband: 2400/24').toBe(100);
    // S172 — the whopper's own pool went 120 → 360 (`hp 12→24, def 5→10`), so this line now also
    // covers the ROUNDING arm that the two exact divisions above cannot: 2400/360 = 6.67 → 7 ticks.
    expect(dotIntervalTicks(360, ZOMBIE_AURA_PER_MILLE), 'whopper: 2400/360 rounds to 7').toBe(7);
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
