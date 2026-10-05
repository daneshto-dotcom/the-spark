/**
 * ⭐⭐ S195 N18 (d) (owner R195-E1: *"definitely show N snapped, M lost … so … the user knows why … he lost
 * such a big structure"*) — "ENTROPY: N SNAPPED, M LOST", told from SYNCED state, to the OWNER seat only,
 * on EVERY peer, with the owner's boing keyed off the same change.
 *
 * REACH: a taxed structure crosses the FIGHT whistle through the real `runHostTick`; the JOINER's world is
 * built by `applyNetSnapshot` from the host's wire string (exactly what a joiner applies), with
 * `world.effects` EMPTY — the route the old toast needed and a joiner usually missed. The real
 * `SeverToastRenderer.drainSeverToast` then reads it (Pixi's Text faked: Node has no canvas), and the real
 * audio slot is reached through a fake AudioContext.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => {
  const pt = () => ({ set: (): void => {} });
  class Container {
    children: unknown[] = []; visible = true; alpha = 1; eventMode = 'auto';
    position = pt(); scale = pt();
    addChild(c: unknown): void { this.children.push(c); }
  }
  class Graphics { clear(): this { return this; } roundRect(): this { return this; } fill(): this { return this; } }
  class TextStyle { constructor(public o?: unknown) {} }
  class Text {
    text = ''; width = 100; height = 30; anchor = pt(); position = pt();
    constructor(o?: { text?: string }) { this.text = o?.text ?? ''; }
  }
  return { Container, Graphics, Text, TextStyle };
});

const { installFakeAudio, flushAudio } = await import('./audioFakeContext.fixtures.ts');
const { _resetAudioForTest, initAudio, slotSfxCounts } = await import('./audioManager.ts');
const { SeverToastRenderer, entropyToastFor, entropyToastCopy, captureSeverToast } = await import('./severToastRenderer.ts');
const { PLAYER_COLORS, PRIMITIVE_MAX_HP, SparkType } = await import('../constants.ts');
const { DEFAULT_SPAWNER_CONFIG, Spawner } = await import('../game/spawner.ts');
const { makeGameStateExtras } = await import('../state/gameState.ts');
const { makeHostTickState, runHostTick } = await import('../state/hostTick.ts');
const { mulberry32 } = await import('../state/rng.ts');
const { applyNetSnapshot, netSnapshot } = await import('../state/save.ts');
const { dispatch, makeWorld } = await import('../state/world.ts');
const { asBondId, asPlayerId, asPrimitiveId } = await import('../types.ts');
type World = ReturnType<typeof makeWorld>;

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

/** A chain-plus-nearest lattice of `connectors` bonds over `shapes` shapes, one component, owned by `seat`. */
function lattice(w: World, seat: number, shapes: number, connectors: number, ox: number, oy: number): void {
  const cols = Math.ceil(Math.sqrt(shapes));
  const ps: Array<{ id: number; pos: { x: number; y: number }; bonds: Set<unknown> }> = [];
  const colour = PLAYER_COLORS[seat]!;
  for (let i = 0; i < shapes; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = ox + c * 40 + (r % 2) * 20, y = oy + r * 35;
    const id = asPrimitiveId(w.nextPrimitiveId++);
    const p = { id, type: i % 2 === 0 ? SparkType.Square : SparkType.Triangle, placerColor: colour, placedBy: asPlayerId(seat),
      createdTick: w.tick, pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: colour,
      lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null };
    w.primitives.set(id, p as never);
    ps.push(p as never);
  }
  const pairs: Array<[number, number, number]> = [];
  for (let i = 0; i < shapes; i++) for (let j = i + 1; j < shapes; j++) {
    pairs.push([(ps[i]!.pos.x - ps[j]!.pos.x) ** 2 + (ps[i]!.pos.y - ps[j]!.pos.y) ** 2, i, j]);
  }
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const have = new Set<string>();
  let n = 0;
  const add = (i: number, j: number): void => {
    if (have.has(`${i},${j}`)) return;
    have.add(`${i},${j}`);
    const id = asBondId(w.nextBondId++);
    const a = ps[i]!, b = ps[j]!;
    w.bonds.set(id, { id, aId: a.id, bId: b.id, a, b, restLength: Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y),
      stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick } as never);
    a.bonds.add(id); b.bonds.add(id);
    n++;
  };
  for (let i = 1; i < shapes; i++) add(i - 1, i);
  for (const [, i, j] of pairs) { if (n >= connectors) break; add(i, j); }
}

