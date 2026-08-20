/**
 * SPARK — S152: the FIX / SCRAP popover's MODEL, driven headlessly.
 *
 * The S130 lesson is that a draw path which cannot be driven without a canvas ships broken, so the
 * whole button matrix lives in `structureActionModel` — a pure function of `(world, seat, primitive)`
 * — and everything worth asserting is asserted here, with no Pixi `Application` anywhere.
 *
 * The specific thing this exists to stop: a button that PROMISES what the reducer REFUSES. Every
 * caption below is cross-checked against the planner the reducer itself consults, so the two cannot
 * drift into disagreement the way a hand-written affordability check would.
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { asPlayerId, type PrimitiveId, type Vec2 } from '../types.ts';
import { makeWorld, type World } from '../state/world.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { damageEntity } from '../state/damage.ts';
import { structureActionModel } from './structurePanel.ts';

const P0 = asPlayerId(0);
const SITE: Vec2 = { x: 300, y: 300 };

function setup(): World {
  const w = makeWorld(0);
  w.isHost = true;
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('laserTurret')) {
    bank[type as number] = (bank[type as number] ?? 0) + count;
  }
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, {
    type: 'BUILD_BLUEPRINT',
    playerId: P0,
    blueprintId: 'laserTurret',
    centre: SITE,
  });
  return w;
}

function nodeId(w: World, i: number): PrimitiveId {
  for (const p of w.primitives.values()) if (p.origin?.nodeIndex === i) return p.id;
  throw new Error(`node ${i} missing`);
}

function stock(w: World, type: SparkType, n: number): void {
  const bank = w.castleBanks.get(P0)!;
  bank[type as number] = (bank[type as number] ?? 0) + n;
}

describe('structureActionModel — the FIX / SCRAP popover', () => {
  it('names the structure and offers both actions on a tower this seat built', () => {
    const view = structureActionModel(setup(), P0, nodeId(setup(), 0));
    expect(view).not.toBeNull();
    expect(view!.buttons.map((b) => b.kind)).toEqual(['FIX', 'SCRAP']);
    expect(view!.title.length).toBeGreaterThan(0);
    expect(view!.title).not.toBe('STRUCTURE'); // a stamped tower is named, not generic
  });

  it('anchors identically whichever member is clicked — the popover follows the STRUCTURE', () => {
    const w = setup();
    const fromHub = structureActionModel(w, P0, nodeId(w, 0))!;
    const fromLeaf = structureActionModel(w, P0, nodeId(w, 4))!;
    expect(fromLeaf.buttons[0].x).toBe(fromHub.buttons[0].x);
    expect(fromLeaf.buttons[0].y).toBe(fromHub.buttons[0].y);
  });

  it("SCRAP's caption is the SURVIVOR count — R21 stated to the player, not the bill", () => {
    const w = setup();
    expect(structureActionModel(w, P0, nodeId(w, 0))!.buttons[1].caption).toBe('RETURNS 7');
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 3) }, PRIMITIVE_MAX_HP, 'creature');
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 5) }, PRIMITIVE_MAX_HP, 'creature');
    expect(structureActionModel(w, P0, nodeId(w, 0))!.buttons[1].caption).toBe('RETURNS 5');
  });

  it('FIX prices the shortfall when it can be paid, and NAMES it when it cannot', () => {
    const w = setup();
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 1) }, PRIMITIVE_MAX_HP, 'creature');
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 2) }, PRIMITIVE_MAX_HP, 'creature');

    // Empty bank: visible, disabled, and it SAYS why — the standing contract for a refused control.
    const broke = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(broke.enabled).toBe(false);
    expect(broke.caption).toBe('NEED 2 MORE');

    stock(w, SparkType.Spiral, 1);
    expect(structureActionModel(w, P0, nodeId(w, 0))!.buttons[0].caption).toBe('NEED 1 MORE');

    stock(w, SparkType.Spiral, 1);
    const ready = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(ready.enabled).toBe(true);
    expect(ready.caption).toBe('COSTS 2');
  });

  it('an untouched tower shows FIX disabled with NOTHING TO FIX — matching the reducer refusal', () => {
    const w = setup();
    const fix = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(fix.enabled).toBe(false);
    expect(fix.caption).toBe('NOTHING TO FIX');
  });

  it('chip damage alone offers a FREE repair', () => {
    const w = setup();
    damageEntity(w, { kind: 'primitive', id: nodeId(w, 2) }, 300, 'creature');
    const fix = structureActionModel(w, P0, nodeId(w, 0))!.buttons[0];
    expect(fix.enabled).toBe(true);
    expect(fix.caption).toBe('REPAIR FREE');
  });

  it('freeform rubble offers SCRAP ONLY — no greyed FIX lying about what the game can do', () => {
    const w = setup();
    w.primitives.get(nodeId(w, 3))!.origin = null;
    const view = structureActionModel(w, P0, nodeId(w, 0))!;
    expect(view.buttons.map((b) => b.kind)).toEqual(['SCRAP']);
    expect(view.title).toBe('STRUCTURE');
  });

  it('R19: no popover at all during the FIGHT stage', () => {
    const w = setup();
    const seed = nodeId(w, 0);
    w.matchPhase = 'FIGHT';
    expect(structureActionModel(w, P0, seed)).toBeNull();
  });

  it('keeps its buttons on-canvas for a tower built hard against the top-left corner', () => {
    const w = makeWorld(0);
    w.isHost = true;
    w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
    const bank = makeCastleBank();
    for (const [type, count] of blueprintBill('laserTurret')) {
      bank[type as number] = (bank[type as number] ?? 0) + count;
    }
    w.castleBanks.set(P0, bank);
    applyBuildBlueprint(w, {
      type: 'BUILD_BLUEPRINT',
      playerId: P0,
      blueprintId: 'laserTurret',
      centre: { x: 70, y: 70 },
    });
    const view = structureActionModel(w, P0, nodeId(w, 0));
    expect(view).not.toBeNull();
    for (const b of view!.buttons) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
    }
  });
});
