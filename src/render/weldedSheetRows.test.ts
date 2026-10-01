/**
 * SPARK — S191 R191-A — **THE WELDED BLOCK AS DRAWN: every tower row is a click that opens that tower.**
 *
 * The card model (`weldedSheetsR191A.test.ts`) proves what the card SAYS; this proves the renderer
 * turns it into click targets: `CharacterSheet.sync` draws the welded block and records each row, and
 * `ownedRowAt` — the one path `Controls.handleSheetSelect` re-aims the card through — returns the
 * tower's target for a point on its row. Pixi is stubbed (no canvas under vitest); the drawing calls
 * are recorded, not rendered.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  class Chain {
    children: unknown[] = [];
    position = { set: (): void => {} };
    scale = { set: (): void => {} };
    visible = true;
    eventMode = 'auto';
    parent: { addChild(c: unknown): void } | null = null;
    addChild(c: unknown): unknown { this.children.push(c); return c; }
    removeChildren(): unknown[] { const c = this.children; this.children = []; return c; }
    destroy(): void {}
    clear(): this { return this; }
    roundRect(): this { return this; }
    rect(): this { return this; }
    circle(): this { return this; }
    ellipse(): this { return this; }
    poly(): this { return this; }
    moveTo(): this { return this; }
    lineTo(): this { return this; }
    arc(): this { return this; }
    fill(): this { return this; }
    stroke(): this { return this; }
  }
  class TextStyle { constructor(public o?: unknown) { Object.assign(this, o ?? {}); } }
  class Text extends Chain {
    text = ''; style: Record<string, unknown> = {}; alpha = 1;
    anchor = { set: (): void => {} };
    constructor(o?: { text?: string; style?: unknown }) { super(); this.text = o?.text ?? ''; this.style = { ...(o?.style as object ?? {}) }; }
  }
  class Sprite extends Chain { texture: unknown = null; anchor = { set: (): void => {} }; }
  return { Application: class {}, Container: Chain, Graphics: Chain, Text, TextStyle, Sprite, Texture: class { static EMPTY = {}; } };
});

const { PRIMITIVE_MAX_HP, SparkType } = await import('../constants.ts');
const { asBondId, asPlayerId, asPrimitiveId } = await import('../types.ts');
const { dispatch, makeWorld } = await import('../state/world.ts');
const { makeHostTickState, runHostTick } = await import('../state/hostTick.ts');
const { runGodlyMatcherCore } = await import('../state/godlyMatcherCore.ts');
const { Spawner, DEFAULT_SPAWNER_CONFIG } = await import('../game/spawner.ts');
const { makeGameStateExtras } = await import('../state/gameState.ts');
const { mulberry32 } = await import('../state/rng.ts');
const { applyBuildBlueprint } = await import('../state/blueprintBuild.ts');
const { blueprintBill } = await import('../state/blueprints.ts');
const { makeCastleBank } = await import('../state/castleBank.ts');
const { componentOf } = await import('../game/structure.ts');
const { CharacterSheet } = await import('./characterSheet.ts');
const { characterSheetModel } = await import('./characterSheetModel.ts');
const { codexCopyFor } = await import('./codexPresentation.ts');
await import('../state/godlyRecipes/registerAll.ts');

const P0 = asPlayerId(0);
/* eslint-disable @typescript-eslint/no-explicit-any */

function tick(w: any, st: any, n: number): void {
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as any;
  const cursor = { lastMatcherTick: -1 };
  for (let i = 0; i < n; i++) {
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    w.effects.length = 0;
  }
}

function stamp(w: any, id: string, centre: { x: number; y: number }): void {
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id as any)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id as any, centre });
}

