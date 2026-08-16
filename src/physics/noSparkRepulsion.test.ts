/**
 * SPARK — S146 P1 REGRESSION GUARD: loose sparks must never shove each other again.
 *
 * This file REPLACES `collision.pile.test.ts`, which locked the invariants of the pass that the
 * owner has now ruled out. Verbatim: *"the primitives push each other off like an antimagnet which
 * becomes a mess after there are too many of them in spawn zone or outside... when you click to drag
 * one it pushes the other out of the way... now that we have gatherers there is no use for that
 * anymore."*
 *
 * ⚠ WHY A BEHAVIOURAL TEST AND NOT A `grep` FOR THE DELETED MODULE. Deleting `collision.ts` is not
 * the property worth locking — someone can reintroduce a separation force inline in the substep loop,
 * in `enforceSpawnerBounds`, or as a "gentle declump" in a renderer-adjacent tick and the file-level
 * absence would still hold. What must stay true is that TWO OVERLAPPING FREE SPARKS DO NOT PUSH
 * APART, so that is what is asserted, through the real `stepPhysics` entry point.
 *
 * The distinction that makes this test meaningful: `verletStepAll` still integrates, so positions are
 * not required to be frozen. The assertion is on the SEPARATION between the pair — a repulsion pass
 * necessarily increases it toward `a.radius + b.radius`, and nothing else in the tick has any reason
 * to.
 */

import { describe, expect, it } from 'vitest';
import { PHYSICS_HZ, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SparkType } from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { mulberry32 } from '../state/rng.ts';
import { dispatch, makeWorld } from '../state/world.ts';
import { asSparkId } from '../types.ts';
import { stepPhysics } from './physicsLoop.ts';
import type { ControlsLike } from '../input/controlsCore.ts';

const stubControls = {
  state: { kind: 'Idle' },
  applyPerSubstep() {},
} as unknown as ControlsLike;

/** A spawner that never spawns, so the only bodies in the world are the ones the test placed. */
function quietSpawner(): Spawner {
  return new Spawner({ ...DEFAULT_SPAWNER_CONFIG, ratePerSecond: 0 }, mulberry32(0x5146_0001));
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

describe('S146 P1 — no spark↔spark repulsion', () => {
  it('two heavily overlapping free sparks do NOT push apart over a second of sim', () => {
    const world = makeWorld(0x5146);
    // Deliberately NOT an exact stack: the old `resolvePair` early-returned under EPSILON, so an
    // exact overlap was inert and would pass even with the repulsion still in. A small offset is
    // precisely the case that used to produce a near-maximal correction (the "fling").
    const a = makeFreeSpark({
      id: asSparkId(9001),
      type: SparkType.Square,
      pos: { x: SPAWNER_CENTER_X + 300, y: SPAWNER_CENTER_Y + 300 },
      velocity: { x: 0, y: 0 },
      dt: 1 / PHYSICS_HZ,
      createdTick: 0,
    });
    const b = makeFreeSpark({
      id: asSparkId(9002),
      type: SparkType.Circle,
      pos: { x: SPAWNER_CENTER_X + 300 + 0.75, y: SPAWNER_CENTER_Y + 300 },
      velocity: { x: 0, y: 0 },
      dt: 1 / PHYSICS_HZ,
      createdTick: 0,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: a });
    dispatch(world, { type: 'SPAWN_SPARK', spark: b });

    const minDist = a.radius + b.radius;
    const before = dist(a.pos, b.pos);
    expect(before, 'precondition: the pair starts deeply overlapped').toBeLessThan(minDist);

    const spawner = quietSpawner();
    for (let t = 0; t < PHYSICS_HZ; t++) stepPhysics(world, spawner, stubControls);

    const after = dist(a.pos, b.pos);
    // The old pass drove separation to exactly `minDist` within a handful of substeps. Allow a
    // hair of Verlet drift, but nothing resembling a separation force.
    expect(after, 'sparks were pushed apart — a repulsion pass has been reintroduced').toBeLessThan(
      minDist * 0.5,
    );
  });

  it('a dense pile stays a pile — no shape is ejected', () => {
    const world = makeWorld(0x5147);
    const origin = { x: SPAWNER_CENTER_X + 250, y: SPAWNER_CENTER_Y + 250 };
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) {
      const s = makeFreeSpark({
        id: asSparkId(9100 + i),
        type: SparkType.Triangle,
        // A tight jitter, all well inside one another's radii.
        pos: { x: origin.x + (i % 4) * 0.6, y: origin.y + Math.floor(i / 4) * 0.6 },
        velocity: { x: 0, y: 0 },
        dt: 1 / PHYSICS_HZ,
        createdTick: 0,
      });
      dispatch(world, { type: 'SPAWN_SPARK', spark: s });
      ids.push(9100 + i);
    }

    // ⚠ MEASURE PAIRWISE SPREAD, NOT ABSOLUTE POSITION. `enforceSpawnerBounds` legitimately
    // translates loose sparks (rim-snapping them back toward the spawn disc), and it moves the
    // whole cluster TOGETHER. An absolute-distance-from-origin assertion therefore fails for a
    // reason that has nothing to do with repulsion — which is exactly what it did on first run.
    // Mutual separation is the property under test: only a repulsion pass inflates it.
    const spreadOf = (): number => {
      let max = 0;
      for (const i of ids) {
        for (const j of ids) {
          const si = world.freeSparks.get(asSparkId(i));
          const sj = world.freeSparks.get(asSparkId(j));
          if (si === undefined || sj === undefined) continue;
          const d = dist(si.pos, sj.pos);
          if (d > max) max = d;
        }
      }
      return max;
    };

    const spreadBefore = spreadOf();
    const spawner = quietSpawner();
    for (let t = 0; t < PHYSICS_HZ; t++) stepPhysics(world, spawner, stubControls);
    const spreadAfter = spreadOf();

    // Under the old 8-iterations-per-substep pass this cluster blew out to a hex-packed disc,
    // i.e. a spread on the order of several times `radius`. Nothing may inflate it now.
    expect(
      spreadAfter,
      `the pile spread from ${spreadBefore.toFixed(2)} to ${spreadAfter.toFixed(2)} — repulsion is back`,
    ).toBeLessThan(spreadBefore + 1);
  });
});
