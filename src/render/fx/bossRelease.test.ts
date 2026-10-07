/**
 * S196 `s196/boss-release` (owner R196-T2) — the DERIVER (`bossReleaseTrack.ts`) and the DRAWERS
 * (`bossReleaseFx.ts`) in isolation. The end-to-end proof across the wire is `../bossReleaseReach.test.ts`.
 *
 * The deriver is driven with hand-made frames so each case is exactly one fact: a tier-9 spawner vanishing
 * WITH its boss first seen at its anchor (release), WITHOUT one (destroyed / scrapped → crumble only), a boss
 * of the wrong race / owner / place / time, a joiner's first frame, a gap, a clock that went backwards, and two
 * towers of one seat releasing in the same tick.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { World } from '../../state/world.ts';
import { ALL_RACES, type RaceId } from '../../state/races.ts';
import { T9_BOSS_TYPE, T9_TOWER_IDS } from '../../state/t9BossIds.ts';
import { TOWER_CRUMBLE_FRAMES } from '../towerFrames.ts';
import {
  BOSS_CRUMBLE_FX_TICKS, BOSS_RELEASE_TICKS, bossCrumbleFx, bossReleaseFx, type BossReleaseSinks,
} from './bossReleaseFx.ts';
import {
  BOSS_RELEASE_DEV, BOSS_RELEASE_MATCH_PX, BOSS_RELEASE_MATCH_TICKS, BOSS_RELEASE_PRIME_GAP_TICKS, BossReleaseTracker,
} from './bossReleaseTrack.ts';
import { recordingSink, type FxEmitRecord } from './emitter.ts';

/* ── a hand-made world: only what the tracker reads ─────────────────────────────────────────── */

interface T { id: number; race: RaceId; owner: number; anchor: number; x: number; y: number }
interface B { id: number; race: RaceId; owner: number; x: number; y: number }
function world(tick: number, towers: readonly T[], bosses: readonly B[]): World {
  const creatureSpawners = new Map<number, unknown>();
  const primitives = new Map<number, unknown>();
  for (const t of towers) {
    creatureSpawners.set(t.id, { id: t.id, recipeId: T9_TOWER_IDS[t.race], anchorPrimitiveId: t.anchor, ownerPlayerId: t.owner });
    primitives.set(t.anchor, { id: t.anchor, pos: { x: t.x, y: t.y } });
  }
  const creatures = new Map<number, unknown>();
  for (const b of bosses) creatures.set(b.id, { id: b.id, type: T9_BOSS_TYPE[b.race], ownerPlayerId: b.owner, pos: { x: b.x, y: b.y } });
  return { tick, creatureSpawners, primitives, creatures } as unknown as World;
}
const FOOT = { x: 400, y: 520, w: 150, h: 150 };
const footOf = () => FOOT;
const tower: T = { id: 7, race: 'orcs', owner: 0, anchor: 70, x: 400, y: 440 };
const bossAt = (over: Partial<B> = {}): B => ({ id: 99, race: 'orcs', owner: 0, x: 400, y: 440, ...over });

/** Run frames; returns the tracker. */
function run(frames: Array<[number, T[], B[]]>): BossReleaseTracker {
  const tr = new BossReleaseTracker();
  for (const [tick, ts, bs] of frames) tr.observe(world(tick, ts, bs), footOf);
  return tr;
}

