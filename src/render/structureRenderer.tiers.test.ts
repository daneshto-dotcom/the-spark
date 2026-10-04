/**
 * SPARK — S195 N17 — THE GRAPHICS TIERS IN THE CONNECTOR RENDERER.
 *
 * Owner: *"that toggle on-off should actually do something … For different tiers of machines."*
 *
 * What these pin, each against the REAL renderer (`StructureRenderer.sync`) with only Pixi stubbed:
 *   1. HIGH IS BYTE-FOR-BYTE TODAY — the HIGH op stream equals the frozen pre-S195 `drawBonds`
 *      (`structureBondsPreS195.fixtures.ts`) on randomised boards, frame after frame.
 *   2. REACH — the stored tier, through `syncGraphicsTier()` (what `main.ts` calls each frame), switches the
 *      renderer onto the cache. Unhook the tier and the cache-path assertions go red.
 *   3. INVALIDATION — a settled board redraws NOTHING; a sever, a stretch (stress), a cover fade, a foul and a
 *      fog change each redraw the bucket they touch and leave the others alone; the drawn result matches.
 *   4. LOW steps the animated silhouettes at 10 Hz; MINIMAL never redraws for the clock alone.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// ---- Pixi stub: a Graphics that records every call, a Container with real children ----
interface Op { name: string; args: unknown[] }
const H = vi.hoisted(() => {
  class GraphicsRec {
  ops: Op[] = [];
  clears = 0;
  visible = true;
  constructor() {
    return new Proxy(this, {
      get(target, prop, recv) {
        if (prop in target) return Reflect.get(target, prop, recv);
        if (typeof prop === 'symbol') return undefined;
        return (...args: unknown[]) => { target.ops.push({ name: prop, args: JSON.parse(JSON.stringify(args)) as unknown[] }); return recv; };
      },
    });
  }
  clear(): this { this.ops = []; this.clears++; return this; }
  destroy(): void { /* stub */ }
}
  class ContainerStub {
  children: unknown[] = [];
  visible = true;
  label = '';
  addChild<T>(c: T): T { this.children.push(c); return c; }
  destroy(): void { /* stub */ }
}
  class SpriteStub {
  anchor = { set: (): void => undefined };
  scale = { set: (): void => undefined };
  tint = 0; x = 0; y = 0; alpha = 1;
  destroy(): void { /* stub */ }
}
  const coverByBond = new Map<number, number>();
  const fog = { concealedOwner: null as number | null };
  return { GraphicsRec, ContainerStub, SpriteStub, coverByBond, fog };
});
const { GraphicsRec, ContainerStub, coverByBond, fog } = H;
type GraphicsRec = InstanceType<typeof H.GraphicsRec>;
type ContainerStub = InstanceType<typeof H.ContainerStub>;
vi.mock('pixi.js', () => ({ Graphics: H.GraphicsRec, Container: H.ContainerStub, Sprite: H.SpriteStub, Application: class {} }));
// The fx runtime pulls in pixi-filters, which needs the real Pixi; the tier's fx half is tested on its own.
vi.mock('./fx/fxRuntime.ts', () => ({ setFxHighQualityRuntime: () => undefined, setFxTierLegacy: () => undefined }));
vi.mock('./shapes.ts', () => ({ makeShapeTextures: () => ({}), destroyShapeTextures: () => undefined }));

// Cover alpha and concealment are the two inputs a tower/fog change moves; drive them directly.
vi.mock('./towerCover.ts', () => ({
  TOWER_COVER_DRAW_EPSILON: 0.01,
  coverAlphaForBond: (id: number) => H.coverByBond.get(id) ?? 1,
  coverAlphaForPrim: () => 1,
  pruneTowerCover: () => undefined,
}));
vi.mock('./concealment.ts', () => ({
  isConcealed: (_x: number, _y: number, owner: number | null) => H.fog.concealedOwner !== null && owner === H.fog.concealedOwner,
}));

const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  },
};

import { StructureRenderer, BOND_CACHE_CELL_PX } from './structureRenderer.ts';
import { drawBondsPreS195 } from './structureBondsPreS195.fixtures.ts';
import { resetGraphicsTierForTests, syncGraphicsTier, graphicsTier } from './graphicsTier.ts';
import type { World } from '../state/world.ts';
import type { Application, Graphics } from 'pixi.js';

