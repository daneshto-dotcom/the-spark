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
import { asPlayerId, asSparkId, asSpawnerId } from '../types.ts';
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
  /**
   * ⚠ S160 P4b — THIS IS AN ARMY NOW, AND THE CHANGE IS THE POINT RATHER THAN AN ACCOMMODATION.
   *
   * The keep has a weapon (`state/castleGuns.ts`). Measured through the real host tick: **one goblin
   * parked on an enemy keep now deals ZERO damage and dies** — the castle's first shot lands before
   * its first swing. Five goblins land their first hit at tick 61 and take it to 1284; ten reach
   * 474; **fifteen bring it down at tick 1342.**
   *
   * So the owner's report is still covered — a goblin that reaches the keep DOES hit it — but the
   * subject of the sentence is now an army, which is exactly what `GOBLIN_DAMAGE_VS_CASTLE`'s own
   * docblock always claimed the design wanted (*"the castle falls to a SUSTAINED ARMY, not to one
   * leaked unit"*). Before the gun that was a statement about arithmetic being slow; now it is a
   * statement about the mechanic. The lone-goblin case is asserted directly below, so the new
   * behaviour is pinned rather than merely accommodated.
   *
   * ⛔ `sourceSpawnerId` must be DISTINCT per goblin: `applySpawnCreature` silently drops a second
   * creature with the same `(owner, type)` when it is `null` (the races spec's B1), so a `null`
   * army is secretly one unit — which is how the first cut of this repair "passed" at n=20.
   */
  it('the owner report, as an assertion: castle HP falls while an ARMY stands there', () => {
    const w = fightWorld();
    const enemy = castleAnchor(1, w.layout);
    // Park five goblins ON the enemy keep with nothing else to attack — the state the owner
    // photographed after S153 P1 shipped the walk.
    for (let i = 0; i < 5; i++) {
      applySpawnCreature(w, {
        type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: asPlayerId(0),
        pos: { x: enemy.x + i * 3, y: enemy.y }, targetPos: { x: enemy.x, y: enemy.y },
        sourceSpawnerId: asSpawnerId(i + 1),
      });
    }
    const before = w.players.get(asPlayerId(1))!.castleHp;
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 300; t++) runHostTick(w, d, st);
    const after = w.players.get(asPlayerId(1))!.castleHp;
    expect(after, 'the castle took damage from goblins standing on it').toBeLessThan(before);
  });

  it('⛔ S160 P4b — and a LONE goblin now deals NOTHING: the keep kills it first', () => {
    // The other half of the same change, pinned so it cannot regress into "one leaker grinds a
    // castle down over four minutes" — which is what the arithmetic allowed before the gun existed.
    const w = fightWorld();
    const enemy = castleAnchor(1, w.layout);
    applySpawnCreature(w, {
      type: 'SPAWN_CREATURE', creatureType: 'goblinMelee', ownerPlayerId: asPlayerId(0),
      pos: { x: enemy.x, y: enemy.y }, targetPos: { x: enemy.x, y: enemy.y }, sourceSpawnerId: null,
    });
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 600; t++) runHostTick(w, d, st);
    expect(
      w.players.get(asPlayerId(1))!.castleHp,
      'a single leaked unit cannot scratch a defended keep',
    ).toBe(CASTLE_MAX_HP);
    expect(w.creatures.size, 'and it was shot down').toBe(0);
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

/**
 * SPARK — S164 P3: **`damageEntity` WAS A WORKING HEAL VECTOR FOR THE CASTLE, AND ONLY THE CASTLE.**
 *
 * An A.0 audit found the castle arm returned ABOVE the integer/non-negative guard, so the one target
 * whose HP ends the match was the one target that could not be validated. `damageEntity(world,
 * {kind:'castle'}, -300)` computed `Math.max(0, hp + 300)` — unvalidated, unclamped, no upper bound.
 *
 * The harm was not theoretical. `save.ts` emits `castleHp` only when BELOW max and rehydrates an
 * absent value as `CASTLE_MAX_HP`, so an over-max value would be emitted as nothing and read by
 * every peer as 1500 — a silent divergence on the match-ending number, invisible to both hash
 * oracles because `stateHashFull` marks `players:'acknowledged'`.
 */
describe('S164 P3 — damageEntity is damage-only, castle included', () => {
  it('⛔ a NEGATIVE amount THROWS for a castle, where it used to silently heal', () => {
    const w = fightWorld();
    const seat = asPlayerId(1);
    const before = w.players.get(seat)!.castleHp;
    expect(() => damageEntity(w, { kind: 'castle', seat }, -300, 'creature')).toThrow(
      /non-negative INTEGER/,
    );
    expect(w.players.get(seat)!.castleHp, 'and nothing was healed on the way out').toBe(before);
  });

  it('⛔ a FRACTIONAL amount throws for a castle too — the guard now covers every target', () => {
    const w = fightWorld();
    const seat = asPlayerId(1);
    expect(() => damageEntity(w, { kind: 'castle', seat }, 2.5, 'creature')).toThrow(
      /non-negative INTEGER/,
    );
  });

  it('⭐ ANTI-VACUITY — ordinary positive integer damage still works exactly as before', () => {
    const w = fightWorld();
    const seat = asPlayerId(1);
    const before = w.players.get(seat)!.castleHp;
    expect(damageEntity(w, { kind: 'castle', seat }, 10, 'creature')).toBe(false);
    expect(w.players.get(seat)!.castleHp).toBe(before - 10);
  });

  it('a zero amount is still a no-op, not a throw', () => {
    const w = fightWorld();
    const seat = asPlayerId(1);
    const before = w.players.get(seat)!.castleHp;
    expect(damageEntity(w, { kind: 'castle', seat }, 0, 'creature')).toBe(false);
    expect(w.players.get(seat)!.castleHp).toBe(before);
  });
});
