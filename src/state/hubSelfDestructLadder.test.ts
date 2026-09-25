/**
 * ⭐⭐ S191 C-5 — **THE LIGHTNING HUB'S SELF-DESTRUCT DEALS 120 FIFTHS. IT NO LONGER RAZES.**
 * (canon §9d item 2 · R182-C, ruled S182 + S187, built here)
 *
 * > *"four times a drone's damage"* — owner, S182 (the AMOUNT)
 * > *"The lightning hub self-destruct will have to rework then. It can't destroy everything around it,
 * > but there should be a certain damage output."* — owner, S187 (the raze is killed)
 *
 * `4 × attackFifths(DRONE_ATK 5, DRONE_PEN 1)` = 120, dealt ONCE to every ENEMY entity inside
 * `STRUCTURE_SELFDESTRUCT_RADIUS` (240 px), through the ordinary funnels and on the ONE ladder:
 * creatures, Helga, lone built shapes, landed stink bags, and connectors (`damageConnector`, no
 * creature attacker → no lifesteal). A shape INSIDE a structure has no arm — a building dies through
 * its connectors (canon §4). ⛔ The S157 P0 owner exemption is untouched. The castle is not an arm.
 *
 * The first block drives it through the REAL host tick: a real hub, banked below a third, fused and
 * blown by the real spawner poll in FIGHT. Everything around it is STUNNED so the only thing acting on
 * the board in the measured tick is the blast.
 */
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DRONE_ATK,
  DRONE_PEN,
  LIGHTNING_HUB_DEGREE,
  PLAYER_COLORS,
  PRIMITIVE_MAX_HP,
  STRUCTURE_SELFDESTRUCT_RADIUS,
  SparkType,
} from '../constants.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { makeIdlePlayer } from '../game/player.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Controls } from '../input/controls.ts';
import {
  asBondId,
  asDefenderId,
  asPlayerId,
  asPrimitiveId,
  asStinkCloudId,
  type BondId,
  type CreatureId,
  type PlayerId,
} from '../types.ts';
import { bossMaxPoolFifths } from './bossSkills.ts';
import { makeDefender } from './defenders/defender.ts';
import { makeStinkCloud } from './defenders/stinkCloud.ts';
import { makeGameStateExtras } from './gameState.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { applyStructureSelfDestruct } from './potatoLifecycle.ts';
import { mulberry32 } from './rng.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { attackFifths } from './stats.ts';
import { T9_BOSS_TYPE } from './t9BossIds.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { canBuildAt } from './zones.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
/** Derived here independently of the production constant, so the two can be compared. */
const BLAST = 4 * attackFifths(DRONE_ATK, DRONE_PEN);
const HUB_AT = { x: 600, y: 400 };
const FROZEN = 1_000_000_000;

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function prim(w: World, seat: PlayerId, type: SparkType, x: number, y: number): Primitive {
  const player = w.players.get(seat)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const p: Primitive = {
    id, type, placerColor: player.color, placedBy: seat, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, p);
  return p;
}

