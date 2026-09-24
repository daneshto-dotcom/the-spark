/**
 * SPARK — S188 — BLOOD DEBT (vampires L0, 20 %) and CRIMSON TIDE (vampires L5, 50 %).
 *
 * Three layers, the S187 rule: the ARITHMETIC (pure), the FUNNEL (every `damageEntity` arm and
 * `damageConnector`, including every no-damage path that must heal nothing), and the REACH — a
 * vampire unit actually healing while it fights, through the real `runHostTick`. The negatives are
 * a vampire seat WITHOUT the pick, and a seat of ANOTHER race WITH its racial pick.
 */
import { describe, expect, it } from 'vitest';
import {
  GOBLIN_MELEE_ATK,
  GOBLIN_MELEE_PEN,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  SparkType,
  phaseDurationTicks,
} from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { damageConnector, damageEntity } from '../damage.ts';
import {
  BLOOD_DEBT_LIFESTEAL_PCT,
  CRIMSON_TIDE_LIFESTEAL_PCT,
  lifestealFifths,
  lifestealPctFor,
} from './lifesteal.ts';
import { asCreatureId, creatureMaxEhp, makeCreature, type Creature, type CreatureType } from '../creatures/creature.ts';
import { CREATURE_CONFIGS, getCreatureConfig } from '../creatures/voltkin-config.ts';
import { attackFifths } from '../stats.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import type { Controls } from '../../input/controls.ts';
import type { Primitive } from '../../game/primitive.ts';
import type { DraftPick } from '../draft.ts';
import type { RaceId } from '../races.ts';
import {
  asBondId, asDefenderId, asPlayerId, asPrimitiveId, asSpawnerId, asStinkCloudId, type BondId, type PlayerId,
} from '../../types.ts';
import { makeDefender } from '../defenders/defender.ts';
import { applyVoltkinChain, chainJumpFifths } from '../creatures/voltkinChain.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const GOBLIN_SWING = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN); // 12

// ── fixtures (the `buildingTargeting.test.ts` shapes, which drive the real tick) ─────────────────
function twoSeat(): World {
  const w = makeWorld(0x188a);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

function seatAs(w: World, seat: PlayerId, raceId: RaceId, picks: DraftPick[]): void {
  const pl = w.players.get(seat);
  if (pl === undefined) throw new Error('fixture: seat missing');
  pl.raceId = raceId;
  pl.draftPicks = [...picks];
}

function unit(w: World, type: CreatureType, owner: PlayerId, x: number, y: number): Creature {
  const c = makeCreature(getCreatureConfig(type), {
    id: asCreatureId(w.nextCreatureId++),
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: w.tick,
    sourceSpawnerId: asSpawnerId(900 + w.creatures.size),
    clock: w,
  });
  w.creatures.set(c.id, c);
  return c;
}

function addShape(w: World, owner: PlayerId, x: number, y: number): Primitive {
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const seat = owner as unknown as number;
  const p = {
    id, type: SparkType.Square,
    placerColor: PLAYER_COLORS[seat]!, placedBy: owner, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set<BondId>(),
    ownerColor: PLAYER_COLORS[seat]!, lastOwnershipChange: 0,
    radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  } as unknown as Primitive;
  w.primitives.set(id, p);
  return p;
}

let nextBond = 18800;
function connect(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(nextBond++);
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
  } as never);
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

