/**
 * S194 `s194/visuals-6` — **THE BUILD / DESTROY SPARKLE ON EVERY TOWER WHOSE CONNECTORS FADE.**
 *
 * Owner: *"when I built a laser turret, it didn't have those little sparks … make it consistent across
 * all built … towers … Anything that has the connectors go … transparent … have that effect."*
 *
 * Three layers of proof, because a source guard proves a line EXISTS and not that it is REACHED (S182):
 *   1. `towerCover`'s group registry, unit-tested (standing, the destroy window, pruning, the foot);
 *   2. a MECHANICAL census: every production `markTowerCover(` caller in `src/render` is enumerated
 *      from disk and must pass a FOOT — a new tower kind that hides its connectors without one fails;
 *   3. REACH through the real `SpawnerZoneRenderer.sync`, with recording sinks installed as the live
 *      fx hooks: a DEFENDER group (the laser turret's case — the bug) and a SPAWNER group both sparkle,
 *      a finished tower does not, the destroy moment sparkles again and dies away, and `?fx=legacy`
 *      emits nothing. Each with its negative.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { Container } from 'pixi.js';
import { recordingSink } from './emitter.ts';
import { setFxHooks, setFxLegacyFlag } from './fxState.ts';
import {
  TOWER_SPARKLE_REVEAL_TICKS, TOWER_SPARKLE_TAIL_TICKS, towerSparkleFx, towerSparkleStrength,
} from './towerSparkleFx.ts';
import {
  TOWER_COVER_FADE_TICKS, TOWER_COVER_GROUP_LINGER_TICKS, TOWER_COVER_REVEAL_TICKS,
  __resetTowerCoverForTests, beginTowerCoverFrame, forEachTowerCoverGroup, markTowerCover,
  towerFootForPrim, resetTowerCoverGroups, pruneTowerCover, type TowerCoverGroupView,
} from '../towerCover.ts';
import { SpawnerZoneRenderer } from '../spawnerZoneRenderer.ts';
import { resetConcealmentForTest } from '../concealment.ts';
import { PLAYER_COLORS, PRIMITIVE_MAX_HP } from '../../constants.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../../state/world.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PrimitiveId } from '../../types.ts';

const P0 = asPlayerId(0);
const FOOT = { x: 400, y: 330, w: 84, h: 84 };

function groups(): TowerCoverGroupView[] {
  const out: TowerCoverGroupView[] = [];
  forEachTowerCoverGroup((g) => out.push(g));
  return out;
}

/** A frame: promote the marks, then (optionally) mark the tower as its publisher would. */
function frame(w: { tick: number }, mark: (() => void) | null): void {
  beginTowerCoverFrame(w as never);
  mark?.();
}

beforeEach(() => { __resetTowerCoverForTests(); resetConcealmentForTest(); setFxLegacyFlag(false); });
afterEach(() => { setFxHooks(null); setFxLegacyFlag(false); __resetTowerCoverForTests(); });

const P = [asPrimitiveId(12), asPrimitiveId(10), asPrimitiveId(11)];
const B = [asBondId(20), asBondId(21)];

