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

/**
 * S165 (sweep Lane 5) — THE MOCK NOW RECORDS ARGUMENTS, AND WITHOUT THAT FOUR TESTS HERE COULD NOT
 * SEE WHAT THEY CLAIMED TO TEST.
 *
 * It recorded call NAMES only, so *"different creatureIds scatter the dust differently"* could do no
 * better than compare call COUNTS — which is satisfied by ignoring `creatureId` entirely — and
 * *"advances the hop over frames"* could only assert `not.toThrow()`. `raceMotifs.test.ts` already
 * had a `signature()` helper for exactly this; this file simply never grew one.
 *
 * `calls` (names) is UNCHANGED so the existing `toContain('clear')` / `toEqual(['clear'])`
 * assertions keep working; `ops` is additive.
 */
class GraphicsMock {
  readonly calls: string[] = [];
  /** Every call with its numeric arguments, so geometry can be compared frame to frame. */
  readonly ops: Array<{ name: string; args: number[] }> = [];
  private rec(name: string, args: unknown[]): this {
    this.calls.push(name);
    this.ops.push({ name, args: args.filter((a): a is number => typeof a === 'number') });
    return this;
  }
  /**
   * A stable, comparable fingerprint of everything drawn: call names plus coordinates rounded to
   * whole pixels. Rounded because sub-pixel float noise is not a behavioural difference — but 6 px
   * of hop, or a different crumb scatter, is.
   */
  /**
   * S165 - RESET BETWEEN FRAMES, AND FORGETTING THIS MADE MY OWN PRUNE TEST WRONG FIRST TIME.
   * The mock only ever APPENDS - `clear()` is recorded as a call, not treated as a reset - so
   * `signature()` after fourteen syncs describes all fourteen frames concatenated. Comparing
   * that against a one-frame signature can never match, which reads exactly like a real leak.
   */
  reset(): void { this.calls.length = 0; this.ops.length = 0; }

  /**
   * S165 - THE BODY'S DRAWN POSITION, rounded. The one part of a chewer frame that is a pure
   * function of `pos`, so it is stable across machines.
   *
   * WHY THIS EXISTS, AND WHY `signature()` IS THE WRONG TOOL FOR A CROSS-INSTANCE COMPARE: the hop
   * phase advances by `dtSec * IDLE_HOP_HZ` - by REAL ELAPSED TIME between syncs. So leg and lean
   * geometry differ by a pixel or two depending on how fast the machine got from one sync to the
   * next. My first prune assertion compared whole frames, passed locally, then failed on CI over
   * `quadraticCurveTo(288,312,284,317)` vs `(...,286,317)` - two pixels of leg - AND BLOCKED THE
   * DEPLOY. A test that encodes the speed of the machine it was written on is not a test.
   */
  bodyPos(): string {
    const first = this.ops.find((o) => o.name === 'ellipse');
    if (first === undefined) return 'NO-BODY';
    return `${Math.round(first.args[0] ?? 0)},${Math.round(first.args[1] ?? 0)}`;
  }

  signature(): string {
    return this.ops.map((o) => `${o.name}(${o.args.map((n) => Math.round(n)).join(',')})`).join('|');
  }
  moveTo(...a: unknown[]): this { return this.rec('moveTo', a); }
  lineTo(...a: unknown[]): this { return this.rec('lineTo', a); }
  quadraticCurveTo(...a: unknown[]): this { return this.rec('quadraticCurveTo', a); }
  circle(...a: unknown[]): this { return this.rec('circle', a); }
  ellipse(...a: unknown[]): this { return this.rec('ellipse', a); }
  rect(...a: unknown[]): this { return this.rec('rect', a); }
  poly(...a: unknown[]): this { return this.rec('poly', a); } // S106 P2 — fangs are g.poly triangles
  closePath(...a: unknown[]): this { return this.rec('closePath', a); }
  fill(...a: unknown[]): this { return this.rec('fill', a); }
  stroke(...a: unknown[]): this { return this.rec('stroke', a); }
  clear(...a: unknown[]): this { return this.rec('clear', a); }
  destroy(): void { this.rec('destroy', []); }
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
    /*
     * S165 — THIS ASSERTED `gA.calls.length === gB.calls.length`, WHICH IS A TEST FOR SAMENESS.
     *
     * Make `drawChewBite` ignore `creatureId` entirely — every emitter drawing identical crumbs —
     * and equal call counts are trivially satisfied. The old comment conceded the mock "can't read
     * coords", which was true and is no longer: `signature()` compares them.
     *
     * ⭐ BOTH HALVES MATTER. The shapes must MATCH (the jitter is positional only, so a different id
     * must not add or drop a crumb) and the coordinates must DIFFER (or there is no jitter).
     */
    const base = { kind: 'CHEW_BITE' as const, tick: 0, pos: { x: 0, y: 0 } };
    const gA = new GraphicsMock();
    const gB = new GraphicsMock();
    drawChewBite(gA as never, { ...base, creatureId: asCreatureId(1) }, 0.4);
    drawChewBite(gB as never, { ...base, creatureId: asCreatureId(99) }, 0.4);