/** A chain of `n` connectors — pool `n × (5 + n)`, sturdy enough to take several swings. */
function building(w: World, owner: PlayerId, x: number, y: number, n: number): BondId[] {
  let prev = addShape(w, owner, x, y);
  const out: BondId[] = [];
  for (let i = 1; i <= n; i++) {
    const next = addShape(w, owner, x + 32 * i, y);
    out.push(connect(w, prev, next));
    prev = next;
  }
  return out;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

/** Every value `c.ehp` takes, tick by tick, through the real host tick. */
function ehpTrace(w: World, c: Creature, ticks: number): number[] {
  const d = deps();
  const st = makeHostTickState(w);
  const out = [c.ehp];
  for (let i = 0; i < ticks; i++) {
    runHostTick(w, d, st);
    const now = w.creatures.get(c.id);
    if (now === undefined) break;
    out.push(now.ehp);
  }
  return out;
}

/** The first step at which the pool ROSE, and by how much (null if it never did). */
function firstRise(trace: number[]): number | null {
  for (let i = 1; i < trace.length; i++) if (trace[i]! > trace[i - 1]!) return trace[i]! - trace[i - 1]!;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 BLOOD DEBT / CRIMSON TIDE — the arithmetic', () => {
  it("⭐ HIS EXAMPLE: a 20 hit heals 4 at 20 %", () => {
    expect(BLOOD_DEBT_LIFESTEAL_PCT).toBe(20);
    expect(lifestealFifths(20, BLOOD_DEBT_LIFESTEAL_PCT)).toBe(4);
  });

  it('floors, and never below ONE on a real hit (the floor-at-one rule)', () => {
    expect(lifestealFifths(GOBLIN_SWING, 20)).toBe(2); // 2.4
    expect(lifestealFifths(6, 20)).toBe(1); // the race unit's 1.2
    expect(lifestealFifths(1, 20)).toBe(1); // 0.2 → one
    expect(lifestealFifths(1, 50)).toBe(1);
    expect(lifestealFifths(GOBLIN_SWING, 50)).toBe(6);
    expect(lifestealFifths(7, 50)).toBe(3); // 3.5
  });

  it('no hit, or no perk, heals nothing', () => {
    expect(lifestealFifths(0, 20)).toBe(0);
    expect(lifestealFifths(20, 0)).toBe(0);
  });

  it('is a whole number between 1 and the hit for EVERY shipped attacker, at both rates', () => {
    for (const cfg of Object.values(CREATURE_CONFIGS)) {
      const hit = attackFifths(cfg.atk, cfg.pen);
      for (const pct of [BLOOD_DEBT_LIFESTEAL_PCT, CRIMSON_TIDE_LIFESTEAL_PCT]) {
        const h = lifestealFifths(hit, pct);
        expect(Number.isInteger(h), `${cfg.type} @ ${pct}`).toBe(true);
        expect(h).toBeGreaterThanOrEqual(1);
        expect(h).toBeLessThanOrEqual(hit);
      }
    }
  });

  it('⛔ CRIMSON TIDE REPLACES the 20, it does not add to it — 50 with or without L0', () => {
    expect(CRIMSON_TIDE_LIFESTEAL_PCT).toBe(50);
    expect(lifestealPctFor({ raceId: 'vampires', draftPicks: ['racial'] })).toBe(20);
    expect(lifestealPctFor({ raceId: 'vampires', draftPicks: ['racial', 'racial'] })).toBe(50);
    expect(lifestealPctFor({ raceId: 'vampires', draftPicks: ['hp', 'racial'] })).toBe(50);
  });

  it('⛔ a seat without the pick, and ANOTHER race with its racial pick, have none', () => {
    expect(lifestealPctFor({ raceId: 'vampires', draftPicks: [] })).toBe(0);
    expect(lifestealPctFor({ raceId: 'vampires', draftPicks: ['hp', 'def'] })).toBe(0);
    expect(lifestealPctFor({ raceId: 'orcs', draftPicks: ['racial', 'racial'] })).toBe(0);
    expect(lifestealPctFor({ raceId: 'zombies', draftPicks: ['racial'] })).toBe(0);
    expect(lifestealPctFor(undefined)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 lifesteal — every funnel arm heals on a LANDED hit, and only then', () => {
  function vampireAttacker(): { w: World; a: Creature } {
    const w = twoSeat();
    seatAs(w, P0, 'vampires', ['racial']);
    const a = unit(w, 'goblinMelee', P0, 500, 500);
    a.ehp = 1;
    return { w, a };
  }
  const by = (a: Creature) => ({ kind: 'creature' as const, id: a.id });

  it('a creature hit heals the attacker', () => {
    const { w, a } = vampireAttacker();
    const v = unit(w, 't3Warband', P1, 520, 500);
    damageEntity(w, { kind: 'creature', id: v.id }, GOBLIN_SWING, 'creature', by(a));
    expect(a.ehp).toBe(1 + lifestealFifths(GOBLIN_SWING, 20));
  });

  it('a killing blow still heals (overkill included — the number he reads)', () => {
    const { w, a } = vampireAttacker();
    const v = unit(w, 'chewer', P1, 520, 500);
    const died = damageEntity(w, { kind: 'creature', id: v.id }, GOBLIN_SWING, 'creature', by(a));
    expect(died).toBe(true);
    expect(a.ehp).toBe(3);
  });

  it('a hit on a CONNECTOR heals — the building funnel carries the attacker now', () => {
    const { w, a } = vampireAttacker();
    const [bond] = building(w, P1, 600, 600, 5);
    damageConnector(w, bond!, GOBLIN_SWING, by(a));
    expect(a.ehp).toBe(3);
  });

  it('a hit on a lone SHAPE and on the CASTLE heal', () => {
    const { w, a } = vampireAttacker();
    const lone = addShape(w, P1, 700, 700);
    damageEntity(w, { kind: 'primitive', id: lone.id }, GOBLIN_SWING, 'creature', by(a));
    expect(a.ehp).toBe(3);
    damageEntity(w, { kind: 'castle', seat: P1 }, GOBLIN_SWING, 'creature', by(a));
    expect(a.ehp).toBe(5);
  });

  it('⛔ capped at the attacker’s OWN full pool — never an overheal', () => {
    const { w, a } = vampireAttacker();
    const max = creatureMaxEhp(a);
    a.ehp = max - 1;
    damageEntity(w, { kind: 'castle', seat: P1 }, 1000, 'creature', by(a));
    expect(a.ehp).toBe(max);
    damageEntity(w, { kind: 'castle', seat: P1 }, 1000, 'creature', by(a));
    expect(a.ehp).toBe(max);
  });

  it('⛔ respects a DRAFT-BUFFED max (creatureMaxEhp), not the type config', () => {
    const { w, a } = vampireAttacker();
    a.maxEhp = 9; // a buffed goblin (config pool 7)
    a.ehp = 5;
    damageEntity(w, { kind: 'castle', seat: P1 }, 1000, 'creature', by(a));
    expect(a.ehp).toBe(9);
  });

  it('⛔ NO damage landed ⇒ NO heal: a fallen castle, a tower, a channelling Pharaoh, a corpse, a missing target', () => {
    const { w, a } = vampireAttacker();
    w.players.get(P1)!.castleHp = 0;
    damageEntity(w, { kind: 'castle', seat: P1 }, GOBLIN_SWING, 'creature', by(a));
    // a TOWER: a defender with no pool
    w.defenders.set(4242 as never, { id: 4242, ehp: null } as never);
    damageEntity(w, { kind: 'defender', id: 4242 as never }, GOBLIN_SWING, 'creature', by(a));
    // a Pharaoh between realities — damage passes straight through him
    const ph = unit(w, 't9BossMummies', P1, 800, 500);
    ph.raRitualUntilTick = w.tick + 100;
    const phBefore = ph.ehp;
    damageEntity(w, { kind: 'creature', id: ph.id }, GOBLIN_SWING, 'creature', by(a));
    expect(ph.ehp).toBe(phBefore);
    // a corpse already awaiting the sweep
    const corpse = unit(w, 't3Warband', P1, 820, 500);
    corpse.ehp = 0;
    damageEntity(w, { kind: 'creature', id: corpse.id }, GOBLIN_SWING, 'creature', by(a));
    // nothing there at all
    damageEntity(w, { kind: 'creature', id: asCreatureId(999999) }, GOBLIN_SWING, 'creature', by(a));
    damageConnector(w, asBondId(999999), GOBLIN_SWING, by(a));
    expect(a.ehp).toBe(1);
  });

  it('⛔ a DEAD attacker heals nothing (its committed blow still lands — S155 N1)', () => {
    const { w, a } = vampireAttacker();
    a.ehp = 0;
    damageEntity(w, { kind: 'castle', seat: P1 }, GOBLIN_SWING, 'creature', by(a));
    expect(a.ehp).toBe(0);
  });

  /* ⭐ S188 fix round F7 — the three arms the first cut left untested: Helga, a landed bag, a chain link. */
  it('F7 — a hit on HELGA (the one defender with a pool) heals the attacker', () => {
    const { w, a } = vampireAttacker();
    const anchor = addShape(w, P1, 900, 900);
    const helga = makeDefender({
      id: asDefenderId(w.nextDefenderId++), kind: 'princess', ownerPlayerId: P1,
      anchorPrimitiveId: anchor.id, recipeId: 'helga' as never, pos: { x: 900, y: 900 }, registeredAtTick: 0,
    });
    w.defenders.set(helga.id, helga);
    expect(helga.ehp, 'fixture: Helga has a pool').not.toBeNull();
    const before = helga.ehp!;
    damageEntity(w, { kind: 'defender', id: helga.id }, GOBLIN_SWING, 'creature', by(a));
    expect(helga.ehp, 'the blow landed').toBe(before - GOBLIN_SWING);
    expect(a.ehp).toBe(1 + lifestealFifths(GOBLIN_SWING, BLOOD_DEBT_LIFESTEAL_PCT));
  });

  it('F7 — a hit on a LANDED STINK BAG heals the attacker', () => {
    const { w, a } = vampireAttacker();
    const id = asStinkCloudId(4401);
    // A bag that SURVIVES the hit, so its burst (which would also hit the attacker) does not fire.
    w.stinkClouds.set(id, { id, pos: { x: 950, y: 950 }, ownerPlayerId: P1, landedAtTick: w.tick, radius: 40, ehp: 30 } as never);
    damageEntity(w, { kind: 'stinkCloud', id }, GOBLIN_SWING, 'creature', by(a));
    expect(w.stinkClouds.get(id)?.ehp, 'the blow landed').toBe(30 - GOBLIN_SWING);
    expect(a.ehp).toBe(1 + lifestealFifths(GOBLIN_SWING, BLOOD_DEBT_LIFESTEAL_PCT));
  });

  it('F7 — every VOLTKIN CHAIN LINK heals the Voltkin, at the link’s own diminished hit', () => {
    const { w } = vampireAttacker();
    const volt = unit(w, 'voltkin', P0, 400, 400);
    volt.ehp = 1;
    const seed = unit(w, 't3Warband', P1, 450, 400);
    const link = unit(w, 't3Warband', P1, 520, 400); // 70 px from the seed, inside the hop range
    const linkBefore = link.ehp;
    const hops = applyVoltkinChain(w, volt, { kind: 'creature', id: seed.id, pos: { ...seed.pos } });
    const jump1 = chainJumpFifths(attackFifths(getCreatureConfig('voltkin').atk, getCreatureConfig('voltkin').pen), 1);
    expect(hops, 'fixture: the bolt jumped').toBeGreaterThanOrEqual(1);
    expect(link.ehp, 'the link took the jump-1 hit').toBe(linkBefore - jump1);
    // The seed is NOT re-hit here (its strike belongs to applyCreatureAttack), so the only heal is the link's.
    expect(volt.ehp).toBe(1 + lifestealFifths(jump1, BLOOD_DEBT_LIFESTEAL_PCT));
  });

  it('a null attacker (area damage) and a DEFENDER attacker heal no creature', () => {
    const { w, a } = vampireAttacker();
    damageEntity(w, { kind: 'castle', seat: P1 }, GOBLIN_SWING, 'aura', null);
    damageEntity(w, { kind: 'castle', seat: P1 }, GOBLIN_SWING, 'defender', { kind: 'defender', id: a.id as never });
    expect(a.ehp).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('S188 lifesteal — ⭐ REACH: a vampire unit heals while it fights, through the real host tick', () => {
  /** A melee goblin at 1 fifth beside a 5-connector enemy building, over 200 real ticks. */
  function chewTheBuilding(raceId: RaceId, picks: DraftPick[]): number[] {
    const w = twoSeat();
    seatAs(w, P0, raceId, picks);
    const bonds = building(w, P1, 500, 500, 5);
    const g = unit(w, 'goblinMelee', P0, 495, 500);
    g.ehp = 1;
    const trace = ehpTrace(w, g, 200);
    const banked = bonds.reduce((s, b) => s + (w.bonds.get(b)?.damageFifths ?? 0), 0);
    // CONTROL: the goblin really did hit the building (else a flat trace proves nothing)
    expect(banked + (5 - bonds.filter((b) => w.bonds.has(b)).length), 'fixture: the goblin must strike').toBeGreaterThan(0);
    return trace;
  }

  it('⭐ BLOOD DEBT: chewing a TOWER heals — the first rise is exactly 20 % of a 12 swing = 2', () => {
    const trace = chewTheBuilding('vampires', ['racial']);
    expect(firstRise(trace)).toBe(lifestealFifths(GOBLIN_SWING, BLOOD_DEBT_LIFESTEAL_PCT));
    expect(Math.max(...trace)).toBeLessThanOrEqual(getMaxGoblin());
  });

  it('⭐ CRIMSON TIDE: the same swing heals 6 (50 %), to the cap', () => {
    const trace = chewTheBuilding('vampires', ['hp', 'racial']);
    expect(firstRise(trace)).toBe(lifestealFifths(GOBLIN_SWING, CRIMSON_TIDE_LIFESTEAL_PCT));
  });

  it('⛔ NEGATIVE: a vampire seat WITHOUT the pick never heals', () => {
    expect(firstRise(chewTheBuilding('vampires', ['hp']))).toBeNull();
  });

  it('⛔ NEGATIVE: an ORC seat WITH its racial pick never heals', () => {
    expect(firstRise(chewTheBuilding('orcs', ['racial']))).toBeNull();
  });

  it('⭐ the CASTLE arm reaches too: vampire goblins at the enemy keep heal as they swing', () => {
    const w = twoSeat();
    seatAs(w, P0, 'vampires', ['racial']);
    const keep = castleAnchor(1, w.layout);
    const gs: Creature[] = [];
    // `castleGuns.test.ts`'s push fixture: in contact with the keep, so they swing before the gun
    // has shot them all.
    for (let i = 0; i < 8; i++) {
      const g = unit(w, 'goblinMelee', P0, keep.x + i * 3, keep.y);
      g.targetPos = { x: keep.x, y: keep.y };
      g.ehp = 1;
      gs.push(g);
    }
    const hpBefore = w.players.get(P1)!.castleHp;
    const d = deps();
    const st = makeHostTickState(w);
    let rose = false;
    const last = new Map(gs.map((g) => [g.id, g.ehp] as const));
    for (let t = 0; t < 400 && !rose; t++) {
      runHostTick(w, d, st);
      for (const g of gs) {
        const now = w.creatures.get(g.id);
        if (now === undefined) continue;
        if (now.ehp > last.get(g.id)!) rose = true;
        last.set(g.id, now.ehp);
      }
    }
    expect(w.players.get(P1)!.castleHp, 'fixture: the keep was hit').toBeLessThan(hpBefore);
    expect(rose).toBe(true);
  });
});

function getMaxGoblin(): number {
  const cfg = getCreatureConfig('goblinMelee');
  return cfg.hp * (5 + cfg.def);
}
