/**
 * SPARK — S192 (owner R192-M2) — ⭐⭐ REACH: EVERY MAGIC SOURCE ARRIVES AT THE MRES RESCALE THROUGH THE REAL
 * `runHostTick`, ON A REAL VICTIM, AND THE VICTIM LOSES EXACTLY WHAT THE RESCALE SAID.
 *
 * A source-text census proves each source PASSES a magic class; it cannot prove the class reaches the
 * arithmetic (CLAUDE.md §2). So `landedFifths` is wrapped (`vi.mock`, the real function underneath) and
 * every call is recorded with its class, the victim's DEF/MRES and what it returned. Each source is then
 * driven through the host tick against two held victims:
 *   · an ARCHDEMON (DEF 8, MRES 14 — ⚠ MINE) — magic must land LESS than the raw number, and
 *   · a control whose MRES = DEF (an orcs castle soldier, or the Voltkin) — magic lands the raw number.
 * Victims are stunned (a stun stops what a unit DOES, never what is done to it) with deep pools so a
 * 300-fifth column is measured rather than fatal.
 */
import { describe, expect, it, vi } from 'vitest';
import type { DamageClass } from './magicResist.ts';

interface Call { amount: number; cls: DamageClass; def: number; mres: number; phase: number; out: number }
const H = vi.hoisted(() => ({ calls: [] as Call[] }));

vi.mock('./magicResist.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./magicResist.ts')>();
  return {
    ...real,
    landedFifths: (amount: number, cls: DamageClass, def: number, mres: number, phase: number): number => {
      const out = real.landedFifths(amount, cls, def, mres, phase);
      H.calls.push({ amount, cls, def, mres, phase, out });
      return out;
    },
  };
});

import { PLAYER_COLORS, RA_RITUAL_TICKS, STINK_AURA_CADENCE_TICKS, ZOMBIE_AURA_PER_MILLE, phaseDurationTicks } from '../constants.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { asCreatureId, makeCreature, type Creature, type CreatureType } from './creatures/creature.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import type { Controls } from '../input/controls.ts';
import type { DraftPick } from './draft.ts';
import type { RaceId } from './races.ts';
import { asDefenderId, asPlayerId, asSpawnerId, type PlayerId } from '../types.ts';
import { magicHitFifths, mresFor } from './magicResist.ts';
import { attackFifths } from './stats.ts';
import { raColumnImpactTick, raColumnPos } from './bossSkillsPharaohRitual.ts';
import { RA_STRIKE_FIFTHS, raStrikeColumnPos } from './racial/powerOfRa.ts';
import { raColumnPoolFor, raSplitShares } from './racial/raColumn.ts';
import { dotIntervalTicks, maxPoolFifths } from './damageOverTime.ts';
import { SCORCHED_GROUND_PER_MILLE } from './racial/scorchedGround.ts';
import { makeDefender } from './defenders/defender.ts';
import { SparkType } from '../constants.ts';
import { STINK_HUB_TYPE, STINK_LEAF_TYPE } from './godlyRecipes/stinkTower.ts';
import { PRIMITIVE_MAX_HP } from './damage.ts';
import type { Primitive } from '../game/primitive.ts';
import { asPrimitiveId, type BondId } from '../types.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const DEEP = 100_000;
const ARCH: CreatureType = 't9BossDemons';
const ARCH_DEF = getCreatureConfig(ARCH).def;

function twoSeat(r0: RaceId, picks0: DraftPick[], r1: RaceId = 'orcs'): World {
  const w = makeWorld(0x192a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0], raceId: r0 }, { seat: 1, color: PLAYER_COLORS[1], raceId: r1 }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT') * 100;
  w.creatures.clear();
  w.draft = null;
  w.players.get(P0)!.draftPicks = [...picks0];
  w.players.get(P1)!.draftPicks = [];
  return w;
}

function unit(w: World, type: CreatureType, owner: PlayerId, at: { x: number; y: number }, held = true): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++), ownerPlayerId: owner, pos: { ...at }, targetPos: { ...at },
    spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(900 + w.creatures.size), clock: w,
  });
  c.ehp = DEEP;
  c.maxEhp = DEEP;
  if (held) c.stunnedUntilTick = w.tick + 1_000_000;
  w.creatures.set(c.id, c);
  return c;
}

