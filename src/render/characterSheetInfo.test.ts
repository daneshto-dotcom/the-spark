/**
 * SPARK — ⭐ S195 N12 + N7a (s195/info-ui): the card's ENTROPY rows and the goblin tower's CONTENTS rows.
 *
 * N12 (owner): *"obvious to the player how many shapes he lost … clicking on a whole structure, seeing what
 * is the percent of him losing how many … connectors"*. B-17 RULED: the LOST stat is owner-only.
 * N7 (owner): *"which goblins are inside (to be released in the fight)"*, *"What is square? Like, people
 * don't know that."*
 *
 * Every expected number is DERIVED from the constants (`entropyChance`, `ENTROPY_FREE_CONNECTORS`,
 * `GOBLIN_FEED_MAP`) — never a literal on its own scale; the canon's own example (54 connectors → 4.4 %,
 * ~2.4 lost) is asserted as a consequence of the derivation, not as the derivation.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { ENTROPY_FREE_CONNECTORS, ENTROPY_SCALE, entropyChance } from '../state/entropy.ts';
import { GOBLIN_FEED_MAP } from '../state/goblinKinds.ts';
import { applyFeedTower } from '../state/goblinTowerFeed.ts';
import { bankAdd } from '../state/castleBank.ts';
import { recordEntropyLoss } from '../state/matchStats.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type PlayerId } from '../types.ts';
import { beginConcealmentFrame, resetConcealmentForTest } from './concealment.ts';
import {
  characterSheetModel, creatureDisplayName, entropyRowsFor, goblinContentsRows, SPARK_WORD, type SheetStatRow,
} from './characterSheetModel.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const TOWER = asSpawnerId(1);

function addPrim(w: World, id: number, x: number, y = 300, owner: PlayerId = P0): Primitive {
  const color = PLAYER_COLORS[owner as number]!;
  const p: Primitive = {
    id: asPrimitiveId(id), type: SparkType.Circle, placerColor: color, placedBy: owner,
    createdTick: 0, pos: { x, y }, prevPos: { x, y }, bonds: new Set(),
    ownerColor: color, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

function link(w: World, id: number, a: Primitive, b: Primitive): void {
  const bd: Bond = {
    id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0,
  };
  w.bonds.set(bd.id, bd);
  a.bonds.add(bd.id);
  b.bonds.add(bd.id);
}

function base(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]!));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]!));
  w.localPlayerId = P0;
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  return w;
}

/** One live goblin tower (hub + 4 leaves = 4 connectors) owned by `owner`, at (x, 300). */
function goblinTower(w: World, owner: PlayerId = P0, x = 300): Primitive {
  const hub = addPrim(w, 1, x, 300, owner);
  for (let i = 0; i < 4; i++) link(w, 100 + i, hub, addPrim(w, 10 + i, x + 40 + 40 * i, 300, owner));
  w.creatureSpawners.set(TOWER, {
    id: TOWER, ownerPlayerId: owner, anchorPrimitiveId: hub.id, recipeId: 'goblinTower',
    nextSpawnTick: 1e9, lastValidatedTick: 0, spawnedCount: 0, ignitedAtTick: 0,
  });
  return hub;
}

/** A free-form chain of `n + 1` shapes = `n` connectors, owned by `owner`, far from everything else. */
function chain(w: World, n: number, owner: PlayerId = P0): Primitive {
  let prev = addPrim(w, 1000, 1200, 700, owner);
  const first = prev;
  for (let i = 1; i <= n; i++) {
    const next = addPrim(w, 1000 + i, 1200 + 20 * i, 700, owner);
    link(w, 2000 + i, prev, next);
    prev = next;
  }
  return first;
}

const rows = (w: World, seat: PlayerId, primitiveId: Primitive['id']): readonly SheetStatRow[] =>
  characterSheetModel(w, seat, { kind: 'structure', primitiveId })!.stats;
const byLabel = (rs: readonly SheetStatRow[], label: string): SheetStatRow | undefined => rs.find((r) => r.label === label);

beforeEach(() => resetConcealmentForTest());

