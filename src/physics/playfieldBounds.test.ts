/**
 * SPARK — S178: **THE PLAYFIELD EDGE.** Owner bug: creatures walked off the board.
 *
 * Owner, S178: *"My brother sent a bunch of goblins and a bunch of creatures, and they just chased
 * my creatures behind my castle. I was playing as player two. And it just chased them out of bounds,
 * like, above my castle to the east. What the shit? How does that happen?"*
 *
 * ⛔ IT HAPPENED BECAUSE THE SIM HAD NO PLAYFIELD AT ALL. `creatureVerletStep` wrote `c.pos` with no
 * bound; the only geometric confinement in the whole sim was `enforceSpawnerBounds`, a quarry-disc
 * reflector that skips everything that is not a Free spark; and `walls.ts` — the "border walls" — is
 * pure derived geometry whose single consumer is `wallRenderer`, i.e. a drawing. Meanwhile
 * `SPARK_TD_SESSION_SPECS.md` asserted TWICE that *"the same movement clamp that already keeps
 * sparks in bounds"* applied here. It did not, and never had.
 *
 * ⚠ NO SEAT-MIRRORING BUG EXISTS, which is worth pinning so a future session does not hunt one:
 * seat 1's keep anchor simply sits at x = 1800, 120 px from the 1920 edge. Seat 0 has the identical
 * exposure to the west. He played seat 2, so he saw east.
 */
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  WORLD_EDGE_MARGIN,
} from '../constants.ts';
import { CREATURE_MAX_ACCEL, clampIntoPlayfield, creatureVerletStep } from './creatureVerlet.ts';
import { standoffTargetPos } from '../state/creatures/creatureAI.ts';
import { asCreatureId } from '../state/creatures/creature.ts';
import type { Creature } from '../state/creatures/creature.ts';

const SUBSTEP_DT = 1 / PHYSICS_HZ / PHYSICS_SUBSTEPS;
const LO = WORLD_EDGE_MARGIN;
const HI_X = CANVAS_WIDTH - WORLD_EDGE_MARGIN;
const HI_Y = CANVAS_HEIGHT - WORLD_EDGE_MARGIN;

function creatureAt(x: number, y: number): Creature {
  return { pos: { x, y }, prevPos: { x, y } } as unknown as Creature;
}

