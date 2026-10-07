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
        const p = w.primitives.get((f + 3) as never) as unknown as P;
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
  const settle = (r: StructureRenderer, w: World): void => { settleCache(r, w); };

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
    (w.primitives.get(60 as never) as unknown as P).pos.x += 6; // stretches its connectors
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
    settle(r, w); // S196 — MINIMAL spreads a whole-board move over several frames (the motion budget)
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
    // S195 audit (LOW): the hint is live only in a match the player is looking at — not NONET, a cinematic, typing.
    expect(MAIN).toMatch(/noteFrameForTierHint\(performance\.now\(\), world\.gameState === 'PLAYING' && !chordBlocked\(\), graphicsTier\(\)\);/);
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

/*
 * ⛔ S195 audit (MED) — the first HIGH oracle only ever drew 1v1 boards with no foul, cover alpha 1 and fog off,
 * so three real HIGH mutations stayed green (foul checked on one end only; cover alpha dropped from the
 * near-break pulse; the ownership pattern forced on in solo). These boards vary every input HIGH reads.
 * Body by the independent auditor (`audit-lag/.tmp-audit/zzAudit.lag.test.ts`), adopted as-is.
 */
/** S196 — sync the same world until the cache stops redrawing (MINIMAL drains its motion queue), bounded. */
function settleCache(r: StructureRenderer, w: World): number {
  for (let i = 0; i < 400; i++) {
    const n = r.bondBucketRedraws();
    r.sync(w);
    if (r.bondBucketRedraws() === n) return i;
  }
  throw new Error('the connector cache never settled');
}
/** S196 audit MED-1 — each non-empty bucket's STRUCTURAL hash (which connectors it holds), by key. */
const shapeHashes = (x: StructureRenderer): string[] => [...internals(x).bondBuckets.entries()]
  .map(([k, b]) => [k, (b as unknown as { shape: number }).shape] as const).filter(([, s]) => s !== 0x811c9dc5)
  .sort((a, b) => a[0] - b[0]).map(([k, s]) => `${k}:${s}`);
const sortedBuckets = (x: StructureRenderer): string[] => [...internals(x).bondBuckets.entries()]
  .filter(([, b]) => b.g.ops.length > 0).sort((a, b) => a[0] - b[0]).map(([k, b]) => k + ':' + opsOf(b.g));

describe('S195 audit (MED) — HIGH vs frozen pre-S195 on boards with foul / cover / fog / solo / ffa / big stress', () => {
  it('matches across varied inputs', () => {
    setTier('HIGH');
    for (const seed of [3, 17, 99]) for (const mode of ['1v1', 'solo', 'ffa']) {
      const w = board(seed, 140);
      (w as { gameMode: string }).gameMode = mode;
      const r = new StructureRenderer(app, new ContainerStub() as never);
      const ref = new GraphicsRec();
      for (let f = 0; f < 6; f++) {
        (w as { tick: number }).tick += 5;
        (w.fouledPrimitives as Set<number>).add(f * 11 + 2);
        coverByBond.set(f * 7 + 1, 0.4); coverByBond.set(f * 7 + 3, 0.005);
        fog.concealedOwner = f % 2 === 0 ? 3 : null;
        const p = w.primitives.get((f * 13 + 5) as never) as unknown as P;
        p.pos.x += 25; // big stretch: pulse + width
        r.sync(w);
        drawBondsPreS195(ref as unknown as Graphics, w);
        expect(opsOf(internals(r).bondGraphics)).toBe(opsOf(ref));
      }
      coverByBond.clear(); fog.concealedOwner = null;
    }
  });
});