function link(w: World, a: Primitive, b: Primitive): BondId {
  const id = asBondId(w.nextBondId++);
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  w.bonds.set(id, {
    id, aId: a.id, bId: b.id, a, b,
    restLength: Math.sqrt(dx * dx + dy * dy), stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(id);
  b.bonds.add(id);
  return id;
}

let spawnerSeq = 9100;
/** A creature through the real SPAWN_CREATURE reducer — STUNNED, so it cannot act during the run. */
function spawn(w: World, type: string, owner: PlayerId, x: number, y: number): CreatureId {
  dispatch(w, {
    type: 'SPAWN_CREATURE', creatureType: type as never, ownerPlayerId: owner,
    pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: spawnerSeq++ as never,
  });
  let newest: CreatureId | null = null;
  for (const c of w.creatures.values()) if (newest === null || (c.id as number) > (newest as number)) newest = c.id;
  w.creatures.get(newest!)!.stunnedUntilTick = FROZEN;
  return newest!;
}

function bag(w: World, owner: PlayerId, x: number, y: number) {
  const b = makeStinkCloud({ id: asStinkCloudId(w.nextStinkCloudId++), pos: { x, y }, ownerPlayerId: owner, landedAtTick: w.tick, radius: 30 });
  w.stinkClouds.set(b.id, b);
  return b;
}

function helga(w: World, owner: PlayerId, x: number, y: number) {
  // Her anchor sits in a two-shape structure whose connector is OUTSIDE the blast, so only Helga
  // herself can be what the blast reaches.
  const anchor = prim(w, owner, SparkType.Square, x, y);
  const far = prim(w, owner, SparkType.Square, x + (x < HUB_AT.x ? -400 : 400), y);
  link(w, anchor, far);
  const d = makeDefender({
    id: asDefenderId(w.nextDefenderId++), kind: 'princess', ownerPlayerId: owner,
    anchorPrimitiveId: anchor.id, recipeId: 'helga', pos: { x, y }, registeredAtTick: w.tick,
  });
  w.defenders.set(d.id, d);
  return d;
}

/* ─────────────────────────────── 1 · THROUGH THE REAL HOST TICK ─────────────────────────────── */

/** A real hub (1 Dot of degree 5 + 5 Circles), ignited by the real matcher, drone emission parked. */
function hubBoard(): { w: World; hub: Primitive; d: HostTickDeps; st: ReturnType<typeof makeHostTickState> } {
  const w = makeWorld(0x191c5);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  const hub = prim(w, P0, SparkType.Dot, HUB_AT.x, HUB_AT.y);
  for (let i = 0; i < LIGHTNING_HUB_DEGREE; i++) {
    const a = (i / LIGHTNING_HUB_DEGREE) * Math.PI * 2;
    link(w, hub, prim(w, P0, SparkType.Circle, HUB_AT.x + Math.cos(a) * 40, HUB_AT.y + Math.sin(a) * 40));
  }
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { ...HUB_AT }, bondCount: 5 });
  const d = deps();
  const st = makeHostTickState(w);
  const cursor = { lastMatcherTick: -1 };
  for (let t = 0; t < 2; t++) { runGodlyMatcherCore(w, cursor); runHostTick(w, d, st); }
  expect(w.creatureSpawners.size, 'fixture: the hub ignited').toBe(1);
  // No drones inside the measured window — a drone blast on a bystander would muddy the arithmetic.
  for (const sp of w.creatureSpawners.values()) sp.nextSpawnTick = FROZEN;
  return { w, hub, d, st };
}

/** Bank `fifths` across the hub's own star (below a third = doomed), without any sever. */
function bankOnStar(w: World, hub: Primitive, fifths: number): void {
  const ids = [...hub.bonds].sort((a, b) => Number(a) - Number(b));
  let left = fifths;
  for (const id of ids) {
    const take = Math.min(left, 9);
    w.bonds.get(id)!.damageFifths += take;
    left -= take;
  }
}

