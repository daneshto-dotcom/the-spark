/**
 * ⛔⛔ S189 C7 (owner) — DEEP CURRENT: NO LINE ACROSS THE SCREEN WHEN A NAGA GATHERER TELEPORTS.
 *
 * > *"the Naga's gatherer teleport … there's like a line … a big line every time they teleport all over
 * > the screen … He should just teleport back to the castle … giving the shape back … then go back to
 * > the center … without that weird like laser beam"* — owner, S189
 *
 * THE CAUSE (measured, Pixi 8.19): `drawDeepCurrentVortices` stroked each swirl with a bare `arc()`.
 * Pixi follows canvas path semantics — `arc()` joins the current pen position to the arc's start — and
 * after every `fill`/`stroke` it re-seats the pen at `getLastPoint()` of the finished path: stale
 * `Point.shared` after a shape (the gatherers drawn just before; (0,0) on a fresh page), `undefined`
 * after an arc. So every teleport stroked a segment from elsewhere on the board into the swirl, for the
 * swirl's whole 36-frame life. Same defect `hazardRing.ts` fixed in S86 P2, repeated in S188.
 *
 * WHAT IS DRIVEN FOR REAL: the haul runs through the real `runHostTick` (the S188 REACH fixture), the
 * real `GathererRenderer.sync` draws every frame, and the assertions read the GEOMETRY Pixi built — the
 * points of each swirl stroke's polygon — not a helper. Both seats:
 *   · HOST — the renderer reads the host world directly;
 *   · CLIENT — the real `HostSync → ClientSync.receive → interpolateInto` path at 10 Hz with the
 *     production render delay, and a second renderer on the client world.
 *
 * ⚠ No renderer RUNS here (no WebGL): this proves what is handed to Pixi's stroke builder, which is
 * where the line was. Mutation-tested: dropping the `moveTo` turns both seats red.
 */

import { describe, expect, it } from 'vitest';
import { Container, Graphics, type Application } from 'pixi.js';
import {
  GATHERER_DEPOSIT_OFFSET_Y,
  NET_RENDER_DELAY_MS,
  NET_SNAPSHOT_HZ,
  PHYSICS_HZ,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
  phaseDurationTicks,
} from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { dispatch, makeWorld, type World } from '../state/world.ts';
import { castleAnchor, makeGatherer } from '../state/gatherers/gatherer.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../state/hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { makeGameStateExtras } from '../state/gameState.ts';
import { ClientSync, HostSync } from '../net/sync.ts';
import { DEEP_CURRENT_JUMP_PX, GathererRenderer } from './gathererRenderer.ts';
import type { Controls } from '../input/controls.ts';
import type { DraftPick } from '../state/draft.ts';
import { asGathererId, asPlayerId, asSparkId, type GathererId } from '../types.ts';

const P0 = asPlayerId(0);
/** `DEEP_CURRENT_VORTEX_COLOR` in gathererRenderer.ts — module-private, so restated and checked below. */
const VORTEX_COLOR = 0x3fd7ff;
/** The swirl's outermost arc radius is (10 + 9·2) = 28 px at birth; a stroke of one swirl fits in this. */
const SWIRL_BOX_PX = 2 * 28 + 8;

/* ── the S188 fixture (deepCurrent.test.ts), restated: a BUILD board, one gatherer, one shape ─── */

function board(picks: DraftPick[]): World {
  const w = makeWorld(0x189c7);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('BUILD') * 10;
  w.draft = null;
  w.gatherers.clear();
  w.freeSparks.clear();
  const pl = w.players.get(P0)!;
  pl.raceId = 'nagas';
  pl.draftPicks = [...picks];
  const home = castleAnchor(0, w.layout);
  const gid = asGathererId(0);
  w.gatherers.set(gid, makeGatherer({ id: gid, ownerPlayerId: P0, pos: { x: home.x, y: home.y }, spawnedAtTick: 0 }));
  w.nextGathererId = 1;
  w.freeSparks.set(asSparkId(7700), makeFreeSpark({
    id: asSparkId(7700), type: SparkType.Dot, pos: { x: SPAWNER_CENTER_X - 20, y: SPAWNER_CENTER_Y },
    velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
  }));
  return w;
}

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
const deps = (): HostTickDeps => ({
  spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)), controls: stubControls,
  botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null, hostSeats: new Map(),
} as unknown as HostTickDeps);

/* ── reading what the renderer handed to Pixi ───────────────────────────────────────────────── */

function mountRenderer(): { r: GathererRenderer; g: Graphics } {
  const parent = new Container();
  const r = new GathererRenderer({ stage: parent } as unknown as Application, parent);
  // The per-frame Graphics is the FIRST child the constructor adds (then the sprite layer, then the overlay).
  const g = parent.children[0];
  if (!(g instanceof Graphics)) throw new Error('fixture: the renderer\'s first child is its Graphics');
  return { r, g };
}

interface Stroke { points: number[]; minX: number; minY: number; maxX: number; maxY: number }

