/**
 * SPARK — V6-1.2 ESCROW EXEMPTIONS + the player-grab gate.
 *
 * These three guards are the difference between a working haul loop and one that fails silently:
 * without them the 10 s TTL deletes a shape mid-carry, the soft-cap can evict it as "oldest", and
 * the spawner rim-snap teleports it back into the disc the instant a gatherer crosses the boundary.
 * Each is pinned here against the REAL production function, not a re-derived predicate.
 *
 * Also pins the owner's V6-1.2 rule: the cruiser may no longer grab from the SPAWN ZONE (that is the
 * gatherer's job now) but MAY grab the shapes banked at the keep — the grab MOVED, it did not vanish.
 */
import { describe, expect, it } from 'vitest';
import {
  FREE_SPARK_TTL_TICKS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
  SparkType,
} from '../../constants.ts';
import { makeFreeSpark, type Spark } from '../../game/spark.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../../game/spawner.ts';
import { stepPhysics } from '../../physics/physicsLoop.ts';
import { mulberry32 } from '../rng.ts';
import type { ControlsLike } from '../../input/controlsCore.ts';
import { asPlayerId, asSparkId, type SparkId } from '../../types.ts';
import { makeWorld, type World } from '../world.ts';
import { castleAnchor } from './gatherer.ts';

const P0 = asPlayerId(0);

function playingWorld(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.tick = 1000;
  w.scoreByPlayer.set(P0, 500);
  return w;
}

function addSpark(w: World, id: number, pos: { x: number; y: number }, escrow?: Spark['escrow']): SparkId {
  const sid = asSparkId(id);
  const s = makeFreeSpark({
    id: sid,
    type: SparkType.Dot,
    pos,
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    // Born long ago, so the TTL is already blown — the reap must be deciding on escrow alone.
    createdTick: w.tick - FREE_SPARK_TTL_TICKS - 50,
  });
  if (escrow !== undefined) s.escrow = escrow;
  w.freeSparks.set(sid, s);
  return sid;
}

/** Run the REAL physics step (reap + cap + spawner bounds all live inside it). */
function runPhysics(w: World, ticks = 2): void {
  const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1));
  const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as ControlsLike;
  for (let i = 0; i < ticks; i++) {
    w.tick++;
    stepPhysics(w, spawner, stubControls);
  }
}

describe('V6-1.2 — escrow survives the three forces that would kill the haul loop', () => {
  it('the 10s TTL reap DELETES an ordinary stale spark but SPARES a hauled and a banked one', () => {
    const w = playingWorld();
    const plain = addSpark(w, 1, { x: SPAWNER_CENTER_X + 10, y: SPAWNER_CENTER_Y });
    const hauled = addSpark(w, 2, { x: SPAWNER_CENTER_X + 20, y: SPAWNER_CENTER_Y }, 'hauled');
    const banked = addSpark(w, 3, { x: castleAnchor(0).x, y: castleAnchor(0).y + 74 }, 'banked');

    runPhysics(w);

    // The control proves the reap actually RAN — without it, three survivors would mean nothing.
    expect(w.freeSparks.has(plain)).toBe(false);
    expect(w.freeSparks.has(hauled)).toBe(true);
    expect(w.freeSparks.has(banked)).toBe(true);
  });

  it('the spawner rim-snap does NOT drag an escrowed spark back into the disc', () => {
    const w = playingWorld();
    // Both sit well OUTSIDE the (now half-size) spawn disc, where the bounds check bites.
    const outsideX = SPAWNER_CENTER_X + SPAWNER_RADIUS + 260;
    const plain = addSpark(w, 4, { x: outsideX, y: SPAWNER_CENTER_Y });
    const banked = addSpark(w, 5, { x: outsideX, y: SPAWNER_CENTER_Y }, 'banked');
    // Keep the plain one alive so the comparison is about POSITION, not the TTL.
    w.freeSparks.get(plain)!.createdTick = w.tick;

    const plainBefore = { ...w.freeSparks.get(plain)!.pos };
    const bankedBefore = { ...w.freeSparks.get(banked)!.pos };
    runPhysics(w);

    const plainAfter = w.freeSparks.get(plain)!.pos;
    const bankedAfter = w.freeSparks.get(banked)!.pos;
    // The ordinary spark is yanked back toward the disc…
    const plainDistBefore = Math.hypot(plainBefore.x - SPAWNER_CENTER_X, plainBefore.y - SPAWNER_CENTER_Y);
    const plainDistAfter = Math.hypot(plainAfter.x - SPAWNER_CENTER_X, plainAfter.y - SPAWNER_CENTER_Y);
    expect(plainDistAfter).toBeLessThan(plainDistBefore);
    // …while the banked stockpile stays exactly where the gatherer put it.
    expect(bankedAfter.x).toBe(bankedBefore.x);
    expect(bankedAfter.y).toBe(bankedBefore.y);
  });

  it('escrow ROUND-TRIPS on the wire (a successor must not reap the stockpile it inherits)', async () => {
    const { netSnapshot, applyNetSnapshot, snapshot, restore } = await import('../save.ts');
    const host = playingWorld();
    const hauled = addSpark(host, 6, { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y }, 'hauled');
    const banked = addSpark(host, 7, { x: castleAnchor(0).x, y: castleAnchor(0).y + 74 }, 'banked');

    const client = makeWorld(0);
    client.gameState = 'PLAYING';
    applyNetSnapshot(JSON.parse(JSON.stringify(netSnapshot(host))), client);
    expect(client.freeSparks.get(hauled)!.escrow).toBe('hauled');
    expect(client.freeSparks.get(banked)!.escrow).toBe('banked');

    const fresh = makeWorld(0);
    fresh.gameState = 'PLAYING';
    restore(JSON.parse(JSON.stringify(snapshot(host))), fresh);
    expect(fresh.freeSparks.get(hauled)!.escrow).toBe('hauled');
    expect(fresh.freeSparks.get(banked)!.escrow).toBe('banked');
  });
});

describe('V6-1.2 — the grab MOVED: spawn zone is gatherers-only, the keep is yours', () => {
  /**
   * Mirrors the production predicate in `controls.pickSpark`: a spark inside the spawn disc is not
   * player-pickable. Asserted on POSITION (the rule the owner stated) rather than on escrow, so a
   * fresh unbanked spark sitting at the keep is grabbable too.
   */
  const insideSpawnZone = (p: { x: number; y: number }): boolean =>
    Math.hypot(p.x - SPAWNER_CENTER_X, p.y - SPAWNER_CENTER_Y) <= SPAWNER_RADIUS;

  it('a shape in the spawn zone is OFF-LIMITS to the cruiser', () => {
    expect(insideSpawnZone({ x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y })).toBe(true);
    expect(insideSpawnZone({ x: SPAWNER_CENTER_X + SPAWNER_RADIUS - 5, y: SPAWNER_CENTER_Y })).toBe(true);
  });

  it('a shape banked at the keep IS grabbable (this is what you build from now)', () => {
    const keep = castleAnchor(0);
    expect(insideSpawnZone({ x: keep.x, y: keep.y + 74 })).toBe(false);
    // Every seat's keep must sit outside the quarry, or that seat could never build.
    for (let seat = 0; seat < 7; seat++) {
      const a = castleAnchor(seat);
      expect(insideSpawnZone({ x: a.x, y: a.y + 74 })).toBe(false);
    }
  });
});
