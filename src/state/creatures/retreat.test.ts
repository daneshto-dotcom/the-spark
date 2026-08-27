/**
 * SPARK — S154 P4 (owner A3): **ARMIES RETREAT BEFORE THE FIGHT ENDS.**
 *
 * The owner raised this twice, the second time with a screenshot of goblins standing in enemy
 * territory at BUILD 1:25: *"during buld phase your own spawn stil lstay in enemy lands! thats
 * inherently wrong - they would be killed"*, and earlier *"they should run back 2 or 3 sec before end
 * of fight and stay near their tower as if they were just built (like halfway transparent)... this is
 * the mode for all spawn armies"*.
 *
 * ## Why the walk alone is not the feature
 *
 * The whole creature fan-out is gated on `matchPhase === 'FIGHT'` (S149 P3 — creatures are dormant in
 * BUILD). The instant the phase flips they stop ticking: `state`, `ticksInState` and `targetPos`
 * freeze where they are. So a run-home window is BEST EFFORT by construction — a slow unit, or one
 * that acquired a target late, freezes mid-field and stands in enemy ground for the whole of BUILD,
 * which is the photograph, not the fix.
 *
 * `GATHERER_SHELTER_LEAD_TICKS` settled this principle already: *"THIS IS A DEADLINE, NOT A HEAD
 * START. The mechanism deliberately does NOT send gatherers walking home and hope they arrive."* The
 * difference here is that the owner asked for the walk BY NAME, so A3 ships both halves — and the
 * assertion that matters is the invariant, not the animation: **at BUILD, no creature is in enemy
 * ground.**
 */

import { describe, expect, it } from 'vitest';