describe('S194 — towerCover remembers every drawn tower as a GROUP', () => {
  it('a mark is a standing group from the NEXT frame, keyed by its smallest shape, with its foot', () => {
    const w = { tick: 100 };
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    expect(groups(), 'the one-frame lag, same as the alphas').toEqual([]);
    w.tick = 101;
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    const g = groups();
    expect(g).toHaveLength(1);
    expect(g[0]!.key).toBe(asPrimitiveId(10));
    expect(g[0]!.standing).toBe(true);
    expect(g[0]!.foot).toEqual(FOOT);
    expect(g[0]!.downTicks).toBe(0);
    expect(towerFootForPrim(asPrimitiveId(11))).toEqual(FOOT);
    expect(towerFootForPrim(asPrimitiveId(99)), 'not a member').toBeNull();
  });

  it('when the publisher stops (the crumble) it stays, not standing, counting down, then is dropped', () => {
    const w = { tick: 100 };
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    w.tick = 101;
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    w.tick = 102;
    frame(w, null); // the frame the sprite stopped (its absence is seen at the NEXT boundary)
    w.tick = 103;
    frame(w, null);
    w.tick = 131;
    frame(w, null);
    const g = groups();
    expect(g).toHaveLength(1);
    expect(g[0]!.standing).toBe(false);
    expect(g[0]!.downTicks).toBe(28);
    expect(towerFootForPrim(asPrimitiveId(10)), 'a gone tower has no foot to stand a background on').toBeNull();
    w.tick = 103 + TOWER_COVER_GROUP_LINGER_TICKS + 1;
    frame(w, null);
    expect(groups()).toEqual([]);
  });

  it('⛔ S194 audit M1 — a title return forgets every group (the tick stays monotonic, as in production)', () => {
    const w = { tick: 5000 };
    frame(w, () => markTowerCover(P, B, 5000, FOOT));
    w.tick = 5001;
    frame(w, () => markTowerCover(P, B, 5000, FOOT));
    expect(groups()).toHaveLength(1);
    resetTowerCoverGroups();
    w.tick = 5002;
    frame(w, null);
    w.tick = 5003;
    frame(w, null);
    expect(groups(), 'nothing goes "down" after the title return').toEqual([]);
  });

  it('⛔ S194 audit L1 — a tower that re-forms WITHOUT its smallest shape does not leave a "fallen" ghost group', () => {
    const w = { tick: 100 };
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    w.tick = 101;
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    const reformed = [asPrimitiveId(11), asPrimitiveId(12), asPrimitiveId(13)];
    w.tick = 102;
    frame(w, () => markTowerCover(reformed, B, 100, FOOT));
    w.tick = 103;
    frame(w, () => markTowerCover(reformed, B, 100, FOOT));
    w.tick = 104;
    frame(w, () => markTowerCover(reformed, B, 100, FOOT));
    const g = groups();
    expect(g.map((x) => [x.key, x.standing])).toEqual([[asPrimitiveId(11), true]]);
  });

  it('⛔ S194 audit L2 — standing again on shapes already seen standing is a RE-REVEAL, not a build', () => {
    const w = { tick: 100 };
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    w.tick = 101;
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    expect(groups()[0]!.revealOnly, 'the first time it stands: a build').toBe(false);
    for (let t = 102; t < 140; t++) { w.tick = t; frame(w, null); } // into the fog
    w.tick = 140;
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    w.tick = 141;
    frame(w, () => markTowerCover(P, B, 100, FOOT));
    expect(groups()[0]!.standing).toBe(true);
    expect(groups()[0]!.revealOnly).toBe(true);
  });

  it('⛔ S194 re-audit (c) — a clock that goes BACKWARDS (a new match) forgets what was seen standing', () => {
    const w = { tick: 5000 };
    frame(w, () => markTowerCover(P, B, 5000, FOOT));
    w.tick = 5001;
    frame(w, () => markTowerCover(P, B, 5000, FOOT));
    w.tick = 3;
    frame(w, null);
    w.tick = 4;
    frame(w, () => markTowerCover(P, B, 4, FOOT));
    w.tick = 5;
    frame(w, () => markTowerCover(P, B, 4, FOOT));
    expect(groups()[0]!.standing).toBe(true);
    expect(groups()[0]!.revealOnly, 'a build in the new match, not a re-reveal').toBe(false);
  });

  it('is INACTIVE until the render tick starts it — nothing is remembered, nothing is visited', () => {
    markTowerCover(P, B, 0, FOOT);
    expect(groups()).toEqual([]);
    expect(towerFootForPrim(P[0]!)).toBeNull();
  });

  it('the reveal the destroy sparkle rises with is the owner\'s one second', () => {
    expect(TOWER_SPARKLE_REVEAL_TICKS).toBe(TOWER_COVER_REVEAL_TICKS);
    expect(TOWER_COVER_GROUP_LINGER_TICKS, 'the group outlives the whole destroy sparkle').toBeGreaterThan(TOWER_SPARKLE_REVEAL_TICKS + TOWER_SPARKLE_TAIL_TICKS);
  });
});