/** Every swirl stroke in this frame, as the polygon points Pixi's stroke builder will be given. */
function swirlStrokes(g: Graphics): Stroke[] {
  const out: Stroke[] = [];
  for (const ins of g.context.instructions) {
    if (ins.action !== 'stroke') continue;
    const data = ins.data as unknown as { style: { color: number }; path: { shapePath: { shapePrimitives: Array<{ shape: { points?: number[] } }> } } };
    if (data.style.color !== VORTEX_COLOR) continue;
    const points = data.path.shapePath.shapePrimitives.flatMap((p) => p.shape.points ?? []);
    const xs = points.filter((_, i) => i % 2 === 0);
    const ys = points.filter((_, i) => i % 2 === 1);
    out.push({ points, minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) });
  }
  return out;
}

function near(s: Stroke, p: { x: number; y: number }): boolean {
  const cx = (s.minX + s.maxX) / 2;
  const cy = (s.minY + s.maxY) / 2;
  return Math.hypot(cx - p.x, cy - p.y) <= SWIRL_BOX_PX;
}

/** The invariant the owner asked for, on one frame: every swirl stroke is a swirl and nothing else. */
function assertNoBeam(frame: Stroke[], ends: ReadonlyArray<{ x: number; y: number }>, label: string): void {
  for (const s of frame) {
    // A pen seated at `(undefined, undefined)` shows up as a non-finite point — the NaN half of the bug.
    expect(s.points.every(Number.isFinite), `${label}: a swirl stroke carries a non-finite point`).toBe(true);
    // A pen seated at a stale point makes the stroke as long as the distance to it — the visible line.
    expect(s.maxX - s.minX, `${label}: a swirl stroke is ${Math.round(s.maxX - s.minX)} px wide`).toBeLessThanOrEqual(SWIRL_BOX_PX);
    expect(s.maxY - s.minY, `${label}: a swirl stroke is ${Math.round(s.maxY - s.minY)} px tall`).toBeLessThanOrEqual(SWIRL_BOX_PX);
    expect(ends.some((e) => near(s, e)), `${label}: a swirl stroke is at neither end of the jump`).toBe(true);
  }
}

interface Run {
  /** Swirl strokes, per rendered frame, from the teleport frame onward. */
  frames: Stroke[][];
  atQuarry: { x: number; y: number };
  depositAt: { x: number; y: number };
  /** Every position the RENDERED gatherer was drawn at, frame by frame, across the jump. */
  path: Array<{ x: number; y: number }>;
  /** Where the host says seat 0 deposits: its castle anchor plus the deposit offset. */
  expectedDeposit: { x: number; y: number };
}

const FRAMES_AFTER = 40; // the swirl lives 36
/** Six walk steps between two 10 Hz snapshots, ~6.6 px each, rounded up. ⚠ MINE — a test tolerance. */
const LAND_SLACK_PX = 60;

/** HOST seat: the renderer reads the host world after every host tick. */
function hostRun(picks: DraftPick[] = ['racial']): Run {
  const w = board(picks);
  const d = deps();
  const st = makeHostTickState(w);
  const { r, g } = mountRenderer();
  const gid = asGathererId(0);
  return drive(() => { runHostTick(w, d, st); r.sync(w); }, () => w, g, gid, w);
}

/** CLIENT seat: 10 Hz snapshots through the real sync path, a second renderer on the client world. */
function clientRun(): Run {
  const w = board(['racial']);
  const d = deps();
  const st = makeHostTickState(w);
  const cw = makeWorld(0);
  cw.isHost = false;
  cw.gameMode = '1v1';
  cw.gameState = 'LOBBY';
  const host = new HostSync();
  const client = new ClientSync();
  const { r, g } = mountRenderer();
  const gid = asGathererId(0);
  const every = Math.round(PHYSICS_HZ / NET_SNAPSHOT_HZ);
  let tick = 0;
  return drive(() => {
    runHostTick(w, d, st);
    tick++;
    const now = (tick * 1000) / PHYSICS_HZ;
    if (tick % every === 0) client.receive(host.buildSnapshotMessage(w), now);
    client.interpolateInto(cw, now, NET_RENDER_DELAY_MS);
    r.sync(cw);
  }, () => cw, g, gid, w);
}

function drive(step: () => void, view: () => World, g: Graphics, gid: GathererId, hostWorld: World): Run {
  const home = castleAnchor(0, hostWorld.layout);
  const out: Run = {
    frames: [], atQuarry: { x: 0, y: 0 }, depositAt: { x: 0, y: 0 }, path: [],
    expectedDeposit: { x: home.x, y: home.y + GATHERER_DEPOSIT_OFFSET_Y },
  };
  let last: { x: number; y: number } | null = null;
  let jumpedAt = -1;
  for (let f = 0; f < 4000; f++) {
    step();
    const gv = view().gatherers.get(gid);
    if (gv === undefined) continue;
    const pos = { x: gv.pos.x, y: gv.pos.y };
    if (jumpedAt < 0 && last !== null && Math.hypot(pos.x - last.x, pos.y - last.y) > DEEP_CURRENT_JUMP_PX) {
      jumpedAt = f;
      out.atQuarry = last;
      out.depositAt = pos;
    }
    if (jumpedAt >= 0) {
      out.frames.push(swirlStrokes(g));
      out.path.push(pos);
      if (f - jumpedAt >= FRAMES_AFTER) break;
    } else {
      out.path = [pos];
    }
    last = pos;
  }
  return out;
}