/** A 1v1 host world in BUILD, seat 0 owning a 145-connector blob, about to cross into FIGHT. */
function taxedHost(seed: number): { w: World; whistle: () => void } {
  const w = makeWorld(seed);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  lattice(w, 0, 65, 145, 260, 200);
  const d = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)), controls: { state: { kind: 'Idle' }, applyPerSubstep() {} },
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as never;
  const st = makeHostTickState(w);
  return {
    w,
    whistle: () => {
      w.effects.length = 0;
      w.phaseEndsAtTick = w.tick;
      runHostTick(w, d, st);
      w.creatures.clear();
    },
  };
}

/** What a joiner holds after applying the host's snapshot off the wire: NO effects. */
function joinerOf(host: World, seat: number): World {
  const j = makeWorld(0);
  applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), j);
  j.effects.length = 0;
  j.localPlayerId = asPlayerId(seat);
  j.gameState = 'PLAYING';
  return j;
}

const fakeApp = () => ({ stage: { addChild: (): void => {} } }) as never;
let env: ReturnType<typeof installFakeAudio>;
beforeEach(() => {
  _resetAudioForTest();
  env = installFakeAudio();
});
afterEach(() => env.restore());

describe('⭐⭐ S195 N18 (d) — ENTROPY: N SNAPPED, M LOST, from synced state, owner-only, on every peer', () => {
  it('the arithmetic: N = the roll\'s snaps of that seat, M = its standing-connector drop, M ≥ N', () => {
    const { w, whistle } = taxedHost(0x195e1);
    const bondsBefore = w.bonds.size;
    whistle();
    expect(w.matchPhase).toBe('FIGHT');
    const s = w.matchStats.seats.get(P0)!;
    expect(s.entropyWave).toBe(w.waveNumber);
    expect(s.entropyLost).toBe(bondsBefore - w.bonds.size); // seat 0 owns every bond on this board
    expect(s.entropyLost).toBeGreaterThanOrEqual(s.entropySnapped);
    expect(s.entropySnapped).toBeGreaterThan(0);
    expect(s.lostToEntropy, 'the pass is a share of the ONE running total, not a second tally').toBe(s.entropyLost);
    expect(w.matchStats.seats.get(P1)?.entropyWave, 'an untaxed seat records nothing').toBeUndefined();
  });

  it('REACH — a JOINER (no effects) that owns the structure reads it, and hears the boing once', async () => {
    const { w, whistle } = taxedHost(0x195e1);
    whistle();
    const s = w.matchStats.seats.get(P0)!;
    const j = joinerOf(w, 0);
    expect(j.effects).toHaveLength(0);
    expect(entropyToastFor(j, P0)).toEqual({ key: w.waveNumber, text: entropyToastCopy(s.entropySnapped, s.entropyLost) });
    initAudio();
    const r = new SeverToastRenderer(fakeApp());
    r.drainSeverToast(j);
    expect(r.isActive()).toBe(true);
    expect((r as unknown as { text: { text: string } }).text.text).toBe(`ENTROPY: ${s.entropySnapped} SNAPPED, ${s.entropyLost} LOST`);
    // The next snapshots carry the SAME pass: shown once, boing once.
    j.tick += 6;
    r.drainSeverToast(j);
    j.tick += 6;
    r.drainSeverToast(j);
    await flushAudio();
    expect(slotSfxCounts().fired.entropyBoing).toBe(1);
  });

  it('NEGATIVE — another seat\'s joiner sees and hears nothing (B-17: only the owner)', async () => {
    const { w, whistle } = taxedHost(0x195e1);
    whistle();
    const j = joinerOf(w, 1);
    initAudio();
    const r = new SeverToastRenderer(fakeApp());
    r.drainSeverToast(j);
    await flushAudio();
    expect(r.isActive()).toBe(false);
    expect(slotSfxCounts().fired.entropyBoing).toBe(0);
  });

  it('NEGATIVE — a pass from an EARLIER wave is never replayed (a late joiner, a migration)', () => {
    const { w, whistle } = taxedHost(0x195e1);
    whistle();
    const j = joinerOf(w, 0);
    j.waveNumber += 1;
    expect(entropyToastFor(j, P0)).toBeNull();
    const r = new SeverToastRenderer(fakeApp());
    r.drainSeverToast(j);
    expect(r.isActive()).toBe(false);
  });

  it('the HOST is not told twice: its entropy BOND_SEVERED effects no longer drive the toast', () => {
    const { w, whistle } = taxedHost(0x195e1);
    whistle();
    const fx = w.effects.filter((e) => e.kind === 'BOND_SEVERED' && e.cause === 'entropy');
    expect(fx.length, 'anti-vacuity: the host DID emit entropy severs').toBeGreaterThan(0);
    w.localPlayerId = P0;
    expect(captureSeverToast(w.effects, P0, new Set()).text).toBeNull();
  });
});
