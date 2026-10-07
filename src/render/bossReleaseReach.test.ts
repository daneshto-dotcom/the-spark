/**
 * S196 `s196/boss-release` (owner R196-T2) — **END-TO-END REACH ACROSS THE WIRE: a tier-9 boss tower built through
 * the real reducer + matcher + host tick releases its boss through the REAL tier-9 arm of `runHostTick`; the host
 * world goes host → `netSnapshot` → JSON → `applyNetSnapshot` onto a FRESH PEER; the PEER's own `TowerRenderer`
 * publishes the foot and the PEER's `SpawnerZoneRenderer.sync` must draw the release.**
 *
 * The S196 tower-fx lesson, verbatim from its audit: host-only tests hid a joiner bug (`spawnedAtTick` is 0 on a
 * peer). Every positive here is asserted ON THE PEER. The assertion is exact: every sprite the pure drawers emit
 * for that tower's (race, seed, foot, age) is among what the peer's renderer emitted that frame.
 *
 * Negatives, all through the same pipeline: the join frame; a joiner whose first snapshot already has the boss
 * out and the tower gone; a tower whose ring is broken (destroyed → crumble only, never the release); an enemy
 * tower in fog; MINIMAL/`?fx=legacy`. And LOW draws fewer sprites than HIGH through the real renderer.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('pixi.js', async (orig) => {
  const m = await orig<typeof import('pixi.js')>();
  return {
    ...m,
    Assets: { load: async () => new m.Texture({ source: new m.TextureSource({ width: 16384, height: 16384 }) }) },
  };
});
vi.mock('./audioManager.ts', () => new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : vi.fn(async () => {})) }));

import { Container } from 'pixi.js';
import { makeWorld, dispatch, type World } from '../state/world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps, type HostTickState } from '../state/hostTick.ts';
import { runGodlyMatcherCore } from '../state/godlyMatcherCore.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { mulberry32 } from '../state/rng.ts';
import type { Controls } from '../input/controls.ts';
import { REVALIDATE_INTERVAL_TICKS } from '../constants.ts';
import { asPlayerId, type PlayerId, type Vec2 } from '../types.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import { T9_BOSS_TYPE, T9_TOWER_IDS } from '../state/t9BossIds.ts';
import type { RaceId } from '../state/races.ts';
import { razePrimitives } from '../state/world.ts';
import { towerMembersAt } from '../state/towerMembers.ts';
import '../state/godlyRecipes/registerAll.ts';
import { __resetTowerCoverForTests, beginTowerCoverFrame } from './towerCover.ts';
import { beginConcealmentFrame, isConcealed, resetConcealmentForTest } from './concealment.ts';
import { TowerRenderer } from './towerRenderer.ts';
import { SpawnerZoneRenderer } from './spawnerZoneRenderer.ts';
import { recordingSink, fxSeed, type FxEmitRecord } from './fx/emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fx/fxState.ts';
import { setFxHighQualityRuntime } from './fx/fxRuntime.ts';
import { BOSS_RELEASE_TICKS, bossCrumbleFx, bossReleaseFx } from './fx/bossReleaseFx.ts';
import { applyNetSnapshot, netSnapshot } from '../state/save.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const realFetch = globalThis.fetch;
const PUBLIC = new URL('../../public/', import.meta.url);

beforeAll(() => {
  globalThis.fetch = (async (url: string) => {
    const body = readFileSync(new URL(String(url).replace(/^\//, ''), PUBLIC), 'utf8');
    return { ok: true, json: async () => JSON.parse(body) } as Response;
  }) as typeof fetch;
});
afterAll(() => { globalThis.fetch = realFetch; });
beforeEach(() => { __resetTowerCoverForTests(); resetConcealmentForTest(); setFxLegacyFlag(false); setFxHighQualityRuntime(true); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); setFxHighQualityRuntime(true); resetConcealmentForTest(); });

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)), controls: stubControls, botManager: null,
    gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}
function tick(w: World, st: HostTickState, n: number): void {
  const d = deps();
  const cursor = { lastMatcherTick: -1 };
  for (let i = 0; i < n; i++) { runGodlyMatcherCore(w, cursor); runHostTick(w, d, st); w.effects.length = 0; }
}

interface Host { w: World; st: HostTickState; race: RaceId; spawnerId: number; anchor: number }
/** A host world with the seat's own tier-9 tower standing (built through the real reducer, matcher, host tick). */
function hostWithBossTower(centre: Vec2 = { x: 520, y: 420 }): Host {
  const w = makeWorld(0x5196);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  const race = w.players.get(P0)!.raceId;
  const id = T9_TOWER_IDS[race];
  const st = makeHostTickState(w);
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
  tick(w, st, 3 + 2 * REVALIDATE_INTERVAL_TICKS + 2);
  const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === id);
  if (sp === undefined) throw new Error(`fixture: the ${race} boss tower did not ignite`);
  return { w, st, race, spawnerId: sp.id as unknown as number, anchor: sp.anchorPrimitiveId as unknown as number };
}
/** The REAL release: hold nothing, just bring the deadline to now and run one real host tick. */
function release(h: Host): void {
  const sp = h.w.creatureSpawners.get(h.spawnerId as never)!;
  sp.nextSpawnTick = h.w.tick;
  tick(h.w, h.st, 1);
}
function toPeer(host: World, peer: World, local: PlayerId = P0): void {
  applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), peer);
  peer.localPlayerId = local;
}

