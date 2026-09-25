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
  PRINCESS_DEF,
  PRINCESS_HP,
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
import { applyStructureSelfDestruct, planHubBlast } from './potatoLifecycle.ts';
import { mulberry32 } from './rng.ts';
import { restore, snapshot } from './save.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { attackFifths, unitPoolFifths } from './stats.ts';
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

describe('⭐⭐ S191 C-5 — REACH: a hub below a third self-destructs in FIGHT and deals 120 IN TOTAL, not a raze', () => {
  it('five enemy targets share 120 (24 each): chewer dies · boss loses 24 · connector felled · structure shapes untouched · owner untouched', () => {
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
    // ⭐ S191 (owner): "120 divided by everything that's around it". Five enemy targets are inside —
    // chewer, boss, lone shape, bag, one connector — so each takes 120 / 5 = 24. (A sixth target
    // appearing inside would move this number, which is what keeps the count honest.)
    expect(bossBefore - w.creatures.get(boss)!.ehp, 'the boss loses only his share').toBe(BLAST / 5);
    expect(w.primitives.has(loneEnemy.id), 'a lone built shape (5) dies').toBe(false);
    expect(w.stinkClouds.has(enemyBag.id), 'a stink bag (5) dies').toBe(false);
    expect(w.bonds.has(e12), 'the connector inside is felled').toBe(false);
    expect(w.connectorBreakHits, 'and the hit that felled it was its 24').toContainEqual({ bondId: e12, amount: BLAST / 5 });
    const severs = w.effects.filter((e) => e.kind === 'BOND_SEVERED');
    expect(severs.length, 'anti-vacuity: the blast severed something').toBeGreaterThan(0);
    expect(severs.every((e) => e.kind === 'BOND_SEVERED' && e.cause === 'drone'), 'an EXISTING cause, never a new one').toBe(true);
    expect(w.bonds.has(e23), 'the connector outside stands').toBe(true);
    /*
     * ⚠ MEASURED, AND NOT WHAT CANON §2 USED TO SAY: the chain's pool was 14 and the hit was 24, yet the
     * survivor holds NOTHING. `damageConnector` drains the STRUCK bond first, so the 10 of overkill sits
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
    // ⛔ S191 GATES-3 — the NUMBER, captured before the blast and pinned to the ladder. This compared
    // `ownHelga.ehp` with itself (the helper returns the very object `damageEntity` mutates), so it
    // could not fail. Checked FIRST, so it is the assertion a dropped owner filter trips.
    const ownPool = ownHelga.ehp!;
    expect(ownPool).toBe(unitPoolFifths(PRINCESS_HP, PRINCESS_DEF));
    hubBlast(w);
    expect(w.defenders.get(ownHelga.id)?.ehp, "the owner's Helga is spared").toBe(ownPool);
    expect(w.defenders.get(enemyHelga.id)?.ehp, 'pre-fix: the raze took her anchor, not her pool').toBe(helgaPool - BLAST);
    expect(w.defenders.get(turret.id)?.ehp, 'a tower dies through its connectors, and this one is outside').toBeNull();
    expect(w.primitives.get(turretAnchor.id)?.hp, 'its anchor is a shape in a structure: no arm').toBe(PRIMITIVE_MAX_HP);
  });

  it('a 5-connector tower wholly inside SHARES the 120 (24 a connector); its structure-wide pool decides how many fall', () => {
    const w = board();
    const hub = prim(w, P1, SparkType.Dot, 700, 400);
    const bonds: BondId[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      bonds.push(link(w, hub, prim(w, P1, SparkType.Square, 700 + Math.cos(a) * 40, 400 + Math.sin(a) * 40)));
    }
    hubBlast(w);
    // 24 + 24 bank 48 < 50; the third 24 fells one (pool 50), the fourth another (36), the fifth a third
    // (24). Pre-split each took its own 120 and all five fell.
    expect(w.connectorBreakHits.map((h) => h.amount)).toEqual([24, 24, 24]);
    expect(bonds.filter((b) => w.bonds.has(b)).length, 'two connectors still stand').toBe(2);
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
    const ownBagPool = ownBag.ehp; // ⛔ S191 GATES-3 — the number, not the live object
    const ownChewer = spawn(w, 'chewer', P0, 620, 400);
    hubBlast(w);
    expect(w.creatures.has(farEnemy)).toBe(true);
    expect(w.primitives.has(farShape.id)).toBe(true);
    expect(w.stinkClouds.get(ownBag.id)?.ehp, "the owner's bag is spared").toBe(ownBagPool);
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

  it('⛔ determinism (BLAST-8) — the board, its save round-trip, and its Maps reversed all blast to one wide hash', () => {
    /*
     * ⛔ S191 BLAST-8 — this compared `hashWorldStateFull(a)` with ITSELF, which cannot fail. Now a real
     * differential: A; B = restore(snapshot(A)) (what a successor or a `?worker=1` INIT holds); C = the
     * same save with every Map this blast reads, and every shape's bond Set, re-inserted in REVERSE (same
     * ids) — so Map iteration order is the ONLY difference. Seven targets, so the 120 splits 17 × 7 + 1
     * and WHO gets the remainder is visible in the hash (creature pools and bond banks are hashed); two
     * bosses tie on distance, so only the id tie-break separates them.
     */
    const a = board();
    const bossA = spawn(a, T9_BOSS_TYPE.nagas, P1, 550, 400); // 50 px — the nearest
    const bossB = spawn(a, T9_BOSS_TYPE.orcs, P1, 650, 400); // 50 px — a tie with the first
    helga(a, P1, 600, 250); // 150 px; her anchor's connector midpoint is (800, 250): outside
    prim(a, P1, SparkType.Triangle, 640, 470); // a lone shape, 80.6 px
    const c1 = prim(a, P1, SparkType.Line, 560, 330);
    const c2 = prim(a, P1, SparkType.Line, 600, 330);
    const c3 = prim(a, P1, SparkType.Line, 640, 330);
    const c4 = prim(a, P1, SparkType.Line, 680, 330);
    link(a, c1, c2);
    link(a, c2, c3);
    link(a, c3, c4); // three connectors inside, pool 24: the 17s fell some of them
    spawn(a, 'goblinMelee', P0, 620, 420); // the owner's — spared in all three
    expect(planHubBlast(a, HUB_AT.x, HUB_AT.y, STRUCTURE_SELFDESTRUCT_RADIUS, P0), 'fixture: seven targets').toHaveLength(7);

    const fromSave = (): World => {
      const w = makeWorld(1);
      restore(JSON.parse(JSON.stringify(snapshot(a))), w);
      return w;
    };
    const b = fromSave();
    const c = fromSave();
    const reverse = <K, V>(m: Map<K, V>): void => {
      const entries = [...m.entries()].reverse();
      m.clear();
      for (const [k, v] of entries) m.set(k, v);
    };
    reverse(c.creatures);
    reverse(c.defenders);
    reverse(c.primitives);
    reverse(c.bonds);
    reverse(c.stinkClouds);
    for (const p of c.primitives.values()) {
      const ids = [...p.bonds].reverse();
      p.bonds.clear();
      for (const id of ids) p.bonds.add(id);
    }
    expect([...c.creatures.keys()][0], 'anti-vacuity: C really iterates in the other order').not.toBe([...a.creatures.keys()][0]);
    const before = hashWorldStateFull(a);
    expect(hashWorldStateFull(b), 'the save round-trip is exact before the blast').toBe(before);
    expect(hashWorldStateFull(c), 'and so is the reversed copy').toBe(before);

    const bossPool = a.creatures.get(bossA)!.ehp;
    const bossBPool = a.creatures.get(bossB)!.ehp;
    for (const w of [a, b, c]) hubBlast(w);
    const after = hashWorldStateFull(a);
    expect(after, 'anti-vacuity: the blast changed the world').not.toBe(before);
    expect(hashWorldStateFull(b), 'B = A after the blast').toBe(after);
    expect(hashWorldStateFull(c), 'C = A after the blast').toBe(after);
    // And the remainder went where the order says: the lower-id boss of the tied pair.
    expect(bossPool - a.creatures.get(bossA)!.ehp).toBe(18);
    expect(bossBPool - a.creatures.get(bossB)!.ehp).toBe(17);
  });
});

