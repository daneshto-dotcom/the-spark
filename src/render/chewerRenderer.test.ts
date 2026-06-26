/**
 * SPARK — S100 P1 (TD Phase 1a) Layer-7 render smoke tests.
 *
 * Covers the three render-only deliverables of the chewer/spawner-zone layer:
 *   1. `drawChewBite` — the host-local graphite bite burst drawer emits ≥1 draw
 *      call across its lifetime without throwing (mirrors the effectsRenderer
 *      drawer smoke pattern).
 *   2. `ChewerRenderer` — constructs, draws a live chewer (emitting body /
 *      legs / teeth / eye geometry), advances its physics-driven hop across
 *      frames, skips Voltkin (partition by `creature.type`), prunes per-chewer
 *      state on despawn, and clears/destroys without throw.
 *   3. `SpawnerZoneRenderer` — constructs, draws a live spawner's radiating
 *      aura + 'alive' bond overlay over its anchor component (via componentOf),
 *      no-ops cleanly when no spawner is live, and clears/destroys.
 *
 * Graphics is mocked via GraphicsMock (the effectsRenderer.test.ts pattern,
 * extended with `ellipse` + `quadraticCurveTo` which these drawers use). Pixi v8
 * Graphics state is JS-side until rendered, so `new Graphics()` in a ctor works
 * in the Node test env with an `addChild` stub.
 *
 * These are RENDER-ONLY assertions: they prove the draw paths execute and emit
 * geometry. They intentionally make NO determinism claims — the hop is keyed off
 * the (deterministic) sim motion but the cosmetic jitter uses performance.now,
 * which is correct for render-only code per the layer brief.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Application, Container } from 'pixi.js';
import { ChewerRenderer } from './chewerRenderer.ts';
import { SpawnerZoneRenderer } from './spawnerZoneRenderer.ts';
import { drawChewBite } from './effects/chewBite.ts';
import type { GameEffect } from '../game/effects.ts';
import type { World } from '../state/world.ts';
import { asCreatureId, asPrimitiveId, asBondId, asSpawnerId } from '../types.ts';

class GraphicsMock {
  readonly calls: string[] = [];
  moveTo(): this { this.calls.push('moveTo'); return this; }
  lineTo(): this { this.calls.push('lineTo'); return this; }
  quadraticCurveTo(): this { this.calls.push('quadraticCurveTo'); return this; }
  circle(): this { this.calls.push('circle'); return this; }
  ellipse(): this { this.calls.push('ellipse'); return this; }
  rect(): this { this.calls.push('rect'); return this; }
  poly(): this { this.calls.push('poly'); return this; } // S106 P2 — chewer fangs are now g.poly triangles
  closePath(): this { this.calls.push('closePath'); return this; }
  fill(): this { this.calls.push('fill'); return this; }
  stroke(): this { this.calls.push('stroke'); return this; }
  clear(): this { this.calls.push('clear'); return this; }
  destroy(): void { this.calls.push('destroy'); }
}

// One shared mock so the renderer's internal `new Graphics()` is observable
// (Pixi's real Graphics is replaced module-wide by this stub for the test).
let lastGraphics: GraphicsMock;
vi.mock('pixi.js', () => ({
  Graphics: class {
    constructor() { lastGraphics = new GraphicsMock(); return lastGraphics as unknown as object; }
  },
  Container: class { addChild(): void {} },
  Application: class {},
}));

const stubParent = (): Container => ({ addChild: () => undefined } as unknown as Container);
const stubApp = (): Application => ({ stage: { addChild: () => undefined } } as unknown as Application);

// Minimal live world: one player (tint source), one bonded triangle anchor
// component, one live spawner over it, one chewer mid-approach.
function makeWorld(opts: { withChewer?: boolean; withSpawner?: boolean; chewerType?: 'chewer' | 'voltkin' } = {}): World {
  const { withChewer = true, withSpawner = true, chewerType = 'chewer' } = opts;
  const primitives = new Map();
  const bonds = new Map();
  const creatures = new Map();
  const creatureSpawners = new Map();
  const players = new Map([[0, { color: 0xff4d4d, avatarPos: { x: 400, y: 300 } }]]);

  const mkP = (id: number, x: number, y: number): unknown => ({
    id: asPrimitiveId(id), type: 2, placerColor: 0xff4d4d, placedBy: 0, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: 0xff4d4d,
    lastOwnershipChange: 0, radius: 10,
  });
  const p0 = mkP(900, 380, 300) as { id: unknown; bonds: Set<unknown> };
  const p1 = mkP(901, 460, 320) as { id: unknown; bonds: Set<unknown> };
  const p2 = mkP(902, 420, 380) as { id: unknown; bonds: Set<unknown> };
  primitives.set(asPrimitiveId(900), p0);
  primitives.set(asPrimitiveId(901), p1);
  primitives.set(asPrimitiveId(902), p2);
  const mkB = (id: number, a: typeof p0, b: typeof p0): unknown => {
    a.bonds.add(asBondId(id)); b.bonds.add(asBondId(id));
    return { id: asBondId(id), aId: a.id, bId: b.id, a, b, restLength: 80, stiffnessTier: 'MID' };
  };
  bonds.set(asBondId(800), mkB(800, p0, p1));
  bonds.set(asBondId(801), mkB(801, p1, p2));
  bonds.set(asBondId(802), mkB(802, p2, p0));

  if (withSpawner) {
    creatureSpawners.set(asSpawnerId(7), {
      id: asSpawnerId(7), ownerPlayerId: 0, anchorPrimitiveId: asPrimitiveId(900),
      recipeId: 'pentagram', nextSpawnTick: 999999, lastValidatedTick: 0, spawnedCount: 0, ignitedAtTick: 0,
    });
  }
  if (withChewer) {
    creatures.set(asCreatureId(50), {
      id: asCreatureId(50), type: chewerType, ownerPlayerId: 0,
      pos: { x: 300, y: 305 }, prevPos: { x: 295, y: 304 }, targetPos: { x: 460, y: 320 },
      targetBondId: asBondId(800), state: 'SEEKING', ticksInState: 20, killCount: 0,
      spawnedAtTick: 0, despawnAtTick: 1e9, sourceSpawnerId: asSpawnerId(7), chewProgress: 0,
    });
  }
  return { tick: 30, primitives, bonds, creatures, creatureSpawners, players, effects: [] } as unknown as World;
}

describe('S100 P1 — drawChewBite', () => {
  it('emits draw calls across its lifetime without throwing', () => {
    const effect: Extract<GameEffect, { kind: 'CHEW_BITE' }> = {
      kind: 'CHEW_BITE', tick: 0, pos: { x: 100, y: 100 }, creatureId: asCreatureId(3),
    };
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const g = new GraphicsMock();
      expect(() => drawChewBite(g as never, effect, t)).not.toThrow();
      expect(g.calls.filter((c) => c === 'circle').length).toBeGreaterThan(0);
      expect(g.calls).toContain('fill');
      expect(g.calls).toContain('stroke');
    }
  });

  it('different creatureIds scatter the dust differently (per-emitter jitter)', () => {
    // Same pos+t, different emitter — the crumb positions differ. We can't read
    // coords through the call-name mock, but we CAN assert both draw without
    // throw and emit the same call SHAPE (the jitter is positional only).
    const base = { kind: 'CHEW_BITE' as const, tick: 0, pos: { x: 0, y: 0 } };
    const gA = new GraphicsMock();
    const gB = new GraphicsMock();
    drawChewBite(gA as never, { ...base, creatureId: asCreatureId(1) }, 0.4);
    drawChewBite(gB as never, { ...base, creatureId: asCreatureId(99) }, 0.4);
    expect(gA.calls.length).toBe(gB.calls.length);
  });
});

describe('S100 P1 — ChewerRenderer', () => {
  it('constructs, draws a live chewer, and emits body/legs/teeth/eye geometry', () => {
    const r = new ChewerRenderer(stubApp(), stubParent());
    const w = makeWorld();
    expect(() => r.sync(w)).not.toThrow();
    // First frame: clear + a chewer's worth of geometry (body fill+stroke, legs,
    // teeth rects, eye circles).
    expect(lastGraphics.calls).toContain('clear');
    expect(lastGraphics.calls).toContain('fill');
    expect(lastGraphics.calls).toContain('stroke');
    expect(lastGraphics.calls.filter((c) => c === 'poly').length).toBeGreaterThanOrEqual(2); // S106 P2 — 2 funny pointed buck-fangs (triangles)
    expect(lastGraphics.calls.filter((c) => c === 'circle').length).toBeGreaterThan(0); // eyes + feet ticks
    r.destroy();
  });

  it('advances the hop over frames as the chewer really moves (no throw)', () => {
    const r = new ChewerRenderer(stubApp(), stubParent());
    const w = makeWorld();
    const c = w.creatures.get(asCreatureId(50)) as { pos: { x: number; y: number }; prevPos: { x: number; y: number } };
    for (let i = 0; i < 10; i++) {
      c.prevPos = { x: c.pos.x, y: c.pos.y };
      c.pos = { x: c.pos.x + 6, y: c.pos.y + 1 };
      (w as { tick: number }).tick += 1;
      expect(() => r.sync(w)).not.toThrow();
    }
    r.destroy();
  });

  it('skips Voltkin (partitions world.creatures by type)', () => {
    const r = new ChewerRenderer(stubApp(), stubParent());
    const w = makeWorld({ chewerType: 'voltkin' });
    r.sync(w);
    // Only the clear() runs — no chewer body geometry for a voltkin.
    expect(lastGraphics.calls).toEqual(['clear']);
    r.destroy();
  });

  it('no-ops to a single clear when there are no chewers', () => {
    const r = new ChewerRenderer(stubApp(), stubParent());
    const w = makeWorld({ withChewer: false });
    r.sync(w);
    expect(lastGraphics.calls).toEqual(['clear']);
    r.destroy();
  });

  it('prunes per-chewer hop state when a chewer despawns', () => {
    const r = new ChewerRenderer(stubApp(), stubParent());
    const w = makeWorld();
    r.sync(w);
    // Remove the chewer; next sync must not throw and clears bookkeeping.
    w.creatures.clear();
    expect(() => r.sync(w)).not.toThrow();
    r.clear();
    r.destroy();
  });
});

describe('S100 P1 — SpawnerZoneRenderer', () => {
  it('draws the radiating aura + alive bond overlay over the anchor component', () => {
    const r = new SpawnerZoneRenderer(stubApp(), stubParent());
    const w = makeWorld();
    expect(() => r.sync(w)).not.toThrow();
    expect(lastGraphics.calls).toContain('clear');
    // aura discs + concentric rings + anchor core => several circles + fills + strokes
    expect(lastGraphics.calls.filter((c) => c === 'circle').length).toBeGreaterThan(3);
    expect(lastGraphics.calls).toContain('fill');
    expect(lastGraphics.calls).toContain('stroke');
    // alive-bond overlay traces each component bond (moveTo/lineTo per bond).
    expect(lastGraphics.calls.filter((c) => c === 'lineTo').length).toBeGreaterThanOrEqual(3);
    r.destroy();
  });

  it('no-ops to a single clear when no spawner is live', () => {
    const r = new SpawnerZoneRenderer(stubApp(), stubParent());
    const w = makeWorld({ withSpawner: false });
    r.sync(w);
    expect(lastGraphics.calls).toEqual(['clear']);
    r.destroy();
  });

  it('survives an anchor primitive that vanished (re-validation race)', () => {
    const r = new SpawnerZoneRenderer(stubApp(), stubParent());
    const w = makeWorld();
    w.primitives.delete(asPrimitiveId(900)); // anchor gone this frame
    expect(() => r.sync(w)).not.toThrow();
    r.destroy();
  });
});
