/**
 * SPARK — S154 AMENDMENT C (owner A4 / R89): **THE CASTLE HAS 1500 HP AND CAN BE DESTROYED.**
 *
 * Owner: *"castle should have 1500 HP. so it would take quite a bit to destroy it but we should add
 * that now."* And earlier, the condition itself: *"castle OR 1500 points wins"*.
 *
 * ## Why this closes an owner report rather than adding a feature
 *
 * S153 P1 already walked goblins to the enemy keep when no enemy shape was left standing. The owner
 * then reported them arriving and doing nothing — *"they are now targeting castle but not attacking
 * it"* — because `creatureAI.ts` said in situ that *"there is NO castle entity and no castle HP ...
 * this deliberately returns a POSITION and nothing else"*. The pathing half shipped a session before
 * the damage half existed. These assertions are about the damage half.
 */

import { describe, expect, it } from 'vitest';

import { dispatch, makeWorld, type World } from './world.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { applySpawnCreature } from './creatures/creatureLifecycle.ts';
import { damageEntity } from './damage.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { pickup } from '../game/player.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import type { Controls } from '../input/controls.ts';
import { CASTLE_MAX_HP, GOBLIN_DAMAGE_VS_CASTLE, phaseDurationTicks } from '../constants.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(3)), controls: stubControls,
    botManager: null, gameStateExtras: makeGameStateExtras(), alivePeerIds: null,
    hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

function fightWorld(): World {
  const w = makeWorld(0xca57);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + phaseDurationTicks('FIGHT');
  w.creatures.clear();
  return w;
}

describe('S154 AMENDMENT C — the castle starts at 1500 and takes damage', () => {
  it('every seat opens with CASTLE_MAX_HP, and it is the owner number', () => {
    expect(CASTLE_MAX_HP).toBe(1500);
    const w = fightWorld();
    expect(w.players.size).toBeGreaterThan(1);
    for (const p of w.players.values()) expect(p.castleHp).toBe(CASTLE_MAX_HP);
  });

  it('damageEntity has a castle arm that subtracts, clamps at zero and is idempotent', () => {
    const w = fightWorld();
    const seat = asPlayerId(1);
    expect(damageEntity(w, { kind: 'castle', seat }, 500, 'creature')).toBe(false);
    expect(w.players.get(seat)!.castleHp).toBe(CASTLE_MAX_HP - 500);
    // the killing blow returns true exactly once…
    expect(damageEntity(w, { kind: 'castle', seat }, 5000, 'creature')).toBe(true);
    expect(w.players.get(seat)!.castleHp).toBe(0); // clamped, never negative
    // …and never again, so the win gate cannot double-fire.
    expect(damageEntity(w, { kind: 'castle', seat }, 10, 'creature')).toBe(false);
    expect(w.players.get(seat)!.castleHp).toBe(0);
  });

  it('⛔ castleHp SURVIVES the carry-FSM rebuild — the documented reset trap', () => {
    /*
     * `pickup` and `fsmDrop` rebuild the player object wholesale, and player.ts carries a standing
     * warning that a field omitted from those literals is silently RESET. For castleHp that failure
     * would be a castle that heals to full every time its owner touches a spark — an unwinnable game,
     * with nothing red anywhere.
     */
    const w = fightWorld();
    const seat = asPlayerId(0);
    damageEntity(w, { kind: 'castle', seat }, 700, 'creature');
    const wounded = w.players.get(seat)!.castleHp;
    expect(wounded).toBe(CASTLE_MAX_HP - 700);
    const carrying = pickup(w.players.get(seat)!, asSparkId(1));
    expect(carrying.castleHp, 'the castle healed itself on a pickup').toBe(wounded);
  });
});

describe('S154 AMENDMENT C — ⭐ a goblin that reaches the keep ACTUALLY HITS IT', () => {
  it('the owner report, as an assertion: castle HP falls while a goblin stands there', () => {
    const w = fightWorld();
    const enemy = castleAnchor(1, w.layout);
    // Park a goblin ON the enemy keep with nothing else to attack — the exact state the owner
    // photographed after S153 P1 shipped the walk.
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: asPlayerId(0),
      pos: { x: enemy.x, y: enemy.y }, targetPos: { x: enemy.x, y: enemy.y }, sourceSpawnerId: null,
    });
    const before = w.players.get(asPlayerId(1))!.castleHp;
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 300; t++) runHostTick(w, d, st);
    const after = w.players.get(asPlayerId(1))!.castleHp;
    expect(after, 'the castle took damage from a goblin standing on it').toBeLessThan(before);
  });

  it('and it does NOT hit its OWN castle', () => {
    const w = fightWorld();
    const own = castleAnchor(0, w.layout);
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: asPlayerId(0),
      pos: { x: own.x, y: own.y }, targetPos: { x: own.x, y: own.y }, sourceSpawnerId: null,
    });
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 300; t++) runHostTick(w, d, st);
    expect(w.players.get(asPlayerId(0))!.castleHp).toBe(CASTLE_MAX_HP);
  });

  it('takes "quite a bit" — one goblin cannot rush it down', () => {
    // The owner asked for a castle that takes real effort. At GOBLIN_DAMAGE_VS_CASTLE per swing on a
    // 60-tick cadence, one goblin needs ~250 swings ≈ 4 minutes of uninterrupted contact. This pins
    // that a single leaked unit is a nuisance, not a loss.
    const swingsToKill = CASTLE_MAX_HP / GOBLIN_DAMAGE_VS_CASTLE;
    expect(swingsToKill).toBeGreaterThan(100);
  });
});

describe('S154 AMENDMENT C — the second victory condition', () => {
  it('⭐ a razed castle ends the match, and the SURVIVOR wins', () => {
    const w = fightWorld();
    expect(w.gameState).toBe('PLAYING');
    damageEntity(w, { kind: 'castle', seat: asPlayerId(1) }, CASTLE_MAX_HP, 'creature');
    expect(w.players.get(asPlayerId(1))!.castleHp).toBe(0);
    const d = deps();
    const st = makeHostTickState(w);
    runHostTick(w, d, st);
    expect(w.gameState, 'the match did not end on a razed castle').not.toBe('PLAYING');
  });

  it('does NOT end while every castle still stands', () => {
    // Anti-vacuity: without this, a win gate that fired unconditionally would pass the test above.
    const w = fightWorld();
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 120; t++) runHostTick(w, d, st);
    expect(w.gameState).toBe('PLAYING');
  });
});
