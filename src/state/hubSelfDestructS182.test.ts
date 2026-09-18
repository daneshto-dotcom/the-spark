/**
 * SPARK — S182 (owner R182-A / R182-B): **THE HUB BLOWS UP BELOW A THIRD, ON ITS OWN STAR.**
 *
 * > *"From thirty two percent it will just get self destroyed, but it is a suicide drone building,
 * > so it makes sense. We won't do it for every building."*
 * > *"A hub welded into a big lattice can reach thirty three percent on its own bonds. The sim still
 * > considers the wider structure healthy, but we don't care about that. If its own bonds are
 * > destroyed, then he will blow up. Neighbouring shapes are protecting it then, and it's fine."*
 *
 * ⛔ DRIVEN THROUGH THE REAL HOST TICK, NOT THROUGH A STATE ASSERTION. The S139 standing lesson in
 * this directory is that setting a field and reading it back proves nothing about the game: the
 * trigger lives inside a THROTTLED revalidation poll, and a rule that is correct but never reached is
 * the exact shape of the last three defects here (`droneLifecycle.ts:153`, the unreachable Voltkin
 * destruction beat, the tower atlases nothing drew).
 */
import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { runGodlyMatcherCore } from './godlyMatcherCore.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { makeGameStateExtras } from './gameState.ts';
import { mulberry32 } from './rng.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId, type PrimitiveId } from '../types.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Controls } from '../input/controls.ts';
import { LIGHTNING_HUB_DEGREE, PRIMITIVE_MAX_HP, SparkType } from '../constants.ts';
import { structurePoolFifths } from './stats.ts';
import {
  STAR_SELFDESTRUCT_BELOW_FRAC,
  starBankedFifths,
  starHealthFrac,
  starIsBelowSelfDestruct,
  starPoolFifths,
  HUB_DEATH_RUN_TICKS,
} from './structureStarHealth.ts';

const P0 = asPlayerId(0);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(1)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function mk(w: World, type: SparkType, x: number, y: number): Primitive {
  const player = w.players.get(P0)!;
  const id = asPrimitiveId(w.nextPrimitiveId++);
  const prim: Primitive = {
    id, type, placerColor: player.color, placedBy: P0, createdTick: w.tick,
    pos: { x, y }, prevPos: { x, y }, bonds: new Set(), ownerColor: player.color,
    lastOwnershipChange: w.tick, radius: 9, hp: PRIMITIVE_MAX_HP, origin: null,
  };
  w.primitives.set(id, prim);
  return prim;
}

function bond(w: World, a: Primitive, b: Primitive): BondId {
  const bid = asBondId(w.nextBondId++);
  w.bonds.set(bid, {
    id: bid, aId: a.id, bId: b.id, a, b,
    restLength: 40, stiffnessTier: 'MID', damageFifths: 0, createdTick: w.tick,
  });
  a.bonds.add(bid);
  b.bonds.add(bid);
  return bid;
}

/** A real hub: 1 Dot of bond-degree exactly 5 + 5 Circle leaves, plus the ignition trigger. */
function worldWithHub(): { w: World; hub: Primitive; leaves: Primitive[] } {
  const w = makeWorld(0x1b2c);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.creatures.clear();
  const hub = mk(w, SparkType.Dot, 600, 400);
  const leaves: Primitive[] = [];
  for (let i = 0; i < LIGHTNING_HUB_DEGREE; i++) {
    const a = (i / LIGHTNING_HUB_DEGREE) * Math.PI * 2;
    const leaf = mk(w, SparkType.Circle, 600 + Math.cos(a) * 40, 400 + Math.sin(a) * 40);
    bond(w, hub, leaf);
    leaves.push(leaf);
  }
  // `runSpawnerIgnition` scans only on a topology change — the one thing a hand-built fixture owes.
  w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 600, y: 400 }, bondCount: 5 });
  return { w, hub, leaves };
}

/** Ignite the hub, then run `ticks` more. Returns the tick the spawner disappeared, if it did. */
function run(w: World, ticks: number): { goneAt: number | null; blasts: number } {
  const d = deps();
  const st = makeHostTickState(w);
  const cursor = { lastMatcherTick: -1 };
  let goneAt: number | null = null;
  let had = false;
  let blasts = 0;
  for (let t = 0; t < ticks; t++) {
    runGodlyMatcherCore(w, cursor);
    runHostTick(w, d, st);
    for (const e of w.effects) if (e.kind === 'BOMB_EXPLODE') blasts++;
    if (w.creatureSpawners.size > 0) had = true;
    if (had && w.creatureSpawners.size === 0 && goneAt === null) goneAt = t;
  }
  return { goneAt, blasts };
}

/** Bank `fifths` of damage across the hub's own bonds, WITHOUT going through a sever. */
function bankOnStar(w: World, hub: Primitive, fifths: number): void {
  const ids = [...hub.bonds].sort((a, b) => Number(a) - Number(b));
  let left = fifths;
  for (const id of ids) {
    if (left <= 0) break;
    const take = Math.min(left, 9);
    w.bonds.get(id)!.damageFifths += take;
    left -= take;
  }
  if (left > 0) w.bonds.get(ids[0]!)!.damageFifths += left;
}