type Rec = ReturnType<typeof recordingSink>;
let hooks: { ground: Rec; top: Rec; shade: Rec };
function install(): void {
  hooks = { ground: recordingSink(), top: recordingSink(), shade: recordingSink() };
  setFxHooks({ top: hooks.top, shade: hooks.shade, ground: hooks.ground, shock: { shock() {} } });
}
const all = (): FxEmitRecord[] => [...hooks.ground.out, ...hooks.top.out, ...hooks.shade.out];
const key = (e: FxEmitRecord): string => JSON.stringify(e);
const app = () => ({ stage: new Container() }) as never;

/** One PEER render frame: its own tower publisher, then the fx sync. Returns what reached the fx layers. */
function peerRig(peer: World, cursor: Vec2 | null = null) {
  const towers = new TowerRenderer(app(), new Container());
  const zone = new SpawnerZoneRenderer({} as never, new Container());
  const frame = (): FxEmitRecord[] => {
    if (cursor !== null) beginConcealmentFrame(peer, cursor);
    beginTowerCoverFrame(peer);
    towers.sync(peer);
    install();
    zone.sync(peer);
    return all();
  };
  return { towers, zone, frame };
}
/** Drive peer frames until the tower atlas lands and a foot is published (bounded). */
async function warm(frame: () => FxEmitRecord[], peer: World): Promise<void> {
  for (let i = 0; i < 60; i++) {
    frame();
    if (hooks.ground.out.length > 0) return; // the boss seal is drawn → the foot is published
    await new Promise((res) => setTimeout(res, 5));
  }
  void peer;
  throw new Error('fixture: the peer never drew the boss tower');
}
/** The drawers' own sprites for this fall. */
function expected(race: RaceId, spawnerId: number, foot: { x: number; y: number; w: number; h: number }, age: number, low: boolean, released: boolean): FxEmitRecord[] {
  const e = { ground: recordingSink(), top: recordingSink(), shade: recordingSink(), shock: { shock() {} } };
  const seed = fxSeed(spawnerId, 0xb055);
  bossCrumbleFx(e, race, seed, foot.x, foot.y, foot.w, foot.h, age, low, released);
  if (released) bossReleaseFx(e, race, seed, foot.x, foot.y, foot.w, foot.h, age, low);
  return [...e.ground.out, ...e.top.out, ...e.shade.out];
}
function releaseOnly(race: RaceId, spawnerId: number, foot: { x: number; y: number; w: number; h: number }, age: number): FxEmitRecord[] {
  const e = { ground: recordingSink(), top: recordingSink(), shade: recordingSink(), shock: { shock() {} } };
  bossReleaseFx(e, race, fxSeed(spawnerId, 0xb055), foot.x, foot.y, foot.w, foot.h, age, false);
  return [...e.ground.out, ...e.top.out, ...e.shade.out];
}
function subset(exp: FxEmitRecord[], got: FxEmitRecord[]): number {
  const have = new Set(got.map(key));
  return exp.filter((e) => have.has(key(e))).length;
}
/** The foot the peer's TowerRenderer drew the tower at (bottom-centre of a T9 sprite on the ring centroid). */
function footOn(peer: World, h: Host) {
  const own = towerMembersAt(peer, T9_TOWER_IDS[h.race], h.anchor as never)!;
  let x = 0, y = 0;
  for (const id of own.prims) { const p = peer.primitives.get(id)!; x += p.pos.x; y += p.pos.y; }
  x /= own.prims.length; y /= own.prims.length;
  return { x, y: y + 75, w: 150, h: 150 };
}