describe('S195 audit — cache fuzz: after ANY change, the cache equals a fresh renderer', () => {
  for (const tier of ['LOW', 'MINIMAL'] as const) it(`${tier}: random mutations over 60 frames`, () => {
    setTier(tier);
    const rnd = lcg(4242);
    let w = board(21, 160);
    const r = new StructureRenderer(app, new ContainerStub() as never);
    for (let f = 0; f < 60; f++) {
      // ⛔ S196 audit MED-1 — on MINIMAL the whole board strains every frame, so the motion budget is ALWAYS
      // saturated: a structural change the cache wrongly files as motion cannot hide behind a quiet frame.
      if (tier === 'MINIMAL') for (const b of w.bonds.values()) (b as unknown as B).restLength *= f % 2 === 0 ? 0.985 : 1 / 0.985;
      const k = Math.floor(rnd() * 12);
      const prims = [...w.primitives.values()] as unknown as P[];
      const pick = prims[Math.floor(rnd() * prims.length)]!;
      if (k === 0) pick.pos.x += rnd() * 4 - 2;
      else if (k === 1) { const ids = [...w.bonds.keys()]; if (ids.length) w.bonds.delete(ids[Math.floor(rnd() * ids.length)]!); }
      else if (k === 2) coverByBond.set(Math.floor(rnd() * 160), rnd());
      else if (k === 3) (w.fouledPrimitives as Set<number>).add(pick.id);
      else if (k === 4) fog.concealedOwner = fog.concealedOwner === null ? Math.floor(rnd() * 4) : null;
      else if (k === 5) { pick.placerColor = COLORS[Math.floor(rnd() * 4)]!; } // steal-ish / rainbow remap
      else if (k === 6) { // rainbow shuffle: player colours rotate (pattern seats change)
        const ps = w.players as unknown as Map<number, { color: number }>;
        const cs = [...ps.values()].map((p) => p.color); cs.push(cs.shift()!);
        let i = 0; for (const p of ps.values()) p.color = cs[i++]!;
      }
      else if (k === 7) (w as { gameMode: string }).gameMode = (w.gameMode === 'solo' ? '1v1' : 'solo');
      else if (k === 8) { w = board(Math.floor(rnd() * 1000), 160); } // rematch / host-migration snapshot jump
      else if (k === 9) { pick.type = (pick.type + 1) % 6; } // combo identity change at same geometry
      else if (k === 10) { // ⛔ MED-1 — a SWAP: one connector severed, a same-look one placed, in one snapshot
        const bs = [...w.bonds.values()] as unknown as B[];
        if (bs.length > 0) {
          const v = bs[Math.floor(rnd() * bs.length)]!;
          w.bonds.delete(v.id as never);
          const nid = 100_000 + f;
          (w.bonds as unknown as Map<number, B>).set(nid, { ...v, id: nid });
        }
      }
      else (w as { tick: number }).tick += Math.floor(rnd() * 20);
      r.sync(w);
      const fresh = new StructureRenderer(app, new ContainerStub() as never);
      fresh.sync(w);
      // ⛔ S196 audit MED-1 — STRUCTURE IS NEVER LATE: on the very frame of the change, before any catch-up,
      // every bucket holds the same connectors as a fresh renderer (its structural hash matches).
      expect(shapeHashes(r), `frame ${f} mutation ${k}: structure on the same frame`).toEqual(shapeHashes(fresh));
      // ⭐ S196 — MINIMAL may defer MOTION-only buckets (the budget); it must still CONVERGE to a fresh renderer.
      if (tier === 'MINIMAL') settleCache(r, w);
      expect(sortedBuckets(r), `frame ${f} mutation ${k}`).toEqual(sortedBuckets(fresh));
    }
  });

  it('tier switches mid-match LOW -> MINIMAL -> HIGH -> LOW stay equal to a fresh renderer', () => {
    const w = board(77, 120);
    const r = new StructureRenderer(app, new ContainerStub() as never);
    for (const t of ['LOW', 'MINIMAL', 'HIGH', 'LOW', 'MINIMAL'] as const) {
      setTier(t);
      (w as { tick: number }).tick += 13;
      r.sync(w);
      const fresh = new StructureRenderer(app, new ContainerStub() as never);
      fresh.sync(w);
      expect(sortedBuckets(r), t).toEqual(sortedBuckets(fresh));
      expect(opsOf(internals(r).bondGraphics), t).toBe(opsOf(internals(fresh).bondGraphics));
    }
  });

  it('memory: buckets are bounded over a long match of drift + rematches', () => {
    setTier('LOW');
    const r = new StructureRenderer(app, new ContainerStub() as never);
    for (let m = 0; m < 30; m++) { const w = board(m, 200); for (let f = 0; f < 5; f++) { (w as { tick: number }).tick += 6; r.sync(w); } }
    expect(internals(r).bondBuckets.size).toBeLessThanOrEqual(16 * 10);
    expect(internals(r).bondCacheLayer.children.length).toBe(internals(r).bondBuckets.size);
  });
});