/* ──────────────────── 2b · THE SPLIT — "120 DAMAGE POINTS IN TOTAL" (owner, S191) ──────────────────── */

/** Where a bond's midpoint is, squared, from the hub — the connector's position in the split order. */
function midD2(w: World, id: BondId): number {
  const b = w.bonds.get(id)!;
  const mx = (b.a.pos.x + b.b.pos.x) / 2 - HUB_AT.x;
  const my = (b.a.pos.y + b.b.pos.y) / 2 - HUB_AT.y;
  return mx * mx + my * my;
}

describe('⭐⭐ S191 (owner) — the blast is 120 IN TOTAL, split across every enemy entity it reaches', () => {
  it('ONE target takes the whole 120', () => {
    const w = board();
    const boss = spawn(w, T9_BOSS_TYPE.nagas, P1, 650, 400);
    const before = w.creatures.get(boss)!.ehp;
    expect(planHubBlast(w, HUB_AT.x, HUB_AT.y, STRUCTURE_SELFDESTRUCT_RADIUS, P0).map((e) => e.amount)).toEqual([BLAST]);
    hubBlast(w);
    expect(before - w.creatures.get(boss)!.ehp).toBe(BLAST);
  });

  it('SEVEN targets: 17 each, the one-point remainder to the NEAREST, exactly 120 in total — and the boss among them loses only his 17', () => {
    const w = board();
    // A chain of 11 enemy shapes: its first six connectors' midpoints are inside (45…195 px), the other
    // four outside, so the structure-wide pool (10 connectors = 150) is never reached and each bond's
    // bank IS its share. The shapes are inside a structure: no arm.
    const shapes: Primitive[] = [];
    for (let k = 0; k <= 6; k++) shapes.push(prim(w, P1, SparkType.Line, 630 + 30 * k, 400));
    for (const x of [1100, 1130, 1160, 1190]) shapes.push(prim(w, P1, SparkType.Line, x, 400));
    const chain: BondId[] = [];
    for (let k = 0; k + 1 < shapes.length; k++) chain.push(link(w, shapes[k]!, shapes[k + 1]!));
    const inside = chain.slice(0, 6);
    for (const b of chain.slice(6)) expect(midD2(w, b), 'fixture: outside').toBeGreaterThan(STRUCTURE_SELFDESTRUCT_RADIUS ** 2);
    const boss = spawn(w, T9_BOSS_TYPE.nagas, P1, 600, 450); // 50 px: between the 45 and the 75 connector
    const before = w.creatures.get(boss)!.ehp;

    hubBlast(w);
    const banked = inside.map((b) => w.bonds.get(b)!.damageFifths);
    const bossLost = before - w.creatures.get(boss)!.ehp;
    expect(banked, 'the nearest (45 px) takes the remainder').toEqual([18, 17, 17, 17, 17, 17]);
    expect(bossLost, 'the boss loses only his share').toBe(17);
    expect(banked.reduce((a, b) => a + b, 0) + bossLost, 'exactly 120 in total').toBe(BLAST);
    for (const b of chain.slice(6)) expect(w.bonds.get(b)!.damageFifths).toBe(0);
  });

  it('the order is TOTAL: nearest, then kind (creature · Helga · shape · bag · connector), then id', () => {
    const w = board();
    // Seven targets all exactly 100 px from the hub, so only kind and id decide the order.
    const b1 = spawn(w, T9_BOSS_TYPE.nagas, P1, 500, 400);
    const b2 = spawn(w, T9_BOSS_TYPE.orcs, P1, 600, 500);
    const h = helga(w, P1, 700, 400); // her anchor's connector is 300 px out
    const s1 = prim(w, P1, SparkType.Triangle, 600, 300);
    const s2 = prim(w, P1, SparkType.Triangle, 660, 480);
    const g = bag(w, P1, 540, 320);
    const c = link(w, prim(w, P1, SparkType.Line, 640, 320), prim(w, P1, SparkType.Line, 720, 360)); // midpoint (680, 340)
    const plan = planHubBlast(w, HUB_AT.x, HUB_AT.y, STRUCTURE_SELFDESTRUCT_RADIUS, P0);
    expect(plan.map((e) => `${e.kind}:${e.id}`)).toEqual([
      `creature:${b1}`, `creature:${b2}`, `defender:${h.id}`, `primitive:${s1.id}`, `primitive:${s2.id}`,
      `stinkCloud:${g.id}`, `connector:${c}`,
    ]);
    expect(plan.map((e) => e.amount)).toEqual([18, 17, 17, 17, 17, 17, 17]);
  });

  it('⚠ MINE — 200 targets (more than 120): the nearest 120 take ONE each, the other 80 nothing; the boss among them loses 1', () => {
    const w = board();
    // A 10 × 11 grid of enemy shapes, 20 px apart, all inside: 199 connectors, pool 199 × 204 — never reached.
    const grid: Primitive[][] = [];
    for (let r = 0; r < 10; r++) {
      grid.push([]);
      for (let c = 0; c < 11; c++) grid[r]!.push(prim(w, P1, SparkType.Dot, 500 + 20 * c, 310 + 20 * r));
    }
    const bonds: BondId[] = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 11; c++) {
        if (c + 1 < 11) bonds.push(link(w, grid[r]![c]!, grid[r]![c + 1]!));
        if (r + 1 < 10) bonds.push(link(w, grid[r]![c]!, grid[r + 1]![c]!));
      }
    }
    expect(bonds.length).toBe(199);
    const boss = spawn(w, T9_BOSS_TYPE.nagas, P1, HUB_AT.x, HUB_AT.y); // 0 px: first in the order
    const before = w.creatures.get(boss)!.ehp;
    expect(planHubBlast(w, HUB_AT.x, HUB_AT.y, STRUCTURE_SELFDESTRUCT_RADIUS, P0)).toHaveLength(200);
    hubBlast(w);
    expect(before - w.creatures.get(boss)!.ehp).toBe(1);
    const hit = bonds.filter((b) => w.bonds.get(b)!.damageFifths === 1);
    expect(hit.length, 'the other 119 ones').toBe(119);
    expect(bonds.filter((b) => w.bonds.get(b)!.damageFifths === 0).length).toBe(80);
    // Re-derived independently: the 119 nearest connectors by (squared distance, id).
    const nearest = [...bonds].sort((x, y) => midD2(w, x) - midD2(w, y) || Number(x) - Number(y)).slice(0, 119);
    expect(new Set(hit)).toEqual(new Set(nearest));
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