describe('S194 — the sparkle strength', () => {
  it('standing: full the moment the building lands, gone with the connectors', () => {
    expect(towerSparkleStrength(true, 1, 0)).toBe(1);
    expect(towerSparkleStrength(true, 0.4, 0)).toBe(0.4);
    expect(towerSparkleStrength(true, 0, 0), 'a FINISHED tower sparkles not at all — it is a transient').toBe(0);
  });
  it('destroyed: rises with the reveal, holds, then dies away over the tail', () => {
    expect(towerSparkleStrength(false, 0.3, 18)).toBeCloseTo(0.3);
    expect(towerSparkleStrength(false, 1, TOWER_SPARKLE_REVEAL_TICKS)).toBe(1);
    const mid = towerSparkleStrength(false, 1, TOWER_SPARKLE_REVEAL_TICKS + TOWER_SPARKLE_TAIL_TICKS / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
    expect(towerSparkleStrength(false, 1, TOWER_SPARKLE_REVEAL_TICKS + TOWER_SPARKLE_TAIL_TICKS)).toBe(0);
  });
  it('⛔ DETERMINISM — same tower, same tick → identical sprites; the next tick differs', () => {
    const run = (tick: number) => {
      const top = recordingSink(); const ground = recordingSink();
      towerSparkleFx(ground, top, 10, 400, 330, 84, 84, 0xff3b6b, tick, 0.8,
        [{ ax: 380, ay: 300, bx: 420, by: 300, a: 0.8 }], [{ x: 380, y: 300, r: 9, a: 0.8 }]);
      return [...ground.out, ...top.out];
    };
    expect(run(500)).toEqual(run(500));
    expect(run(501)).not.toEqual(run(500));
  });
});

/* ── the census ──────────────────────────────────────────────────────────────────────────────── */

const RENDER_DIR = new URL('../', import.meta.url);
function code(file: string): string {
  return readFileSync(new URL(file, RENDER_DIR), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('S194 — ⛔ EVERY tower kind that hides its connectors publishes a FOOT (mechanical census)', () => {
  // ⭐ S194 audit — RECURSIVE over src/render/** (a publisher in a sub-folder must not escape the census).
  const publishers = (readdirSync(RENDER_DIR, { recursive: true }) as string[])
    .map((f) => f.split(String.fromCharCode(92)).join('/'))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'towerCover.ts')
    .filter((f) => !/(^|\/)(arcade|nonet|sudokuOverlay)/.test(f))
    .filter((f) => code(f).includes('markTowerCover('));

  it('the census found the four publishers (anti-vacuity) — and no other', () => {
    expect(publishers.sort()).toEqual(['stinkTowerRenderer.ts', 'structureRampRenderer.ts', 'towerRenderer.ts', 'voltkinTowerRenderer.ts']);
  });

  it('⛔ each one passes the sprite\'s foot, so its sparkle and its race background stand on the art', () => {
    for (const f of publishers) {
      const calls = [...code(f).matchAll(/markTowerCover\(([^;]*)\);/g)].map((m) => m[1]!);
      expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) expect(c, `${f}: markTowerCover without a foot`).toMatch(/\{\s*x:[^}]*y:[^}]*w:[^}]*h:[^}]*\}\s*\)?\s*$/);
    }
  });
});

/* ── REACH through the real renderer ─────────────────────────────────────────────────────────── */

let top: ReturnType<typeof recordingSink>;
let ground: ReturnType<typeof recordingSink>;
function install(): void {
  top = recordingSink();
  ground = recordingSink();
  setFxHooks({ top, shade: recordingSink(), ground, shock: { shock() {} } });
}

/** A three-shape, two-connector structure owned by P0 — the SAME shape for a spawner and a defender. */
function boardWith(kind: 'spawner' | 'defender'): { w: World; prims: PrimitiveId[]; bonds: BondId[] } {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  const color = PLAYER_COLORS[0];
  const mk = (id: number, x: number, y: number): any => {
    const p = {
      id: asPrimitiveId(id), type: 0, placerColor: color, placedBy: P0, createdTick: 0, pos: { x, y }, prevPos: { x, y },
      bonds: new Set(), ownerColor: color, lastOwnershipChange: 0, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
    };
    w.primitives.set(p.id, p as never);
    return p;
  };
  const a = mk(10, 380, 300), b = mk(11, 420, 300), c = mk(12, 400, 270);
  const bonds: BondId[] = [];
  for (const [id, x, y] of [[20, a, b], [21, b, c]] as const) {
    const bid = asBondId(id);
    w.bonds.set(bid, { id: bid, aId: x.id, bId: y.id, a: x, b: y, restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: 0 } as never);
    bonds.push(bid);
  }
  // ⚠ The renderer does not care which collection the tower lives in — that is the point. The
  // `kind` only documents which publisher this group stands for (towerRenderer vs the ramp's defender).
  void kind;
  return { w, prims: [a.id, b.id, c.id], bonds };
}

