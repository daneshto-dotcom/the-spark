/**
 * S196 `s196/tower-fx` — **END-TO-END REACH: a tower built through the real reducer + matcher + host tick, drawn
 * by its REAL publisher, gets its signature from the REAL `SpawnerZoneRenderer.sync` (or, for the Voltkin TV,
 * from `VoltkinTowerRenderer.sync` itself).** The unit file (`fx/towerSignature.test.ts`) hand-publishes the
 * foot; this one lets the shipped renderers publish it, so a publisher that stopped passing a foot, or a sync
 * that stopped dispatching, turns this red. The assertion is exact: every sprite the pure drawer emits for that
 * tower's (id, foot, tick) is among what the renderer emitted that frame.
 *
 * Harness copied from `coverPublishersReach.test.ts` (the shipped `-anim.json` manifests read from disk; only the
 * PNG decode is stubbed).
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
import { asPlayerId, type PrimitiveId, type Vec2 } from '../types.ts';
import { applyBuildBlueprint } from '../state/blueprintBuild.ts';
import { blueprintBill } from '../state/blueprints.ts';
import { makeCastleBank } from '../state/castleBank.ts';
import type { GodlyId } from '../state/godlyRecipes/types.ts';
import { RACE_TOWER_IDS } from '../state/raceTowerIds.ts';
import '../state/godlyRecipes/registerAll.ts';
import { __resetTowerCoverForTests, beginTowerCoverFrame, towerFootForPrim } from './towerCover.ts';
import { resetConcealmentForTest } from './concealment.ts';
import { TowerRenderer } from './towerRenderer.ts';
import { StructureRampRenderer } from './structureRampRenderer.ts';
import { VoltkinTowerRenderer } from './voltkinTowerRenderer.ts';
import { StinkTowerRenderer } from './stinkTowerRenderer.ts';
import { SpawnerZoneRenderer } from './spawnerZoneRenderer.ts';
import { recordingSink, type FxEmitRecord } from './fx/emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fx/fxState.ts';
import { TOWER_SIGNATURE, TOWER_SIG_NO_ACT, defenderSigAct, towerSignatureFx } from './fx/towerSignatureFx.ts';
import { getDefenderConfig } from '../state/defenders/defender.ts';
import { DEFENDER_FIRE_HOLD_TICKS } from '../constants.ts';
import { raceForTowerId } from '../state/raceTowerIds.ts';
import { applyNetSnapshot, netSnapshot } from '../state/save.ts';
import { makeCreature } from '../state/creatures/creature.ts';
import { CREATURE_CONFIGS } from '../state/creatures/voltkin-config.ts';

const P0 = asPlayerId(0);
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
beforeEach(() => { __resetTowerCoverForTests(); resetConcealmentForTest(); setFxLegacyFlag(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); });

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
function built(id: GodlyId, centre: Vec2 = { x: 500, y: 400 }): World {
  const w = makeWorld(0x5194);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'BUILD';
  w.creatures.clear();
  const st = makeHostTickState(w);
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill(id)) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: id, centre });
  tick(w, st, 3 + 2 * REVALIDATE_INTERVAL_TICKS + 2);
  return w;
}

interface Publisher { sync(w: World): void }
type Rec = ReturnType<typeof recordingSink>;
let hooks: { ground: Rec; top: Rec; shade: Rec };
function install(): void {
  hooks = { ground: recordingSink(), top: recordingSink(), shade: recordingSink() };
  setFxHooks({ top: hooks.top, shade: hooks.shade, ground: hooks.ground, shock: { shock() {} } });
}
const key = (e: FxEmitRecord): string => JSON.stringify(e);

/** Publish until the publisher's async atlas load lands and the anchor has a foot (bounded). */
async function publishFoot(r: Publisher, w: World, anchor: PrimitiveId) {
  for (let i = 0; i < 60; i++) {
    beginTowerCoverFrame(w);
    r.sync(w);
    beginTowerCoverFrame(w);
    const f = towerFootForPrim(anchor);
    if (f !== null) return f;
    await new Promise((res) => setTimeout(res, 5));
  }
  return null;
}

function expectSubset(expected: FxEmitRecord[], got: FxEmitRecord[], what: string): void {
  expect(expected.length, `${what}: the drawer emits`).toBeGreaterThan(3);
  const have = new Set(got.map(key));
  const missing = expected.filter((e) => !have.has(key(e)));
  expect(missing.length, `${what}: ${missing.length} of the signature's sprites never reached the frame`).toBe(0);
}

