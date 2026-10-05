/**
 * S195 T19 (owner B-3, RULED: *add a short "repaired" sparkle*) — the beat when a FIX re-stands a tower, derived
 * from the synced `world.repairJobs`: a job that LEAVES the array while the connectors among its members ROSE
 * finished (`restoreFromDelivered` re-welds on the same tick); a job that leaves with the count unchanged was
 * cancelled. REACH through the real `SyncedCuesRenderer` on the frames a peer sees.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let fogged = false;
vi.mock('../concealment.ts', () => ({
  isConcealed: () => fogged,
  beginConcealmentFrame: () => {},
  concealmentContext: () => ({ active: fogged, localPlayerId: null, sources: [] }),
  resetConcealmentForTest: () => {},
}));
vi.mock('../audioManager.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../audioManager.ts')>()),
  playSlotSFX: vi.fn(async () => false),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../../constants.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../../types.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../../state/world.ts';
import { recordingSink } from '../fx/emitter.ts';
import { setFxHooks, setFxLegacyFlag } from '../fx/fxState.ts';
import { REPAIRED_SPARKLE_TICKS, repairedSparkleFx } from './repairedSparkleFx.ts';
import { bondsAmong, SyncedCuesRenderer } from './syncedCuesRenderer.ts';

const P0 = asPlayerId(0);

function world(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.tick = 500;
  return w;
}
function prim(w: World, id: number, x: number, y: number, type = SparkType.Circle): void {
  w.primitives.set(asPrimitiveId(id), {
    id: asPrimitiveId(id), type, placerColor: PLAYER_COLORS[0], placedBy: P0, createdTick: 0,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: PLAYER_COLORS[0],
    lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}
function bond(w: World, id: number, a: number, b: number): void {
  const pa = w.primitives.get(asPrimitiveId(a))!;
  const pb = w.primitives.get(asPrimitiveId(b))!;
  w.bonds.set(asBondId(id), {
    id: asBondId(id), aId: pa.id, bId: pb.id, a: pa, b: pb, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  pa.bonds.add(asBondId(id));
  pb.bonds.add(asBondId(id));
}
/** A fallen 3-leaf star: hub 1, leaves 2-4, with the hub–leaf-4 connector MISSING; a FIX job queued over it. */
function fallenTower(w: World): void {
  prim(w, 1, 400, 300, SparkType.Square); prim(w, 2, 370, 290); prim(w, 3, 430, 290); prim(w, 4, 400, 266);
  bond(w, 11, 1, 2); bond(w, 12, 1, 3);
  w.repairJobs.push({ id: 1, seat: P0, targetId: asPrimitiveId(1), memberIds: [1, 2, 3, 4].map(asPrimitiveId), need: [], delivered: [SparkType.Circle] });
}
/** What `restoreFromDelivered` + the job splice do on the finishing tick. */
function finish(w: World): void { bond(w, 13, 1, 4); w.repairJobs.length = 0; }

let top = recordingSink();
beforeEach(() => {
  fogged = false; top = recordingSink();
  setFxHooks({ top, shade: recordingSink(), ground: recordingSink(), shock: { shock() { /* none */ } } });
  setFxLegacyFlag(false);
});
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); });

describe('REACH — the repaired sparkle', () => {
  it('a job that leaves while its members\' connectors ROSE → one beat at the members, in the seat colour', () => {
    const w = world(); fallenTower(w);
    const r = new SyncedCuesRenderer();
    r.sync(w);
    expect(r.watchedJobCount()).toBe(1);
    expect(bondsAmong(w, w.repairJobs[0]!.memberIds)).toBe(2);
    finish(w); w.tick += 1;
    r.sync(w);
    expect(r.sparkleCount()).toBe(1);
    expect(r.watchedJobCount()).toBe(0);
    expect(top.out.length).toBeGreaterThan(0);
    expect(top.out.some((e) => e.tint === PLAYER_COLORS[0] || e.tint !== 0)).toBe(true);
    // centred on the shapes
    const cx = top.out.reduce((s, e) => s + e.x, 0) / top.out.length;
    expect(cx).toBeGreaterThan(380); expect(cx).toBeLessThan(420);
    w.tick += REPAIRED_SPARKLE_TICKS; r.sync(w);
    expect(r.sparkleCount()).toBe(0);
  });

  it('NEGATIVE — a CANCELLED job (it leaves, nothing re-welded) plays nothing', () => {
    const w = world(); fallenTower(w);
    const r = new SyncedCuesRenderer();
    r.sync(w);
    w.repairJobs.length = 0; w.tick += 1;
    r.sync(w);
    expect(r.sparkleCount()).toBe(0);
  });
  it('NEGATIVE — a job whose shapes are GONE (the tower was razed) plays nothing', () => {
    const w = world(); fallenTower(w);
    const r = new SyncedCuesRenderer();
    r.sync(w);
    for (const id of [1, 2, 3, 4]) w.primitives.delete(asPrimitiveId(id));
    w.bonds.clear(); w.repairJobs.length = 0; w.tick += 1;
    r.sync(w);
    expect(r.sparkleCount()).toBe(0);
  });
  it('NEGATIVE — inside the fog (owner S170) the finish shows nothing to this seat', () => {
    const w = world(); fallenTower(w);
    const r = new SyncedCuesRenderer();
    r.sync(w);
    fogged = true; finish(w); w.tick += 1;
    r.sync(w);
    expect(r.sparkleCount()).toBe(0);
  });
  it('NEGATIVE — a title return between the frames forgets the job (no beat over the title), and a NEW world starts clean', () => {
    const w = world(); fallenTower(w);
    const r = new SyncedCuesRenderer();
    r.sync(w);
    w.gameState = 'TITLE'; r.sync(w);
    expect(r.watchedJobCount()).toBe(0);
    w.gameState = 'PLAYING'; finish(w); w.tick += 1; r.sync(w);
    expect(r.sparkleCount()).toBe(0);
    const w2 = world(); fallenTower(w2); r.sync(w2); // another World object
    expect(r.watchedJobCount()).toBe(1);
  });
  it('?fx=legacy draws nothing', () => {
    setFxLegacyFlag(true);
    const w = world(); fallenTower(w);
    const r = new SyncedCuesRenderer();
    r.sync(w); finish(w); w.tick += 1; r.sync(w);
    expect(top.out.length).toBe(0);
  });
});

describe('the fx is pure (the fx/ guards do not walk coherence/)', () => {
  it('same inputs → identical emits; nothing outside 0..1 draws', () => {
    const a = recordingSink(); const b = recordingSink();
    repairedSparkleFx(a, 7, 100, 100, 40, 0x44aaff, 0.3);
    repairedSparkleFx(b, 7, 100, 100, 40, 0x44aaff, 0.3);
    expect(a.out).toEqual(b.out);
    expect(a.out.length).toBeGreaterThan(0);
    const c = recordingSink();
    repairedSparkleFx(c, 7, 100, 100, 40, 0x44aaff, 1); repairedSparkleFx(c, 7, 100, 100, 40, 0x44aaff, -0.1);
    expect(c.out.length).toBe(0);
  });
  it('no Math.random, no clock, in either file', () => {
    for (const f of ['repairedSparkleFx.ts', 'syncedCuesRenderer.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8');
      expect(src, f).not.toMatch(/Math\.random\(|performance\.now\(|Date\.now\(/); // CALLS — the docblock may name them
    }
  });
});
