/**
 * SPARK — Session 12 smoke tests for the per-kind effects split.
 *
 * Coverage axes:
 *   1. effectLifetime() returns a positive duration for each kind, and
 *      STRUCTURE_GROW's duration scales with maxHop.
 *   2. Each per-kind drawer (drawBondCommit / drawSeverErase /
 *      drawStructureGrow / drawStructureMerge / drawScoreTier) dispatches
 *      and emits ≥1 draw call without throwing, including all 12 magic
 *      silhouettes for BOND_COMMIT.
 *   3. The EffectsRenderer class lifecycle (constructor + sync + destroy)
 *      runs without throw, sync drains world.effects, and lifetime
 *      expiry culls activeCount to zero.
 *
 * Graphics is mocked via GraphicsMock (same pattern as
 * bondVisualRenderer.test.ts). Pixi v8 Graphics state is JS-side until
 * rendered, so `new Graphics()` inside EffectsRenderer's constructor
 * works in Node test env with an `app.stage.addChild` stub.
 */

import { describe, expect, it } from 'vitest';
import type { Application } from 'pixi.js';
import { EffectsRenderer } from './effectsRenderer.ts';
import { drawBondCommit } from './effects/bondCommit.ts';
import { drawScoreTier } from './effects/scoreTier.ts';
import { drawSeverErase } from './effects/severErase.ts';
import { drawStructureGrow } from './effects/structureGrow.ts';
import { drawStructureMerge } from './effects/structureMerge.ts';
import { effectLifetime } from './effects/lifetime.ts';
import type { GameEffect } from '../game/effects.ts';
import type { World } from '../state/world.ts';
import { asPrimitiveId } from '../types.ts';

interface CallRecord {
  readonly op:
    | 'moveTo' | 'lineTo' | 'circle' | 'rect' | 'roundRect'
    | 'fill' | 'stroke' | 'clear' | 'destroy';
}

class GraphicsMock {
  readonly calls: CallRecord[] = [];
  moveTo(): this { this.calls.push({ op: 'moveTo' }); return this; }
  lineTo(): this { this.calls.push({ op: 'lineTo' }); return this; }
  circle(): this { this.calls.push({ op: 'circle' }); return this; }
  rect(): this { this.calls.push({ op: 'rect' }); return this; }
  roundRect(): this { this.calls.push({ op: 'roundRect' }); return this; }
  fill(): this { this.calls.push({ op: 'fill' }); return this; }
  stroke(): this { this.calls.push({ op: 'stroke' }); return this; }
  clear(): this { this.calls.push({ op: 'clear' }); return this; }
  destroy(): void { this.calls.push({ op: 'destroy' }); }
}

const emptyWorld = (tick = 1): World =>
  ({
    tick,
    rngSeed: 1,
    freeSparks: new Map(),
    primitives: new Map(),
    bonds: new Map(),
    players: new Map(),
    effects: [],
  } as unknown as World);

const stubApp = (): Application =>
  ({ stage: { addChild: () => undefined } } as unknown as Application);

describe('S12 — effectLifetime', () => {
  it('returns a positive duration for each kind', () => {
    const cases: GameEffect[] = [
      { kind: 'BOND_COMMIT', tick: 0, pos: { x: 0, y: 0 }, color: 0xffffff, radius: 4, visualEffectId: 'fx.bond.default', otherPos: { x: 10, y: 0 } },
      { kind: 'SEVER_ERASE', tick: 0, pos: { x: 0, y: 0 }, color: 0xffffff, radius: 5 },
      { kind: 'STRUCTURE_GROW', tick: 0, originPrimId: asPrimitiveId(1), hopByPrimId: new Map(), hopByBondId: new Map(), color: 0xffffff, maxHop: 0 },
      { kind: 'STRUCTURE_MERGE', tick: 0, originPos: { x: 0, y: 0 }, unionPrimIds: [], color: 0xffffff },
      { kind: 'SCORE_TIER', tick: 0, tier: 1, color: 0xffffff, pos: { x: 0, y: 0 } },
    ];
    for (const eff of cases) {
      expect(effectLifetime(eff), `${eff.kind} should have positive lifetime`).toBeGreaterThan(0);
    }
  });

  it('STRUCTURE_GROW lifetime scales with maxHop (deeper components linger longer)', () => {
    const shallow: GameEffect = { kind: 'STRUCTURE_GROW', tick: 0, originPrimId: asPrimitiveId(1), hopByPrimId: new Map(), hopByBondId: new Map(), color: 0, maxHop: 0 };
    const deep: GameEffect = { kind: 'STRUCTURE_GROW', tick: 0, originPrimId: asPrimitiveId(1), hopByPrimId: new Map(), hopByBondId: new Map(), color: 0, maxHop: 3 };
    expect(effectLifetime(deep)).toBeGreaterThan(effectLifetime(shallow));
  });
});