describe('⭐⭐ S195 N12 — the ENTROPY rows (arithmetic from `state/entropy.ts`, never restated)', () => {
  it('a lone tower is under the free allowance: 0 %, and the row says how far under', () => {
    const w = base();
    const hub = goblinTower(w);
    const rs = rows(w, P0, hub.id);
    const e = byLabel(rs, 'ENTROPY %')!;
    expect(e, 'the row is on the card').toBeDefined();
    expect(e.points).toBe(0);
    expect(entropyChance(4), 'anti-vacuity: the constant really says a 4-connector tower is free').toBe(0);
    expect(e.derived).toBe(`4 of ${ENTROPY_FREE_CONNECTORS} free`);
  });

  it('the canon example — 54 connectors — reads the chance per connector and the expected loss, derived', () => {
    const w = base();
    const first = chain(w, 54);
    const rs = rows(w, P0, first.id);
    const e = byLabel(rs, 'ENTROPY %')!;
    const chance = entropyChance(54);
    expect(chance, 'anti-vacuity: taxed').toBeGreaterThan(0);
    expect(e.points).toBe((chance * 100) / ENTROPY_SCALE);
    expect(e.derived).toBe(`~${((54 * chance) / ENTROPY_SCALE).toFixed(1)} lost/fight`);
    // The consequence the canon table prints (§2: 54 → 4.4 %, 2.4 lost) falls out of the derivation.
    expect(e.points).toBe(4.4);
    expect(e.derived).toBe('~2.4 lost/fight');
    // And a 10-connector structure sits exactly on the edge: free.
    expect(entropyRowsFor(w, ENTROPY_FREE_CONNECTORS, P0, P1)[0]!.points).toBe(0);
    expect(entropyRowsFor(w, ENTROPY_FREE_CONNECTORS + 1, P0, P1)[0]!.points).toBeGreaterThan(0);
  });

  it('⛔ B-17 — LOST TO ENTROPY shows on the OWNER\'s view only; another seat sees the chance and no LOST row', () => {
    const w = base();
    const hub = goblinTower(w);
    recordEntropyLoss(w, P0, 7);
    recordEntropyLoss(w, P1, 3); // the other seat's own losses must not leak onto P0's card either
    const mine = rows(w, P0, hub.id);
    expect(byLabel(mine, 'LOST')).toEqual({ label: 'LOST', points: 7, derived: 'to entropy' });
    const theirs = rows(w, P1, hub.id);
    expect(byLabel(theirs, 'ENTROPY %'), 'the public arithmetic stays').toBeDefined();
    expect(byLabel(theirs, 'LOST'), 'negative: no owner-only line for a viewer who does not own it').toBeUndefined();
  });

  it('a seat that never lost a connector reads LOST 0 (the counter is absent on the wire at zero)', () => {
    const w = base();
    const hub = goblinTower(w);
    expect(byLabel(rows(w, P0, hub.id), 'LOST')!.points).toBe(0);
  });

  it('the rows sit AFTER the structure rows, so CONNECTORS is still the first thing read', () => {
    const w = base();
    const hub = goblinTower(w);
    const labels = rows(w, P0, hub.id).map((r) => r.label);
    expect(labels[0]).toBe('CONNECTORS');
    expect(labels.indexOf('ENTROPY %')).toBeGreaterThan(labels.indexOf('SHAPES'));
    expect(labels.indexOf('LOST')).toBe(labels.indexOf('ENTROPY %') + 1);
  });
});