    expect(gA.calls, 'the call SHAPE must not depend on the emitter').toEqual(gB.calls);
    expect(gA.ops.length, 'anti-vacuity: nothing was drawn at all').toBeGreaterThan(0);
    expect(
      gA.signature(),
      'two different emitters drew IDENTICAL geometry — the per-emitter jitter is not applied. '
        + 'NOTE there are TWO creatureId terms in drawChewBite: the ring PHASE (idPhase) and the '
        + 'crumb DISTANCE (far). Neutralising only one still leaves this test passing, which is '
        + 'how a partial negative control fooled me into calling this test vacuous.',
    ).not.toBe(gB.signature());

    // ...and it is deterministic: the same id twice is the same scatter, or replays would diverge.
    const gC = new GraphicsMock();
    drawChewBite(gC as never, { ...base, creatureId: asCreatureId(1) }, 0.4);
    expect(gC.signature()).toBe(gA.signature());
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

  it('advances the hop over frames as the chewer really moves', () => {
    /*
     * S165 — THE ONLY ASSERTION HERE WAS `not.toThrow()`, INSIDE A TEN-FRAME LOOP. Make the hop
     * offset a constant 0 and it stayed green; the name promised motion and the test could not see
     * any. Now it compares the drawn geometry between frames.
     */
    const r = new ChewerRenderer(stubApp(), stubParent());
    const w = makeWorld();
    const c = w.creatures.get(asCreatureId(50)) as { pos: { x: number; y: number }; prevPos: { x: number; y: number } };
    const frames: string[] = [];
    for (let i = 0; i < 10; i++) {
      c.prevPos = { x: c.pos.x, y: c.pos.y };
      c.pos = { x: c.pos.x + 6, y: c.pos.y + 1 };
      (w as { tick: number }).tick += 1;
      lastGraphics.reset();
      r.sync(w);
      frames.push(lastGraphics.signature());
    }
    r.destroy();

    expect(frames[0]!.length, 'anti-vacuity: no geometry was recorded').toBeGreaterThan(0);
    // A walking chewer must not draw the same picture twice in ten frames.
    expect(
      new Set(frames).size,
      'ten frames of a moving chewer produced identical geometry — the hop is not advancing',
    ).toBeGreaterThan(1);
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
    /*
     * S165 - THE ONLY ASSERTION HERE WAS `not.toThrow()`, ON A LEAK GUARD. Five per-chewer `Map`s
     * are keyed by CreatureId and must shrink when a chewer dies; delete the prune, let them grow
     * unbounded, and the suite stayed green. The only lane that could have caught the leak is
     * `render-heap.spec.ts`, which is `@soak` and non-gating - so the class had no gating signal.
     *
     * MEASURED AS MAP SIZES, and getting here took two wrong attempts worth recording:
     *
     *   1. A whole-frame geometry comparison DID catch stale state - and is machine-dependent. The
     *      hop advances by `dtSec * IDLE_HOP_HZ`, i.e. real elapsed time, so legs land a pixel or
     *      two apart on a slower box. It passed locally, failed on CI over two pixels of leg, and
     *      BLOCKED THE DEPLOY.
     *   2. Narrowing to the body position is machine-stable and no longer catches the leak at all,
     *      because a stale `lastSeenPos` perturbs the HOP, not the position.
     *
     * The thing under test is a map size. `inspectState()` reports it directly - the
     * `inspectAudioChain()` idiom this repo already uses - and is immune to both problems.
     */
    const r = new ChewerRenderer(stubApp(), stubParent());
    const w = makeWorld();
    r.sync(w);

    const populated = r.inspectState();
    // Anti-vacuity: if nothing was ever recorded, "it shrank" would be trivially true.
    expect(Object.keys(populated).length, 'no bookkeeping maps reported').toBeGreaterThan(0);
    expect(populated.lastSeenPos, 'the live chewer was never recorded').toBe(1);

    // Walk it so hop/facing/state are all genuinely populated, not just the position.
    const c = w.creatures.get(asCreatureId(50)) as {
      pos: { x: number; y: number }; prevPos: { x: number; y: number };
    };
    for (let i = 0; i < 5; i++) {
      c.prevPos = { x: c.pos.x, y: c.pos.y };
      c.pos = { x: c.pos.x - 7, y: c.pos.y };
      (w as { tick: number }).tick += 1;
      r.sync(w);
    }
    for (const [key, n] of Object.entries(r.inspectState())) {
      expect(n, `${key} should hold the live chewer before it despawns`).toBeGreaterThan(0);
    }

    // The despawn tick. Every map must drop the dead id.
    w.creatures.clear();
    r.sync(w);
    for (const [key, n] of Object.entries(r.inspectState())) {
      expect(
        n,
        `${key} still holds ${n} entr${n === 1 ? 'y' : 'ies'} after the chewer despawned - this is `
          + `the unbounded-growth leak, one entry per creature that ever lived`,
      ).toBe(0);
    }

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