describe('S195 audit — every BondDraw field moves the bucket hash (the cache key is complete)', () => {
  it('per field', async () => {
    const { hashBondDraw } = await import('./structureRenderer.ts');
    type BD = Parameters<typeof hashBondDraw>[1];
    const base: BD = { ax: 10, ay: 20, bx: 30, by: 40, visualEffectId: 'fx.wheel', colorA: 0x112233, colorB: 0x445566, alpha: 0.85, width: 2, tick: 600, pulseAlpha: -1, pattern: 'none', bondId: 7, aId: 3, bId: 4 };
    const h0 = hashBondDraw(0x811c9dc5, base);
    const perturb: Partial<BD>[] = [{ ax: 11 }, { ay: 21 }, { bx: 31 }, { by: 41 }, { visualEffectId: 'fx.star' }, { colorA: 0x112234 }, { colorB: 0x445567 }, { alpha: 0.5 }, { width: 2.5 }, { tick: 606 }, { pulseAlpha: 0.5 }, { pattern: 'rungs' }];
    for (const p of perturb) expect(hashBondDraw(0x811c9dc5, { ...base, ...p }), JSON.stringify(p)).not.toBe(h0);
  });
});

/*
 * ⭐ S196 (joiner-lag, R196-P1) — THE MINIMAL MOTION BUDGET. Measured on a joiner at wave 10: MINIMAL re-stroked
 * 8.5 buckets / 511 Graphics instructions per frame because every interpolated shape moves a pixel a frame. MINIMAL
 * now re-strokes at most `motionRedrawsPerFrame` motion-only buckets a frame (stalest first); a STRUCTURAL change is
 * never deferred. These run the REAL renderer through the stored tier.
 */