// ---- a deterministic board (no Math.random: a tiny LCG) ----
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
const COLORS = [0xff4d4d, 0x4dafff, 0x5eff7a, 0xffd84d];
interface P { id: number; type: number; pos: { x: number; y: number }; placedBy: number; placerColor: number; ownerColor: number; bonds: Set<number> }
interface B { id: number; aId: number; bId: number; a: P; b: P; restLength: number; stiffnessTier: 'LOW' | 'MID' | 'HIGH'; damageFifths?: number }
function board(seed: number, n: number): World {
  const r = lcg(seed);
  const primitives = new Map<number, P>();
  const bonds = new Map<number, B>();
  for (let i = 0; i < n; i++) {
    const seat = i % 4;
    primitives.set(i, {
      id: i, type: Math.floor(r() * 6), pos: { x: 40 + r() * 1840, y: 40 + r() * 1000 },
      placedBy: seat, placerColor: COLORS[seat]!, ownerColor: COLORS[seat]!, bonds: new Set(),
    });
  }
  let bid = 0;
  for (let i = 1; i < n; i++) {
    const a = primitives.get(i)!;
    const b = primitives.get(i - 1 - Math.floor(r() * Math.min(i, 3)))!;
    const len = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
    const tiers = ['LOW', 'MID', 'HIGH'] as const;
    bonds.set(bid, { id: bid, aId: a.id, bId: b.id, a, b, restLength: len / (1 + r() * 0.3), stiffnessTier: tiers[Math.floor(r() * 3)]! });
    a.bonds.add(bid); b.bonds.add(bid);
    bid++;
  }
  return {
    tick: 1000, gameMode: '1v1', primitives, bonds, fouledPrimitives: new Set<number>(),
    players: new Map(COLORS.map((c, i) => [i, { color: c }])),
  } as unknown as World;
}

const app = { stage: new ContainerStub() } as unknown as Application;
type Internals = { bondGraphics: GraphicsRec; bondCacheLayer: ContainerStub; bondBuckets: Map<number, { g: GraphicsRec; hash: number }> };
const internals = (r: StructureRenderer): Internals => r as unknown as Internals;
const opsOf = (g: GraphicsRec): string => JSON.stringify(g.ops);
/** Every op the cache drew this frame, bucket by bucket. */
const cachedOps = (r: StructureRenderer): Op[] => [...internals(r).bondBuckets.values()].flatMap((b) => b.g.ops);

function setTier(t: 'HIGH' | 'LOW' | 'MINIMAL'): void {
  store.set('display.graphicsTier', t);
  syncGraphicsTier();
}

beforeEach(() => {
  store.clear();
  coverByBond.clear();
  fog.concealedOwner = null;
  resetGraphicsTierForTests();
});

describe('S195 N17 — HIGH is the pre-S195 renderer, byte for byte', () => {
  it('the op stream equals the frozen pre-S195 drawBonds on randomised boards, over several frames', () => {
    setTier('HIGH');
    expect(graphicsTier()).toBe('HIGH');
    for (const seed of [1, 7, 42, 1999]) {
      const w = board(seed, 120);
      const r = new StructureRenderer(app, new ContainerStub() as never);
      const ref = new GraphicsRec();
      for (let f = 0; f < 4; f++) {
        (w as { tick: number }).tick += 7; // animated silhouettes read the clock
        const p = w.primitives.get(f + 3) as unknown as P;
        p.pos.x += 3.3; // a stretched connector: stress tint + width + pulse
        r.sync(w);
        drawBondsPreS195(ref as unknown as Graphics, w);
        expect(internals(r).bondGraphics.ops.length).toBeGreaterThan(100);
        expect(opsOf(internals(r).bondGraphics)).toBe(opsOf(ref));
      }
      expect(internals(r).bondCacheLayer.visible).toBe(false);
      expect(cachedOps(r)).toHaveLength(0);
    }
  });
});