describe('S196 R196-T2 — the release DERIVER', () => {
  it('⭐ RELEASE: the tower vanishes and its race\'s boss is first seen at its anchor in the same frame', () => {
    const tr = run([[100, [tower], []], [106, [tower], []], [112, [], [bossAt()]]]);
    const f = tr.current();
    expect(f.length).toBe(1);
    expect(f[0]).toMatchObject({ spawnerId: 7, race: 'orcs', owner: 0, startTick: 112, released: true, foot: FOOT });
  });

  it('⭐ the boss may be seen a snapshot AFTER the vanish (and may have walked a little)', () => {
    const tr = run([[100, [tower], []], [106, [], []], [112, [], [bossAt({ x: 430 })]]]);
    expect(tr.current()[0]!.released).toBe(true);
    expect(tr.current()[0]!.startTick, 'the crumble started at the vanish').toBe(106);
  });

  it('⛔ DESTROYED / SCRAPPED: the tower vanishes and no boss appears → crumble only', () => {
    const tr = run([[100, [tower], []], [106, [], []], [112, [], []], [130, [], []]]);
    expect(tr.current().length).toBe(1);
    expect(tr.current()[0]!.released).toBe(false);
  });

  it('⛔ a boss that was ALREADY on the board when the tower falls is not its release', () => {
    const tr = run([[100, [tower], [bossAt()]], [106, [], [bossAt()]]]);
    expect(tr.current()[0]!.released).toBe(false);
  });

  it('⛔ the wrong race, the wrong owner, too far, or too late does not release', () => {
    for (const b of [bossAt({ race: 'demons' }), bossAt({ owner: 1 }), bossAt({ x: 400 + BOSS_RELEASE_MATCH_PX + 1 })]) {
      expect(run([[100, [tower], []], [106, [], [b]]]).current()[0]!.released, JSON.stringify(b)).toBe(false);
    }
    const late = run([[100, [tower], []], [106, [], []], [106 + BOSS_RELEASE_MATCH_TICKS + 1, [], [bossAt()]]]);
    expect(late.current()[0]!.released, 'a boss first seen after the window').toBe(false);
    const edge = run([[100, [tower], []], [106, [], [bossAt({ x: 400 + BOSS_RELEASE_MATCH_PX })]]]);
    expect(edge.current()[0]!.released, 'exactly on the radius counts').toBe(true);
  });

  it('⛔ JOINER: the first frame is unprimed — a tower already gone and a boss already out replay nothing', () => {
    // first frame: the boss is out, no tower → nothing; and a tower that is in the first frame then vanishes DOES count
    const tr = run([[500, [], [bossAt()]], [506, [], [bossAt()]]]);
    expect(tr.current().length).toBe(0);
    const tr2 = run([[500, [tower], []], [506, [], [bossAt({ id: 100 })]]]);
    expect(tr2.current()[0]!.released, 'primed by one frame, a real release plays').toBe(true);
  });

  it('⛔ a GAP (tab hidden, legacy/MINIMAL stretch) or a clock that went BACKWARDS re-primes: no stale release', () => {
    const gap = run([[100, [tower], []], [100 + BOSS_RELEASE_PRIME_GAP_TICKS + 1, [], [bossAt()]]]);
    expect(gap.current().length).toBe(0);
    const back = run([[900, [tower], []], [10, [], [bossAt()]]]);
    expect(back.current().length).toBe(0);
    // and a fall in flight is dropped by a gap (it would otherwise jump to a stale age)
    const drop = run([[100, [tower], []], [106, [], [bossAt()]], [106 + BOSS_RELEASE_PRIME_GAP_TICKS + 1, [], [bossAt()]]]);
    expect(drop.current().length).toBe(0);
  });

  it('⭐ two towers of one seat releasing in one tick each claim their OWN boss (nearest, then smaller id)', () => {
    const a: T = { ...tower, id: 7, anchor: 70, x: 400 };
    const b: T = { ...tower, id: 8, anchor: 80, x: 460 };
    const tr = run([[100, [a, b], []], [106, [], [bossAt({ id: 201, x: 460 }), bossAt({ id: 200, x: 400 })]]]);
    expect(tr.current().map((f) => f.released)).toEqual([true, true]);
    // one boss, two vanishes → exactly one release, and it is the nearer tower's
    const one = run([[100, [a, b], []], [106, [], [bossAt({ id: 300, x: 455 })]]]);
    expect(one.current().filter((f) => f.released).map((f) => f.spawnerId)).toEqual([8]);
  });

  it('⭐ a fall is pruned after BOSS_CRUMBLE_FX_TICKS; reset() forgets everything', () => {
    const tr = new BossReleaseTracker();
    tr.observe(world(100, [tower], []), footOf);
    tr.observe(world(106, [], [bossAt()]), footOf);
    for (let t = 112; t < 106 + BOSS_CRUMBLE_FX_TICKS; t += 6) tr.observe(world(t, [], [bossAt()]), footOf);
    expect(tr.current().length).toBe(1);
    tr.observe(world(106 + BOSS_CRUMBLE_FX_TICKS, [], [bossAt()]), footOf);
    expect(tr.current().length).toBe(0);
    tr.observe(world(400, [tower], []), footOf);
    tr.reset();
    tr.observe(world(406, [], [bossAt({ id: 5 })]), footOf);
    expect(tr.current().length, 'after reset the next frame is unprimed').toBe(0);
  });

  it('⭐ the foot is the last one PUBLISHED (a fogged/unloaded frame keeps it); never seen → the anchor fallback', () => {
    const tr = new BossReleaseTracker();
    tr.observe(world(100, [tower], []), () => FOOT);
    tr.observe(world(106, [tower], []), () => null);
    tr.observe(world(112, [], []), () => null);
    expect(tr.current()[0]!.foot).toEqual(FOOT);
    const tr2 = new BossReleaseTracker();
    tr2.observe(world(100, [tower], []), () => null);
    tr2.observe(world(106, [], []), () => null);
    expect(tr2.current()[0]!.foot).toEqual({ x: 400, y: 440 + 75, w: 150, h: 150 });
  });
});