describe('S196 — MINIMAL defers motion, never structure', () => {
  const BUDGET = 3;
  function moved(seed: number): { w: World; r: StructureRenderer } {
    setTier('MINIMAL');
    const w = board(seed, 200);
    const r = new StructureRenderer(app, new ContainerStub() as never);
    r.sync(w);
    shake(w);
    return { w, r };
  }
  /** Every connector strains: stress tint + width move on all of them, nothing crosses a bucket — pure MOTION. */
  function shake(w: World): void {
    for (const b of w.bonds.values()) (b as unknown as B).restLength *= 0.7;
  }

  it('the knob: MINIMAL has a budget, LOW and HIGH do not', async () => {
    const { BOND_CACHE_KNOBS } = await import('./graphicsTier.ts');
    expect(BOND_CACHE_KNOBS.MINIMAL!.motionRedrawsPerFrame).toBe(BUDGET);
    expect(BOND_CACHE_KNOBS.LOW!.motionRedrawsPerFrame).toBe(Number.POSITIVE_INFINITY);
    expect(BOND_CACHE_KNOBS.HIGH).toBeNull();
  });

  it('REACH: a whole-board move redraws at most the budget per frame, and converges to a fresh renderer', () => {
    const { w, r } = moved(31);
    const start = r.bondBucketRedraws();
    let frames = 0;
    for (;;) {
      const n = r.bondBucketRedraws();
      r.sync(w);
      const d = r.bondBucketRedraws() - n;
      expect(d, `frame ${frames}`).toBeLessThanOrEqual(BUDGET);
      if (d === 0) break;
      frames++;
    }
    const total = r.bondBucketRedraws() - start;
    expect(total, 'the shake touched many buckets').toBeGreaterThan(BUDGET * 4);
    // arithmetic: `total` motion-only buckets, BUDGET a frame => exactly ceil(total / BUDGET) frames to drain
    expect(frames).toBe(Math.ceil(total / BUDGET));
    const fresh = new StructureRenderer(app, new ContainerStub() as never);
    fresh.sync(w);
    expect(sortedBuckets(r)).toEqual(sortedBuckets(fresh));
  });

  it('NEGATIVE: LOW has no budget — the same move redraws every bucket in one frame', () => {
    setTier('LOW');
    const w = board(31, 200);
    const r = new StructureRenderer(app, new ContainerStub() as never);
    r.sync(w);
    for (const b of w.bonds.values()) (b as unknown as B).restLength *= 0.7;
    const n = r.bondBucketRedraws();
    r.sync(w);
    expect(r.bondBucketRedraws() - n, 'all at once').toBeGreaterThan(BUDGET * 4);
    expect(settleCache(r, w), 'nothing left owed').toBe(0);
  });

  it('a SEVER, a FOG change and a tier switch are drawn on the very next frame even with the budget saturated', () => {
    const { w, r } = moved(47);
    r.sync(w); // budget now saturated: most buckets still owe a motion redraw
    // sever one connector whose bucket has NOT been redrawn yet
    const stale = [...internals(r).bondBuckets.entries()].find(([, b]) => (b as unknown as { lastFrame: number }).lastFrame <= 1);
    expect(stale, 'a bucket still waiting').toBeDefined();
    const victim = [...w.bonds.values()].find((b) => {
      const k = Math.floor((Math.round(b.a.pos.x) + Math.round(b.b.pos.x)) / 2 / BOND_CACHE_CELL_PX) * 1024
        + Math.floor((Math.round(b.a.pos.y) + Math.round(b.b.pos.y)) / 2 / BOND_CACHE_CELL_PX);
      return k === stale![0];
    })!;
    w.bonds.delete(victim.id as never);
    r.sync(w);
    const freshAfterSever = new StructureRenderer(app, new ContainerStub() as never);
    freshAfterSever.sync(w);
    const one = (x: StructureRenderer): string => opsOf(internals(x).bondBuckets.get(stale![0])!.g);
    expect(one(r), 'the severed bucket is current on the next frame').toBe(one(freshAfterSever));
    // fog: seat 1 drops out of vision — every bucket holding its connectors changes count => drawn now
    fog.concealedOwner = 1;
    r.sync(w);
    const freshFog = new StructureRenderer(app, new ContainerStub() as never);
    freshFog.sync(w);
    // every bucket holds the same connectors as a fresh renderer's (stress tint may still be catching up)
    const shapes = (x: StructureRenderer): string[] => [...internals(x).bondBuckets.entries()]
      .map(([k, b]) => [k, (b as unknown as { shape: number }).shape] as const).filter(([, s]) => s !== 0x811c9dc5)
      .sort((a, b) => a[0] - b[0]).map(([k, s]) => `${k}:${s}`);
    expect(shapes(r), 'no concealed connector survives a frame').toEqual(shapes(freshFog));
    expect(shapes(r).length).toBeGreaterThan(0);
    // a tier switch redraws everything at once
    setTier('LOW');
    r.sync(w);
    const freshLow = new StructureRenderer(app, new ContainerStub() as never);
    freshLow.sync(w);
    expect(sortedBuckets(r)).toEqual(sortedBuckets(freshLow));
  });

  it('no bucket starves: stalest first, even while more buckets than the budget never stop shaking', () => {
    const { w, r } = moved(5);
    r.sync(w);
    // the LOWEST-keyed buckets shake every frame, more of them than the budget can serve: a key-ordered queue
    // would hand them the whole budget forever and never reach the rest
    const keys = [...internals(r).bondBuckets.keys()].sort((a, b) => a - b);
    const hot = new Set(keys.slice(0, BUDGET * 2));
    const keyOf = (b: B): number => Math.floor((Math.round(b.a.pos.x) + Math.round(b.b.pos.x)) / 2 / BOND_CACHE_CELL_PX) * 1024
      + Math.floor((Math.round(b.a.pos.y) + Math.round(b.b.pos.y)) / 2 / BOND_CACHE_CELL_PX);
    const hotBonds = ([...w.bonds.values()] as unknown as B[]).filter((b) => hot.has(keyOf(b)));
    expect(hotBonds.length).toBeGreaterThan(BUDGET * 2);
    for (let f = 0; f < 3 * keys.length; f++) {
      for (const b of hotBonds) b.restLength *= f % 2 === 0 ? 0.97 : 1 / 0.97; // stress flickers: motion only
      r.sync(w);
    }
    // every bucket that is NOT still shaking is current: none was starved by the shaking ones
    const fresh0 = new StructureRenderer(app, new ContainerStub() as never);
    fresh0.sync(w);
    const stale = [...internals(r).bondBuckets.entries()]
      .filter(([k, b]) => !hot.has(k) && opsOf(b.g) !== opsOf(internals(fresh0).bondBuckets.get(k)?.g ?? new GraphicsRec()))
      .map(([k]) => k);
    expect(stale, 'every quiet bucket got its turn').toEqual([]);
    settleCache(r, w);
    const fresh = new StructureRenderer(app, new ContainerStub() as never);
    fresh.sync(w);
    expect(sortedBuckets(r)).toEqual(sortedBuckets(fresh));
  });

  it('the structural hash ignores motion and sees structure (the deferral key is the right one)', async () => {
    const { hashBondShape } = await import('./structureRenderer.ts');
    type BD = Parameters<typeof hashBondShape>[1];
    const base: BD = { ax: 10, ay: 20, bx: 30, by: 40, visualEffectId: 'fx.wheel', colorA: 0x112233, colorB: 0x445566, alpha: 0.85, width: 2, tick: 600, pulseAlpha: -1, pattern: 'none', bondId: 7, aId: 3, bId: 4 };
    const h0 = hashBondShape(0x811c9dc5, base);
    for (const p of [{ ax: 11 }, { by: 41 }, { colorA: 0x112234 }, { alpha: 0.5 }, { width: 2.5 }, { tick: 606 }, { pulseAlpha: 0.5 }] as Partial<BD>[]) {
      expect(hashBondShape(0x811c9dc5, { ...base, ...p }), JSON.stringify(p)).toBe(h0);
    }
    // ⛔ S196 audit MED-1 — IDENTITY is structure: a different connector with the same look is not "movement"
    for (const p of [{ visualEffectId: 'fx.star' }, { pattern: 'rungs' }, { bondId: 8 }, { aId: 5 }, { bId: 6 }] as Partial<BD>[]) {
      expect(hashBondShape(0x811c9dc5, { ...base, ...p }), JSON.stringify(p)).not.toBe(h0);
    }
    // one more connector in the bucket = a different structural hash
    expect(hashBondShape(h0, base)).not.toBe(h0);
  });
});

