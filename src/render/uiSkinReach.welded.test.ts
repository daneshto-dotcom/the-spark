/**
 * S195 carry-forward (T1) — REACH: the WELDED building cards' skin, driven through a REAL
 * `CharacterSheet.sync` on a real two-tower weld (a stamped laser turret and a stamped goblin tower,
 * hand-welded by one Square, stood up by the real host tick).
 *
 * `uiSkinReach.sheet.test.ts` reaches the card's ACTION buttons and plate; the welded block was covered by
 * the census pin alone (S182 rule 2: a source-text claim that `skinButtonFx` EXISTS at `drawWelded`, not
 * that it is REACHED). This file proves the two welded surfaces:
 *   · the STRUCTURE card (click the weld): one skinned ROW per tower, each exactly the rect `ownedRowAt`
 *     re-aims the card through — just inside is that tower, just outside is not;
 *   · the TOWER card (click a tower): the strip's ICON per OTHER tower, same contract;
 * and that a hover on a row lands the skin's `hover` state on exactly that rect and no other.
 *
 * Black-box: the click rects are derived from the recorded skin calls and the public `ownedRowAt`, never
 * from the private `weldHits`, so a skin drawn where no hit-test listens fails here.
 */
// ⭐ S195 T18 #2 — census pairing (read by uiSkinCensus.reach.test.ts): the SKINNED rows this file REACHES.
// CENSUS-REACH src/render/characterSheet.ts :: *
import { describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';
import { PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PrimitiveId } from '../types.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../state/hostTick.ts';
import { runGodlyMatcherCore } from '../state/godlyMatcherCore.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { mulberry32 } from '../state/rng.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { componentOf } from '../game/structure.ts';
import type { Primitive } from '../game/primitive.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { WELD_ICON_PX, WELD_ROW_H, characterSheetModel, type SheetTarget } from './characterSheetModel.ts';
import { codexCopyFor } from './codexPresentation.ts';
import '../state/godlyRecipes/registerAll.ts';
import { installFakeTextCanvas } from './fakeTextCanvas.fixtures.ts';

installFakeTextCanvas();

interface Skin { x: number; y: number; w: number; h: number; state: string }
const skinned: Skin[] = [];
vi.mock('./uiSkin.ts', async (orig) => {
  const real = await orig<typeof import('./uiSkin.ts')>();
  return {
    ...real,
    skinButtonFx: (g: never, x: number, y: number, w: number, h: number, o: { state: string }) => {
      skinned.push({ x, y, w, h, state: o.state });
      real.skinButtonFx(g, x, y, w, h, o as never);
    },
  };
});

const { CharacterSheet } = await import('./characterSheet.ts');
const P0 = asPlayerId(0);

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function tick(w: World, st: HostTickState, n: number): void {
  const d = deps();
  const cursor = { lastMatcherTick: -1 };
  for (let i = 0; i < n; i++) {
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    w.effects.length = 0;
  }
}

function stamp(w: World, id: GodlyId, centre: { x: number; y: number }): void {
  const bank = w.castleBanks.get(P0) ?? makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
}

function bond(w: World, a: Primitive, b: Primitive): BondId {
  const bid = asBondId(w.nextBondId++);
  w.bonds.set(bid, { id: bid, aId: a.id, bId: b.id, a, b, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick });
  a.bonds.add(bid);
  b.bonds.add(bid);
  return bid;
}

/** A stamped laser turret and goblin tower, one hand-placed Square welding them (the R191-A fixture). */
function welded(): { w: World; turretHub: PrimitiveId; goblinHub: PrimitiveId; square: Primitive } {
  const w = makeWorld(0x5195a);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  const st = makeHostTickState(w);
  stamp(w, 'laserTurret', { x: 500, y: 300 });
  stamp(w, 'goblinTower', { x: 640, y: 300 });
  tick(w, st, 3);
  const turretHub = [...w.defenders.values()][0]!.anchorPrimitiveId;
  const goblinHub = [...w.creatureSpawners.values()][0]!.anchorPrimitiveId;
  const edge = (hub: PrimitiveId, dir: 1 | -1): Primitive =>
    [...componentOf(w.primitives.get(hub)!, w.primitives, w.bonds).primitiveIds]
      .map((id) => w.primitives.get(id)!).sort((a, b) => dir * (b.pos.x - a.pos.x))[0]!;
  const color = w.players.get(P0)!.color;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const square: Primitive = {
    id, type: SparkType.Square, placerColor: color, placedBy: P0, createdTick: w.tick, pos: { x: 570, y: 300 },
    prevPos: { x: 570, y: 300 }, bonds: new Set(), ownerColor: color, lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, square);
  bond(w, square, edge(turretHub, 1));
  bond(w, square, edge(goblinHub, -1));
  tick(w, st, 62);
  expect(w.defenders.size, 'the welded turret stands').toBe(1);
  expect(w.creatureSpawners.size, 'the welded goblin tower stands').toBe(1);
  return { w, turretHub, goblinHub, square };
}

const sameRect = (a: Skin, b: Skin): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** The skins that are WELD click targets: `ownedRowAt` at their centre opens one of the block's towers. */
function weldSkins(sheet: InstanceType<typeof CharacterSheet>, w: World, skins: readonly Skin[], towerNames: readonly string[]): Array<Skin & { target: SheetTarget; title: string }> {
  const out: Array<Skin & { target: SheetTarget; title: string }> = [];
  for (const s of skins) {
    const t = sheet.ownedRowAt(s.x + s.w / 2, s.y + s.h / 2);
    if (t === null) continue;
    const title = characterSheetModel(w, P0, t)?.title ?? '';
    if (towerNames.includes(title)) out.push({ ...s, target: t, title });
  }
  return out;
}

function syncOn(w: World, target: SheetTarget, hover: { x: number; y: number } | null = null) {
  const stage = new Container();
  const sheet = new CharacterSheet({ stage } as never, stage);
  sheet.select(target);
  if (hover !== null) sheet.setHover(hover.x, hover.y);
  skinned.length = 0;
  sheet.sync(w, P0);
  return { sheet, skins: [...skinned] };
}

describe('⭐ S195 T1 REACH — the STRUCTURE card: one skinned row per tower, exactly on the rect `ownedRowAt` answers for', () => {
  const { w, square } = welded();
  const target: SheetTarget = { kind: 'structure', primitiveId: square.id };
  const { sheet, skins } = syncOn(w, target);
  const ui = sheet.getUiPoints();
  const names = ui.welded?.towers.map((t) => t.name) ?? [];
  const rows = weldSkins(sheet, w, skins, names);

  it('anti-vacuity: it is the weld card, with two towers, and the rows are the full-width WELD_ROW_H − 4 rects', () => {
    expect(ui.title).toBe('WELDED STRUCTURE');
    expect(ui.welded?.role).toBe('structure');
    expect(names).toEqual([codexCopyFor('goblinTower').name, codexCopyFor('laserTurret').name]);
    expect(rows.length, 'one skinned click row per tower').toBe(2);
    for (const r of rows) expect(r.h).toBe(WELD_ROW_H - 4);
    expect(new Set(rows.map((r) => r.w)).size, 'all rows share one width').toBe(1);
    expect(rows.map((r) => r.title), 'in the card\'s order, each opening THAT tower').toEqual(names);
  });

  it('each row is skinned exactly once, at rest, and lies inside the card', () => {
    const rect = sheet.rect()!;
    for (const r of rows) {
      expect(skins.filter((s) => sameRect(s, r)).length).toBe(1);
      expect(r.state).toBe('rest');
      expect(sheet.isOver(r.x + 1, r.y + 1)).toBe(true);
      expect(r.y + r.h).toBeLessThanOrEqual(rect.y + rect.h);
    }
  });

  it('just inside a row is that tower; just outside (the 4 px gap above / below, 1.5 px past the sides) is not', () => {
    const e = 1;
    for (const r of rows) {
      for (const [px, py] of [[r.x + e, r.y + r.h / 2], [r.x + r.w - e, r.y + r.h / 2], [r.x + r.w / 2, r.y + e], [r.x + r.w / 2, r.y + r.h - e]]) {
        expect(sheet.ownedRowAt(px!, py!), `${r.title} inside (${px},${py})`).toEqual(r.target);
      }
      for (const [px, py] of [[r.x - 1.5, r.y + r.h / 2], [r.x + r.w + 1.5, r.y + r.h / 2], [r.x + r.w / 2, r.y - 1.5], [r.x + r.w / 2, r.y + r.h + 1.5]]) {
        const hit = sheet.ownedRowAt(px!, py!);
        expect(hit === null || JSON.stringify(hit) !== JSON.stringify(r.target), `${r.title} outside (${px},${py})`).toBe(true);
      }
    }
  });

  it('a hover on the second row lands `hover` on exactly that rect, and `rest` on the first', () => {
    const second = rows[1]!;
    const { sheet: hs, skins: hovered } = syncOn(w, target, { x: second.x + second.w / 2, y: second.y + second.h / 2 });
    const hRows = weldSkins(hs, w, hovered, names);
    expect(hRows.length).toBe(2);
    expect(hRows.map((r) => r.state)).toEqual(['rest', 'hover']);
    expect(sameRect(hRows[1]!, second), 'the hovered rect is the same rect the rest frame drew').toBe(true);
    expect(hovered.filter((s) => s.state === 'hover').length, 'nothing else on the card lit up').toBe(1);
  });
});

describe('⭐ S195 T1 REACH — the TOWER card: the strip\'s icon per OTHER tower, exactly on its hit rect', () => {
  const { w, turretHub } = welded();
  const target: SheetTarget = { kind: 'structure', primitiveId: turretHub };
  const { sheet, skins } = syncOn(w, target);
  const ui = sheet.getUiPoints();
  const names = ui.welded?.towers.map((t) => t.name) ?? [];
  const icons = weldSkins(sheet, w, skins, names);

  it('anti-vacuity: the turret\'s own card, WELDED, listing the OTHER tower as one WELD_ICON_PX icon', () => {
    expect(ui.title).toBe(codexCopyFor('laserTurret').name);
    expect(ui.subtitle).toBe('YOUR BUILDING · WELDED');
    expect(ui.welded?.role).toBe('tower');
    expect(names).toEqual([codexCopyFor('goblinTower').name]);
    expect(icons.length).toBe(1);
    expect([icons[0]!.w, icons[0]!.h]).toEqual([WELD_ICON_PX, WELD_ICON_PX]);
    expect(icons[0]!.title).toBe(codexCopyFor('goblinTower').name);
    expect(skins.filter((s) => sameRect(s, icons[0]!)).length, 'skinned once').toBe(1);
    expect(icons[0]!.state).toBe('rest');
  });

  it('just inside the icon opens the goblin tower; just outside does not; the action buttons are not weld hits', () => {
    const r = icons[0]!;
    for (const [px, py] of [[r.x + 1, r.y + 1], [r.x + r.w - 1, r.y + r.h - 1]]) {
      expect(sheet.ownedRowAt(px!, py!)).toEqual(r.target);
    }
    for (const [px, py] of [[r.x - 1.5, r.y + r.h / 2], [r.x + r.w + 1.5, r.y + r.h / 2], [r.x + r.w / 2, r.y - 1.5], [r.x + r.w / 2, r.y + r.h + 1.5]]) {
      expect(sheet.ownedRowAt(px!, py!), `outside (${px},${py})`).toBeNull();
    }
    for (const a of ui.actions) {
      expect(sheet.ownedRowAt(a.x + a.w / 2, a.y + a.h / 2), `${a.kind} is a button, not a weld row`).toBeNull();
      expect(sheet.actionAt(a.x + a.w / 2, a.y + a.h / 2)?.kind).toBe(a.enabled ? a.kind : undefined);
    }
    expect(ui.actions.map((a) => a.kind), 'its own FIX and SCRAP (R191-A)').toEqual(['FIX', 'SCRAP']);
  });

  it('a hover on the icon lights exactly that rect', () => {
    const r = icons[0]!;
    const { sheet: hs, skins: hovered } = syncOn(w, target, { x: r.x + r.w / 2, y: r.y + r.h / 2 });
    const lit = weldSkins(hs, w, hovered, names);
    expect(lit.length).toBe(1);
    expect(lit[0]!.state).toBe('hover');
    expect(sameRect(lit[0]!, r)).toBe(true);
    expect(hovered.filter((s) => s.state === 'hover').length).toBe(1);
  });
});
