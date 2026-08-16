/**
 * SPARK — S144 P2: the BUILD GRID's model and layout.
 *
 * The owner's complaint was that clicking the castle showed no towers. These tests pin the two things
 * that would make the fix a lie:
 *
 *   1. **The model must agree with the reducer.** A bright tile that the reducer then refuses (or a
 *      dim tile that would actually have built) is worse than no tile. `castleStructuresModel` decides
 *      affordability with `planBlueprintPayment` — the SAME function `applyBuildBlueprint` uses — and
 *      the agreement test below asserts that rather than trusting it.
 *   2. **The grid must fit the plate.** This is the exact class that shipped GREEN in S140: the bank
 *      strip was laid out as one row of `CASTLE_BANK_CAP` slots and hung 24 px off BOTH edges, and
 *      `castlePanel.test.ts` had no bank coverage at all so nothing caught it. Six new 76 px tiles
 *      plus a two-line caption are the same hazard, so containment and on-canvas placement are
 *      asserted for every seat.
 */

import { describe, expect, it } from 'vitest';
import { makeCastleBank } from '../state/castleBank.ts';
import { makeWorld, type World } from '../state/world.ts';
import { makeIdlePlayer } from '../game/player.ts';
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, MAX_PLAYERS, PLAYER_COLORS, SparkType,
} from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { ALL_BLUEPRINT_IDS, blueprintBill, blueprintCost } from '../state/blueprints.ts';
import { planBlueprintPayment } from '../state/blueprintBuild.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import {
  PANEL_W, ROW_INNER_W, TILE, TILE_COLS, castleStructuresModel, panelHeight, panelOrigin, panelRect,
  rowsTop, structureRowCount, structuresStripHeight, tileOrigin,
} from './castlePanel.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';

const P0 = asPlayerId(0);

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.localPlayerId = P0;
  return w;
}
/** Bank exactly the bill for `id`, so that one tile is affordable and (mostly) the others are not. */
function fund(w: World, id: GodlyId): void {
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill(id)) {
    for (let i = 0; i < count; i++) {
      bank[type as number] = (bank[type as number] ?? 0) + 1;
    }
  }
  w.castleBanks.set(P0, bank);
}

describe('castleStructuresModel — all six, always', () => {
  it('lists every recipe in ALL_BLUEPRINT_IDS order', () => {
    // Owner: "for now everyone should have all the recipes just to test it all out". This costs
    // nothing because the codex is a localStorage GALLERY record that nothing in src/state/ reads —
    // note this test never touches localStorage and still sees all six.
    expect(castleStructuresModel(setup()).map((r) => r.id)).toEqual(ALL_BLUEPRINT_IDS);
  });

  it('every row carries a real name, an epigraph and its true cost', () => {
    for (const row of castleStructuresModel(setup())) {
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.name).not.toBe(row.id); // a raw id leaking into the UI is the bug this catches
      expect(row.tagline.length).toBeGreaterThan(0);
      expect(row.cost).toBe(blueprintCost(row.id));
    }
  });

  it('an empty bank disables everything, and every dim row NAMES its blocker', () => {
    for (const row of castleStructuresModel(setup())) {
      expect(row.enabled).toBe(false);
      // This file's standing contract: "A DISABLED CONTROL MUST SAY WHY." An unexplained dim box is
      // indistinguishable from a dead button — the actual defect behind the S136 owner complaint.
      expect(row.reason).not.toBe('');
      expect(row.missing.length).toBeGreaterThan(0);
    }
  });

  it('funding a recipe enables exactly that one (or another it fully covers)', () => {
    const w = setup();
    fund(w, 'stinkTower');
    const rows = castleStructuresModel(w);
    const stink = rows.find((r) => r.id === 'stinkTower')!;
    expect(stink.enabled).toBe(true);
    expect(stink.reason).toBe('');
    expect(stink.missing).toEqual([]);
    // Nothing costing more than the 4 banked shapes can be affordable.
    for (const row of rows) {
      if (row.cost > blueprintCost('stinkTower')) expect(row.enabled).toBe(false);
    }
  });

  it('a benched player is LOCKED out of every tile', () => {
    const w = setup();
    fund(w, 'stinkTower');
    w.players.get(P0)!.benchedUntilTick = w.tick + 600;
    for (const row of castleStructuresModel(w)) {
      expect(row.enabled).toBe(false);
      expect(row.reason).toBe('LOCKED');
    }
  });

  it('a shortfall reports have/need per shape, never a bare boolean', () => {
    const w = setup();
    // One Circle short of a stink tower (1 Square + 3 Circles).
    const short = makeCastleBank();
    for (const type of [SparkType.Square, SparkType.Circle, SparkType.Circle]) {
      short[type as number] = (short[type as number] ?? 0) + 1;
    }
    w.castleBanks.set(P0, short);
    const stink = castleStructuresModel(w).find((r) => r.id === 'stinkTower')!;
    expect(stink.enabled).toBe(false);
    expect(stink.missing).toEqual([{ type: SparkType.Circle, need: 3, have: 2 }]);
    expect(stink.reason).toBe('NEED 1 MORE');
  });

  it('⭐ enabled ALWAYS agrees with the reducer’s own payment plan', () => {
    // The sharing contract. If these ever diverge the panel is lying about what will happen.
    for (const seed of [undefined, 'stinkTower', 'pentagram', 'laserTurret', 'voltkin'] as const) {
      const w = setup();
      if (seed !== undefined) fund(w, seed);
      for (const row of castleStructuresModel(w)) {
        const canPay = planBlueprintPayment(w, P0, row.id) !== null;
        // `enabled` additionally honours the input locks; with none set the two must match exactly.
        expect(row.enabled).toBe(canPay);
      }
    }
  });
});

