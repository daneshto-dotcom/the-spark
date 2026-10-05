/**
 * S195 T19 (#4, merge-owner call) — THE SOUND SLOTS: wired silent, a file drop is the whole change.
 *   · REACH per slot: the trigger fires on the right event, for the right seat, through the real consumer
 *     (`drainAudioEffects`, `SyncedCuesRenderer`, `UnitDeathRenderer`).
 *   · a MISSING file is SILENT, not an error: one probe, latched, no warning, no source started.
 *   · a PRESENT file plays through the one-shot path (a buffer source carrying the slot's URL).
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeAudio, flushAudio, type FakeAudioEnv } from './audioFakeContext.fixtures.ts';
import {
  _resetAudioForTest, drainAudioEffects, initAudio, playSlotSFX, SFX_SLOTS, shutDownAudioForDeadServer, slotSfxCounts,
} from './audioManager.ts';
import { PLAYER_COLORS, CASTLE_ATTACK_RANGE, CASTLE_FIRE_INTERVAL_TICKS } from '../constants.ts';
import { asPlayerId } from '../types.ts';
import { makeWorld, dispatch, type World } from '../state/world.ts';
import { makeCreature } from '../state/creatures/creature.ts';
import { getCreatureConfig } from '../state/creatures/voltkin-config.ts';
import { castleAnchor } from '../state/gatherers/gatherer.ts';
import { SyncedCuesRenderer } from './coherence/syncedCuesRenderer.ts';
import { UnitDeathRenderer, UNIT_FALLS_MAX_PER_FRAME, UNIT_FALLS_OWN_SOUND } from './coherence/unitDeathRenderer.ts';
import { resetConcealmentForTest } from './concealment.ts';

let env: FakeAudioEnv;
/** URLs the fake server answers 404 for (everything else is 200 with a decodable buffer). */
let missing = new Set<string>();
let fetchCalls: string[] = [];

beforeEach(() => {
  _resetAudioForTest();
  resetConcealmentForTest();
  env?.restore();
  env = installFakeAudio();
  missing = new Set();
  fetchCalls = [];
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: unknown): Promise<unknown> => {
    const url = String(input);
    fetchCalls.push(url);
    if (missing.has(url)) return { ok: false, status: 404, headers: { get: () => 'text/html' }, arrayBuffer: async () => new ArrayBuffer(0) };
    return inner(input as never);
  }) as typeof fetch;
});
afterEach(() => { env?.restore(); });
afterAll(() => { _resetAudioForTest(); });

const slotSources = (slot: keyof typeof SFX_SLOTS) =>
  env.sources.filter((s) => s.kind === 'buffer' && s.url === SFX_SLOTS[slot] && s.startArgs !== null);

describe('the slot table', () => {
  it('names the four slots the merge owner asked for, each at its own .ogg under /audio/sfx/', () => {
    expect(Object.keys(SFX_SLOTS).sort()).toEqual(['castleGunFire', 'entropyBoing', 'stinkTowerFire', 'unitFalls']);
    for (const url of Object.values(SFX_SLOTS)) expect(url).toMatch(/^\/audio\/sfx\/[a-z-]+\.ogg$/);
    expect(new Set(Object.values(SFX_SLOTS)).size).toBe(4);
  });
});