describe('⭐⭐ S191 C-5 — REACH: a hub below a third self-destructs in FIGHT and deals 120, not a raze', () => {
  it('chewer dies · boss loses exactly 120 · enemy connector felled · shapes in a structure untouched · the owner untouched', () => {
    expect(BLAST).toBe(120);
    const { w, hub, d, st } = hubBoard();

    // ── the enemy (seat 1), all inside 240 px of the hub ──
    const chewer = spawn(w, 'chewer', P1, 720, 400);
    const boss = spawn(w, T9_BOSS_TYPE.nagas, P1, 600, 560);
    const loneEnemy = prim(w, P1, SparkType.Triangle, 600, 250);
    const enemyBag = bag(w, P1, 440, 400);
    // A chain whose FIRST connector's midpoint is inside (230 px) and second's is outside (270 px).
    const e1 = prim(w, P1, SparkType.Triangle, 810, 400);
    const e2 = prim(w, P1, SparkType.Triangle, 850, 400);
    const e3 = prim(w, P1, SparkType.Triangle, 890, 400);
    const e12 = link(w, e1, e2);
    const e23 = link(w, e2, e3);
    // A shape INSIDE the blast (190 px) but in a structure whose connector is outside (midpoint 255 px).
    const s1 = prim(w, P1, SparkType.Line, 600, 590);
    const s2 = prim(w, P1, SparkType.Line, 600, 720);
    const s12 = link(w, s1, s2);
    // ── the owner (seat 0), all inside 240 px ──
    const ownUnit = spawn(w, 'goblinMelee', P0, 600, 280);
    const ownLone = prim(w, P0, SparkType.Triangle, 720, 300);
    const o1 = prim(w, P0, SparkType.Line, 430, 520);
    const o2 = prim(w, P0, SparkType.Line, 470, 520);
    const o12 = link(w, o1, o2);
    const ownUnitPool = w.creatures.get(ownUnit)!.ehp;
    const enemyCastle = w.players.get(P1)!.castleHp;

    bankOnStar(w, hub, 34); // 16 of 50 left — below a third (R182-A)
    let bossBefore = -1;
    let blewAt = -1;
    for (let t = 0; t < 200 && blewAt < 0; t++) {
      w.effects.length = 0;
      bossBefore = w.creatures.get(boss)!.ehp;
      runHostTick(w, d, st);
      if (w.effects.some((e) => e.kind === 'BOMB_EXPLODE' && e.radius === STRUCTURE_SELFDESTRUCT_RADIUS)) blewAt = t;
    }
    expect(blewAt, 'anti-vacuity: the real poll fused and blew the hub').toBeGreaterThanOrEqual(0);
    expect(w.creatureSpawners.size, 'the hub is gone').toBe(0);
    expect([...w.creatures.values()].some((c) => c.type === 'lightningDrone'), 'no drone muddied the tick').toBe(false);

    // The enemy.
    expect(w.creatures.has(chewer), 'a chewer (pool 5) dies').toBe(false);
    expect(bossMaxPoolFifths(T9_BOSS_TYPE.nagas), 'anti-vacuity: a tier-9 pool is above 120').toBeGreaterThan(BLAST);
    expect(w.creatures.has(boss), 'pre-fix: the raze DELETED him').toBe(true);
    expect(bossBefore - w.creatures.get(boss)!.ehp, 'the boss loses exactly 120').toBe(BLAST);
    expect(w.primitives.has(loneEnemy.id), 'a lone built shape (5) dies').toBe(false);
    expect(w.stinkClouds.has(enemyBag.id), 'a stink bag (5) dies').toBe(false);
    expect(w.bonds.has(e12), 'the connector inside is felled').toBe(false);
    expect(w.connectorBreakHits, 'and the hit that felled it was 120').toContainEqual({ bondId: e12, amount: BLAST });
    const severs = w.effects.filter((e) => e.kind === 'BOND_SEVERED');
    expect(severs.length, 'anti-vacuity: the blast severed something').toBeGreaterThan(0);
    expect(severs.every((e) => e.kind === 'BOND_SEVERED' && e.cause === 'drone'), 'an EXISTING cause, never a new one').toBe(true);
    expect(w.bonds.has(e23), 'the connector outside stands').toBe(true);
    /*
     * ⚠ MEASURED, AND NOT WHAT CANON §2 SAYS: the chain's pool was 14 and the hit was 120, yet the
     * survivor holds NOTHING. `damageConnector` drains the STRUCK bond first, so the 106 of overkill sits
     * on the bond the sever then deletes. Pre-existing (every connector strike in the game does it) and
     * reported by S191 C-5, not fixed here — flip this when `damageConnector` carries it.
     */
    expect(w.bonds.get(e23)!.damageFifths).toBe(0);
    expect(w.primitives.get(s1.id)?.hp, 'a shape INSIDE a structure has no arm').toBe(PRIMITIVE_MAX_HP);
    expect(w.bonds.get(s12)?.damageFifths, 'and its connector outside took nothing').toBe(0);
    expect(w.players.get(P1)!.castleHp, 'the castle is not an arm').toBe(enemyCastle);

    // ⛔ S157 P0 — the owner.
    expect(w.creatures.get(ownUnit)?.ehp, 'the owner\'s unit is untouched').toBe(ownUnitPool);
    expect(w.primitives.get(ownLone.id)?.hp, 'the owner\'s lone shape is untouched').toBe(PRIMITIVE_MAX_HP);
    expect(w.bonds.get(o12)?.damageFifths, 'the owner\'s connector inside is untouched').toBe(0);
  });
});