/* ── the tests ──────────────────────────────────────────────────────────────────────────────── */

describe('fixture sanity — the swirl colour this file filters on is the renderer\'s', () => {
  it('gathererRenderer.ts still strokes the swirl in 0x3fd7ff', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'gathererRenderer.ts'), 'utf8');
    expect(src).toMatch(/const DEEP_CURRENT_VORTEX_COLOR = 0x3fd7ff;/);
  });
});

for (const [seat, run] of [['HOST', hostRun], ['CLIENT (10 Hz, real sync path)', clientRun]] as const) {
  describe(`⛔ S189 C7 — ${seat}: a teleport draws two swirls and NO segment spanning the jump`, () => {
    const r = run();

    it('REACH — the gatherer really teleported: quarry → its deposit point in ONE rendered frame', () => {
      expect(r.frames.length, 'the jump was seen and the frames after it were rendered').toBeGreaterThan(FRAMES_AFTER);
      expect(Math.hypot(r.depositAt.x - r.atQuarry.x, r.depositAt.y - r.atQuarry.y)).toBeGreaterThan(DEEP_CURRENT_JUMP_PX);
      // The host draws it ON the deposit point. A 10 Hz client first sees it one snapshot later, so it
      // may already have taken up to six walking steps back out (~6.6 px each) — never more.
      const landed = Math.hypot(r.depositAt.x - r.expectedDeposit.x, r.depositAt.y - r.expectedDeposit.y);
      expect(landed).toBeLessThanOrEqual(seat === 'HOST' ? 0 : LAND_SLACK_PX);
    });

    it('it VANISHES and APPEARS — the WHOLE hop lands in one frame, nothing slides across it', () => {
      // A lerp across the jump would split the hop into many sub-200 px steps, so this frame-to-frame
      // step would be a fraction of the distance home. It is the whole of it (less the client's slack).
      const hop = Math.hypot(r.depositAt.x - r.atQuarry.x, r.depositAt.y - r.atQuarry.y);
      const home = Math.hypot(r.expectedDeposit.x - r.atQuarry.x, r.expectedDeposit.y - r.atQuarry.y);
      expect(hop).toBeGreaterThanOrEqual(home - LAND_SLACK_PX);
    });

    it('the swirls ARE drawn, at BOTH ends, on the teleport frame', () => {
      const first = r.frames[0]!;
      expect(first.some((s) => near(s, r.atQuarry)), 'a swirl where it left').toBe(true);
      expect(first.some((s) => near(s, r.depositAt)), 'a swirl where it arrived').toBe(true);
    });

    it('⛔ and on EVERY frame of the swirl\'s life, no swirl stroke is anything but a swirl', () => {
      r.frames.forEach((frame, i) => assertNoBeam(frame, [r.atQuarry, r.depositAt], `${seat} frame +${i}`));
    });

    it('then it walks back out — the next frames move it toward the centre in walking steps', () => {
      const after = r.path.slice(1);
      for (let i = 1; i < after.length; i++) {
        const step = Math.hypot(after[i]!.x - after[i - 1]!.x, after[i]!.y - after[i - 1]!.y);
        expect(step, `frame ${i}: a walk step, not another jump`).toBeLessThan(DEEP_CURRENT_JUMP_PX);
      }
      const d0 = Math.hypot(after[0]!.x - SPAWNER_CENTER_X, after[0]!.y - SPAWNER_CENTER_Y);
      const dN = Math.hypot(after.at(-1)!.x - SPAWNER_CENTER_X, after.at(-1)!.y - SPAWNER_CENTER_Y);
      expect(dN, 'heading back to the quarry').toBeLessThan(d0);
    });
  });
}

describe('⛔ NEGATIVE — a naga seat WITHOUT the pick walks home: no jump, no swirl, nothing to strip', () => {
  it('no frame of its whole haul holds a swirl stroke', () => {
    const w = board(['hp']);
    const d = deps();
    const st = makeHostTickState(w);
    const { r, g } = mountRenderer();
    let swirls = 0;
    let banked = false;
    for (let f = 0; f < 4000 && !banked; f++) {
      runHostTick(w, d, st);
      r.sync(w);
      swirls += swirlStrokes(g).length;
      banked = !w.freeSparks.has(asSparkId(7700));
    }
    expect(banked, 'fixture: the walker got the shape home').toBe(true);
    expect(swirls).toBe(0);
  });
});