describe('R182-B — the health is the hub\'s OWN star, not its component', () => {
  it('a five-armed hub\'s pool is 50 fifths, read from its live bond count', () => {
    const { w, hub } = worldWithHub();
    expect(starPoolFifths(w, hub.id)).toBe(structurePoolFifths(LIGHTNING_HUB_DEGREE));
    expect(starPoolFifths(w, hub.id)).toBe(50);
    expect(starHealthFrac(w, hub.id)).toBe(1);
  });

  it('⭐ damage on a NEIGHBOUR\'s connector does not touch it — "the lattice is protecting it"', () => {
    const { w, hub, leaves } = worldWithHub();
    // A friendly shape welded onto one leaf: legal since S158 B2b, and the lattice R182-B describes.
    const outsider = mk(w, SparkType.Square, 700, 400);
    const foreign = bond(w, leaves[0]!, outsider);
    w.bonds.get(foreign)!.damageFifths = 40;

    expect(starBankedFifths(w, hub.id)).toBe(0);
    expect(starHealthFrac(w, hub.id)).toBe(1);
    expect(starIsBelowSelfDestruct(w, hub.id)).toBe(false);
  });

  it('⛔ and the DIVERGENCE from the component pool is the point, not a bug', () => {
    /*
     * The same lattice, with the damage on the hub's OWN arms instead. `damageConnector` would judge
     * this against a six-connector component (pool 66) and call it healthy; R182-B judges it against
     * the hub's own five (pool 50) and detonates. Both readings are live in the codebase ON PURPOSE.
     */
    const { w, hub, leaves } = worldWithHub();
    const outsider = mk(w, SparkType.Square, 700, 400);
    bond(w, leaves[0]!, outsider);

    bankOnStar(w, hub, 34);
    expect(starBankedFifths(w, hub.id)).toBe(34);
    expect(starIsBelowSelfDestruct(w, hub.id)).toBe(true);
    // …while the wider structure, on its own arithmetic, is still above a third.
    expect(1 - 34 / structurePoolFifths(6)).toBeGreaterThan(STAR_SELFDESTRUCT_BELOW_FRAC);
  });

  it('clamps rather than reporting negative health when a lattice has over-banked its arms', () => {
    const { w, hub, leaves } = worldWithHub();
    const outsider = mk(w, SparkType.Square, 700, 400);
    bond(w, leaves[0]!, outsider);
    bankOnStar(w, hub, 60); // legal: the six-connector component's pool is 66
    expect(starHealthFrac(w, hub.id)).toBe(0);
  });

  it('a hub that is not there reads null, and null is never "detonate"', () => {
    const { w } = worldWithHub();
    const ghost = asPrimitiveId(9999) as PrimitiveId;
    expect(starHealthFrac(w, ghost)).toBeNull();
    expect(starBankedFifths(w, ghost)).toBeNull();
    expect(starIsBelowSelfDestruct(w, ghost)).toBe(false);
  });
});