describe('build-grid layout stays inside the plate (the S140 overflow class)', () => {
  it('three columns of tiles fit the panel interior', () => {
    expect(TILE_COLS * TILE + (TILE_COLS - 1) * 6).toBeLessThanOrEqual(ROW_INNER_W);
  });

  it('every tile is fully inside the panel, horizontally and vertically', () => {
    const count = ALL_BLUEPRINT_IDS.length;
    const h = panelHeight(2);
    for (let i = 0; i < count; i++) {
      const o = tileOrigin(i, count);
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.x + TILE).toBeLessThanOrEqual(PANEL_W);
      expect(o.y).toBeGreaterThanOrEqual(0);
      // The grid must end above the control rows, not overlap them.
      expect(o.y + TILE).toBeLessThanOrEqual(rowsTop());
      expect(o.y + TILE).toBeLessThanOrEqual(h);
    }
  });

  it('tiles never overlap each other', () => {
    const count = ALL_BLUEPRINT_IDS.length;
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const a = tileOrigin(i, count);
        const b = tileOrigin(j, count);
        const disjoint = a.x + TILE <= b.x || b.x + TILE <= a.x
          || a.y + TILE <= b.y || b.y + TILE <= a.y;
        expect(disjoint).toBe(true);
      }
    }
  });

  it('panelHeight accounts for the build section', () => {
    // Guards the ordering trap this file documents: a strip added to the layout but NOT to
    // panelHeight leaves panelOrigin clamping against a stale height, so the panel hangs off-canvas
    // for keeps on the lower arc of the ring.
    expect(panelHeight(2)).toBeGreaterThan(structuresStripHeight());
    expect(structuresStripHeight()).toBeGreaterThan(structureRowCount() * TILE);
  });

  it('the panel stays fully on canvas for EVERY seat', () => {
    for (let seat = 0; seat < MAX_PLAYERS; seat++) {
      const a = castleAnchor(seat);
      const r = panelRect(panelOrigin(a.x, a.y, 2), 2);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(CANVAS_WIDTH);
      expect(r.y + r.h).toBeLessThanOrEqual(CANVAS_HEIGHT);
    }
  });

  it('the taller panel still fits the canvas with room for the caption', () => {
    expect(panelHeight(2)).toBeLessThan(CANVAS_HEIGHT - 16);
  });
});