describe('S178 — a creature cannot leave the board', () => {
  it('is held inside the margin however hard it is driven at an edge', () => {
    // Drive east and north at full acceleration for a full second of substeps. Before S178 this
    // walked straight off the canvas and kept going; the owner watched an army do it at 25 s.
    const c = creatureAt(HI_X - 5, LO + 5);
    for (let i = 0; i < PHYSICS_HZ * PHYSICS_SUBSTEPS; i++) {
      creatureVerletStep(c, SUBSTEP_DT, { x: CREATURE_MAX_ACCEL, y: -CREATURE_MAX_ACCEL });
    }
    expect(c.pos.x).toBeLessThanOrEqual(HI_X);
    expect(c.pos.y).toBeGreaterThanOrEqual(LO);
  });

  it('holds on all four edges, not just the one the owner happened to watch', () => {
    const drives: Array<{ from: [number, number]; accel: [number, number] }> = [
      { from: [LO + 5, 540], accel: [-CREATURE_MAX_ACCEL, 0] },      // west
      { from: [HI_X - 5, 540], accel: [CREATURE_MAX_ACCEL, 0] },     // east
      { from: [960, LO + 5], accel: [0, -CREATURE_MAX_ACCEL] },      // north
      { from: [960, HI_Y - 5], accel: [0, CREATURE_MAX_ACCEL] },     // south
    ];
    for (const d of drives) {
      const c = creatureAt(d.from[0], d.from[1]);
      for (let i = 0; i < 2000; i++) {
        creatureVerletStep(c, SUBSTEP_DT, { x: d.accel[0], y: d.accel[1] });
      }
      expect(c.pos.x, `x on drive ${d.accel.join(',')}`).toBeGreaterThanOrEqual(LO);
      expect(c.pos.x).toBeLessThanOrEqual(HI_X);
      expect(c.pos.y, `y on drive ${d.accel.join(',')}`).toBeGreaterThanOrEqual(LO);
      expect(c.pos.y).toBeLessThanOrEqual(HI_Y);
    }
  });

  /*
   * ⛔⛔ THE TRAP, AND THE ONE THAT WOULD HAVE SHIPPED AS A WORSE BUG THAN THE ORIGINAL. This is a
   * VERLET integrator: velocity is implicit in `pos − prevPos`. Clamping the position alone
   * manufactures a one-frame velocity of exactly the overshoot, pointing back inward, and the next
   * substep flings the unit across the board. `recallArmies` documents the same trap at its own
   * teleport (*"⚠ prevPos MOVES WITH pos"*).
   */
  it('⛔ moves prevPos with pos, so a clamped unit is not FLUNG back across the board', () => {
    const pos = { x: HI_X + 200, y: 540 };
    const prevPos = { x: HI_X + 199, y: 540 }; // travelling east at +1 px/substep
    clampIntoPlayfield(pos, prevPos);
    expect(pos.x).toBe(HI_X);
    // The implicit velocity must be UNCHANGED by the clamp — still +1, not −200.
    expect(pos.x - prevPos.x).toBeCloseTo(1, 12);
  });

  it('a unit pressed against the edge stays pressed, it does not bounce or drift away', () => {
    const c = creatureAt(HI_X, 540);
    const xs: number[] = [];
    for (let i = 0; i < 400; i++) {
      creatureVerletStep(c, SUBSTEP_DT, { x: CREATURE_MAX_ACCEL, y: 0 });
      xs.push(c.pos.x);
    }
    // No sample may escape, and none may be flung back inward by more than a pixel.
    for (const x of xs) expect(x).toBeLessThanOrEqual(HI_X);
    expect(Math.min(...xs)).toBeGreaterThan(HI_X - 1);
  });

  it('leaves a creature in open ground completely untouched', () => {
    const c = creatureAt(960, 540);
    const before = { x: c.pos.x, y: c.pos.y };
    creatureVerletStep(c, SUBSTEP_DT, { x: CREATURE_MAX_ACCEL, y: 0 });
    expect(c.pos.x).toBeGreaterThan(before.x); // it moved, i.e. the clamp is not a no-op wall
    expect(c.pos.y).toBeCloseTo(before.y, 12);
  });
});

describe('S178 — the standoff ring cannot point off the board', () => {
  /*
   * The kite treadmill: this is the ONLY target producer that projects a destination materially away
   * from an entity (176 px for a goblin archer), and it is anchored to a victim that keeps closing —
   * so each cadence regenerates it further out. The integrator clamp alone would leave the whole
   * clump pressed flat against an invisible wall for the rest of the FIGHT, which is broken in a
   * different way; bounding the DESTINATION lets a cornered unit slide along the edge instead.
   */
  it('never returns a point outside the playfield, from any corner or angle', () => {
    const corners = [
      { x: 10, y: 10 }, { x: CANVAS_WIDTH - 10, y: 10 },
      { x: 10, y: CANVAS_HEIGHT - 10 }, { x: CANVAS_WIDTH - 10, y: CANVAS_HEIGHT - 10 },
      { x: 1800, y: 540 }, // seat 1's keep — 120 px from the east edge, the owner's own case
    ];
    for (const target of corners) {
      for (let id = 0; id < 24; id++) {
        for (const range of [35, 220, 420]) {
          const from = { x: target.x - 30, y: target.y - 30 };
          const p = standoffTargetPos(from, target, range, asCreatureId(id));
          expect(p.x, `x for target ${target.x},${target.y} id ${id}`).toBeGreaterThanOrEqual(LO);
          expect(p.x).toBeLessThanOrEqual(HI_X);
          expect(p.y, `y for target ${target.x},${target.y} id ${id}`).toBeGreaterThanOrEqual(LO);
          expect(p.y).toBeLessThanOrEqual(HI_Y);
        }
      }
    }
  });

  it('still returns the true ring position when there is room for it', () => {
    // Mid-board, nothing to clamp: the ring must be untouched, or the clamp has changed combat.
    const target = { x: 960, y: 540 };
    const p = standoffTargetPos({ x: 900, y: 540 }, target, 220, asCreatureId(3));
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    expect(d).toBeGreaterThan(100); // a real standoff distance, not a clamped stub
  });
});