describe('S12 — per-kind drawers dispatch without throw', () => {
  const ALL_MAGIC: readonly string[] = [
    'fx.filament', 'fx.cable', 'fx.bracket', 'fx.diamond', 'fx.wheel',
    'fx.star', 'fx.orbital', 'fx.lattice', 'fx.capsule', 'fx.vortex',
    'fx.whip', 'fx.warped',
  ];

  it('drawBondCommit emits draw calls for fx.bond.default', () => {
    const g = new GraphicsMock();
    drawBondCommit(
      g as never,
      { kind: 'BOND_COMMIT', tick: 0, pos: { x: 50, y: 50 }, color: 0xff0000, radius: 4, visualEffectId: 'fx.bond.default', otherPos: { x: 100, y: 50 } },
      0.5,
    );
    expect(g.calls.length).toBeGreaterThan(0);
  });

  it.each(ALL_MAGIC)('drawBondCommit dispatches %s without throw and emits ≥1 call', (visualEffectId) => {
    const g = new GraphicsMock();
    expect(() => drawBondCommit(
      g as never,
      { kind: 'BOND_COMMIT', tick: 0, pos: { x: 50, y: 50 }, color: 0xff0000, radius: 4, visualEffectId, otherPos: { x: 100, y: 50 } },
      0.5,
    )).not.toThrow();
    expect(g.calls.length, `${visualEffectId} emitted zero draw calls`).toBeGreaterThan(0);
  });

  it('drawSeverErase emits a ghost fill and a shockwave stroke', () => {
    const g = new GraphicsMock();
    drawSeverErase(
      g as never,
      { kind: 'SEVER_ERASE', tick: 0, pos: { x: 0, y: 0 }, color: 0xffffff, radius: 5 },
      0.5,
    );
    expect(g.calls.some((c) => c.op === 'fill')).toBe(true);
    expect(g.calls.some((c) => c.op === 'stroke')).toBe(true);
  });

  it('drawStructureGrow with empty world maps does not throw', () => {
    const g = new GraphicsMock();
    const eff: GameEffect = {
      kind: 'STRUCTURE_GROW',
      tick: 0,
      originPrimId: asPrimitiveId(1),
      hopByPrimId: new Map([[asPrimitiveId(1), 0]]),
      hopByBondId: new Map(),
      color: 0xffffff,
      maxHop: 0,
    };
    expect(() => drawStructureGrow(g as never, eff as never, 5, emptyWorld(5))).not.toThrow();
  });

  it('drawStructureMerge with no matching primitives skips silently', () => {
    const g = new GraphicsMock();
    const eff: GameEffect = {
      kind: 'STRUCTURE_MERGE',
      tick: 0,
      originPos: { x: 0, y: 0 },
      unionPrimIds: [asPrimitiveId(1), asPrimitiveId(2)],
      color: 0xffffff,
    };
    expect(() => drawStructureMerge(g as never, eff as never, 10, emptyWorld(10))).not.toThrow();
  });

  it('drawScoreTier emits bloom fill and leading ring stroke', () => {
    const g = new GraphicsMock();
    drawScoreTier(
      g as never,
      { kind: 'SCORE_TIER', tick: 0, tier: 1, color: 0xffffff, pos: { x: 0, y: 0 } },
      10,
    );
    expect(g.calls.some((c) => c.op === 'fill')).toBe(true);
    expect(g.calls.some((c) => c.op === 'stroke')).toBe(true);
  });
});

describe('S12 — EffectsRenderer class lifecycle', () => {
  it('constructor + sync (empty world) + destroy run without throw', () => {
    const renderer = new EffectsRenderer(stubApp());
    expect(() => renderer.sync(emptyWorld())).not.toThrow();
    expect(renderer.activeCount).toBe(0);
    renderer.destroy();
  });

  it('sync drains world.effects and the active list grows by their count', () => {
    const renderer = new EffectsRenderer(stubApp());
    const w = emptyWorld(1);
    w.effects.push(
      { kind: 'BOND_COMMIT', tick: 0, pos: { x: 0, y: 0 }, color: 0xffffff, radius: 4, visualEffectId: 'fx.bond.default', otherPos: { x: 10, y: 0 } },
      { kind: 'SEVER_ERASE', tick: 0, pos: { x: 0, y: 0 }, color: 0xffffff, radius: 5 },
      { kind: 'SCORE_TIER', tick: 0, tier: 1, color: 0xffffff, pos: { x: 0, y: 0 } },
    );
    renderer.sync(w);
    expect(w.effects.length).toBe(0);
    expect(renderer.activeCount).toBe(3);
    renderer.destroy();
  });

  it('sync after lifetime expiry culls active list to zero', () => {
    const renderer = new EffectsRenderer(stubApp());
    const w = emptyWorld(1);
    w.effects.push({ kind: 'BOND_COMMIT', tick: 0, pos: { x: 0, y: 0 }, color: 0xffffff, radius: 4, visualEffectId: 'fx.bond.default', otherPos: { x: 10, y: 0 } });
    renderer.sync(w);
    expect(renderer.activeCount).toBe(1);
    w.tick = 1000;
    renderer.sync(w);
    expect(renderer.activeCount).toBe(0);
    renderer.destroy();
  });
});