describe('a missing file is SILENT, not an error', () => {
  it('a 404 latches the slot absent: no source, no warning, and the URL is fetched exactly ONCE', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    initAudio();
    missing.add(SFX_SLOTS.unitFalls);
    expect(await playSlotSFX('unitFalls', { x: 1, y: 2 })).toBe(false);
    expect(await playSlotSFX('unitFalls', { x: 1, y: 2 })).toBe(false);
    await playSlotSFX('unitFalls');
    await flushAudio();
    expect(slotSources('unitFalls')).toHaveLength(0);
    expect(fetchCalls.filter((u) => u === SFX_SLOTS.unitFalls)).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
    const c = slotSfxCounts();
    expect(c.absent).toEqual(['unitFalls']);
    expect(c.silenced.unitFalls).toBe(3);
    expect(c.fired.unitFalls).toBe(0);
    warn.mockRestore();
  });

  it('a fetch that THROWS (offline) latches absent too', async () => {
    initAudio();
    globalThis.fetch = (async (): Promise<unknown> => { throw new Error('offline'); }) as typeof fetch;
    expect(await playSlotSFX('castleGunFire')).toBe(false);
    expect(slotSfxCounts().absent).toEqual(['castleGunFire']);
  });

  it('a PRESENT file plays through the one-shot path, with the slot URL on the started source', async () => {
    initAudio();
    expect(await playSlotSFX('stinkTowerFire', { x: 100, y: 100 })).toBe(true);
    await flushAudio();
    expect(slotSources('stinkTowerFire')).toHaveLength(1);
    expect(slotSfxCounts().fired.stinkTowerFire).toBe(1);
    expect(slotSfxCounts().absent).toEqual([]);
  });

  it('with the bus shut down (dead server) nothing is probed and nothing plays', async () => {
    initAudio();
    shutDownAudioForDeadServer();
    expect(await playSlotSFX('unitFalls')).toBe(false);
    expect(fetchCalls.filter((u) => u === SFX_SLOTS.unitFalls)).toEqual([]);
  });
});

// ── REACH: the entropy boing, owner-only ─────────────────────────────────────────────────────────────
const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const P2 = asPlayerId(2);
const sever = (victim: typeof P0, tick = 100) =>
  ({ kind: 'BOND_SEVERED', tick, pos: { x: 300, y: 300 }, cause: 'entropy', victim } as never);

describe('REACH — the entropy boing (owner B-14 / N12): only the seat that lost the connector', () => {
  it('the local seat IS the victim → fires; a THIRD seat → silent; no seat given → silent', async () => {
    initAudio();
    drainAudioEffects([sever(P1)], 100, P1);
    await flushAudio();
    expect(slotSfxCounts().fired.entropyBoing).toBe(1);
    drainAudioEffects([sever(P1, 101)], 101, P2);
    drainAudioEffects([sever(P1, 102)], 102, null);
    drainAudioEffects([sever(P1, 103)], 103);
    await flushAudio();
    expect(slotSfxCounts().fired.entropyBoing).toBe(1);
  });

  it('a player / unit / chewer sever never reaches the boing (the arm is entropy-only)', async () => {
    initAudio();
    for (const cause of ['player', 'unit', 'chewer', 'raid', 'bomb'] as const) {
      drainAudioEffects([{ kind: 'BOND_SEVERED', tick: 200, pos: { x: 0, y: 0 }, cause, victim: P0 } as never], 200, P0);
    }
    await flushAudio();
    expect(slotSfxCounts().fired.entropyBoing).toBe(0);
  });
});

// ── REACH: the castle gun, every gate of `castleGunsTick` mirrored ─────────────────────────────────
function fourSeats(): World {
  const w = makeWorld(0x5e47);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: 'bots', isHost: true,
    roster: [0, 1, 2, 3].map((s) => ({ seat: s, color: PLAYER_COLORS[s]! })),
    botSeats: [1, 2, 3],
  } as never);
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}
function enemyNear(w: World, seat: number, owner: typeof P0, dist = 60): void {
  const at = castleAnchor(seat, w.layout);
  const c = makeCreature(getCreatureConfig('goblinMelee'), {
    id: w.nextCreatureId++ as never, ownerPlayerId: owner, pos: { x: at.x + dist, y: at.y }, targetPos: { x: at.x, y: at.y },
    spawnedAtTick: w.tick, sourceSpawnerId: null,
  });
  w.creatures.set(c.id, c);
}
/** Seat 0's castle fires when `tick % interval === 0`. */
const seat0FireTick = (n: number): number => n * CASTLE_FIRE_INTERVAL_TICKS;