/** The two-tower weld (a stamped turret + a stamped goblin tower, one hand-placed Square between). */
function weldedBoard(): { w: any; st: any; sqId: any } {
    const w: any = makeWorld(0x5191c);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'BUILD';
    w.creatures.clear();
    const st = makeHostTickState(w);
    stamp(w, 'laserTurret', { x: 500, y: 300 });
    stamp(w, 'goblinTower', { x: 640, y: 300 });
    tick(w, st, 3);
    const turretHub = [...w.defenders.values()][0].anchorPrimitiveId;
    const goblinHub = [...w.creatureSpawners.values()][0].anchorPrimitiveId;
    const color = w.players.get(P0).color;
    const sqId = asPrimitiveId(w.nextPrimitiveId++);
    const sq: any = {
      id: sqId, type: SparkType.Square, placerColor: color, placedBy: P0, createdTick: w.tick, pos: { x: 570, y: 300 },
      prevPos: { x: 570, y: 300 }, bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    };
    w.primitives.set(sqId, sq);
    const edge = (hub: any, dir: 1 | -1): any => [...componentOf(w.primitives.get(hub), w.primitives, w.bonds).primitiveIds]
      .map((id: any) => w.primitives.get(id)).sort((a: any, b: any) => dir * (b.pos.x - a.pos.x))[0];
    for (const other of [edge(turretHub, 1), edge(goblinHub, -1)]) {
      const bid = asBondId(w.nextBondId++);
      w.bonds.set(bid, { id: bid, aId: sq.id, bId: other.id, a: sq, b: other, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
      sq.bonds.add(bid);
      other.bonds.add(bid);
    }
    tick(w, st, 62);
    expect(w.defenders.size + w.creatureSpawners.size).toBe(2);
    return { w, st, sqId };
}

describe('⭐ S191 R191-A — the welded block is drawn as clickable rows', () => {
  it('the WELD card lists both towers; a point on a row re-aims the card at that tower', () => {
    const { w, sqId } = weldedBoard();

    const sheet = new CharacterSheet({ stage: { addChild() {} } } as any);
    sheet.select({ kind: 'structure', primitiveId: sqId });
    sheet.sync(w, P0);
    const ui = sheet.getUiPoints();
    expect(ui.title).toBe('WELDED STRUCTURE');
    expect(ui.welded?.role).toBe('structure');
    expect(ui.welded!.towers.map((t) => t.name)).toEqual([codexCopyFor('goblinTower').name, codexCopyFor('laserTurret').name]);
    const rows = (sheet as unknown as { weldHits: { x: number; y: number; w: number; h: number; target: any }[] }).weldHits;
    expect(rows, 'one drawn row per tower').toHaveLength(2);
    const r = rows[1]!;
    const target = sheet.ownedRowAt(r.x + r.w / 2, r.y + r.h / 2);
    expect(target, 'the row is a click target').not.toBeNull();
    expect(characterSheetModel(w, P0, target!)!.title, 'and it opens THAT tower').toBe(codexCopyFor('laserTurret').name);
    // Inside the card: every row lies within the card the model sized for it (nothing clipped).
    const rect = sheet.rect()!;
    for (const row of rows) expect(row.y + row.h).toBeLessThanOrEqual(rect.y + rect.h);
  });
});

type Row = { x: number; y: number; w: number; h: number; target: any };
const rowsOf = (sheet: any): Row[] => (sheet as { weldHits: Row[] }).weldHits;

describe('⛔ S192 SHEETS-2 — a CLOSED welded card leaves no click targets behind', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const openWeldCard = (): { w: any; sheet: any; sqId: any; centre: { x: number; y: number } } => {
    const { w, sqId } = weldedBoard();
    const sheet = new CharacterSheet({ stage: { addChild() {} } } as any);
    sheet.select({ kind: 'structure', primitiveId: sqId });
    sheet.sync(w, P0);
    const r = rowsOf(sheet)[1]!;
    const centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    expect(sheet.ownedRowAt(centre.x, centre.y), 'fixture: the open card has a row there').not.toBeNull();
    return { w, sheet, sqId, centre };
  };

  it('closed by a click on empty ground (select(null) + sync): no row answers', () => {
    const { w, sheet, centre } = openWeldCard();
    sheet.select(null);
    sheet.sync(w, P0);
    expect(sheet.ownedRowAt(centre.x, centre.y)).toBeNull();
  });

  it('closed by SCRAPping the weld (its target is gone) + sync: no row answers', () => {
    const { w, sheet, sqId, centre } = openWeldCard();
    dispatch(w, { type: 'SCRAP_STRUCTURE', playerId: P0, primitiveId: sqId });
    sheet.sync(w, P0);
    expect(sheet.selection(), 'the card closed itself').toBeNull();
    expect(sheet.ownedRowAt(centre.x, centre.y)).toBeNull();
  });

  it('closed by clear(): no row answers', () => {
    const { sheet, centre } = openWeldCard();
    sheet.clear();
    expect(sheet.ownedRowAt(centre.x, centre.y)).toBeNull();
  });

  it('REACH — through the real Controls: a goblin standing where the row of a CLOSED card was opens the GOBLIN', async () => {
    vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
    const { Controls } = await import('../input/controls.ts');
    const { makeCreature } = await import('../state/creatures/creature.ts');
    const { CHEWER_CONFIG } = await import('../state/creatures/voltkin-config.ts');
    const { asCreatureId, asSpawnerId } = await import('../types.ts');
    const { w, sheet, centre } = openWeldCard();
    sheet.select(null);
    sheet.sync(w, P0);
    const gob = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(w.nextCreatureId++), ownerPlayerId: asPlayerId(1),
      pos: { ...centre }, targetPos: { ...centre }, spawnedAtTick: w.tick, sourceSpawnerId: asSpawnerId(99),
    });
    w.creatures.set(gob.id, gob);
    const canvas = {
      addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, style: { cursor: '' },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080, right: 1920, bottom: 1080, x: 0, y: 0 }),
    };
    const c = new Controls({ canvas } as never, w, P0, (a: any) => dispatch(w, a));
    c.setCastlePanel({
      isOpen: () => false, toggle() {}, close() {}, isOverPanel: () => false, armedBlueprint: () => null,
      disarm() {}, armExternal() {}, requestShapesFor() {},
    } as any);
    c.setCharacterSheet(sheet);
    type Ptr = { button: number; clientX: number; clientY: number; pointerId: number };
    (c as unknown as { onDown(e: Ptr): void }).onDown({ button: 0, clientX: centre.x, clientY: centre.y, pointerId: 1 });
    (c as unknown as { onUp(e: Ptr): void }).onUp({ button: 0, clientX: centre.x, clientY: centre.y, pointerId: 1 });
    expect(sheet.selection(), 'the click opens what is actually there').toEqual({ kind: 'creature', id: gob.id });
  });
});