describe('S195 N17 — REACH: the stored tier switches the renderer', () => {
  it('LOW / MINIMAL stored → syncGraphicsTier → the connectors draw from the cache, not bondGraphics', () => {
    for (const tier of ['LOW', 'MINIMAL'] as const) {
      resetGraphicsTierForTests();
      setTier(tier);
      const w = board(5, 80);
      const r = new StructureRenderer(app, new ContainerStub() as never);
      r.sync(w);
      expect(internals(r).bondCacheLayer.visible, tier).toBe(true);
      expect(internals(r).bondGraphics.ops, tier).toHaveLength(0);
      expect(cachedOps(r).length, tier).toBeGreaterThan(80);
      // every connector is drawn exactly once: one silhouette start per bond is what the HIGH path draws too
      const high = new GraphicsRec();
      drawBondsPreS195(high as unknown as Graphics, w);
      const strokes = (ops: Op[]): number => ops.filter((o) => o.name === 'stroke').length;
      expect(strokes(cachedOps(r))).toBe(strokes(high.ops));
    }
  });

  it('switching back to HIGH empties the cache and HIGH draws again (live, no rebuild)', () => {
    setTier('MINIMAL');
    const w = board(9, 60);
    const r = new StructureRenderer(app, new ContainerStub() as never);
    r.sync(w);
    setTier('HIGH');
    r.sync(w);
    expect(internals(r).bondCacheLayer.visible).toBe(false);
    expect(cachedOps(r)).toHaveLength(0);
    expect(internals(r).bondGraphics.ops.length).toBeGreaterThan(60);
  });

  it('the cache lives inside primitiveLayer, so fogHiddenLayer keeps its child roll-call (fog.spec index 1 = _Graphics)', () => {
    const parent = new ContainerStub();
    new StructureRenderer(app, parent as never);
    expect(parent.children).toHaveLength(2);
    expect(parent.children[0]).toBeInstanceOf(GraphicsRec);
  });
});

describe('S195 N17 — the cache redraws exactly what changed', () => {
  function settled(tier: 'LOW' | 'MINIMAL'): { w: World; r: StructureRenderer } {
    setTier(tier);
    const w = board(11, 150);
    const r = new StructureRenderer(app, new ContainerStub() as never);
    r.sync(w);
    return { w, r };
  }
  const redraws = (r: StructureRenderer): number => r.bondBucketRedraws();

  it('a settled board redraws nothing, frame after frame', () => {
    const { w, r } = settled('MINIMAL');
    const before = redraws(r);
    for (let i = 0; i < 5; i++) { (w as { tick: number }).tick++; r.sync(w); }
    expect(redraws(r)).toBe(before);
  });

  it('a SEVER redraws its bucket, and the severed connector is gone from the drawing', () => {
    const { w, r } = settled('MINIMAL');
    const before = redraws(r);
    w.bonds.delete(40 as never);
    r.sync(w);
    expect(redraws(r) - before).toBe(1);
    // the whole drawing equals a fresh renderer's drawing of the post-sever board
    const fresh = new StructureRenderer(app, new ContainerStub() as never);
    fresh.sync(w);
    const sorted = (x: StructureRenderer): string[] => [...internals(x).bondBuckets.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => opsOf(b.g));
    expect(sorted(r)).toEqual(sorted(fresh));
  });

  it('a STRETCH (stress), a COVER fade, a FOUL and a FOG change each force a redraw', () => {
    const { w, r } = settled('LOW');
    let n = redraws(r);
    (w.primitives.get(60) as unknown as P).pos.x += 6; // stretches its connectors
    r.sync(w);
    expect(redraws(r), 'stretch').toBeGreaterThan(n);
    n = redraws(r);
    coverByBond.set(20, 0.5); // a tower standing up over connector 20
    r.sync(w);
    expect(redraws(r) - n, 'cover').toBe(1);
    n = redraws(r);
    (w.fouledPrimitives as Set<number>).add(90);
    r.sync(w);
    expect(redraws(r), 'foul').toBeGreaterThan(n);
    n = redraws(r);
    fog.concealedOwner = 2; // seat 2 drops out of vision
    r.sync(w);
    expect(redraws(r), 'fog').toBeGreaterThan(n);
  });

  it('drift that stays inside one pixel does NOT redraw (MINIMAL snaps to whole pixels)', () => {
    const { w, r } = settled('MINIMAL');
    for (const p of w.primitives.values()) { const q = p as unknown as P; q.pos.x = Math.round(q.pos.x) + 0.3; }
    r.sync(w);
    const before = redraws(r);
    for (const p of w.primitives.values()) { const q = p as unknown as P; q.pos.x = Math.round(q.pos.x) + 0.1; }
    r.sync(w);
    expect(redraws(r)).toBe(before);
    // …and one whole pixel of it does
    for (const p of w.primitives.values()) (p as unknown as P).pos.x += 1;
    r.sync(w);
    expect(redraws(r)).toBeGreaterThan(before);
  });

  it('LOW steps the animated silhouettes at 10 Hz; MINIMAL never redraws for the clock alone', () => {
    const low = settled('LOW');
    let n = redraws(low.r);
    (low.w as { tick: number }).tick = 1001; low.r.sync(low.w); // inside the same 6-tick step as 1000
    expect(redraws(low.r)).toBe(n);
    (low.w as { tick: number }).tick = 1008; low.r.sync(low.w); // next step
    expect(redraws(low.r)).toBeGreaterThan(n);
    resetGraphicsTierForTests();
    const min = settled('MINIMAL');
    n = redraws(min.r);
    (min.w as { tick: number }).tick = 5000; min.r.sync(min.w);
    expect(redraws(min.r)).toBe(n);
  });

  it(`buckets are ${BOND_CACHE_CELL_PX} px cells`, () => {
    const { r } = settled('MINIMAL');
    expect(internals(r).bondBuckets.size).toBeGreaterThan(20);
  });
});