describe('S196 R196-T2 REACH (host → snapshot → peer) — the boss release is drawn on a PEER', () => {
  it('⭐ the real tier-9 release reaches the peer: crumble + race release at age 0, and it runs on; ⛔ the join frame draws neither', async () => {
    const h = hostWithBossTower();
    const peer = makeWorld(0x5196);
    toPeer(h.w, peer);
    const rig = peerRig(peer);
    await warm(rig.frame, peer);
    const foot = footOn(peer, h);
    // ⛔ standing: no crumble, no release, however many quiet snapshots pass
    for (let i = 0; i < 3; i++) {
      h.w.tick += 6; toPeer(h.w, peer);
      const quiet = rig.frame();
      expect(subset(releaseOnly(h.race, h.spawnerId, foot, 0), quiet), 'a standing tower drew a release').toBe(0);
    }
    // ⭐ the host releases through the REAL tier-9 arm; the next snapshot carries it
    release(h);
    expect(h.w.creatureSpawners.has(h.spawnerId as never), 'host: the tower removed itself').toBe(false);
    const boss = [...h.w.creatures.values()].find((c) => c.type === T9_BOSS_TYPE[h.race]);
    expect(boss, 'host: the boss walked out').toBeDefined();
    expect(boss!.sourceSpawnerId ?? null, 'host: the boss carries no spawner id (why this must be derived)').toBeNull();
    toPeer(h.w, peer);
    expect(peer.creatures.get(boss!.id)!.spawnedAtTick, 'the wire drops spawnedAtTick').toBe(0);
    const lit = rig.frame();
    const exp0 = expected(h.race, h.spawnerId, foot, 0, false, true);
    expect(exp0.length).toBeGreaterThan(40);
    expect(subset(exp0, lit), 'the peer drew every sprite of the release + crumble at age 0').toBe(exp0.length);
    // … and it plays on: 6 ticks later (the next snapshot) at age 6
    h.w.tick += 6; toPeer(h.w, peer);
    const later = rig.frame();
    const exp6 = expected(h.race, h.spawnerId, foot, 6, false, true);
    expect(subset(exp6, later)).toBe(exp6.length);
    // … and it ends: past the crumble, nothing is drawn for it
    h.w.tick += 200; toPeer(h.w, peer);
    rig.frame(); // a gap > the prime gap re-primes; one more frame inside the gap
    h.w.tick += 6; toPeer(h.w, peer);
    expect(rig.frame().filter((e) => e.tex === 'ring' && e.y === foot.y).length, 'the seal / shock rings are gone').toBe(0);
  });

  it('⭐ the HOST draws it too, the same frame it releases (host renderer, no wire)', async () => {
    const h = hostWithBossTower();
    const rig = peerRig(h.w);
    await warm(rig.frame, h.w);
    const foot = footOn(h.w, h);
    release(h);
    const lit = rig.frame();
    const exp0 = expected(h.race, h.spawnerId, foot, 0, false, true);
    expect(subset(exp0, lit)).toBe(exp0.length);
  });

  it('⛔ a JOINER whose first snapshot already has the boss out and the tower gone sees nothing replayed', async () => {
    const h = hostWithBossTower();
    release(h);
    const peer = makeWorld(0x5196);
    toPeer(h.w, peer);
    const rig = peerRig(peer);
    for (let i = 0; i < 4; i++) {
      const f = rig.frame();
      expect(f.length, `joiner frame ${i}: nothing for a tower it never saw`).toBe(0);
      h.w.tick += 6; toPeer(h.w, peer);
    }
  });

  it('⛔ a tower DESTROYED (its ring broken, the real re-validation removes it) crumbles on the peer but never releases', async () => {
    const h = hostWithBossTower();
    const peer = makeWorld(0x5196);
    toPeer(h.w, peer);
    const rig = peerRig(peer);
    await warm(rig.frame, peer);
    const foot = footOn(peer, h);
    const own = towerMembersAt(h.w, T9_TOWER_IDS[h.race], h.anchor as never)!;
    razePrimitives(h.w, [own.prims[3]!]);
    let gone = false;
    let crumbleSeen = 0;
    let releaseSeen = 0;
    for (let i = 0; i < 2 * REVALIDATE_INTERVAL_TICKS + 4 && i < 40; i++) {
      tick(h.w, h.st, 1);
      toPeer(h.w, peer);
      const f = rig.frame();
      if (!gone && !h.w.creatureSpawners.has(h.spawnerId as never)) gone = true;
      crumbleSeen += f.filter((e) => e.tex === 'smoke').length;
      releaseSeen += subset(releaseOnly(h.race, h.spawnerId, foot, 0), f);
    }
    expect(gone, 'fixture: the broken tower was removed by the real re-validation').toBe(true);
    expect([...h.w.creatures.values()].some((c) => c.type === T9_BOSS_TYPE[h.race]), 'fixture: no boss came out').toBe(false);
    expect(crumbleSeen, 'the destroyed tower crumbled (dust) on the peer').toBeGreaterThan(0);
    expect(releaseSeen, 'a destroyed tower must not play the release').toBe(0);
  });

  it('⛔ an ENEMY boss tower releasing in FOG draws nothing on the peer; the same release in vision does', async () => {
    const run = async (cursor: Vec2) => {
      const h = hostWithBossTower({ x: 1700, y: 950 });
      const peer = makeWorld(0x5196);
      toPeer(h.w, peer, P1);
      peer.matchPhase = 'BUILD';
      // the peer is seat 1 watching seat 0's tower; warm with the cursor ON the tower so the atlas + foot land
      const warmRig = peerRig(peer, { x: 1700, y: 950 });
      await warm(warmRig.frame, peer);
      const rig = { frame: () => { beginConcealmentFrame(peer, cursor); beginTowerCoverFrame(peer); warmRig.towers.sync(peer); install(); warmRig.zone.sync(peer); return all(); } };
      h.w.tick += 6; toPeer(h.w, peer, P1); peer.matchPhase = 'BUILD';
      rig.frame();
      const foot = footOn(peer, h);
      release(h);
      toPeer(h.w, peer, P1); peer.matchPhase = 'BUILD';
      const f = rig.frame();
      return { f, foot, h, concealed: isConcealed(foot.x, foot.y, P0) };
    };
    const dark = await run({ x: 100, y: 100 });
    expect(dark.concealed, 'fixture: the enemy tower\'s foot is in fog').toBe(true);
    expect(subset(releaseOnly(dark.h.race, dark.h.spawnerId, dark.foot, 0), dark.f), 'released in fog: drew it').toBe(0);
    expect(dark.f.filter((e) => e.tex === 'smoke').length, 'crumbled in fog: drew it').toBe(0);
    __resetTowerCoverForTests();
    const lit = await run({ x: 1700, y: 950 });
    expect(lit.concealed, 'fixture: the cursor lights the tower').toBe(false);
    const exp = releaseOnly(lit.h.race, lit.h.spawnerId, lit.foot, 0);
    expect(subset(exp, lit.f), 'released in vision: the peer draws it').toBe(exp.length);
  });

  it('⭐ LOW draws fewer sprites than HIGH through the real renderer; ⛔ MINIMAL/legacy draws nothing', async () => {
    const measure = async (mode: 'high' | 'low' | 'legacy') => {
      __resetTowerCoverForTests();
      const h = hostWithBossTower();
      const peer = makeWorld(0x5196);
      toPeer(h.w, peer);
      const rig = peerRig(peer);
      await warm(rig.frame, peer);
      setFxHighQualityRuntime(mode !== 'low');
      setFxLegacyFlag(mode === 'legacy');
      rig.frame();
      release(h);
      let n = 0;
      for (let i = 0; i < 6; i++) {
        toPeer(h.w, peer);
        n += rig.frame().length;
        h.w.tick += 6;
      }
      setFxLegacyFlag(false);
      setFxHighQualityRuntime(true);
      return n;
    };
    const hi = await measure('high');
    const lo = await measure('low');
    const off = await measure('legacy');
    expect(hi).toBeGreaterThan(100);
    expect(lo, 'LOW must be lighter than HIGH').toBeLessThan(hi * 0.8);
    expect(off, 'MINIMAL/legacy must draw nothing').toBe(0);
  });

  it('⭐ the release lasts BOSS_RELEASE_TICKS and the crumble outlives it (age is ticks since the vanish)', () => {
    const foot = { x: 500, y: 500, w: 150, h: 150 };
    expect(releaseOnly('orcs', 7, foot, BOSS_RELEASE_TICKS - 1).length).toBeGreaterThan(0);
    expect(releaseOnly('orcs', 7, foot, BOSS_RELEASE_TICKS).length).toBe(0);
    expect(expected('orcs', 7, foot, BOSS_RELEASE_TICKS + 10, false, false).length).toBeGreaterThan(0);
  });
});
