/**
 * ⛔ S189 — THE C7 DEFECT AT ITS TWO OTHER LIVE SITES: NO ARC MAY BE JOINED TO THE PREVIOUS SHAPE.
 *
 * Owner, of the DEEP CURRENT swirl (C7): *"a big line every time they teleport all over the screen …
 * without that weird like laser beam"*. The cause was a bare Pixi `arc()`: it joins the pen's current
 * position to the arc's start, and after every fill/stroke Pixi re-seats the pen wherever the previous
 * shape ended. The same bare `arc()` drew:
 *   · the KRAKEN SONAR's four body rings and its foam edge (`bossAuras.ts` `drawSonarWave`);
 *   · the NAGA fallback keep's shell crest (`raceMotifs.ts` `drawRaceKeepFallback`), where the arc
 *     is also FILLED, so the join made a filled wedge, not only a line.
 * Each now `moveTo`s its own start first.
 *
 * WHAT IS READ: a REAL Pixi `Graphics` (no renderer runs — no WebGL here) and the polygon points of
 * each stroke / fill Pixi's builders will be handed. Before each drawing a short line is stroked far
 * away (1800–1810, 1000), so there is always a "previous shape" whose end a bare arc would join —
 * as on the shared per-frame Graphics both functions draw into. Mutation-tested once for the set:
 * with the three `moveTo`s removed, both invariant tests go red — the first sonar ring had a point
 * 1272 px off its circle, and the crest's first path started at (0, 0), the stale pen the body
 * band's rect left behind. (The two REACH tests stay green then, by design: they prove the drawing
 * happens, the invariants prove it is clean.)
 */
import { describe, expect, it } from 'vitest';
import { Graphics } from 'pixi.js';
import { drawBossAuras } from './bossAuras.ts';
import { drawRaceKeepFallback } from './raceMotifs.ts';
import { makeWorld, type World } from '../state/world.ts';
import { T9_BOSS_TYPE } from '../state/t9BossIds.ts';
import { KEEP_H, KEEP_W, KRAKEN_SONAR_INTERVAL_TICKS, PRIMITIVE_MAX_HP } from '../constants.ts';
import { asCreatureId, asPlayerId } from '../types.ts';
import type { Creature } from '../state/creatures/creature.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
/** Where the pen is left before each drawing — far from both subjects. */
const PEN = { x: 1810, y: 1000 };
/** `SONAR_TINT` and `SONAR_FOAM_TINT` in bossAuras.ts (module-private, restated). */
const SONAR_COLORS = new Set([0x8fdcff, 0xffffff]);

interface Path { color: number; points: number[] }

/** A shared per-frame Graphics, with its pen parked at `PEN` by the shape drawn before. */
function penParked(): Graphics {
  const g = new Graphics();
  g.moveTo(PEN.x - 10, PEN.y).lineTo(PEN.x, PEN.y).stroke({ width: 1, color: 0x123456 });
  return g;
}

/** Every fill / stroke AFTER the parking line, as the polygon points Pixi's builders receive. */
function paths(g: Graphics): Path[] {
  return g.context.instructions.slice(1).flatMap((ins) => {
    if (ins.action !== 'fill' && ins.action !== 'stroke') return [];
    const data = ins.data as unknown as {
      style: { color: number };
      path: { shapePath: { shapePrimitives: Array<{ shape: { points?: number[] } }> } };
    };
    return data.path.shapePath.shapePrimitives
      .filter((p) => p.shape.points !== undefined)
      .map((p) => ({ color: data.style.color, points: p.shape.points! }));
  });
}

const pairs = (pts: number[]): Array<[number, number]> =>
  Array.from({ length: pts.length / 2 }, (_, i) => [pts[2 * i]!, pts[2 * i + 1]!]);

/* ── the Kraken sonar ─────────────────────────────────────────────────────────────────────────── */

function put(w: World, id: number, type: string, owner: typeof P0, x: number, y: number): void {
  const c = {
    id: asCreatureId(id), type, ownerPlayerId: owner,
    pos: { x, y }, prevPos: { x, y },
    state: 'SEEKING', ticksInState: 0, stateEnteredTick: 0, spawnTick: 0,
    despawnAtTick: 1_000_000, ehp: PRIMITIVE_MAX_HP, sourceSpawnerId: null,
    targetBondId: null, targetCreatureId: null, targetPrimitiveId: null,
  } as unknown as Creature;
  w.creatures.set(c.id, c);
}

describe('⛔ S189 — the KRAKEN SONAR: every ring is an arc about the boss, joined to nothing', () => {
  const BOSS = { x: 500, y: 500 };
  const drawn = (): Path[] => {
    const w = makeWorld(7);
    w.gameState = 'PLAYING';
    w.creatures.clear();
    const id = 3;
    put(w, id, T9_BOSS_TYPE.nagas, P0, BOSS.x, BOSS.y);
    put(w, 99, 'goblinMelee', P1, 620, 500); // a target in reach, or the sim fires no wave
    // Half-way across its visible window: front = 130 px, so all four body rings AND the foam draw.
    w.tick = KRAKEN_SONAR_INTERVAL_TICKS - (id % KRAKEN_SONAR_INTERVAL_TICKS) + 12;
    const g = penParked();
    drawBossAuras(g, w);
    return paths(g).filter((p) => SONAR_COLORS.has(p.color));
  };

  it('REACH — the wave is drawn: four body rings and the foam edge', () => {
    expect(drawn().length).toBe(5);
  });

  it('every point of every ring is finite and on ONE circle about the boss (no chord to the pen)', () => {
    for (const [i, p] of drawn().entries()) {
      const d = pairs(p.points).map(([x, y]) => Math.hypot(x - BOSS.x, y - BOSS.y));
      expect(d.every(Number.isFinite), `ring ${i}: a non-finite point (the pen seated at undefined)`).toBe(true);
      expect(Math.max(...d) - Math.min(...d), `ring ${i}: a point off its circle — joined to the previous shape`)
        .toBeLessThan(0.5);
    }
  });
});

/* ── the naga fallback keep ───────────────────────────────────────────────────────────────────── */

describe('⛔ S189 — the NAGA fallback keep: the shell crest stays on the keep', () => {
  const LEFT = 100;
  const TOP = 200;
  const drawn = (): Path[] => {
    const g = penParked();
    drawRaceKeepFallback(g, LEFT, TOP, KEEP_W, KEEP_H, 10, 0x3fd7ff, 'nagas');
    return paths(g);
  };

  it('REACH — the three scallops are drawn (each an arc, filled and stroked)', () => {
    const arcs = drawn().filter((p) => p.points.length > 8);
    expect(arcs.length).toBeGreaterThanOrEqual(3);
  });

  it('every point of every fill and stroke is finite and inside the keep (no wedge to the pen)', () => {
    // The crest rises 0.15·w above the body band, which starts 10 px below the top.
    const box = { x0: LEFT - 1, x1: LEFT + KEEP_W + 1, y0: TOP + 10 - KEEP_W * 0.15 - 1, y1: TOP + KEEP_H + 1 };
    for (const [i, p] of drawn().entries()) {
      for (const [x, y] of pairs(p.points)) {
        expect(Number.isFinite(x) && Number.isFinite(y), `path ${i}: a non-finite point`).toBe(true);
        expect(x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1,
          `path ${i}: point (${Math.round(x)}, ${Math.round(y)}) is outside the keep — joined to the pen`).toBe(true);
      }
    }
  });
});