import { dispatch, makeWorld, type World } from '../world.ts';
import { makeHostTickState, recallArmies, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import { applySpawnCreature } from './creatureLifecycle.ts';
import { isRetreatWindow, ownHomePos } from './creatureAI.ts';
import { castleAnchor } from '../gatherers/gatherer.ts';
import { asPlayerId } from '../../types.ts';
import type { Controls } from '../../input/controls.ts';
import { ARMY_RETREAT_LEAD_TICKS, phaseDurationTicks } from '../../constants.ts';

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

/** A 1v1 world in FIGHT with a clean creature slate. */
function fightWorld(): World {
  const w = makeWorld(0x5154);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

/** Put one goblin deep in the OTHER seat's half of the board. */
function spawnInEnemyGround(w: World, seat: 0 | 1) {
  const enemy = castleAnchor(seat === 0 ? 1 : 0, w.layout);
  applySpawnCreature(w, {
    type: 'SPAWN_CREATURE',
    creatureType: 'goblinMelee',
    ownerPlayerId: asPlayerId(seat),
    pos: { x: enemy.x, y: enemy.y },
    targetPos: { x: enemy.x, y: enemy.y },
    sourceSpawnerId: null,
  });
  return [...w.creatures.values()].find((c) => (c.ownerPlayerId as unknown as number) === seat)!;
}

const distTo = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('S154 P4 — the retreat WINDOW', () => {
  it('is closed for most of the fight and opens in the last stretch', () => {
    const w = fightWorld();
    expect(isRetreatWindow(w)).toBe(false);
    w.tick = w.phaseEndsAtTick - ARMY_RETREAT_LEAD_TICKS;
    expect(isRetreatWindow(w)).toBe(true);
  });

  it('is closed during BUILD, whatever the clock says', () => {
    const w = fightWorld();
    w.matchPhase = 'BUILD';
    w.tick = w.phaseEndsAtTick - 1;
    expect(isRetreatWindow(w)).toBe(false);
  });

  it('lasts the 2-3 seconds the owner asked for', () => {
    expect(ARMY_RETREAT_LEAD_TICKS).toBeGreaterThanOrEqual(120); // 2 s
    expect(ARMY_RETREAT_LEAD_TICKS).toBeLessThanOrEqual(180); // 3 s
  });
});

describe('S154 P4 — home is the OWN tower, else the OWN castle', () => {
  it('a starter goblin with no spawner goes to its own castle', () => {
    const w = fightWorld();
    const g = spawnInEnemyGround(w, 0);
    const home = ownHomePos(w, g)!;
    const mine = castleAnchor(0, w.layout);
    expect(home).not.toBeNull();
    expect(distTo(home, mine)).toBeLessThan(1);
  });

  it('⛔ and NEVER the ENEMY castle — the whole point of the priority', () => {
    const w = fightWorld();
    const g = spawnInEnemyGround(w, 0);
    const home = ownHomePos(w, g)!;
    expect(distTo(home, castleAnchor(1, w.layout))).toBeGreaterThan(100);
  });
});

describe('S154 P4 — ⭐ THE WALK: a goblin in enemy ground turns for home when the fight ends', () => {
  it('closes the distance to its own castle once the window opens', () => {
    const w = fightWorld();
    const g = spawnInEnemyGround(w, 0);
    const mine = castleAnchor(0, w.layout);
    const before = distTo(g.pos, mine);

    // Park the clock just inside the window, then run most of it — but stop SHORT of the flip, so
    // this measures the walk and not the snap.
    w.tick = w.phaseEndsAtTick - ARMY_RETREAT_LEAD_TICKS;
    const d = deps();
    const st = makeHostTickState(w);
    for (let i = 0; i < ARMY_RETREAT_LEAD_TICKS - 10; i++) runHostTick(w, d, st);

    const live = w.creatures.get(g.id)!;
    expect(w.matchPhase, 'still FIGHT — this is the walk, not the snap').toBe('FIGHT');
    expect(distTo(live.pos, mine), 'it moved toward home').toBeLessThan(before);
  });

  it('and does NOT walk home in the middle of the fight', () => {
    // Anti-vacuity for the test above: without this, a goblin that always walks home would pass it.
    const w = fightWorld();
    const g = spawnInEnemyGround(w, 0);
    const mine = castleAnchor(0, w.layout);
    const before = distTo(g.pos, mine);
    const d = deps();
    const st = makeHostTickState(w);
    for (let i = 0; i < 200; i++) runHostTick(w, d, st);
    const live = w.creatures.get(g.id)!;
    expect(isRetreatWindow(w)).toBe(false);
    // It is free to chase shapes/units — it just must not be homing. Allow either way, but require
    // that it has NOT closed most of the way home.
    expect(distTo(live.pos, mine)).toBeGreaterThan(before * 0.5);
  });
});

describe('S154 P4 — ⛔ THE DEADLINE: at BUILD nobody is left in enemy ground', () => {
  it('the FIGHT→BUILD edge recalls whoever is still out', () => {
    const w = fightWorld();
    const g = spawnInEnemyGround(w, 0);
    const mine = castleAnchor(0, w.layout);
    expect(distTo(g.pos, mine)).toBeGreaterThan(200); // premise: it really is far away

    // One tick across the boundary.
    w.tick = w.phaseEndsAtTick;
    const d = deps();
    const st = makeHostTickState(w);
    runHostTick(w, d, st);

    expect(w.matchPhase).toBe('BUILD');
    const live = w.creatures.get(g.id)!;
    expect(distTo(live.pos, mine), 'recalled to its own castle').toBeLessThan(2);
  });

  it('the recall moves prevPos too, or the creature is flung back out', () => {
    /*
     * ⚠ THE ONE THING THAT WOULD HAVE BEEN INVISIBLE. This is a Verlet integrator: velocity is
     * IMPLICIT in (pos - prevPos). Teleporting `pos` alone hands the creature a one-frame velocity
     * of the whole board width, and the moment FIGHT resumes it would rocket back across the map —
     * with no error, and every determinism gate green because both peers would do it identically.
     */
    const w = fightWorld();
    const g = spawnInEnemyGround(w, 0);
    recallArmies(w);
    const live = w.creatures.get(g.id)!;
    expect(distTo(live.pos, live.prevPos), 'zero implied velocity after the snap').toBeLessThan(1e-9);
  });

  it('drops every target commitment, so it does not walk straight back', () => {
    const w = fightWorld();
    const g = spawnInEnemyGround(w, 0);
    g.targetPrimitiveId = null;
    g.state = 'ATTACKING';
    g.ticksInState = 20;
    recallArmies(w);
    const live = w.creatures.get(g.id)!;
    expect(live.targetBondId).toBeNull();
    expect(live.targetCreatureId).toBeNull();
    expect(live.targetPrimitiveId).toBeNull();
    expect(live.state, 'an interrupted swing does not resume from home').toBe('SEEKING');
  });

  it('is idempotent — running it twice changes nothing', () => {
    const w = fightWorld();
    spawnInEnemyGround(w, 0);
    recallArmies(w);
    const snap = JSON.stringify([...w.creatures.values()].map((c) => [c.pos.x, c.pos.y, c.state]));
    recallArmies(w);
    expect(JSON.stringify([...w.creatures.values()].map((c) => [c.pos.x, c.pos.y, c.state]))).toBe(snap);
  });

  it('⭐ THE OWNER INVARIANT: after a full FIGHT, every creature is nearer its OWN castle', () => {
    // The screenshot, as an assertion. Two armies, both sent into each other's ground, run the whole
    // phase out, and at BUILD each one must be closer to its own keep than to the enemy's.
    const w = fightWorld();
    spawnInEnemyGround(w, 0);
    spawnInEnemyGround(w, 1);
    const d = deps();
    const st = makeHostTickState(w);
    for (let i = 0; i <= phaseDurationTicks('FIGHT') + 2; i++) runHostTick(w, d, st);

    expect(w.matchPhase).toBe('BUILD');
    expect(w.creatures.size, 'anti-vacuity: there are creatures to check').toBeGreaterThan(0);
    for (const c of w.creatures.values()) {
      const seat = c.ownerPlayerId as unknown as number;
      const own = castleAnchor(seat, w.layout);
      const foe = castleAnchor(seat === 0 ? 1 : 0, w.layout);
      expect(
        distTo(c.pos, own),
        `seat ${seat}'s creature is still nearer the enemy keep at BUILD`,
      ).toBeLessThan(distTo(c.pos, foe));
    }
  });
});