describe('S196 — the keystone telegraph on MINIMAL ignores sub-grid jitter', () => {
  it('a 1 px shake every frame never redraws the links; a real move does; HIGH still redraws every frame', async () => {
    const { KeystoneTelegraphRenderer, MINIMAL_LINK_SNAP_PX } = await import('./keystoneTelegraphRenderer.ts');
    const { comboView } = await import('./comboView.ts');
    let pick: [number, number, number] | null = null;
    for (let a = 0; a < 6 && pick === null; a++) for (let b = 0; b < 6 && pick === null; b++) for (let c = 0; c < 6 && pick === null; c++) {
      if (comboView(a, b).isAnchor && comboView(b, c).isMagical) pick = [a, b, c];
    }
    const [ta, tb, tc] = pick!;
    const mk = (id: number, type: number, x: number): P => ({ id, type, pos: { x, y: 301 }, placedBy: 0, placerColor: COLORS[0]!, ownerColor: COLORS[0]!, bonds: new Set() });
    const p0 = mk(0, ta, 301), p1 = mk(1, tb, 361), p2 = mk(2, tc, 421);
    const hub: B = { id: 0, aId: 0, bId: 1, a: p0, b: p1, restLength: 60, stiffnessTier: 'MID' };
    const nb: B = { id: 1, aId: 1, bId: 2, a: p1, b: p2, restLength: 60, stiffnessTier: 'MID' };
    p0.bonds.add(0); p1.bonds.add(0); p1.bonds.add(1); p2.bonds.add(1);
    const w = { tick: 10, gameMode: '1v1', fouledPrimitives: new Set(), players: new Map([[0, { color: COLORS[0] }]]),
      primitives: new Map([[0, p0], [1, p1], [2, p2]]), bonds: new Map([[0, hub], [1, nb]]) } as unknown as World;
    const parent = new ContainerStub();
    const k = new KeystoneTelegraphRenderer(app, parent as never);
    const g = parent.children[0] as GraphicsRec;
    expect(MINIMAL_LINK_SNAP_PX).toBe(4);
    setTier('MINIMAL');
    k.sync(w);
    const clears = g.clears;
    for (let f = 0; f < 20; f++) { p2.pos.x = 421 + (f % 2 === 0 ? 0.9 : -0.9); (w as { tick: number }).tick++; k.sync(w); }
    expect(g.clears, 'sub-grid jitter: no redraw').toBe(clears);
    // every drawn endpoint sits on the grid
    for (const o of g.ops.filter((x) => x.name === 'moveTo' || x.name === 'lineTo')) {
      for (const v of o.args as number[]) expect(v % MINIMAL_LINK_SNAP_PX).toBe(0);
    }
    p2.pos.x = 440; // a real move
    k.sync(w);
    expect(g.clears).toBe(clears + 1);
    // NEGATIVE: HIGH is untouched — exact positions, a redraw every frame
    setTier('HIGH');
    k.sync(w);
    const hc = g.clears;
    p2.pos.x = 440.5; k.sync(w);
    expect(g.clears).toBe(hc + 1);
    expect(g.ops.some((o) => o.name === 'lineTo' && (o.args as number[])[0] === 440.5)).toBe(true);
  });
});