function syncAt(r: SpawnerZoneRenderer, w: World, tick: number, mark: boolean, prims: PrimitiveId[], bonds: BondId[]): void {
  w.tick = tick;
  install();
  beginTowerCoverFrame(w);
  r.sync(w);
  if (mark) markTowerCover(prims, bonds, 1000, FOOT); // the publisher runs AFTER the zone renderer, as in main.ts
}

describe('S194 REACH — `SpawnerZoneRenderer.sync` sparkles every tower kind', () => {
  for (const kind of ['defender', 'spawner'] as const) {
    it(`a ${kind} tower (no spawner in the world for the defender case) sparkles while its connectors fade`, () => {
      const { w, prims, bonds } = boardWith(kind);
      expect(w.creatureSpawners.size, 'no spawner — the S193 renderer returned before drawing anything').toBe(0);
      const r = new SpawnerZoneRenderer({} as never, new Container());
      syncAt(r, w, 1000, true, prims, bonds);
      syncAt(r, w, 1001, true, prims, bonds);
      syncAt(r, w, 1010, true, prims, bonds);
      expect(top.out.length, 'embers, connector sparks and shape twinkles on the top layer').toBeGreaterThan(8);
      expect(ground.out.length, 'the light pool').toBe(2);
      // the beads run along the real connectors
      const beads = top.out.filter((e) => e.tex === 'core' && e.tint === 0xffffff);
      expect(beads.length).toBe(2);
      expect(beads.every((e) => e.y >= 270 && e.y <= 300 && e.x >= 380 && e.x <= 420)).toBe(true);
      // the pool sits at the FOOT the publisher passed, not at the shapes
      expect(ground.out.every((e) => e.x === FOOT.x && e.y === FOOT.y)).toBe(true);
    });
  }

  it('⛔ NEGATIVE — a FINISHED tower (connectors fully hidden) draws no sparkle', () => {
    const { w, prims, bonds } = boardWith('defender');
    const r = new SpawnerZoneRenderer({} as never, new Container());
    syncAt(r, w, 1000, true, prims, bonds);
    syncAt(r, w, 1000 + TOWER_COVER_FADE_TICKS + 5, true, prims, bonds);
    syncAt(r, w, 1000 + TOWER_COVER_FADE_TICKS + 6, true, prims, bonds);
    expect(top.out).toEqual([]);
    expect(ground.out).toEqual([]);
  });

  it('⛔ NEGATIVE — a tower that never hid its connectors (never published) draws no sparkle', () => {
    const { w, prims, bonds } = boardWith('defender');
    const r = new SpawnerZoneRenderer({} as never, new Container());
    syncAt(r, w, 1000, false, prims, bonds);
    syncAt(r, w, 1001, false, prims, bonds);
    expect(top.out).toEqual([]);
  });

  it('⭐ THE DESTROY MOMENT — the connectors come back, the sparkle comes back with them, then it dies away', () => {
    const { w, prims, bonds } = boardWith('defender');
    const r = new SpawnerZoneRenderer({} as never, new Container());
    syncAt(r, w, 1000, true, prims, bonds);
    for (let t = 1001; t <= 1000 + TOWER_COVER_FADE_TICKS + 5; t += 5) syncAt(r, w, t, true, prims, bonds);
    expect(top.out, 'finished: quiet').toEqual([]);
    const gone = 1000 + TOWER_COVER_FADE_TICKS + 6;
    syncAt(r, w, gone, false, prims, bonds); // the crumble: the publisher stops
    syncAt(r, w, gone + 1, false, prims, bonds);
    syncAt(r, w, gone + 30, false, prims, bonds);
    expect(top.out.length, 'mid-reveal: sparkling').toBeGreaterThan(8);
    syncAt(r, w, gone + TOWER_SPARKLE_REVEAL_TICKS + TOWER_SPARKLE_TAIL_TICKS + 2, false, prims, bonds);
    expect(top.out, 'after the tail: quiet').toEqual([]);
  });

  it('⛔ S194 audit M1 REACH — a title return (shapes cleared, tick still rising) plays NO phantom sparkle', () => {
    const { w, prims, bonds } = boardWith('defender');
    const r = new SpawnerZoneRenderer({} as never, new Container());
    for (let t = 1000; t <= 1000 + TOWER_COVER_FADE_TICKS + 5; t += 5) syncAt(r, w, t, true, prims, bonds);
    // the title return: the reducer clears the board, main.ts calls clear(), the renderers keep syncing
    w.primitives.clear();
    w.bonds.clear();
    pruneTowerCover(w);
    r.clear();
    const t0 = 1000 + TOWER_COVER_FADE_TICKS + 6;
    for (let t = t0; t < t0 + 40; t++) {
      syncAt(r, w, t, false, prims, bonds);
      expect(top.out, `tick ${t}`).toEqual([]);
    }
    expect(groups(), 'clear() forgot the groups (not merely their owners)').toEqual([]);
  });

  it('⛔ S194 audit L2 REACH — a tower re-entering vision shows the finished state, no BUILD sparkle', () => {
    const { w, prims, bonds } = boardWith('defender');
    const r = new SpawnerZoneRenderer({} as never, new Container());
    for (let t = 1000; t <= 1000 + TOWER_COVER_FADE_TICKS + 5; t += 5) syncAt(r, w, t, true, prims, bonds);
    const fog = 1000 + TOWER_COVER_FADE_TICKS + 6;
    for (let t = fog; t < fog + 100; t++) syncAt(r, w, t, false, prims, bonds); // fogged: not published
    const back = fog + 100;
    syncAt(r, w, back, true, prims, bonds);
    for (let t = back + 1; t < back + 20; t++) {
      syncAt(r, w, t, true, prims, bonds);
      expect(top.out, `tick ${t}`).toEqual([]);
    }
  });

  /*
   * ⭐ S194 (overlap with T15 `s194/weld-rebuild`) — a tower welded into a big structure whose structure
   * RE-FORMS (a connector breaks; it re-registers a beat later on n−1 shapes, under a new group key) must
   * not play the BUILD sparkle again. L1 (the old key is dropped once a standing group holds its shapes)
   * + L2 (shapes already seen standing ⇒ a re-reveal) make that true here. ⚠ What this does NOT cover:
   * the shapes' COVER phase still flips during the gap (towerCover's reveal), so they phase back in and
   * out — that half is sim/registration timing and stays with T15.
   */
  it('⭐ a welded tower that re-forms on n−1 shapes after a short gap plays NO build sparkle', () => {
    const { w, prims, bonds } = boardWith('spawner');
    const r = new SpawnerZoneRenderer({} as never, new Container());
    for (let t = 1000; t <= 1000 + TOWER_COVER_FADE_TICKS + 5; t += 5) syncAt(r, w, t, true, prims, bonds);
    const gap = 1000 + TOWER_COVER_FADE_TICKS + 6;
    for (let t = gap; t < gap + 20; t++) syncAt(r, w, t, false, prims, bonds); // the re-form gap (≤ a poll)
    const survivors = prims.slice(1); // re-formed WITHOUT its smallest shape: a new group key
    const back = gap + 20;
    syncAt(r, w, back, true, survivors, bonds.slice(1));
    for (let t = back + 1; t < back + 30; t++) {
      syncAt(r, w, t, true, survivors, bonds.slice(1));
      expect(top.out.filter((e) => e.tint === 0xffffff), `tick ${t}: no build-sparkle beads`).toEqual([]);
      expect(ground.out, `tick ${t}: no build light pool`).toEqual([]);
    }
  });

  it('⛔ NEGATIVE — `?fx=legacy` emits no sparkle sprites at all', () => {
    const { w, prims, bonds } = boardWith('defender');
    const r = new SpawnerZoneRenderer({} as never, new Container());
    setFxLegacyFlag(true);
    syncAt(r, w, 1000, true, prims, bonds);
    syncAt(r, w, 1010, true, prims, bonds);
    expect(top.out).toEqual([]);
    expect(ground.out).toEqual([]);
  });
});