describe('R182-A — through the real host tick', () => {
  it('the control: an undamaged hub ignites and is still standing', () => {
    const { w } = worldWithHub();
    const { goneAt } = run(w, 120);
    expect(goneAt).toBeNull();
    expect(w.creatureSpawners.size).toBe(1);
  });

  it('at banked 33 of 50 it HOLDS — the threshold is BELOW a third, not at it', () => {
    const { w, hub } = worldWithHub();
    run(w, 2); // ignite first, so the spawner exists to be judged
    expect(w.creatureSpawners.size).toBe(1);
    bankOnStar(w, hub, 33);
    const { goneAt } = run(w, 120);
    expect(goneAt).toBeNull();
    expect(w.creatureSpawners.size).toBe(1);
  });

  it('⭐⭐ at banked 34 it self-destructs, with its star still INTACT', () => {
    const { w, hub, leaves } = worldWithHub();
    run(w, 2);
    expect(w.creatureSpawners.size).toBe(1);
    // ⛔ THE LOAD-BEARING HALF: every arm is still attached, so the OLD trigger (recipe broken)
    // cannot fire. Anything that happens below is the new threshold and nothing else.
    expect(hub.bonds.size).toBe(LIGHTNING_HUB_DEGREE);

    bankOnStar(w, hub, 34);
    const { goneAt, blasts } = run(w, 120);
    expect(goneAt).not.toBeNull();
    expect(blasts).toBeGreaterThan(0); // the blast still fires — R182-C left exactly as it was
    // S157 P0's other ruling still holds: the hub razes its own component so no leaf survives as a
    // bond-less orphan that "stays and attracts enemy fire".
    expect(w.primitives.has(hub.id)).toBe(false);
    for (const leaf of leaves) expect(w.primitives.has(leaf.id)).toBe(false);
  });

  it('⭐⭐⭐ S182 — it SURVIVES the collapse run, then dies (the death run completes before the raze)', () => {
    /*
     * ⛔ THE DEFECT THIS CLOSES. Crossing the threshold used to blast, remove and raze in ONE tick,
     * so the eight frames of collapse existed only on a client-local ghost — invisible to a peer
     * that had reloaded and to a joiner who arrived a moment earlier. The hub is now FUSED: it stays
     * in the world for `HUB_DEATH_RUN_TICKS`, which is the same eight frames the renderer needs, so
     * every peer derives the collapse from synced `Bond.damageFifths`.
     *
     * ⚠ ASSERTED ON BOTH SIDES OF THE FUSE. "It eventually dies" alone would pass against the old
     * same-tick raze; "it is alive at tick N" alone would pass against a hub that never dies at all.
     */
    const { w, hub } = worldWithHub();
    run(w, 2);
    expect(w.creatureSpawners.size).toBe(1);
    bankOnStar(w, hub, 34);
    expect(starIsBelowSelfDestruct(w, hub.id), 'the fixture must actually be doomed').toBe(true);

    // STILL STANDING while the collapse plays — the whole point of the fuse.
    const { goneAt: goneDuringRun } = run(w, HUB_DEATH_RUN_TICKS);
    expect(goneDuringRun, 'the hub must outlive its own death run').toBeNull();
    expect(w.primitives.has(hub.id)).toBe(true);

    // …and then it goes, on the next revalidation poll after the fuse blows.
    const { goneAt, blasts } = run(w, 120);
    expect(goneAt, 'and it must still die').not.toBeNull();
    expect(blasts).toBeGreaterThan(0);
    expect(w.primitives.has(hub.id)).toBe(false);
  });

  it('⛔ the fuse DELAYS, it never rescues — a star that breaks mid-run dies at once', () => {
    // A reprieve would be a balance change nobody asked for. Breaking the star during the fuse must
    // fall straight through the ordinary recipe test.
    const { w, hub, leaves } = worldWithHub();
    run(w, 2);
    bankOnStar(w, hub, 34);
    run(w, 2); // light the fuse
    // Eat a leaf: hub.bonds drops to 4, `isStarAt` fails, the recipe test fires.
    const leaf = leaves[0]!;
    for (const bid of [...leaf.bonds]) {
      const b = w.bonds.get(bid)!;
      w.primitives.get(b.aId)?.bonds.delete(bid);
      w.primitives.get(b.bId)?.bonds.delete(bid);
      w.bonds.delete(bid);
    }
    w.primitives.delete(leaf.id);
    const { goneAt } = run(w, 40);
    expect(goneAt, 'a broken star does not get to wait out the fuse').not.toBeNull();
  });

  it('it goes within TWO revalidation windows — about a second, not a whole fight', () => {
    /*
     * ⭐ S182 — RE-PINNED FROM 30 TO 60, and the extra poll is the death fuse, not a slowdown.
     * Crossing the threshold now LIGHTS the fuse on one poll and BLOWS it on the next, so the
     * collapse has its 24 ticks to play before the raze. Measured: 57 ticks.
     *
     * ⚠ This is the balance cost of the fix, stated rather than buried: a doomed hub lives about
     * half a second longer than it did, which is at most one extra drone off its 300-tick cadence.
     */
    const { w, hub } = worldWithHub();
    run(w, 2);
    bankOnStar(w, hub, 34);
    const { goneAt } = run(w, 200);
    expect(goneAt).not.toBeNull();
    expect(goneAt!).toBeGreaterThanOrEqual(HUB_DEATH_RUN_TICKS); // the run really did get its time
    expect(goneAt!).toBeLessThanOrEqual(60); // 2 x REVALIDATE_INTERVAL_TICKS
  });

  it('⛔ NOT for every building — a laser turret at the same damage is untouched', () => {
    /*
     * *"We won't do it for every building."* The turret is the nearest neighbour to the hub — a
     * degree-6 star on the same pool arithmetic — so if the threshold ever leaks out of the hub
     * branch, it leaks here first.
     */
    const w = makeWorld(0x2c3d);
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    w.matchPhase = 'FIGHT';
    w.creatures.clear();
    const hub = mk(w, SparkType.Line, 600, 400);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bond(w, hub, mk(w, SparkType.Spiral, 600 + Math.cos(a) * 40, 400 + Math.sin(a) * 40));
    }
    w.effects.push({ kind: 'BOND_FORMED', tick: w.tick, pos: { x: 600, y: 400 }, bondCount: 6 });
    run(w, 2);

    bankOnStar(w, hub, 60); // well past a third of the turret's 66
    expect(starIsBelowSelfDestruct(w, hub.id)).toBe(true); // the READING applies to any star…
    run(w, 120);
    expect(w.primitives.has(hub.id), 'the turret must NOT self-destruct').toBe(true); // …the RULE does not
  });
});