/*
 * ⛔ S196 audit MED-1 — the auditor's repro (`audit-joiner-lag/.tmp-audit/zzAuditSwap.test.ts.txt`), adopted: after a
 * whole-board shake fills the MINIMAL budget, a sever + a same-look placement in the same cell (new id, and a REUSED
 * id in place) left the severed connector drawn and the new one missing for 25 frames. Identity in the structural
 * hash makes it 0.
 */
for (const variant of ['v1 new id (homogeneous bucket)', 'v2 reused bond id, in place'] as const) {
  describe(`S196 audit MED-1 repro ${variant} — same-count same-look swap under a saturated budget`, () => {
    it('the severed connector does not stay drawn, the new one is drawn on the next frame', () => {
      setTier('MINIMAL');
      const w = board(47, 200);
      if (variant.startsWith('v1')) {
        for (const p of (w.primitives as unknown as Map<number, P>).values()) { p.type = 0; p.placedBy = 0; p.placerColor = COLORS[0]!; p.ownerColor = COLORS[0]!; }
      }
      const r = new StructureRenderer(app, new ContainerStub() as never);
      r.sync(w);
      for (const b of w.bonds.values()) (b as unknown as B).restLength *= 0.7; // shake all -> saturate
      r.sync(w); // BUDGET drawn this frame, the rest still owed
      const lastOf = (b: unknown): number => (b as { lastFrame: number }).lastFrame;
      const frameNow = Math.max(...[...internals(r).bondBuckets.values()].map(lastOf));
      const keyOf = (b: B): number => Math.floor((Math.round(b.a.pos.x) + Math.round(b.b.pos.x)) / 2 / BOND_CACHE_CELL_PX) * 1024
        + Math.floor((Math.round(b.a.pos.y) + Math.round(b.b.pos.y)) / 2 / BOND_CACHE_CELL_PX);
      // a bucket JUST redrawn — the freshest, so the back of the stalest-first queue
      const fresh = [...internals(r).bondBuckets.entries()].filter(([, b]) => lastOf(b) === frameNow).map(([k]) => k);
      const victim = ([...w.bonds.values()] as unknown as B[]).find((b) => fresh.includes(keyOf(b)))!;
      expect(victim).toBeDefined();
      const K = keyOf(victim);
      const na: P = { ...victim.a, id: 9001, pos: { x: victim.a.pos.x + 6, y: victim.a.pos.y + 5 }, bonds: new Set() };
      const nb: P = { ...victim.b, id: 9002, pos: { x: victim.b.pos.x + 6, y: victim.b.pos.y + 5 }, bonds: new Set() };
      (w.primitives as unknown as Map<number, P>).set(9001, na);
      (w.primitives as unknown as Map<number, P>).set(9002, nb);
      const nid = variant.startsWith('v1') ? 9003 : victim.id;
      if (variant.startsWith('v1')) w.bonds.delete(victim.id as never);
      const nbond: B = { id: nid, aId: 9001, bId: 9002, a: na, b: nb, restLength: victim.restLength, stiffnessTier: victim.stiffnessTier };
      (w.bonds as unknown as Map<number, B>).set(nid, nbond);
      expect(keyOf(nbond)).toBe(K);
      r.sync(w);
      const ref = new StructureRenderer(app, new ContainerStub() as never);
      ref.sync(w);
      const one = (x: StructureRenderer): string => opsOf(internals(x).bondBuckets.get(K)!.g);
      let ghost = 0;
      while (one(r) !== one(ref) && ghost < 500) { r.sync(w); ghost++; }
      expect(ghost, 'frames the severed connector stayed drawn').toBe(0);
    });
  });
}