const app = () => ({ stage: new Container() }) as never;

describe('S196 REACH (end to end) — a really-built tower gets its signature', () => {
  const cases: Array<{ id: GodlyId; pub: () => Publisher }> = [
    { id: 'laserTurret', pub: () => new StructureRampRenderer(app(), new Container()) },
    { id: 'helga', pub: () => new StructureRampRenderer(app(), new Container()) },
    { id: 'stinkTower', pub: () => new StinkTowerRenderer(app(), new Container()) },
    { id: 'goblinTower', pub: () => new StructureRampRenderer(app(), new Container()) },
    { id: 'pentagram', pub: () => new StructureRampRenderer(app(), new Container()) },
    { id: 'lightningHub', pub: () => new StructureRampRenderer(app(), new Container()) },
  ];
  for (const c of cases) {
    it(`⭐ ${c.id}`, async () => {
      const w = built(c.id);
      const d = [...w.defenders.values()].find((x) => x.recipeId === c.id);
      const sp = [...w.creatureSpawners.values()].find((x) => x.recipeId === c.id);
      const anchor = (d?.anchorPrimitiveId ?? sp?.anchorPrimitiveId)!;
      expect(anchor, `fixture: ${c.id} stands`).toBeDefined();
      const foot = await publishFoot(c.pub(), w, anchor);
      expect(foot, `${c.id}: its publisher put a foot down`).not.toBeNull();
      install();
      new SpawnerZoneRenderer({} as never, new Container()).sync(w);
      const got = [...hooks.ground.out, ...hooks.top.out, ...hooks.shade.out];
      const exp = { ground: recordingSink(), top: recordingSink(), shade: recordingSink() };
      let actAge = TOWER_SIG_NO_ACT;
      let charge = 0;
      if (d !== undefined) {
        const cfg = getDefenderConfig(d.kind);
        ({ actAge, charge } = defenderSigAct(d.state, d.ticksInState, d.nextFireTick, w.tick, cfg.fireIntervalTicks, DEFENDER_FIRE_HOLD_TICKS));
      }
      // a spawner: a fresh renderer's first frame is unprimed (audit HIGH-1) — no birth flare
      towerSignatureFx(exp, TOWER_SIGNATURE[c.id], anchor as unknown as number, foot!.x, foot!.y, foot!.w, foot!.h, w.tick, false, actAge, charge, null);
      expectSubset([...exp.ground.out, ...exp.top.out, ...exp.shade.out], got, c.id);
    });
  }

  it('⭐ a tier-3 race tower (the seat\'s own race)', async () => {
    const w0 = makeWorld(0x5194);
    dispatch(w0, { type: 'START_GAME', mode: '1v1', isHost: true });
    const race = w0.players.get(P0)!.raceId;
    const id = RACE_TOWER_IDS[race];
    const w = built(id);
    const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === id)!;
    expect(sp, 'fixture: the race tower stands').toBeDefined();
    const foot = await publishFoot(new TowerRenderer(app(), new Container()), w, sp.anchorPrimitiveId);
    expect(foot).not.toBeNull();
    install();
    new SpawnerZoneRenderer({} as never, new Container()).sync(w);
    const exp = { ground: recordingSink(), top: recordingSink(), shade: recordingSink() };
    towerSignatureFx(exp, 'race3', sp.anchorPrimitiveId as unknown as number, foot!.x, foot!.y, foot!.w, foot!.h, w.tick, false, TOWER_SIG_NO_ACT, 0, raceForTowerId(id));
    expectSubset([...exp.ground.out, ...exp.top.out, ...exp.shade.out], [...hooks.ground.out, ...hooks.top.out, ...hooks.shade.out], id);
  });

  it('⭐ the Voltkin TV draws its live screen from its own renderer; ⛔ not under legacy/MINIMAL', async () => {
    const w = built('voltkin' as GodlyId);
    const r = new VoltkinTowerRenderer(app(), new Container());
    const first = [...w.primitives.keys()].sort((a, b) => a - b)[0]!;
    // the atlas loads asynchronously: drive frames until it publishes (fx hooks installed, so the TV draws)
    let tvGlow = 0;
    for (let i = 0; i < 60 && tvGlow === 0; i++) {
      install();
      beginTowerCoverFrame(w);
      r.sync(w);
      tvGlow = hooks.top.out.filter((e) => e.tint === 0x6fc8ff).length;
      if (tvGlow === 0) await new Promise((res) => setTimeout(res, 5));
    }
    expect(tvGlow, 'the TV screen glow reached the frame').toBeGreaterThan(0);
    expect(towerFootForPrim(first) ?? 'foot', 'the chain published').not.toBeNull();
    install();
    setFxLegacyFlag(true);
    beginTowerCoverFrame(w);
    r.sync(w);
    expect([...hooks.top.out, ...hooks.ground.out, ...hooks.shade.out]).toEqual([]);
  });
});

