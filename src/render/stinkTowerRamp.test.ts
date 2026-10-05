/**
 * S195 T19 (owner B-8) — the stink tower's damage-ramp HANDOVER, behind a manifest check, through the real
 * `StinkTowerRenderer`:
 *   · no sheet on disk (today) → LEGACY: the probe answers false, the tower draws exactly as before;
 *   · the sheet's manifest answers → the renderer draws NO sprite of its own and publishes no cover (the generic
 *     ramp renderer owns the building); the aura/lob readouts and the fire SLOT keep working either way;
 *   · the `stinkTowerFire` slot fires once per synced FIRE edge (REACH).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { slot, cover } = vi.hoisted(() => ({ slot: vi.fn(async () => false), cover: vi.fn() }));
vi.mock('./audioManager.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audioManager.ts')>()),
  playSlotSFX: slot,
}));
vi.mock('./towerCover.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./towerCover.ts')>()),
  markTowerCover: cover,
}));

import { Container, Texture } from 'pixi.js';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { asBondId, asDefenderId, asPlayerId, asPrimitiveId } from '../types.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeWorld, type World } from '../state/world.ts';
import { makeDefender } from '../state/defenders/defender.ts';
import { resetConcealmentForTest } from './concealment.ts';
import { StinkTowerRenderer } from './stinkTowerRenderer.ts';
import { RAMP_SPECS_PENDING_ART } from './structureRamp.ts';

const P0 = asPlayerId(0);
const STINK = asDefenderId(3);
const MANIFEST = `${RAMP_SPECS_PENDING_ART[0]!.atlasBase}-anim.json`;

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w.bonds.set(asBondId(id), { id: asBondId(id), aId: pa.id, bId: pb.id, a: pa, b: pb, restLength: 32, stiffnessTier: 'MID', damageFifths: 0, createdTick: 3 } as any);
  pa.bonds.add(asBondId(id)); pb.bonds.add(asBondId(id));
}
function world(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.gameState = 'PLAYING'; w.matchPhase = 'FIGHT'; w.tick = 100;
  prim(w, 1, 400, 300, SparkType.Square); prim(w, 2, 370, 290); prim(w, 3, 430, 290); prim(w, 4, 400, 266);
  bond(w, 11, 1, 2); bond(w, 12, 1, 3); bond(w, 13, 1, 4);
  const d = makeDefender({
    id: STINK, kind: 'stinkTower', ownerPlayerId: P0, anchorPrimitiveId: asPrimitiveId(1),
    recipeId: 'stinkTower' as never, pos: { x: 400, y: 300 }, registeredAtTick: 0,
  });
  w.defenders.set(d.id, d);
  return w;
}
/** A fake server: `present` decides what the ramp manifest URL answers; every other URL 404s (no atlas either). */
function serve(present: boolean): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: unknown): Promise<unknown> => {
    const url = String(input);
    calls.push(url);
    if (url === MANIFEST && present) return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({}) };
    return { ok: false, status: 404, headers: { get: () => 'text/html' }, json: async () => { throw new Error('404'); } };
  }) as typeof fetch;
  return calls;
}
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const renderer = () => new StinkTowerRenderer({ stage: new Container() } as never, new Container());
/** The character atlas the real load would have produced (one idle cell). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const injectAtlas = (r: StinkTowerRenderer): void => { (r as any).atlas = { cells: { idle: [Texture.EMPTY], attack: [Texture.EMPTY] }, manifest: { cellW: 1, cellH: 1, footAnchor: { x: 0.5, y: 1 }, states: { idle: { row: 0, frames: 1, ticksPerFrame: 6 }, attack: { row: 1, frames: 1, ticksPerFrame: 6 } } } }; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spriteCount = (r: StinkTowerRenderer): number => (r as any).sprites.size;

const realFetch = globalThis.fetch;
beforeEach(() => { resetConcealmentForTest(); slot.mockClear(); cover.mockClear(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe('B-8 — the handover is behind the manifest check', () => {
  it('NO sheet (today): the probe answers false once, and the renderer keeps drawing its own sprite + cover (LEGACY)', async () => {
    const calls = serve(false);
    const r = renderer();
    const w = world();
    r.sync(w); await settle();
    expect(r.rampHandoverState()).toBe(false);
    injectAtlas(r);
    r.sync(w); r.sync(w);
    expect(spriteCount(r)).toBe(1);
    expect(cover).toHaveBeenCalled();
    expect(calls.filter((u) => u === MANIFEST)).toHaveLength(1); // probed once, never retried
  });

  it('the sheet IS there: the probe answers true, no own sprite, no cover publish — the ramp renderer owns the building', async () => {
    serve(true);
    const r = renderer();
    const w = world();
    injectAtlas(r);
    r.sync(w); // legacy frame while the probe is in flight
    expect(spriteCount(r)).toBe(1);
    await settle();
    expect(r.rampHandoverState()).toBe(true);
    cover.mockClear();
    r.sync(w);
    expect(spriteCount(r)).toBe(0);
    expect(cover).not.toHaveBeenCalled();
  });
});

describe('REACH — the `stinkTowerFire` slot on the synced FIRE edge', () => {
  it('fires once when the tower enters FIRE, not while it holds FIRE, and again on the next lob', async () => {
    serve(false);
    const r = renderer();
    const w = world();
    r.sync(w);
    const d = w.defenders.get(STINK)!;
    d.state = 'FIRE'; d.ticksInState = 0; d.lastStrikePos = { x: 600, y: 300 }; w.tick += 1;
    r.sync(w);
    d.ticksInState = 3; w.tick += 3; r.sync(w);
    expect(slot).toHaveBeenCalledTimes(1);
    expect(slot).toHaveBeenCalledWith('stinkTowerFire', { x: 400, y: 300 });
    d.state = 'RECOVER'; w.tick += 1; r.sync(w);
    d.state = 'FIRE'; d.ticksInState = 0; w.tick += 1; r.sync(w);
    expect(slot).toHaveBeenCalledTimes(2);
  });
});

// ⭐ S195 (coherence-2 audit, LOW) — the ramp HIT TEST must keep using `rampSpecWithArtFor` (RAMP_SPECS only):
// a "simplify" back to `rampSpecFor` would give the stink tower a 106 px ramp click box before any art lands.
describe('S195 — the stink tower has NO ramp click box until its sheet ships', () => {
  it('rampSpecWithArtFor(stinkTower) is null while the row sits in RAMP_SPECS_PENDING_ART', async () => {
    const { rampSpecWithArtFor, rampSpecFor } = await import('./structureRamp.ts');
    expect(rampSpecWithArtFor('stinkTower')).toBeNull();
    expect(rampSpecFor('stinkTower')).not.toBeNull(); // the pending row still resolves for the renderer
  });
  it('rampHitAtPoint reads rampSpecWithArtFor, never rampSpecFor', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./structureRamp.ts', import.meta.url), 'utf8');
    const start = src.indexOf('export function rampHitAtPoint');
    const next = src.indexOf('\nexport ', start + 1); // the function body ends at the next top-level export
    const fn = src.slice(start, next);
    expect(fn).toContain('rampSpecWithArtFor(');
    expect(fn).not.toMatch(/[^A-Za-z]rampSpecFor\(/);
  });
});