function place(c: Creature, at: { x: number; y: number }): void {
  c.pos = { x: at.x, y: at.y };
  c.prevPos = { x: at.x, y: at.y };
  c.targetPos = { x: at.x, y: at.y };
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function rig(w: World): { d: HostTickDeps; s: HostTickState } {
  return {
    d: {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
      botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
    } as unknown as HostTickDeps,
    s: makeHostTickState(w),
  };
}
function ticks(w: World, r: { d: HostTickDeps; s: HostTickState }, n: number): void {
  for (let i = 0; i < n; i++) runHostTick(w, r.d, r.s);
}

const lost = (c: Creature): number => DEEP - c.ehp;
const callsOn = (c: Creature): Call[] => H.calls.filter((k) => k.phase === (c.id as unknown as number));
const sumOut = (cs: Call[]): number => cs.reduce((s, k) => s + k.out, 0);
const sumIn = (cs: Call[]): number => cs.reduce((s, k) => s + k.amount, 0);
const isDot = (k: Call): boolean => typeof k.cls === 'object';

describe('S192 MRES — ⭐⭐ REACH of every magic source through the real host tick', () => {
  /*
   * ⭐⭐ S193 (owner flag) — **MRES APPLIES PER RA SHARE, NOT TO THE COLUMN TOTAL.** Since S191/S192 one
   * column is a 35-fifth POOL split across everything it catches (`raSplitShares`, total order d², kind,
   * id). Each share then goes through the funnel on ITS OWN target, so each is defended by that target's
   * own MRES. Two victims, one column: the Archdemon (d² 0, share 18, MRES 14 > DEF 8) and an orcs soldier
   * (d² 36, share 17, MRES = DEF). The discriminator is the SOLDIER: a total-based rescale would have
   * shrunk the 35 by somebody's MRES before splitting, so the soldier — who resists nothing — would lose
   * less than his 17. Per share, he loses exactly 17 and only the Archdemon's share shrinks.
   */
  const raShareCase = (w: World, r: { d: HostTickDeps; s: HostTickState }, arch: Creature, ctl: Creature, pool: number): void => {
    const shares = raSplitShares(pool, 2);
    expect(shares, 'fixture: 35 split two ways, the nearer target first').toEqual([18, 17]);
    expect(lost(ctl), 'MRES = DEF: his share lands raw — the Archdemon’s MRES never touched it').toBe(shares[1]);
    expect(lost(arch), 'the Archdemon resists HIS share').toBe(magicHitFifths(shares[0]!, ARCH_DEF, mresFor(ARCH, null)));
    expect(lost(arch)).toBeLessThan(shares[0]!);
    // ⛔ NEGATIVE — the total-then-split reading would not produce these numbers.
    const total = magicHitFifths(pool, ARCH_DEF, mresFor(ARCH, null));
    expect(lost(ctl) + lost(arch), 'not the rescaled total').not.toBe(total);
    const k = callsOn(arch);
    expect(k.length).toBe(1);
    expect(k[0], 'the funnel saw the SHARE, never the pool').toMatchObject({ cls: 'magic', def: ARCH_DEF, mres: 14, amount: shares[0] });
    expect(callsOn(ctl)[0]).toMatchObject({ cls: 'magic', amount: shares[1], out: shares[1] });
    void w; void r;
  };

  it('POWER OF RA (mummies L0): MRES is applied PER SHARE — each split share is defended by its own target', () => {
    H.calls.length = 0;
    const w = twoSeat('mummies', ['racial']);
    const r = rig(w);
    const arch = unit(w, ARCH, P1, { x: 100, y: 900 });
    const ctl = unit(w, 'raceUnit', P1, { x: 140, y: 900 }); // orcs: MRES 1 = DEF 1
    dispatch(w, { type: 'CAST_POWER_OF_RA', playerId: P0, x: 960, y: 260 });
    const strike = w.players.get(P0)!.raStrikes[0]!;
    const impact = raColumnImpactTick(strike.untilTick, 0);
    ticks(w, r, impact - 1 - w.tick);
    const spot = raStrikeColumnPos(P0, 0, strike);
    place(arch, spot);
    place(ctl, { x: spot.x + 6, y: spot.y });
    runHostTick(w, r.d, r.s);
    expect(w.tick).toBe(impact);
    const pool = raColumnPoolFor(w, P0);
    expect(pool).toBe(RA_STRIKE_FIFTHS);
    raShareCase(w, r, arch, ctl, pool);
  });

  it('the PHARAOH’S OWN RA RITUAL column (R190-E): magic, PER SHARE, through the same landRaColumn', () => {
    H.calls.length = 0;
    const w = twoSeat('mummies', []);
    const r = rig(w);
    const pharaoh = unit(w, 't9BossMummies', P0, { x: 960, y: 540 });
    pharaoh.raRitualUntilTick = w.tick + RA_RITUAL_TICKS;
    const arch = unit(w, ARCH, P1, { x: 100, y: 900 });
    const ctl = unit(w, 'raceUnit', P1, { x: 140, y: 900 });
    const impact = raColumnImpactTick(pharaoh.raRitualUntilTick, 0);
    ticks(w, r, impact - 1 - w.tick);
    const spot = raColumnPos(pharaoh.id as unknown as number, 0, pharaoh.pos.x, pharaoh.pos.y);
    place(arch, spot);
    place(ctl, { x: spot.x + 6, y: spot.y });
    runHostTick(w, r.d, r.s);
    raShareCase(w, r, arch, ctl, raColumnPoolFor(w, P0));
  });

  it('the VOLTKIN — its chain lightning is magic on every link it lands', () => {
    H.calls.length = 0;
    const w = twoSeat('orcs', [], 'orcs');
    const r = rig(w);
    const v = unit(w, 'voltkin', P0, { x: 900, y: 500 }, false);
    const seed = unit(w, 'raceUnit', P1, { x: 930, y: 500 }); // nearest — the zap
    const hop = unit(w, ARCH, P1, { x: 1000, y: 500 }); // within the 120 px hop range of the seed
    ticks(w, r, 240);
    expect(v.killCount).toBe(0);
    const onSeed = callsOn(seed);
    const onHop = callsOn(hop);
    expect(onSeed.length + onHop.length, 'the Voltkin struck through the magic arm').toBeGreaterThan(0);
    // EVERY fifth either victim lost came through the magic rescale, and it said what landed.
    expect(lost(seed)).toBe(sumOut(onSeed));
    expect(lost(hop)).toBe(sumOut(onHop));
    for (const k of [...onSeed, ...onHop]) expect(k.cls).toBe('magic');
    expect(onHop.length, 'the chain hopped to the Archdemon').toBeGreaterThan(0);
    expect(sumOut(onHop), 'MRES 14 > DEF 8 — the bolt lands less').toBeLessThan(sumIn(onHop));
    expect(sumOut(onSeed), 'MRES = DEF — the bolt lands in full').toBe(sumIn(onSeed));
  });

  it('the STINK TOWER AURA — one fifth a second, spread over beats: 13/19 of it on the Archdemon', () => {
    H.calls.length = 0;
    const w = twoSeat('orcs', [], 'orcs');
    const r = rig(w);
    // A REAL stink-tower star (a Square hub, three Circle leaves, real bonds) so the 0.5 s recipe poll keeps it.
    const prim = (type: SparkType, x: number, y: number): Primitive => {
      const p = {
        id: asPrimitiveId(w.nextPrimitiveId++), type, placerColor: PLAYER_COLORS[0]!, placedBy: P0,
        createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: PLAYER_COLORS[0]!,
        lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
      } as unknown as Primitive;
      w.primitives.set(p.id, p);
      return p;
    };
    const anchor = prim(STINK_HUB_TYPE, 600, 300);
    for (const [dx, dy] of [[32, 0], [-16, 28], [-16, -28]] as const) {
      const leaf = prim(STINK_LEAF_TYPE, 600 + dx, 300 + dy);
      const id = w.nextBondId++ as unknown as BondId;
      w.bonds.set(id, {
        id, aId: anchor.id, bId: leaf.id, a: anchor, b: leaf, restLength: 32, stiffnessTier: 'MID',
        damageFifths: 0, createdTick: 0,
      } as never);
      anchor.bonds.add(id);
      leaf.bonds.add(id);
    }
    const d = makeDefender({
      id: asDefenderId(w.nextDefenderId++), kind: 'stinkTower', ownerPlayerId: P0, anchorPrimitiveId: anchor.id,
      recipeId: 'stinkTower', pos: { x: 600, y: 300 }, registeredAtTick: 0,
    });
    d.bagsRemaining = 0; // depleted: the aura alone, no bags thrown
    w.defenders.set(d.id, d);
    const arch = unit(w, ARCH, P1, { x: 650, y: 300 });
    const ctl = unit(w, 'raceUnit', P1, { x: 600, y: 350 });
    const pulses = 38;
    ticks(w, r, pulses * STINK_AURA_CADENCE_TICKS);
    expect(w.defenders.has(d.id), 'the tower stood for the whole window').toBe(true);
    // ⚠ A spent tower still lobs (the bag splash is PHYSICAL, 6 fifths) and its landed clouds are the same
    // smell (MAGIC, ⚠ MINE Q-C), so the victims take more than the aura alone. What this pins: every MAGIC
    // fifth came through the rescale, at one fifth a beat on MRES = DEF and 13/19 of it on the Archdemon.
    const kc = callsOn(ctl);
    const ka = callsOn(arch);
    expect(kc.length, 'the aura pulsed on the soldier every second').toBeGreaterThanOrEqual(pulses);
    expect(ka.length).toBeGreaterThanOrEqual(pulses);
    expect([...kc, ...ka].every(isDot)).toBe(true);
    for (const k of kc) expect(k.out, 'MRES = DEF: one fifth, as today').toBe(1);
    expect(sumOut(ka)).toBeLessThan(ka.length);
    expect(Math.abs(sumOut(ka) - (ka.length * 13) / 19)).toBeLessThanOrEqual(2);
    expect(ka.every((k) => k.def === ARCH_DEF && k.mres === 14)).toBe(true);
  });

  it('SCORCHED GROUND (demons L0) — the burn is magic: MRES 14 burns the Archdemon slower, MRES = DEF burns at today’s rate', () => {
    H.calls.length = 0;
    const w = twoSeat('demons', ['racial'], 'orcs');
    const r = rig(w);
    const arch = unit(w, ARCH, P1, { x: 600, y: 200 });
    const ctl = unit(w, 'voltkin', P1, { x: 640, y: 200 }); // global: MRES = DEF = 3
    const iCtl = dotIntervalTicks(maxPoolFifths('voltkin'), SCORCHED_GROUND_PER_MILLE);
    const n = 6;
    ticks(w, r, iCtl * n);
    expect(lost(ctl), 'one fifth per due beat, as today').toBe(n);
    const k = callsOn(arch);
    expect(k.length).toBeGreaterThan(10);
    expect(k.every(isDot)).toBe(true);
    expect(lost(arch)).toBe(sumOut(k));
    expect(lost(arch)).toBeLessThan(k.length);
    expect(Math.abs(lost(arch) - Math.round((k.length * 13) / 19))).toBeLessThanOrEqual(1);
  });

  it('the ZOMBIE BOSS ROT — magic DoT ticks on every enemy in his radius, at today’s rate on MRES = DEF', () => {
    H.calls.length = 0;
    const w = twoSeat('zombies', [], 'orcs');
    const r = rig(w);
    unit(w, 't9BossZombies', P0, { x: 500, y: 500 }, false);
    const arch = unit(w, ARCH, P1, { x: 640, y: 500 });
    const ctl = unit(w, 'voltkin', P1, { x: 500, y: 640 });
    ticks(w, r, 120);
    const a = callsOn(arch).filter(isDot);
    const c = callsOn(ctl).filter(isDot);
    expect(a.length).toBeGreaterThan(5);
    expect(c.length).toBeGreaterThan(0);
    for (const k of c) expect(k.out, 'MRES = DEF: exactly one fifth').toBe(1);
    expect(a.every((k) => k.def === ARCH_DEF && k.mres === 14)).toBe(true);
    expect(sumOut(a)).toBeLessThan(a.length);
    void ZOMBIE_AURA_PER_MILLE;
  });

  it('⛔ NEGATIVE — a PHYSICAL source on the Archdemon never reaches the rescale', () => {
    H.calls.length = 0;
    const w = twoSeat('orcs', [], 'orcs');
    const r = rig(w);
    unit(w, 'goblinMelee', P0, { x: 900, y: 500 }, false);
    const arch = unit(w, ARCH, P1, { x: 925, y: 500 });
    ticks(w, r, 240);
    expect(lost(arch), 'the goblin swung').toBeGreaterThan(0);
    expect(callsOn(arch)).toEqual([]);
    expect(lost(arch) % attackFifths(2, 1), 'whole raw swings of 12').toBe(0);
  });
});