/*
 * ⭐⭐ S196 audit HIGH-1 — **THE BIRTH FLARE ON A JOINER.** The first cut read `Creature.spawnedAtTick`, which
 * the peer deserializer sets to 0, so a joiner never saw a spawner flare; every test above reads a HOST world.
 * This one crosses the wire: host → `netSnapshot` → JSON → `applyNetSnapshot` on a fresh peer world → the
 * peer's own publisher + `SpawnerZoneRenderer.sync`.
 */
describe('S196 REACH (host → snapshot → peer) — the spawner birth flare fires on a JOINER', () => {
  function toPeer(host: World, peer: World): void {
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), peer);
  }
  const lumOf = (out: FxEmitRecord[]): number => out.reduce((a, e) => a + e.alpha * e.w * e.h, 0);

  it('⭐ a creature that appears on the peer flares its tower there; ⛔ the join frame flares nothing', async () => {
    const host = built('goblinTower');
    const sp = [...host.creatureSpawners.values()].find((s) => s.recipeId === 'goblinTower')!;
    expect(sp, 'fixture: the goblin tower stands').toBeDefined();
    const anchor = sp.anchorPrimitiveId;
    // the joiner: ALREADY two of this tower's goblins on the board when it arrives
    const mint = (): void => {
      const id = host.nextCreatureId++;
      const a = host.primitives.get(anchor)!;
      host.creatures.set(id as never, makeCreature(CREATURE_CONFIGS.goblinMelee, {
        id: id as never, ownerPlayerId: P0, pos: { ...a.pos }, targetPos: { ...a.pos }, spawnedAtTick: host.tick, clock: host, sourceSpawnerId: sp.id,
      }));
    };
    mint(); mint();
    const peer = makeWorld(0x5194);
    toPeer(host, peer);
    expect([...peer.creatures.values()].every((c) => c.spawnedAtTick === 0), 'the wire drops spawnedAtTick (why the first cut never flared on a peer)').toBe(true);
    const pub = new StructureRampRenderer(app(), new Container());
    const foot = await publishFoot(pub, peer, anchor);
    expect(foot, 'the peer drew the tower').not.toBeNull();
    const r = new SpawnerZoneRenderer({} as never, new Container());
    const peerFrame = (): FxEmitRecord[] => {
      beginTowerCoverFrame(peer);
      pub.sync(peer);
      beginTowerCoverFrame(peer);
      install();
      r.sync(peer);
      return [...hooks.ground.out, ...hooks.top.out, ...hooks.shade.out];
    };
    const idle = (): FxEmitRecord[] => {
      const e = { ground: recordingSink(), top: recordingSink(), shade: recordingSink() };
      towerSignatureFx(e, 'goblinForge', anchor as unknown as number, foot!.x, foot!.y, foot!.w, foot!.h, peer.tick, false, TOWER_SIG_NO_ACT, 0, null);
      return [...e.ground.out, ...e.top.out, ...e.shade.out];
    };
    // ⛔ the join frame: two goblins stand there, nothing flares — the signature is exactly the idle one
    const join = peerFrame();
    expectSubset(idle(), join, 'join frame');
    const joinLum = lumOf(join);
    // one snapshot later (6 ticks), nothing new: still idle
    host.tick += 6;
    toPeer(host, peer);
    const quiet = peerFrame();
    expectSubset(idle(), quiet, 'quiet frame');
    // ⭐ the host mints a goblin; the next snapshot carries it; the PEER flares
    host.tick += 6;
    mint();
    toPeer(host, peer);
    const lit = peerFrame();
    const e = { ground: recordingSink(), top: recordingSink(), shade: recordingSink() };
    towerSignatureFx(e, 'goblinForge', anchor as unknown as number, foot!.x, foot!.y, foot!.w, foot!.h, peer.tick, false, 0, 0, null);
    expectSubset([...e.ground.out, ...e.top.out, ...e.shade.out], lit, 'the peer flare (actAge 0)');
    expect(lumOf(lit)).toBeGreaterThan(joinLum * 1.1);
  });
});