/* ──────────────────────────── 2 · THE ARITHMETIC, ARM BY ARM ──────────────────────────── */

function board(): World {
  const w = makeWorld(0x191c6);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  return w;
}
const hubBlast = (w: World): void => {
  applyStructureSelfDestruct(w, {
    type: 'STRUCTURE_SELFDESTRUCT', blast: 'ladder', pos: { ...HUB_AT },
    radius: STRUCTURE_SELFDESTRUCT_RADIUS, ownerPlayerId: P0,
  });
};

describe('S191 C-5 — every arm, exactly', () => {
  it('Helga loses exactly 120 and stands (her pool is 156); a TOWER (no pool) takes nothing; the owner\'s Helga is spared', () => {
    const w = board();
    const enemyHelga = helga(w, P1, 700, 400);
    const ownHelga = helga(w, P0, 500, 400);
    const turretAnchor = prim(w, P1, SparkType.Square, 600, 500);
    link(w, turretAnchor, prim(w, P1, SparkType.Square, 1100, 500)); // its connector's midpoint 269 px: outside
    const turret = makeDefender({
      id: asDefenderId(w.nextDefenderId++), kind: 'turret', ownerPlayerId: P1,
      anchorPrimitiveId: turretAnchor.id, recipeId: 'laserTurret', pos: { x: 600, y: 500 }, registeredAtTick: 0,
    });
    w.defenders.set(turret.id, turret);
    const helgaPool = enemyHelga.ehp!;
    expect(helgaPool, 'anti-vacuity: she survives one blast').toBeGreaterThan(BLAST);
    hubBlast(w);
    expect(w.defenders.get(enemyHelga.id)?.ehp, 'pre-fix: the raze took her anchor, not her pool').toBe(helgaPool - BLAST);
    expect(w.defenders.get(ownHelga.id)?.ehp).toBe(ownHelga.ehp);
    expect(w.defenders.get(turret.id)?.ehp, 'a tower dies through its connectors, and this one is outside').toBeNull();
    expect(w.primitives.get(turretAnchor.id)?.hp, 'its anchor is a shape in a structure: no arm').toBe(PRIMITIVE_MAX_HP);
  });

  it('⚠ MINE — PER CONNECTOR: a 5-connector tower wholly inside takes 120 on each of its five and falls', () => {
    const w = board();
    const hub = prim(w, P1, SparkType.Dot, 700, 400);
    const bonds: BondId[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      bonds.push(link(w, hub, prim(w, P1, SparkType.Square, 700 + Math.cos(a) * 40, 400 + Math.sin(a) * 40)));
    }
    hubBlast(w);
    for (const b of bonds) expect(w.bonds.has(b)).toBe(false);
    expect(w.connectorBreakHits.map((h) => h.amount)).toEqual(bonds.map(() => BLAST));
  });

  it('a MIXED connector (one end the owner\'s) is spared — neither endpoint may be his', () => {
    const w = board();
    const mine = prim(w, P0, SparkType.Square, 650, 400);
    const theirs = prim(w, P1, SparkType.Square, 690, 400);
    const mixed = link(w, mine, theirs);
    hubBlast(w);
    expect(w.bonds.get(mixed)?.damageFifths).toBe(0);
  });

  it('negatives — just outside the radius nothing is touched; the owner\'s bag, unit and shapes are spared', () => {
    const w = board();
    const out = STRUCTURE_SELFDESTRUCT_RADIUS + 1;
    const farEnemy = spawn(w, 'chewer', P1, HUB_AT.x + out, HUB_AT.y);
    const farShape = prim(w, P1, SparkType.Triangle, HUB_AT.x - out, HUB_AT.y);
    const ownBag = bag(w, P0, 650, 450);
    const ownChewer = spawn(w, 'chewer', P0, 620, 400);
    hubBlast(w);
    expect(w.creatures.has(farEnemy)).toBe(true);
    expect(w.primitives.has(farShape.id)).toBe(true);
    expect(w.stinkClouds.get(ownBag.id)?.ehp).toBe(ownBag.ehp);
    expect(w.creatures.has(ownChewer)).toBe(true);
  });

  it('⛔ the CASTLE is not an arm — even a keep dropped at ground zero keeps every point', () => {
    const w = board();
    const at = castleAnchor(1, w.layout);
    const before = w.players.get(P1)!.castleHp;
    applyStructureSelfDestruct(w, {
      type: 'STRUCTURE_SELFDESTRUCT', blast: 'ladder', pos: { ...at },
      radius: STRUCTURE_SELFDESTRUCT_RADIUS, ownerPlayerId: P0,
    });
    expect(w.players.get(P1)!.castleHp).toBe(before);
  });

  it('⭐ and on every shipped board no ENEMY keep can sit inside the blast of a hub built on its owner\'s ground', () => {
    // Why the castle question needs no ruling today: measured over every buildable point of every seat.
    for (const layout of ['PITCH_2P', 'QUADRANTS_4P'] as const) {
      const seats = layout === 'PITCH_2P' ? 2 : 4;
      let min2 = Infinity;
      for (let seat = 0; seat < seats; seat++) {
        const keeps = [...Array(seats).keys()].filter((s) => s !== seat).map((s) => castleAnchor(s, layout));
        for (let x = 0; x <= CANVAS_WIDTH; x += 8) {
          for (let y = 0; y <= CANVAS_HEIGHT; y += 8) {
            if (!canBuildAt({ x, y }, seat, layout)) continue;
            for (const k of keeps) min2 = Math.min(min2, (x - k.x) ** 2 + (y - k.y) ** 2);
          }
        }
      }
      expect(Math.sqrt(min2), layout).toBeGreaterThan(STRUCTURE_SELFDESTRUCT_RADIUS);
    }
  });

  it('determinism — the same board inserted in a different Map order ends in the same world', () => {
    const build = (reverse: boolean): World => {
      const w = board();
      const add: Array<() => void> = [
        () => { spawn(w, 'chewer', P1, 700, 420); },
        () => { spawn(w, 'goblinMelee', P1, 560, 330); },
        () => { bag(w, P1, 520, 460); },
        () => { prim(w, P1, SparkType.Triangle, 640, 300); },
        () => { link(w, prim(w, P1, SparkType.Line, 760, 380), prim(w, P1, SparkType.Line, 800, 380)); },
      ];
      for (const f of reverse ? [...add].reverse() : add) f();
      return w;
    };
    const a = build(false);
    const b = build(true);
    hubBlast(a);
    hubBlast(b);
    // Ids differ by insertion order, so compare what survived by kind and pool, not by id.
    const shape = (w: World) => ({
      creatures: [...w.creatures.values()].map((c) => `${c.type}:${c.ehp}`).sort(),
      prims: w.primitives.size,
      bonds: w.bonds.size,
      bags: w.stinkClouds.size,
    });
    expect(shape(b)).toEqual(shape(a));
    expect(hashWorldStateFull(a)).toBe(hashWorldStateFull(a)); // stable under re-hash
  });
});

/* ─────────────────────── 3 · THE ZOMBIE BOSS'S BLAST IS NOT THIS RULING ─────────────────────── */

describe('S191 C-5 — the raze stays for the one dispatcher the ruling does not cover', () => {
  it('⛔ `blast: \'raze\'` (the zombie boss\'s R138 death blast) still DELETES a boss outright', () => {
    // Anti-vacuity for the ladder: the same boss, the same radius, the other variant.
    const w = board();
    const boss = spawn(w, T9_BOSS_TYPE.nagas, P1, 650, 400);
    applyStructureSelfDestruct(w, {
      type: 'STRUCTURE_SELFDESTRUCT', blast: 'raze', pos: { ...HUB_AT }, radius: STRUCTURE_SELFDESTRUCT_RADIUS,
    });
    expect(w.creatures.has(boss)).toBe(false);
  });
});