describe('⭐⭐ S195 N7a — the goblin tower lists what is inside it, by kind, with the shape that makes each', () => {
  function fed(): { w: World; hub: Primitive } {
    const w = base();
    const hub = goblinTower(w);
    for (const t of [SparkType.Triangle, SparkType.Triangle, SparkType.Square]) {
      bankAdd(w.castleBanks, P0, t);
      applyFeedTower(w, { type: 'FEED_TOWER', playerId: P0, spawnerId: TOWER, sparkType: t });
    }
    expect(w.creatures.size, 'anti-vacuity: three goblins were born').toBe(3);
    return { w, hub };
  }

  it('REACH through the model: GOBLINS total, then one row per kind in SHAPE order, each naming its shape', () => {
    const { w, hub } = fed();
    const rs = rows(w, P0, hub.id);
    const head = byLabel(rs, 'GOBLINS')!;
    expect(head).toEqual({ label: 'GOBLINS', points: 3, derived: 'in the tower' });
    const i = rs.indexOf(head);
    const melee = creatureDisplayName(GOBLIN_FEED_MAP[SparkType.Triangle]).replace(/ GOBLIN$/, '');
    const shield = creatureDisplayName(GOBLIN_FEED_MAP[SparkType.Square]).replace(/ GOBLIN$/, '');
    expect(rs[i + 1]).toEqual({ label: `· ${melee}`, points: 2, derived: `from ${SPARK_WORD[SparkType.Triangle]}` });
    expect(rs[i + 2]).toEqual({ label: `· ${shield}`, points: 1, derived: `from ${SPARK_WORD[SparkType.Square]}` });
    // The owner's words, as consequences: Triangle → melee, Square → shield.
    expect(rs[i + 1]!.label).toBe('· MELEE');
    expect(rs[i + 2]!.label).toBe('· SHIELD');
    expect(rs[i + 2]!.derived).toBe('from SQUARE');
  });

  it('the same goblins read "in the fight" once the whistle goes — nothing resets (S191 stock)', () => {
    const { w, hub } = fed();
    w.matchPhase = 'FIGHT';
    expect(byLabel(rows(w, P0, hub.id), 'GOBLINS')).toEqual({ label: 'GOBLINS', points: 3, derived: 'in the fight' });
  });

  it('an empty tower reads GOBLINS 0 (the row is still there, so the player learns it CAN hold them)', () => {
    const w = base();
    const hub = goblinTower(w);
    const rs = rows(w, P0, hub.id);
    expect(byLabel(rs, 'GOBLINS')).toEqual({ label: 'GOBLINS', points: 0, derived: 'in the tower' });
    expect(rs.filter((r) => r.label.startsWith('· ')).length).toBe(0);
  });

  it('a goblin that died is no longer inside; a creature from ANOTHER spawner is never counted', () => {
    const { w, hub } = fed();
    const [first] = [...w.creatures.keys()];
    w.creatures.delete(first!);
    // A stray creature with a different provenance.
    const stray = [...w.creatures.values()][0]!;
    w.creatures.set(asPlayerId(999) as never, { ...stray, id: 999 as never, sourceSpawnerId: asSpawnerId(77) } as never);
    expect(byLabel(rows(w, P0, hub.id), 'GOBLINS')!.points).toBe(2);
  });

  it('every other recipe has no contents rows (a pentagram is not a goblin tower)', () => {
    const w = base();
    const hub = goblinTower(w);
    w.creatureSpawners.set(TOWER, { ...w.creatureSpawners.get(TOWER)!, recipeId: 'pentagram' });
    expect(byLabel(rows(w, P0, hub.id), 'GOBLINS')).toBeUndefined();
    expect(goblinContentsRows(w, new Set([hub.id]), false), 'no goblin spawner among these members').toEqual([]);
  });

  it('⛔ negative: an ENEMY tower in the fog shows no head-count (S170), and the same tower lit shows it', () => {
    const w = base();
    w.gameMode = '1v1'; // networked ⇒ the fog is live in BUILD (`fogActive`)
    const hub = goblinTower(w, P1, 1700); // P1's tower, far from P0's quarry and cursor
    bankAdd(w.castleBanks, P1, SparkType.Spiral);
    applyFeedTower(w, { type: 'FEED_TOWER', playerId: P1, spawnerId: TOWER, sparkType: SparkType.Spiral });
    expect(w.creatures.size).toBe(1);
    beginConcealmentFrame(w, { x: 200, y: 200 }); // my spark is elsewhere: their tower is dark
    const dark = characterSheetModel(w, P0, { kind: 'structure', primitiveId: hub.id })!;
    expect(dark.health.frozen, 'anti-vacuity: the card IS frozen').toBe(true);
    expect(byLabel(dark.stats, 'GOBLINS')).toBeUndefined();
    expect(byLabel(dark.stats, 'ENTROPY %'), 'the public arithmetic is not intel; it stays').toBeDefined();
    beginConcealmentFrame(w, { x: 1700, y: 300 }); // my spark is over it: lit
    const lit = characterSheetModel(w, P0, { kind: 'structure', primitiveId: hub.id })!;
    expect(lit.health.frozen).toBe(false);
    expect(byLabel(lit.stats, 'GOBLINS')!.points).toBe(1);
    expect(byLabel(lit.stats, 'LOST'), 'and never their LOST row').toBeUndefined();
  });
});