describe('REACH — the castle gun fire slot (`SyncedCuesRenderer`)', () => {
  it('fires ONCE per shot tick for a keep with a target in range, on a 4-seat board', async () => {
    initAudio();
    const w = fourSeats();
    enemyNear(w, 0, P1);
    const r = new SyncedCuesRenderer();
    w.tick = seat0FireTick(10);
    r.sync(w);
    r.sync(w); // a repeated frame on the same tick
    w.tick += 1;
    r.sync(w); // the shot is 1 tick old — still that shot
    await flushAudio();
    expect(slotSfxCounts().fired.castleGunFire).toBe(1);
    w.tick = seat0FireTick(11);
    r.sync(w);
    await flushAudio();
    expect(slotSfxCounts().fired.castleGunFire).toBe(2);
  });

  it('NEGATIVE — no target in range, BUILD phase, a fallen castle, a stale shot: silent', async () => {
    initAudio();
    const r = new SyncedCuesRenderer();
    const w = fourSeats();
    w.tick = seat0FireTick(3);
    r.sync(w); // nobody near seat 0's keep (other seats' creatures are far away too)
    enemyNear(w, 0, P1, CASTLE_ATTACK_RANGE + 50); // out of range
    r.sync(w);
    enemyNear(w, 0, P1);
    w.matchPhase = 'BUILD';
    r.sync(w);
    w.matchPhase = 'FIGHT';
    w.players.get(P0)!.castleHp = 0;
    r.sync(w);
    w.players.get(P0)!.castleHp = 100;
    w.tick = seat0FireTick(3) + 30; // older than the VFX window — not this frame's shot
    r.sync(w);
    await flushAudio();
    expect(slotSfxCounts().fired.castleGunFire).toBe(0);
  });

  it('NEGATIVE — an OWN creature near the keep is not a target (the gun never fires at friends)', async () => {
    initAudio();
    const w = fourSeats();
    enemyNear(w, 0, P0);
    const r = new SyncedCuesRenderer();
    w.tick = seat0FireTick(5);
    r.sync(w);
    await flushAudio();
    expect(slotSfxCounts().fired.castleGunFire).toBe(0);
  });
});

// ── REACH: unit falls — every unit without a death sound of its own ───────────────────────────────
describe('REACH — the unit-falls slot (`UnitDeathRenderer`)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function put(w: any, id: number, type: string, state = 'SEEKING'): void {
    w.creatures.set(id, { id, type, ownerPlayerId: P1, pos: { x: 400 + id, y: 400 }, ehp: 30, state, ticksInState: 0, despawnAtTick: w.tick });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function kill(w: any, r: UnitDeathRenderer, ids: number[]): void {
    r.sync(w);
    for (const id of ids) {
      const c = w.creatures.get(id);
      if (c !== undefined) w.creatureKillHits.push({ pos: { ...c.pos }, amount: 12, owner: c.ownerPlayerId });
      w.creatures.delete(id);
    }
    w.tick += 1;
    r.sync(w);
  }

  it('a killed goblin sounds the slot; a killed chewer / Voltkin / pants keep their own and do not', async () => {
    initAudio();
    const w = fourSeats();
    const r = new UnitDeathRenderer();
    put(w, 1, 'goblinMelee');
    kill(w, r, [1]);
    await flushAudio();
    expect(slotSfxCounts().fired.unitFalls).toBe(1);
    let id = 10;
    for (const own of UNIT_FALLS_OWN_SOUND) { put(w, id, own); kill(w, r, [id]); id++; }
    await flushAudio();
    expect(slotSfxCounts().fired.unitFalls).toBe(1);
    expect([...UNIT_FALLS_OWN_SOUND].sort()).toEqual(['chewer', 'endgameMonster', 'megaPants', 'voltkin']);
  });

  it('an EXPIRY (last seen DESPAWNING) is not a death — silent', async () => {
    initAudio();
    const w = fourSeats();
    const r = new UnitDeathRenderer();
    put(w, 1, 'goblinMelee', 'DESPAWNING');
    kill(w, r, [1]);
    await flushAudio();
    expect(slotSfxCounts().fired.unitFalls).toBe(0);
  });

  it(`a wave wipe is capped at ${UNIT_FALLS_MAX_PER_FRAME} thuds a frame`, async () => {
    initAudio();
    const w = fourSeats();
    const r = new UnitDeathRenderer();
    const ids = Array.from({ length: 12 }, (_, i) => 100 + i);
    for (const id of ids) put(w, id, 'goblinArcher');
    kill(w, r, ids);
    await flushAudio();
    expect(slotSfxCounts().fired.unitFalls).toBe(UNIT_FALLS_MAX_PER_FRAME);
  });
});
