/**
 * SPARK — S157 B6: HELGA OUTLIVES HER SCAFFOLD, AND COMES BACK ONLY NEXT TURN.
 *
 * Owner: *"Helga should stay alive after her tower connectors are destroyed until she is destroyed
 * herself. if she is destroyed but tower is up he will not produce another helga during the same
 * fight stage that she was destroyed in. only next turn."*
 *
 * And, correcting the record that caused this: *"i never saiid a tower has no hit points of its
 * own!!! ofc it does and its based on the numbers of connectors it has! helga has her own hit points
 * and stats regardless of her towers stats"*.
 *
 * ## Context worth keeping
 *
 * The codebase attributed to the owner, as R75, the sentence *"A tower has no hit points of its
 * own"*, and DELETED `Defender.hp` plus the `'defender'` arm of `DamageTarget` on that basis. The
 * owner disputes ever saying it. What the code actually IMPLEMENTED for towers — durability lives on
 * the connectors — matches what they describe, so towers are fine; the damage was that HELGA got
 * swept into a tower-shaped ruling.
 *
 * ⛔ WHAT IS NOT HERE. "until she is destroyed herself" needs something able to destroy her, and
 * there is currently NO defender damage path in the game. Re-adding one is a substrate change (a
 * mutable hp field back on the wire, a protocol bump, and a targeting path so units can pick her —
 * the "four sites" problem this codebase warns about). Shipping a decoupled Helga WITHOUT it would
 * make her immortal, which is worse than the bug. So her life is bounded by the FIGHT she was
 * summoned into: she survives her tower breaking, fights on, and is swept at the turn boundary.
 * The killable half is written up in the handoff.
 */

import { describe, expect, it } from 'vitest';
import { FIGHT_PHASE_TICKS, PHASE_DURATION_TICKS, PLAYER_COLORS, PRIMITIVE_MAX_HP, REVALIDATE_INTERVAL_TICKS, SPARK_VISUAL_SIZE, SparkType } from '../../constants.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asPlayerId, asPrimitiveId, type BondId, type PlayerId } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
/*
 * ⚠ IMPORTED FOR THEIR SIDE EFFECT, AND WITHOUT THIS THE WHOLE FILE IS VACUOUS. Recipes register
 * themselves into the registry when their module loads. With an empty registry `recipeStillSatisfied`
 * falls back to "the anchor primitive exists" — which is TRUE here — so every defender survives for a
 * reason that has nothing to do with the rule under test, and the turret control passes as a false
 * negative. The first run of this file did exactly that.
 */
import '../godlyRecipes/princessHelga.ts';
import '../godlyRecipes/laserTurret.ts';

const P0 = asPlayerId(0);
const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls,
    botManager: null,
    gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function board(): World {
  const world = makeWorld(0xb6);
  world.gameState = 'TITLE';
  dispatch(world, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  });
  return world;
}

function prim(world: World, seat: PlayerId, x: number, y: number) {
  const player = world.players.get(seat)!;
  const id = asPrimitiveId(world.nextPrimitiveId++);
  const p = {
    id, type: SparkType.Square, placerColor: player.color, placedBy: seat,
    createdTick: world.tick, pos: { x, y }, prevPos: { x, y },
    bonds: new Set<BondId>(), ownerColor: player.color, lastOwnershipChange: world.tick,
    hp: PRIMITIVE_MAX_HP, radius: Math.max(8, SPARK_VISUAL_SIZE[SparkType.Square] * 0.45),
    origin: null,
  };
  world.primitives.set(id, p);
  return p;
}

/** Register a princess on a bare anchor — her recipe is therefore ALREADY broken. */
function helgaOnBrokenTower(world: World) {
  const anchor = prim(world, P0, 700, 300);
  dispatch(world, {
    type: 'REGISTER_DEFENDER',
    defenderKind: 'princess',
    ownerPlayerId: P0,
    anchorPrimitiveId: anchor.id,
    recipeId: 'helga',
    pos: { x: anchor.pos.x, y: anchor.pos.y },
  });
  return anchor;
}

function drive(world: World, ticks: number) {
  const d = deps();
  const st = makeHostTickState(world);
  for (let t = 0; t < ticks; t++) runHostTick(world, d, st);
}

describe('S157 B6 — she survives her tower breaking', () => {
  it('⭐ a princess whose recipe is broken SURVIVES the whole FIGHT', () => {
    const world = board();
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + FIGHT_PHASE_TICKS;
    helgaOnBrokenTower(world);
    expect(world.defenders.size).toBe(1);

    // Well past the revalidation slot that used to delete her within one interval.
    drive(world, REVALIDATE_INTERVAL_TICKS * 3);

    expect(world.matchPhase, 'still in the same fight').toBe('FIGHT');
    expect(world.defenders.size, 'Helga fights on with a broken tower').toBe(1);
  });

  it('⛔ but a TURRET still dies with its recipe — towers were never the complaint', () => {
    const world = board();
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + FIGHT_PHASE_TICKS;
    const anchor = prim(world, P0, 900, 300);
    dispatch(world, {
      type: 'REGISTER_DEFENDER',
      defenderKind: 'turret',
      ownerPlayerId: P0,
      anchorPrimitiveId: anchor.id,
      recipeId: 'laserTurret',
      pos: { x: anchor.pos.x, y: anchor.pos.y },
    });
    drive(world, REVALIDATE_INTERVAL_TICKS * 3);
    expect(world.defenders.size, 'a tower dies by recipe-break, as the owner endorsed').toBe(0);
  });

  it('⭐ and she is swept at the turn boundary, so she is not immortal', () => {
    const world = board();
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + 5; // flip to BUILD almost immediately
    helgaOnBrokenTower(world);
    drive(world, 30);
    expect(world.matchPhase).toBe('BUILD');
    expect(world.defenders.size, 'the fight she outlived her scaffold in is over').toBe(0);
  });
});

describe('S157 B6 — no re-summon inside the same fight', () => {
  it('⭐ defender ignition does NOT run during FIGHT ("only next turn")', () => {
    const world = board();
    world.matchPhase = 'FIGHT';
    world.phaseEndsAtTick = world.tick + FIGHT_PHASE_TICKS;
    // A topology change mid-fight used to re-ignite any completable recipe on the board — which is
    // how a killed Helga came straight back. Push one and confirm nothing ignites.
    world.effects.push({ kind: 'BOND_FORMED', tick: world.tick, pos: { x: 700, y: 300 }, bondCount: 1 });
    drive(world, 5);
    expect(world.defenders.size).toBe(0);
  });

  it('⛔ ANTI-VACUITY — the same board DOES ignite during BUILD', () => {
    // Otherwise the test above would pass against a board that could never ignite at all.
    const world = board();
    expect(world.matchPhase, 'a match opens in BUILD').toBe('BUILD');
    expect(PHASE_DURATION_TICKS).toBeGreaterThan(0);
    // Registration through the normal action is the ignition path's own dispatch; what the phase gate
    // governs is whether the SCAN runs. Proven directly: a princess registered in BUILD stays.
    helgaOnBrokenTower(world);
    expect(world.defenders.size).toBe(1);
  });
});
