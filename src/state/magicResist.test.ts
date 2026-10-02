/**
 * SPARK — S192 (owner R192-M1..M7) — MAGIC RESISTANCE: the ARITHMETIC, the TABLE and the NEGATIVES.
 *
 * Reachability through the real host tick is `magicResist.reach.test.ts`; the MRES = DEF byte-identity over
 * a bots match is `magicResist.differential.test.ts`; the call-site census is `magicResist.callSites.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  CASTLE_SOLDIER_MRES, CREATURE_MRES, RACE_MRES_LEVEL, bossMres, castleMresLevel, defenderMres, isMagicClass, landedFifths,
  magicDot, magicDotFifths, magicHitFifths, mresFor, strikeClassFor, structureMres,
} from './magicResist.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from './creatures/voltkin-config.ts';
import type { CreatureType } from './creatures/creature.ts';
import { RACE_TOWER_UNIT } from './raceTowerIds.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import type { RaceId } from './races.ts';
import { castleDamageAfterDefence, castleMagicDamageAfterResist, emptyCastleUpgrades } from './castleUpgrades.ts';
import { attackFifths, unitPoolFifths } from './stats.ts';
import { getDefenderConfig } from './defenders/defender.ts';
import { RA_COLUMN_ATK, RA_COLUMN_PEN } from '../constants.ts';
import { damageConnector, damageEntity } from './damage.ts';
import { makeWorld } from './world.ts';
import { asCreatureId, makeCreature } from './creatures/creature.ts';
import { asPlayerId } from '../types.ts';
import { makeIdlePlayer } from '../game/player.ts';

const ALL_TYPES = Object.keys(CREATURE_CONFIGS) as CreatureType[];
const RACES: RaceId[] = ['vampires', 'nagas', 'mummies', 'zombies', 'orcs', 'demons'];

describe('S192 MRES — the arithmetic', () => {
  it('his ladder: MRES n defends ×(1 + 0.2n) — a magic hit lands × (5+DEF)/(5+MRES)', () => {
    // A unit with DEF 0 and MRES 1/2/3 takes 1/1.2, 1/1.4, 1/1.6 of a 60-fifth magic hit.
    expect(magicHitFifths(60, 0, 1)).toBe(50);
    expect(magicHitFifths(60, 0, 2)).toBe(Math.floor(60 / 1.4)); // 42
    expect(magicHitFifths(60, 0, 3)).toBe(Math.floor(60 / 1.6)); // 37
    // and the other way: DEF above MRES lets magic through harder (it is not "stronger", only different)
    expect(magicHitFifths(60, 3, 0)).toBe(96);
  });

  it('⭐ the pool reading: a magic hit uses up the same FRACTION of the bar that the MRES pool says', () => {
    // Vlad, 20 HP / DEF 8, MRES 12: bar 260 physical, 340 against magic.
    const bar = unitPoolFifths(20, 8);
    const magicBar = unitPoolFifths(20, 12);
    expect([bar, magicBar]).toEqual([260, 340]);
    // 340 of magic exactly empties a 260 bar.
    expect(magicHitFifths(340, 8, 12)).toBe(260);
  });

  it('floored, and NEVER below 1 on a real hit; 0 stays 0', () => {
    expect(magicHitFifths(1, 0, 20)).toBe(1);
    expect(magicHitFifths(2, 0, 20)).toBe(1);
    expect(magicHitFifths(0, 0, 20)).toBe(0);
    expect(magicHitFifths(7, 1, 4)).toBe(4); // 42/9 = 4.67
  });

  it('⭐⭐ MRES = DEF IS THE IDENTITY — every hit 1..400, every DEF 0..20, both formulas, any beat', () => {
    for (let def = 0; def <= 20; def++) {
      for (let a = 1; a <= 400; a++) {
        expect(magicHitFifths(a, def, def)).toBe(a);
        for (const beat of [0, 1, 7, 12345]) expect(magicDotFifths(a, def, def, beat)).toBe(a);
        expect(landedFifths(a, 'magic', def, def, 3)).toBe(a);
        expect(landedFifths(a, magicDot(5), def, def, 3)).toBe(a);
      }
    }
  });

  it('a DoT tick (Bresenham over beats) averages EXACTLY (5+DEF)/(5+MRES) per beat and never drifts', () => {
    for (const [def, mres] of [[1, 4], [8, 14], [0, 3], [12, 10], [10, 6], [3, 0]] as const) {
      for (const start of [0, 3, 991]) {
        let total = 0;
        const n = 5 + mres; // one full period
        for (let b = start; b < start + n * 7; b++) total += magicDotFifths(1, def, mres, b);
        expect(total, `def ${def} mres ${mres} from ${start}`).toBe(7 * (5 + def));
      }
    }
  });

  it('⚠ the honest consequence (spec Q-D): a high-MRES victim skips some beats — never all of them', () => {
    const beats = Array.from({ length: 9 }, (_, b) => magicDotFifths(1, 1, 4, b)); // r = 6/9
    expect(beats.filter((x) => x === 0).length).toBe(3);
    expect(beats.filter((x) => x === 1).length).toBe(6);
    // …and a low-MRES victim sometimes takes 2 (r = 6/5)
    const hard = Array.from({ length: 5 }, (_, b) => magicDotFifths(1, 1, 0, b));
    expect(hard.reduce((s, x) => s + x, 0)).toBe(6);
  });

  it('⛔ NEGATIVE — a PHYSICAL hit is never touched by MRES, whatever the numbers', () => {
    for (const mres of [0, 1, 5, 14, 40]) expect(landedFifths(300, 'physical', 8, mres, 1)).toBe(300);
    expect(isMagicClass('physical')).toBe(false);
    expect(isMagicClass('magic')).toBe(true);
    expect(isMagicClass(magicDot(0))).toBe(true);
  });
});

describe('S192 MRES — every non-unit target resists magic exactly as it resists physical today', () => {
  it('a STRUCTURE of n connectors: DEF n and MRES n (R192-M5) — every magic hit lands unchanged', () => {
    for (let n = 1; n <= 12; n++) {
      expect(structureMres(n)).toBe(n);
      for (const a of [1, 6, 35, 300]) expect(landedFifths(a, 'magic', n, structureMres(n), 0)).toBe(a);
    }
  });

  it('⭐ HIS CASTLE (S192): starts with MRES = its starting DEF (0), then MRES and DEF are bought APART', () => {
    expect(castleMresLevel(emptyCastleUpgrades())).toBe(emptyCastleUpgrades().defLevel);
    for (let lvl = 0; lvl <= 10; lvl++) {
      // a bought DEF point never raises MRES …
      expect(castleMresLevel({ ...emptyCastleUpgrades(), defLevel: lvl })).toBe(0);
      // … and a bought MRES point raises only MRES.
      const u = { ...emptyCastleUpgrades(), mresLevel: lvl };
      expect(castleMresLevel(u)).toBe(lvl);
      for (const a of [1, 12, 40, 150, 300]) {
        // the magic formula IS the DEF formula with MRES in DEF's place
        expect(castleMagicDamageAfterResist(a, u)).toBe(castleDamageAfterDefence(a, { ...emptyCastleUpgrades(), defLevel: lvl }));
        expect(magicHitFifths(a, 0, castleMresLevel(u))).toBe(castleMagicDamageAfterResist(a, u));
      }
    }
  });

  it('HELGA resists with her own DEF — identity', () => {
    const unit = getDefenderConfig('princess').unitStats!;
    expect(defenderMres(unit)).toBe(unit.def);
    expect(landedFifths(33, 'magic', unit.def, defenderMres(unit), 9)).toBe(33);
  });
});

describe('S192 MRES — the table (every value ⚠ MINE until he rules)', () => {
  it('covers every creature type the game has (the Record is exhaustive — this guards the count)', () => {
    expect(Object.keys(CREATURE_MRES).sort()).toEqual([...ALL_TYPES].sort());
    expect(ALL_TYPES.length).toBe(28);
    for (const t of ALL_TYPES) for (const r of [...RACES, null]) {
      const m = mresFor(t, r);
      expect(Number.isInteger(m) && m >= 0, `${t} ${r}`).toBe(true);
    }
  });

  it('⭐ his ORDER (R192-M6): demons ≈ mummies > vampires > nagas > orcs > zombies — at every tier', () => {
    const L = RACE_MRES_LEVEL;
    expect(L.demons).toBe(L.mummies);
    expect(L.mummies).toBeGreaterThan(L.vampires);
    expect(L.vampires).toBeGreaterThan(L.nagas);
    expect(L.nagas).toBeGreaterThan(L.orcs);
    expect(L.orcs).toBeGreaterThan(L.zombies);
    const order: RaceId[] = ['demons', 'mummies', 'vampires', 'nagas', 'orcs', 'zombies'];
    // ⭐ S194 HIS — the castle soldier left this order: it is MRES 1 for every race (pinned below).
    for (const tier of [
      (r: RaceId) => mresFor(RACE_TOWER_UNIT[r], r),
      (r: RaceId) => mresFor(T9_BOSS_TYPE[r], r),
    ]) {
      const v = order.map(tier);
      for (let i = 1; i < v.length; i++) expect(v[i - 1]!).toBeGreaterThanOrEqual(v[i]!);
      expect(v[0]).toBe(v[1]); // demons ≈ mummies
      expect(v.slice(1)).toEqual([...v.slice(1)].sort((a, b) => b - a));
      expect(new Set(v.slice(1)).size).toBe(5); // strictly ordered below the top pair
    }
  });

  it('the boss is 6 + 2 × level; the tier-3 unit carries the race level; the castle soldier is 1 for every race (S194)', () => {
    expect(RACES.map((r) => bossMres(r))).toEqual([12, 10, 14, 6, 8, 14]);
    for (const r of RACES) {
      expect(mresFor(T9_BOSS_TYPE[r], null)).toBe(bossMres(r));
      expect(mresFor(RACE_TOWER_UNIT[r], null)).toBe(RACE_MRES_LEVEL[r]);
      // ⭐ S194 HIS: *"They all have just one, so they're all equal between the races."*
      expect(mresFor('raceUnit', r)).toBe(CASTLE_SOLDIER_MRES);
    }
    expect(CASTLE_SOLDIER_MRES).toBe(1);
    // ⚠ Q-E — the elite piranha / bat swarm keep their base unit's level
    expect(mresFor('t3PiranhaElite', null)).toBe(mresFor('t3Piranha', null));
    expect(mresFor('t3BatSwarm', null)).toBe(mresFor('t3Bat', null));
  });

  it('⚠ Q-G — every GLOBAL unit resists magic with its own DEF (so magic hits it exactly as today)', () => {
    const globals: CreatureType[] = [
      'goblinMelee', 'goblinArcher', 'goblinShield', 'goblinHound', 'goblinBat', 'goblinSuicide',
      'chewer', 'lightningDrone', 'voltkin', 'direwolf', 'locustCloud',
    ];
    for (const t of globals) for (const r of [...RACES, null]) expect(mresFor(t, r), t).toBe(getCreatureConfig(t).def);
    // a castle soldier whose seat cannot be found falls back to its own DEF (the function is total)
    expect(mresFor('raceUnit', null)).toBe(getCreatureConfig('raceUnit').def);
  });

  it('⚠ Q-V — a unit strike is physical; only the Voltkin zap is magic', () => {
    for (const t of ALL_TYPES) expect(strikeClassFor(t)).toBe(t === 'voltkin' ? 'magic' : 'physical');
  });

  it('the worked numbers in the spec: the Pharaoh’s 300 column on each boss', () => {
    const col = attackFifths(RA_COLUMN_ATK, RA_COLUMN_PEN);
    expect(col).toBe(300);
    const land = (t: CreatureType) => magicHitFifths(col, getCreatureConfig(t).def, mresFor(t, null));
    expect([
      land('t9BossVampires'), land('t9BossDemons'), land('t9BossNagas'),
      land('t9BossMummies'), land('t9BossZombies'), land('t9BossOrcs'),
    ]).toEqual([229, 205, 340, 331, 409, 392]);
  });
});

describe('S192 MRES — the funnels apply it (direct calls; the host-tick REACH is its own file)', () => {
  function oneVictim(type: CreatureType, race: RaceId) {
    const w = makeWorld(1);
    const seat = makeIdlePlayer(asPlayerId(1), 0x55aa55);
    (seat as { raceId: RaceId }).raceId = race;
    w.players.set(seat.id, seat);
    const c = makeCreature(getCreatureConfig(type), {
      id: asCreatureId(77), ownerPlayerId: asPlayerId(1), pos: { x: 0, y: 0 }, targetPos: { x: 0, y: 0 },
      spawnedAtTick: 0, sourceSpawnerId: null,
    });
    c.ehp = 10_000; c.maxEhp = 10_000;
    w.creatures.set(c.id, c);
    return { w, c };
  }

  it('damageEntity: magic on a demons TIER-3 unit (its DEF vs MRES 4) is rescaled; physical lands it all', () => {
    // ⭐ S194 — re-pinned off the castle soldier (now MRES 1 = DEF for every race, so magic lands it all)
    // onto the demons tier-3 unit, which keeps the race table.
    const t = 't3Souleater' as const;
    const m = oneVictim(t, 'demons');
    damageEntity(m.w, { kind: 'creature', id: m.c.id }, 90, 'aura', null, 'magic');
    expect(10_000 - m.c.ehp).toBe(magicHitFifths(90, getCreatureConfig(t).def, RACE_MRES_LEVEL.demons));
    const s = oneVictim('raceUnit', 'demons');
    damageEntity(s.w, { kind: 'creature', id: s.c.id }, 90, 'aura', null, 'magic');
    expect(10_000 - s.c.ehp, 'a demons SOLDIER: MRES 1 = DEF 1, magic lands it all').toBe(90);
    const p = oneVictim('raceUnit', 'demons');
    damageEntity(p.w, { kind: 'creature', id: p.c.id }, 90, 'creature', null, 'physical');
    expect(10_000 - p.c.ehp).toBe(90);
  });

  it('⭐ S194 HIS — the castle soldier resists the SAME for every race (it used to read its owner’s race)', () => {
    for (const r of RACES) {
      const v = oneVictim('raceUnit', r);
      damageEntity(v.w, { kind: 'creature', id: v.c.id }, 50, 'aura', null, 'magic');
      expect(10_000 - v.c.ehp, r).toBe(50); // MRES 1 = DEF 1
    }
  });

  it('damageConnector: a magic hit on a structure banks exactly what a physical one banks (R192-M5)', () => {
    for (const cls of ['physical', 'magic'] as const) {
      const w = makeWorld(2);
      const a = { id: 1, pos: { x: 0, y: 0 }, bonds: new Set<number>() };
      const b = { id: 2, pos: { x: 30, y: 0 }, bonds: new Set<number>() };
      w.primitives.set(1 as never, a as never);
      w.primitives.set(2 as never, b as never);
      w.bonds.set(5 as never, { id: 5, aId: 1, bId: 2, a, b, damageFifths: 0 } as never);
      a.bonds.add(5); b.bonds.add(5);
      expect(damageConnector(w, 5 as never, 4, null, cls)).toBe(false); // pool(1) = 6
      expect((w.bonds.get(5 as never) as { damageFifths: number }).damageFifths, cls).toBe(4);
    }
  });
});