/* ── the drawers ────────────────────────────────────────────────────────────────────────────── */

type Rec = ReturnType<typeof recordingSink>;
function sinks(): BossReleaseSinks & { ground: Rec; top: Rec; shade: Rec; all(): FxEmitRecord[]; shocks: number } {
  const g = recordingSink(), t = recordingSink(), s = recordingSink();
  const o = { ground: g, top: t, shade: s, shocks: 0, shock: { shock() { o.shocks++; } }, all: () => [...g.out, ...t.out, ...s.out] };
  return o;
}
function draw(race: RaceId, age: number, low: boolean, released = true) {
  const s = sinks();
  bossCrumbleFx(s, race, 12345, 400, 520, 150, 150, age, low, released);
  if (released) bossReleaseFx(s, race, 12345, 400, 520, 150, 150, age, low);
  return s;
}

describe('S196 R196-T2 — the release + crumble DRAWERS', () => {
  it('the crumble runs exactly as long as the sprite\'s destroy cinematic', () => {
    expect(BOSS_CRUMBLE_FX_TICKS).toBe(TOWER_CRUMBLE_FRAMES);
    expect(BOSS_RELEASE_TICKS).toBeLessThan(BOSS_CRUMBLE_FX_TICKS);
  });

  for (const race of ALL_RACES) {
    it(`⭐ ${race}: deterministic, alive through the release, LOW lighter, no normal blend on the bloomed layer`, () => {
      for (const age of [0, 5, 20, 45, 80]) {
        const a = draw(race, age, false);
        expect(a.all(), `${race}@${age}: deterministic`).toEqual(draw(race, age, false).all());
        expect(a.all().length, `${race}@${age}: draws`).toBeGreaterThan(10);
        expect(a.top.out.filter((e) => e.blend === 'normal'), 'normal blend on TOP').toEqual([]);
        for (const e of a.all()) expect(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.alpha), `${race}@${age}: a NaN sprite`).toBe(true);
      }
      let hi = 0, lo = 0;
      for (let age = 0; age < BOSS_CRUMBLE_FX_TICKS; age += 3) { hi += draw(race, age, false).all().length; lo += draw(race, age, true).all().length; }
      expect(lo, `${race}: LOW lighter`).toBeLessThan(hi * 0.75);
    });
  }

  it('⭐ the race releases differ (each race has its own look) and the release adds to the crumble', () => {
    const sig = (r: RaceId) => JSON.stringify(draw(r, 20, false).top.out.map((e) => e.tint));
    expect(new Set(ALL_RACES.map(sig)).size).toBe(ALL_RACES.length);
    expect(draw('nagas', 10, false, true).all().length).toBeGreaterThan(draw('nagas', 10, false, false).all().length + 20);
  });

  it('⭐ the ground ripple only on HIGH, only early; ⛔ nothing outside [0, life)', () => {
    expect(draw('orcs', 4, false).shocks).toBe(1);
    expect(draw('orcs', 4, true).shocks).toBe(0);
    expect(draw('orcs', 60, false).shocks).toBe(0);
    expect(draw('orcs', -1, false).all()).toEqual([]);
    expect(draw('orcs', BOSS_CRUMBLE_FX_TICKS, false).all()).toEqual([]);
  });
});

describe('S196 R196-T2 — the DEV capture/bench seam is inert in production', () => {
  it('⛔ defaults off, and no production source writes it', () => {
    expect(BOSS_RELEASE_DEV).toEqual({ off: false, loop: false });
    const SRC = join(__dirname, '..', '..');
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : n.endsWith('.ts') && !n.endsWith('.test.ts') ? [p] : []; });
    const writers = walk(SRC).filter((p) => /BOSS_RELEASE_DEV\s*(\.\s*\w+\s*=[^=]|=[^=])/.test(readFileSync(p, 'utf8').replace(/export const BOSS_RELEASE_DEV[^\r\n]*/, '')));
    expect(writers, 'a production file writes the dev seam').toEqual([]);
  });
  it('⭐ the seam does what the bench needs: `loop` keeps a fall past the crumble', () => {
    const tr = new BossReleaseTracker();
    try {
      BOSS_RELEASE_DEV.loop = true;
      tr.observe(world(100, [tower], []), footOf);
      tr.observe(world(106, [], [bossAt()]), footOf);
      for (let t = 112; t < 106 + 3 * BOSS_CRUMBLE_FX_TICKS; t += 6) tr.observe(world(t, [], [bossAt()]), footOf);
      expect(tr.current().length).toBe(1);
    } finally { BOSS_RELEASE_DEV.loop = false; }
  });
});
