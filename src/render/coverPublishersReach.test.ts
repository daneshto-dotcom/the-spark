/**
 * S194 `s194/visuals-6` (audit reach gap) — **EVERY REAL COVER PUBLISHER, DRIVEN, PUBLISHES A FOOT.**
 *
 * The census in `fx/towerSparkle.test.ts` proves each `markTowerCover(` call passes a foot (the line
 * EXISTS). This proves it is REACHED: each of the four publishers — `TowerRenderer`,
 * `StructureRampRenderer`, `VoltkinTowerRenderer`, `StinkTowerRenderer` — runs its real `sync` on a tower
 * built through the real reducer + matcher + host tick, and `forEachTowerCoverGroup` then yields that
 * tower's group WITH a foot standing on the sprite. Specifically covered: a tier-3 race tower, a TIER-9
 * tower, HELGA, the laser turret, the Voltkin TV and the stink tower.
 *
 * The atlases are the shipped ones: `fetch` reads the real `public/**-anim.json` manifests from disk;
 * only the PNG decode (`Assets.load`) is stubbed with a blank texture of the sheet's size class.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('pixi.js', async (orig) => {
  const m = await orig<typeof import('pixi.js')>();
  return {
    ...m,
    Assets: { load: async () => new m.Texture({ source: new m.TextureSource({ width: 16384, height: 16384 }) }) },
  };
});
// ⛔ S195 (coherence-2 audit, HIGH) — the Proxy must NOT answer `then`: a mocked module that is a thenable makes
// vitest's `await import()` hang forever. Latent until `stinkTowerRenderer.ts` became this graph's first
// `audioManager` importer (the stink-fire SFX slot); the merged tree's full suite then hung at this file.
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
import { T9_TOWER_IDS } from '../state/t9BossIds.ts';
import '../state/godlyRecipes/registerAll.ts';
import { __resetTowerCoverForTests, beginTowerCoverFrame, forEachTowerCoverGroup, type TowerCoverGroupView } from './towerCover.ts';
import { resetConcealmentForTest } from './concealment.ts';
import { TowerRenderer } from './towerRenderer.ts';
import { StructureRampRenderer } from './structureRampRenderer.ts';
import { VoltkinTowerRenderer } from './voltkinTowerRenderer.ts';
import { StinkTowerRenderer } from './stinkTowerRenderer.ts';

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
beforeEach(() => { __resetTowerCoverForTests(); resetConcealmentForTest(); });

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
/** Run frames until the publisher's async atlas load lands and it publishes (bounded). */
async function publish(r: Publisher, w: World): Promise<TowerCoverGroupView[]> {
  for (let i = 0; i < 60; i++) {
    beginTowerCoverFrame(w);
    r.sync(w);
    beginTowerCoverFrame(w);
    const out: TowerCoverGroupView[] = [];
    forEachTowerCoverGroup((g) => out.push(g));
    // groups surface one boundary after the mark: one more frame
    r.sync(w);
    beginTowerCoverFrame(w);
    forEachTowerCoverGroup((g) => out.push(g));
    if (out.length > 0) return out;
    await new Promise((res) => setTimeout(res, 5));
  }
  return [];
}

function expectFootOn(w: World, groups: TowerCoverGroupView[], anchor: PrimitiveId, what: string): void {
  const g = groups.find((x) => x.prims.includes(anchor));
  expect(g, `${what}: a cover group for the built tower`).toBeDefined();
  expect(g!.foot, `${what}: the group carries the sprite foot`).not.toBeNull();
  const f = g!.foot!;
  expect(f.w).toBeGreaterThan(20);
  expect(f.h).toBeGreaterThan(20);
  // the foot stands on the tower: centred on its shapes, at most one art height below their centre
  let cx = 0, cy = 0, n = 0;
  for (const id of g!.prims) { const p = w.primitives.get(id); if (p) { cx += p.pos.x; cy += p.pos.y; n++; } }
  cx /= n; cy /= n;
  expect(Math.abs(f.x - cx), `${what}: foot x`).toBeLessThan(f.w * 0.5);
  expect(f.y - cy, `${what}: foot at or below the centre`).toBeGreaterThanOrEqual(-1);
  expect(f.y - cy, `${what}: foot y`).toBeLessThan(f.h * 1.5);
}

const parent = () => new Container();
const app = () => ({ stage: new Container() }) as never;

describe('S194 REACH — each real cover publisher publishes a foot for a tower it drew', () => {
  it('TowerRenderer — a tier-3 race tower', async () => {
    const id = RACE_TOWER_IDS[w0Race()];
    const w = built(id);
    const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === id);
    expect(sp, 'fixture: the race tower stands').toBeDefined();
    expectFootOn(w, await publish(new TowerRenderer(app(), parent()), w), sp!.anchorPrimitiveId, 'tier-3');
  });

  it('TowerRenderer — a TIER-9 tower', async () => {
    const race = w0Race();
    const id = T9_TOWER_IDS[race];
    const w = built(id);
    const sp = [...w.creatureSpawners.values()].find((s) => s.recipeId === id);
    expect(sp, 'fixture: the tier-9 tower stands').toBeDefined();
    expectFootOn(w, await publish(new TowerRenderer(app(), parent()), w), sp!.anchorPrimitiveId, 'tier-9');
  });

  for (const id of ['helga', 'laserTurret'] as const) {
    it(`StructureRampRenderer — ${id} (a DEFENDER)`, async () => {
      const w = built(id as GodlyId);
      const d = [...w.defenders.values()].find((x) => x.recipeId === id);
      expect(d, `fixture: ${id} stands`).toBeDefined();
      expectFootOn(w, await publish(new StructureRampRenderer(app(), parent()), w), d!.anchorPrimitiveId, id);
    });
  }

  it('VoltkinTowerRenderer — the Voltkin TV', async () => {
    // The TV stands on a Voltkin CHAIN (found from the shapes, `findAllVoltkinChains`), not on a record.
    const w = built('voltkin' as GodlyId);
    const first = [...w.primitives.keys()].sort((a, b) => a - b)[0]!;
    expectFootOn(w, await publish(new VoltkinTowerRenderer(app(), parent()), w), first, 'voltkin');
  });

  it('StinkTowerRenderer — the stink tower', async () => {
    const w = built('stinkTower' as GodlyId);
    const d = [...w.defenders.values()].find((x) => x.recipeId === 'stinkTower');
    expect(d, 'fixture: the stink tower stands').toBeDefined();
    expectFootOn(w, await publish(new StinkTowerRenderer(app(), parent()), w), d!.anchorPrimitiveId, 'stink');
  });
});

/** Seat 0's race in a fresh 1v1 (its tier-9 recipe is that race's). */
function w0Race(): keyof typeof T9_TOWER_IDS {
  const w = makeWorld(0x5194);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  return w.players.get(P0)!.raceId as keyof typeof T9_TOWER_IDS;
}