describe('S195 N17 — source guards (paired with the REACH tests above)', () => {
  const MAIN = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const SETTINGS = readFileSync(new URL('./settingsOverlay.ts', import.meta.url), 'utf8');
  it('main.ts polls the tier every frame, before the fx frame opens', () => {
    expect(MAIN).toMatch(/syncGraphicsTier\(\);\r?\n[^\n]*\r?\n\s*noteFrameForTierHint\(/);
    expect(MAIN).toMatch(/noteFrameForTierHint\(.*\);\r?\n\s*fxBeginFrame\(\);/);
  });
  it('the Settings tier choice writes the tier store (and the old checkbox is gone)', () => {
    expect(SETTINGS).toMatch(/tierRow\.onChange\(\(tier\) => \{\r?\n\s*setGraphicsTier\(tier\);/);
    expect(SETTINGS).not.toMatch(/fx-hq/);
  });
});


describe('S195 N17 — the keystone telegraph on MINIMAL: still links, cached', () => {
  it('HIGH draws the travelling pulse dots every frame; MINIMAL draws the link lines only and does not redraw for the clock', async () => {
    const { KeystoneTelegraphRenderer, computeKeystonePulses } = await import('./keystoneTelegraphRenderer.ts');
    const { isAnchorCombo, isMagical } = await import('../combos.ts');
    let pick: [number, number, number] | null = null;
    for (let a = 0; a < 6 && pick === null; a++) for (let b = 0; b < 6 && pick === null; b++) for (let c = 0; c < 6 && pick === null; c++) {
      if (isAnchorCombo(a, b) && isMagical(b, c)) pick = [a, b, c];
    }
    expect(pick, 'an anchor hub with a magic neighbour exists in the combo table').not.toBeNull();
    const [ta, tb, tc] = pick!;
    const mk = (id: number, type: number, x: number): P => ({ id, type, pos: { x, y: 300 }, placedBy: 0, placerColor: COLORS[0]!, ownerColor: COLORS[0]!, bonds: new Set() });
    const p0 = mk(0, ta, 300), p1 = mk(1, tb, 360), p2 = mk(2, tc, 420);
    const hub: B = { id: 0, aId: 0, bId: 1, a: p0, b: p1, restLength: 60, stiffnessTier: 'MID' };
    const nb: B = { id: 1, aId: 1, bId: 2, a: p1, b: p2, restLength: 60, stiffnessTier: 'MID' };
    p0.bonds.add(0); p1.bonds.add(0); p1.bonds.add(1); p2.bonds.add(1);
    const w = { tick: 10, gameMode: '1v1', fouledPrimitives: new Set(), players: new Map([[0, { color: COLORS[0] }]]),
      primitives: new Map([[0, p0], [1, p1], [2, p2]]), bonds: new Map([[0, hub], [1, nb]]) } as unknown as World;
    expect(computeKeystonePulses(w).length).toBeGreaterThan(0);

    const parent = new ContainerStub();
    const k = new KeystoneTelegraphRenderer(app, parent as never);
    const g = parent.children[0] as GraphicsRec;
    setTier('HIGH');
    k.sync(w);
    expect(g.ops.some((o) => o.name === 'circle'), 'HIGH: the pulse dot').toBe(true);
    const highClears = g.clears;
    (w as { tick: number }).tick++;
    k.sync(w);
    expect(g.clears, 'HIGH redraws every frame').toBe(highClears + 1);

    setTier('MINIMAL');
    k.sync(w);
    expect(g.ops.some((o) => o.name === 'circle'), 'MINIMAL: no dot').toBe(false);
    expect(g.ops.filter((o) => o.name === 'stroke').length, 'MINIMAL: one link line per pulse').toBe(computeKeystonePulses(w).length);
    const minClears = g.clears;
    for (let i = 0; i < 5; i++) { (w as { tick: number }).tick++; k.sync(w); }
    expect(g.clears, 'MINIMAL: the clock alone never redraws').toBe(minClears);
    p2.pos.x += 5; // the structure moved
    k.sync(w);
    expect(g.clears, 'MINIMAL: a moved link redraws').toBe(minClears + 1);
  });
});
