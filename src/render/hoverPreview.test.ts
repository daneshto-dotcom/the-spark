/**
 * SPARK — ⭐⭐ S195 N7 (s195/info-ui): the hover preview RESOLVER, pure.
 *
 * Owner: *"hovering a goblin or a shape … shows you what unit will be produced … a preview of the character
 * sheet"*; *"What is square? Like, people don't know that."*
 *
 * Every expected name and number is DERIVED — from `GOBLIN_FEED_MAP`, `RACE_FEED_SHAPE` / `RACE_TOWER_UNIT`,
 * `getCreatureConfig` and the ladder (`attackFifths`, `unitPoolFifths`) — and the owner's own words
 * ("Square → shield goblin") are asserted as consequences. The pick radii are pinned to `controls.ts`'s
 * literals by parsing that file, so hover and click can never pick differently.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_SPARK_TYPES, PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { GOBLIN_FEED_MAP } from '../state/goblinKinds.ts';
import { RACE_FEED_SHAPE } from '../state/races.ts';
import { RACE_TOWER_IDS, RACE_TOWER_UNIT } from '../state/raceTowerIds.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { creatureMaxEhp } from '../state/creatures/creature.ts';
import { attackFifths, unitPoolFifths } from '../state/stats.ts';
import { asBondId, asPlayerId, asPrimitiveId, asSpawnerId, type PlayerId } from '../types.ts';
import { beginConcealmentFrame, resetConcealmentForTest } from './concealment.ts';
import { creatureDisplayName, SPARK_WORD } from './characterSheetModel.ts';
import { creatureDrawnSizeRatio } from './towerFrames.ts';
import {
  HOVER_CREATURE_PICK_DIST, HOVER_PREVIEW_DELAY_MS, HOVER_SHAPE_PICK_PAD, hoverPreviewFor, shapeThatMakes,
} from './hoverPreview.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const TOWER = asSpawnerId(1);

function addPrim(w: World, id: number, x: number, y: number, type = SparkType.Circle, owner: PlayerId = P0): Primitive {
  const color = PLAYER_COLORS[owner as number]!;
  const p: Primitive = {
    id: asPrimitiveId(id), type, placerColor: color, placedBy: owner, createdTick: 0, pos: { x, y }, prevPos: { x, y },
    bonds: new Set(), ownerColor: color, lastOwnershipChange: 0, radius: 8, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(p.id, p);
  return p;
}

function link(w: World, id: number, a: Primitive, b: Primitive): void {
  const bd: Bond = { id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 30, stiffnessTier: 'MID', createdTick: 0, damageFifths: 0 };
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
  const hub = addPrim(w, 1, 300, 300);
  for (let i = 0; i < 4; i++) link(w, 100 + i, hub, addPrim(w, 10 + i, 340 + 40 * i, 300));
  w.creatureSpawners.set(TOWER, {
    id: TOWER, ownerPlayerId: P0, anchorPrimitiveId: hub.id, recipeId: 'goblinTower',
    nextSpawnTick: 1e9, lastValidatedTick: 0, spawnedCount: 0, ignitedAtTick: 0,
  });
  return w;
}

const spawn = (w: World, type: Parameters<typeof getCreatureConfig>[0], x: number, y: number, owner: PlayerId = P0): void => {
  dispatch(w, { type: 'SPAWN_CREATURE', creatureType: type, ownerPlayerId: owner, pos: { x, y }, targetPos: { x, y }, sourceSpawnerId: TOWER } as never);
};

beforeEach(() => resetConcealmentForTest());

describe('⭐⭐ N7 — a FEED chip: what THIS tower makes of THIS shape (the owner\'s "what is square?")', () => {
  it.each(ALL_SPARK_TYPES)('shape %i on the goblin tower → its goblin, with the ladder rows and the shape that makes it', (t) => {
    const w = base();
    const pv = hoverPreviewFor(w, 0, 0, P0, { spawnerId: TOWER, sparkType: t })!;
    const type = GOBLIN_FEED_MAP[t];
    const cfg = getCreatureConfig(type);
    expect(pv).not.toBeNull();
    expect(pv.source).toBe('chip');
    expect(pv.type).toBe(type);
    expect(pv.name).toBe(creatureDisplayName(type));
    expect(pv.tier).toBe('GOBLIN');
    expect(pv.madeFrom).toBe(t);
    expect(pv.stats.map((r) => r.label)).toEqual(['ATK', 'PEN', 'HP', 'DEF']);
    expect(pv.stats[0]).toEqual({ label: 'ATK', points: cfg.atk, derived: `${attackFifths(cfg.atk, cfg.pen)} a swing` });
    expect(pv.stats[2]).toEqual({ label: 'HP', points: cfg.hp, derived: `${unitPoolFifths(cfg.hp, cfg.def)} pool` });
  });

  it('the owner\'s words, as consequences: Square → SHIELD GOBLIN, Triangle → MELEE GOBLIN, Spiral → BAT GOBLIN', () => {
    const w = base();
    const name = (t: SparkType): string => hoverPreviewFor(w, 0, 0, P0, { spawnerId: TOWER, sparkType: t })!.name;
    expect(name(SparkType.Square)).toBe('SHIELD GOBLIN');
    expect(name(SparkType.Triangle)).toBe('MELEE GOBLIN');
    expect(name(SparkType.Spiral)).toBe('BAT GOBLIN');
    expect(SPARK_WORD[SparkType.Square]).toBe('SQUARE');
  });

  it('a race tower\'s chip: its own shape → its unit; any other shape → nothing (R119); an unknown spawner → nothing', () => {
    const w = base();
    const race = 'nagas';
    w.creatureSpawners.set(TOWER, { ...w.creatureSpawners.get(TOWER)!, recipeId: RACE_TOWER_IDS[race] });
    const own = hoverPreviewFor(w, 0, 0, P0, { spawnerId: TOWER, sparkType: RACE_FEED_SHAPE[race] })!;
    expect(own.type).toBe(RACE_TOWER_UNIT[race]);
    expect(own.tier).toBe('T3');
    expect(own.madeFrom).toBe(RACE_FEED_SHAPE[race]);
    const wrong = ALL_SPARK_TYPES.find((t) => t !== RACE_FEED_SHAPE[race])!;
    expect(hoverPreviewFor(w, 0, 0, P0, { spawnerId: TOWER, sparkType: wrong })).toBeNull();
    expect(hoverPreviewFor(w, 0, 0, P0, { spawnerId: asSpawnerId(99), sparkType: SparkType.Square })).toBeNull();
  });
});

describe('⭐⭐ N7 — a CREATURE under the pointer: the click\'s own pick, its own numbers', () => {
  it('picks the nearest by fraction of its drawn radius; a tie goes to the lower id; outside its radius is a miss', () => {
    const w = base();
    spawn(w, 'goblinMelee', 600, 600);
    spawn(w, 'goblinArcher', 640, 600);
    const [melee, archer] = [...w.creatures.values()];
    expect(w.creatures.size, 'anti-vacuity').toBe(2);
    const near = hoverPreviewFor(w, 604, 600, P0, null)!;
    expect(near.source).toBe('creature');
    expect(near.type).toBe('goblinMelee');
    expect(near.subject).toEqual({ kind: 'creature', id: melee!.id });
    expect(hoverPreviewFor(w, 636, 600, P0, null)!.type).toBe('goblinArcher');
    // Exactly between two creatures of the same drawn size: the LOWER id, every time (a total order).
    expect(creatureDrawnSizeRatio('goblinMelee')).toBe(creatureDrawnSizeRatio('goblinArcher'));
    expect(hoverPreviewFor(w, 620, 600, P0, null)!.subject).toEqual({ kind: 'creature', id: Math.min(Number(melee!.id), Number(archer!.id)) as never });
    const r = HOVER_CREATURE_PICK_DIST * creatureDrawnSizeRatio('goblinArcher');
    expect(hoverPreviewFor(w, 640 + r + 1, 600, P0, null), 'just outside its own radius').toBeNull();
    expect(hoverPreviewFor(w, 640 + r - 1, 600, P0, null)!.type).toBe('goblinArcher');
  });

  it('its OWN pool on the HP row (as its full card prints it) and the shape that makes its kind', () => {
    const w = base();
    spawn(w, 'goblinShield', 600, 600);
    const c = [...w.creatures.values()][0]!;
    const pv = hoverPreviewFor(w, 600, 600, P0, null)!;
    expect(pv.name).toBe('SHIELD GOBLIN');
    expect(pv.stats[2]!.derived).toBe(`${creatureMaxEhp(c)} pool`);
    expect(pv.madeFrom).toBe(SparkType.Square);
    expect(shapeThatMakes('goblinShield')).toBe(SparkType.Square);
    expect(shapeThatMakes('raceUnit'), 'no shape makes the castle unit').toBeNull();
  });

  it('⛔ negative: an ENEMY creature in the fog shows nothing; lit, it shows', () => {
    const w = base();
    w.gameMode = '1v1';
    spawn(w, 'goblinBat', 1700, 900, P1);
    expect(w.creatures.size).toBe(1);
    beginConcealmentFrame(w, { x: 200, y: 200 });
    expect(hoverPreviewFor(w, 1700, 900, P0, null)).toBeNull();
    beginConcealmentFrame(w, { x: 1700, y: 900 });
    expect(hoverPreviewFor(w, 1700, 900, P0, null)!.type).toBe('goblinBat');
  });
});

describe('⭐⭐ N7 — a FREE SHAPE under the pointer: what the viewer\'s goblin tower would make of it', () => {
  it('a square lying free → SHIELD GOBLIN (source "shape"); a shape bonded into a structure → nothing', () => {
    const w = base();
    const sq = addPrim(w, 500, 900, 600, SparkType.Square);
    const pv = hoverPreviewFor(w, 902, 603, P0, null)!;
    expect(pv.source).toBe('shape');
    expect(pv.type).toBe(GOBLIN_FEED_MAP[SparkType.Square]);
    expect(pv.name).toBe('SHIELD GOBLIN');
    expect(pv.madeFrom).toBe(SparkType.Square);
    expect(pv.subject).toEqual({ kind: 'shape', id: sq.id });
    // The tower's hub is bonded: the structure's card answers for it, the preview does not.
    expect(hoverPreviewFor(w, 300, 300, P0, null)).toBeNull();
    // Just outside radius + pad is a miss; inside is a hit.
    expect(hoverPreviewFor(w, 900 + sq.radius + HOVER_SHAPE_PICK_PAD + 1, 600, P0, null)).toBeNull();
    expect(hoverPreviewFor(w, 900 + sq.radius + HOVER_SHAPE_PICK_PAD - 1, 600, P0, null)).not.toBeNull();
  });

  it('two free shapes under the pointer: the nearer; at equal distance the lower id', () => {
    const w = base();
    addPrim(w, 501, 900, 600, SparkType.Dot);
    addPrim(w, 502, 912, 600, SparkType.Line);
    expect(hoverPreviewFor(w, 906, 600, P0, null)!.subject).toEqual({ kind: 'shape', id: asPrimitiveId(501) });
    expect(hoverPreviewFor(w, 910, 600, P0, null)!.type).toBe(GOBLIN_FEED_MAP[SparkType.Line]);
  });

  it('⛔ negative: the ENEMY\'s shapes in the fog show nothing (S170); my own far corner is always lit', () => {
    const w = base();
    w.gameMode = '1v1';
    addPrim(w, 600, 1700, 900, SparkType.Spiral, P1);
    addPrim(w, 601, 1000, 1000, SparkType.Spiral, P0); // far from theirs: my own shapes are vision sources
    beginConcealmentFrame(w, { x: 200, y: 200 });
    expect(hoverPreviewFor(w, 1700, 900, P0, null), 'theirs, dark').toBeNull();
    expect(hoverPreviewFor(w, 1000, 1000, P0, null)!.type, 'mine, lit').toBe(GOBLIN_FEED_MAP[SparkType.Spiral]);
    beginConcealmentFrame(w, { x: 1700, y: 900 });
    expect(hoverPreviewFor(w, 1700, 900, P0, null), 'theirs, under my spark').not.toBeNull();
  });

  it('empty board under the pointer → null', () => {
    expect(hoverPreviewFor(base(), 1500, 200, P0, null)).toBeNull();
  });
});

describe('⛔ hover picks exactly as a click picks — the radii are controls.ts\'s own (parsed, not remembered)', () => {
  const controls = readFileSync(new URL('../input/controls.ts', import.meta.url), 'utf8');
  it('HOVER_CREATURE_PICK_DIST === CREATURE_PICK_DIST', () => {
    const m = /const CREATURE_PICK_DIST = (\d+);/.exec(controls);
    expect(m, 'controls.ts still declares it').not.toBeNull();
    expect(HOVER_CREATURE_PICK_DIST).toBe(Number(m![1]));
  });
  it('HOVER_SHAPE_PICK_PAD === the click\'s `prim.radius + N` forgiveness', () => {
    const m = /const r = prim\.radius \+ (\d+);/.exec(controls);
    expect(m).not.toBeNull();
    expect(HOVER_SHAPE_PICK_PAD).toBe(Number(m![1]));
  });
  it('⚠ MINE — the delay is a short rest, not a wait, and not zero (a sweep must not strobe)', () => {
    expect(HOVER_PREVIEW_DELAY_MS).toBeGreaterThan(0);
    expect(HOVER_PREVIEW_DELAY_MS).toBeLessThanOrEqual(400);
  });
});
