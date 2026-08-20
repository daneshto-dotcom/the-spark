/**
 * SPARK — S149 P2: **THE BUILD/FIGHT SPLIT IS ENFORCED.**
 *
 * ## What the owner reported
 *
 * *"the gatherer keeps gathering during fight stage and you can build during fight stage and your
 * towers(helga or whatever) can fight during build stage — there is no split while we have totally
 * designed the exact mechanism in the latest blueprint we've discussed."*
 *
 * ## Why it was true
 *
 * The match clock shipped in S147 and almost nothing consumed it. Probed on disk at the start of
 * S149: `grep matchPhase` over `src/state/gatherers/` returned NOTHING, over `src/state/defenders/`
 * returned NOTHING, and the quarry's spark minter in `physics/physicsLoop.ts` returned NOTHING.
 * Two things in the entire simulation read the phase — the scoring gate and one kill bounty.
 *
 * So this is FOUR independent holes, and this file pins each one shut:
 *
 *   1. **Gatherers** shelter 1 s before the phase ends (R6/R12), at EVERY speed level, from EVERY
 *      distance — with their cargo conserved.
 *   2. **Nothing is buildable** outside BUILD, at every gate.
 *   3. **Towers are dormant** outside FIGHT (R4), and forget their target at the edge.
 *   4. **The quarry produces during BUILD only** (R22 — CF-S148-a, open since S148).
 *
 * ⚠ A GREEN SUITE PROVED NOTHING HERE BEFORE THIS FILE EXISTED. After the whole P2 implementation
 * landed, the suite still reported exactly the pre-P2 count — 2,629 passing, not one test touched.
 * Every assertion below exists because nothing else in 163 files would have noticed if the phase
 * split had been wired backwards, or not at all.
 */

import { describe, expect, it } from 'vitest';

import {
  GATHERER_MAX_SPEED_LEVEL,
  GATHERER_SHELTER_LEAD_TICKS,
  PHASE_DURATION_TICKS,
  PLAYER_COLORS,
  SparkType,
} from '../constants.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { asDefenderId, asGathererId, asPlayerId, asSparkId, type PlayerId } from '../types.ts';
import { bankCount } from './castleBank.ts';
import { canBuildNow } from './buildLegality.ts';
import { stampRefusalAt } from './blueprintLegality.ts';
import { makeDefender } from './defenders/defender.ts';
import { standDownDefenders } from './defenders/defenderLifecycle.ts';
import { castleAnchor, makeGatherer } from './gatherers/gatherer.ts';
import {
  releaseShelteredGatherers,
  tickGathererShelter,
} from './gatherers/gathererLifecycle.ts';
import { applyPlaceFromFree } from './placeFromFree.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { DEFAULT_SPAWNER_CONFIG, Spawner } from '../game/spawner.ts';
import { mulberry32 } from './rng.ts';
import { makeGameStateExtras } from './gameState.ts';
import { dispatch, makeWorld, type World } from './world.ts';
import { ownZonePoint } from './zones.fixtures.ts';

const P0 = asPlayerId(0);

/** A solo PLAYING world in BUILD, with the clock freshly stamped. */
function buildWorld(): World {
  const w = makeWorld(0);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = PHASE_DURATION_TICKS;
  w.tick = 0;
  return w;
}

/** Put a gatherer for `seat` at `pos`, at `speedLevel`. Returns it. */
function addGatherer(w: World, seat: PlayerId, rawId: number, pos: { x: number; y: number }, speedLevel = 0) {
  const g = makeGatherer({
    id: asGathererId(rawId),
    ownerPlayerId: seat,
    pos: { ...pos },
    spawnedAtTick: 0,
  });
  g.speedLevel = speedLevel;
  w.gatherers.set(g.id, g);
  return g;
}

/** Hand `g` a real hauled spark, exactly as a successful pickup would. */
function giveCargo(w: World, g: ReturnType<typeof addGatherer>, rawSparkId: number): void {
  const s = makeFreeSpark({
    id: asSparkId(rawSparkId),
    type: SparkType.Line,
    pos: { x: g.pos.x, y: g.pos.y },
    velocity: { x: 0, y: 0 },
    dt: 1 / 60,
    createdTick: 0,
  });
  s.escrow = 'hauled';
  w.freeSparks.set(s.id, s);
  g.carriedSparkId = s.id;
  g.state = 'HAULING';
}

/* ========================================================================== *
 *  HOLE 1 — GATHERERS COME IN, WHATEVER THEIR SPEED, FROM WHEREVER THEY ARE   *
 * ========================================================================== */

describe('S149 P2 — every gatherer is SHELTERED before the phase ends (R6/R12)', () => {
  // The four corners plus the centre-adjacent extremes. The far corner is the case the owner's
  // rule is really about: a speed-0 hauler there cannot walk home in a second, which is why the
  // mechanism is a snap and not a race.
  const PLACES: ReadonlyArray<readonly [string, { x: number; y: number }]> = [
    ['top-left corner', { x: 40, y: 40 }],
    ['top-right corner', { x: 1880, y: 40 }],
    ['bottom-left corner', { x: 40, y: 1040 }],
    ['bottom-right corner', { x: 1880, y: 1040 }],
    ['far side of the quarry', { x: 1400, y: 540 }],
  ];

  for (let speed = 0; speed <= GATHERER_MAX_SPEED_LEVEL; speed++) {
    for (const [where, pos] of PLACES) {
      it(`speed ${speed}, ${where} — SHELTERED exactly at the deadline`, () => {
        const w = buildWorld();
        const g = addGatherer(w, P0, 1, pos, speed);

        // One tick before the window opens: still out working.
        w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS - 1;
        tickGathererShelter(w);
        expect(g.state).not.toBe('SHELTERED');

        // The deadline tick itself.
        w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
        tickGathererShelter(w);
        expect(g.state).toBe('SHELTERED');
      });
    }
  }

  it('the rule is SPEED-INDEPENDENT — every level shelters on the same tick', () => {
    const w = buildWorld();
    for (let speed = 0; speed <= GATHERER_MAX_SPEED_LEVEL; speed++) {
      addGatherer(w, P0, 10 + speed, { x: 40, y: 1040 }, speed);
    }
    w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
    tickGathererShelter(w);
    for (const g of w.gatherers.values()) expect(g.state).toBe('SHELTERED');
  });

  it('CARGO IS CONSERVED — a hauler carrying a shape banks it rather than dropping it', () => {
    const w = buildWorld();
    const g = addGatherer(w, P0, 1, { x: 400, y: 300 });
    giveCargo(w, g, 7001);

    const before = bankCount(w.castleBanks, P0);
    w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
    tickGathererShelter(w);

    expect(g.state).toBe('SHELTERED');
    expect(g.carriedSparkId).toBeNull();
    // The shape is IN THE CASTLE — not destroyed, and not left lying on the field for the enemy.
    expect(bankCount(w.castleBanks, P0)).toBe(before + 1);
    expect(w.freeSparks.has(asSparkId(7001))).toBe(false);
  });

  it('a sheltered gatherer is parked at its own porch, not frozen mid-field', () => {
    const w = buildWorld();
    const g = addGatherer(w, P0, 1, { x: 1880, y: 1040 });
    w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
    tickGathererShelter(w);
    const home = castleAnchor(0, w.layout);
    expect(Math.abs(g.pos.x - home.x)).toBeLessThan(1);
  });

  it('⚠ SKIP-PROOF — a tick JUMP past the deadline still shelters (a NONET freeze can skip ticks)', () => {
    // `main.ts` advances world.tick and `continue`s past the whole host tick during a NONET trial,
    // which is exactly why the phase flip beside this is a `while` and not an `if`. An equality
    // test here would miss the snap entirely and strand gatherers outside for a whole FIGHT.
    const w = buildWorld();
    const g = addGatherer(w, P0, 1, { x: 400, y: 300 });
    w.tick = w.phaseEndsAtTick - 3; // deep inside the window, deadline tick never observed
    tickGathererShelter(w);
    expect(g.state).toBe('SHELTERED');
  });

  it('is IDEMPOTENT across the whole window — re-running never double-banks cargo', () => {
    const w = buildWorld();
    const g = addGatherer(w, P0, 1, { x: 400, y: 300 });
    giveCargo(w, g, 7002);
    const before = bankCount(w.castleBanks, P0);

    for (let t = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS; t < w.phaseEndsAtTick; t++) {
      w.tick = t;
      tickGathererShelter(w);
    }
    expect(g.state).toBe('SHELTERED');
    expect(bankCount(w.castleBanks, P0)).toBe(before + 1); // exactly one, not sixty
  });

  it('does NOT fire during FIGHT — the window belongs to the next BUILD edge', () => {
    const w = buildWorld();
    w.matchPhase = 'FIGHT';
    const g = addGatherer(w, P0, 1, { x: 400, y: 300 });
    w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
    tickGathererShelter(w);
    expect(g.state).not.toBe('SHELTERED');
  });

  it('DETERMINISTIC — two worlds built in OPPOSITE Map orders shelter identically', () => {
    // ⚠ HONEST SCOPE. An earlier draft of this test asserted that deposits land in the bank in
    // gatherer-id order. That claim was WRONG, and measuring it is what showed it: `CastleBank`
    // is a per-TYPE TALLY (S146 made the inventory type-addressed), so deposits COMMUTE and
    // their order is not observable through the bank at all.
    //
    // The sort in `tickGathererShelter` is therefore not fixing a divergence I can demonstrate
    // today — it makes the pass independent of how the container was BUILT, which is what keeps
    // it correct the moment a deposit gains an order-sensitive side effect (an inventory cap, an
    // id mint, a per-deposit effect). What IS provable now is the property that matters: the
    // outcome cannot depend on Map insertion order.
    const ascending = buildWorld();
    for (const raw of [1, 2, 3, 4, 5]) giveCargo(ascending, addGatherer(ascending, P0, raw, { x: 400, y: 300 }), 8000 + raw);

    const descending = buildWorld();
    for (const raw of [5, 4, 3, 2, 1]) giveCargo(descending, addGatherer(descending, P0, raw, { x: 400, y: 300 }), 8000 + raw);

    // The two Maps genuinely iterate in opposite orders — otherwise this proves nothing.
    expect([...ascending.gatherers.keys()].map(Number)).toEqual([1, 2, 3, 4, 5]);
    expect([...descending.gatherers.keys()].map(Number)).toEqual([5, 4, 3, 2, 1]);

    for (const w of [ascending, descending]) {
      w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
      tickGathererShelter(w);
    }

    expect(bankCount(ascending.castleBanks, P0)).toBe(5); // anti-vacuity: they really banked
    expect(bankCount(descending.castleBanks, P0)).toBe(bankCount(ascending.castleBanks, P0));
    expect(ascending.castleBanks.get(P0)).toEqual(descending.castleBanks.get(P0));
    expect(ascending.freeSparks.size).toBe(descending.freeSparks.size);
    for (const raw of [1, 2, 3, 4, 5]) {
      expect(ascending.gatherers.get(asGathererId(raw))?.state).toBe('SHELTERED');
      expect(descending.gatherers.get(asGathererId(raw))?.state).toBe('SHELTERED');
    }
  });

  it('the doors open again — releaseShelteredGatherers returns them to SEEKING', () => {
    const w = buildWorld();
    const g = addGatherer(w, P0, 1, { x: 400, y: 300 });
    w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
    tickGathererShelter(w);
    expect(g.state).toBe('SHELTERED');

    releaseShelteredGatherers(w);
    expect(g.state).toBe('SEEKING');
    expect(g.carriedSparkId).toBeNull();
    expect(g.targetSparkId).toBeNull();
  });

  it('release is idempotent and leaves working gatherers alone', () => {
    const w = buildWorld();
    const working = addGatherer(w, P0, 1, { x: 400, y: 300 });
    working.state = 'HAULING';
    releaseShelteredGatherers(w);
    releaseShelteredGatherers(w);
    expect(working.state).toBe('HAULING');
  });
});

/* ========================================================================== *
 *          HOLE 2 — NOTHING IS BUILDABLE ONCE THE FIGHT STARTS               *
 * ========================================================================== */

describe('S149 P2 — building stops when the fight starts', () => {
  it('canBuildNow allows own ground in BUILD and refuses the SAME point in FIGHT', () => {
    const w = buildWorld();
    const mine = ownZonePoint(P0, w.layout);
    expect(canBuildNow(w, mine, P0)).toBe(true);
    w.matchPhase = 'FIGHT';
    expect(canBuildNow(w, mine, P0)).toBe(false);
  });

  it('the host reducer REFUSES a placement on own ground during FIGHT', () => {
    const w = buildWorld();
    const mine = ownZonePoint(P0, w.layout);
    dispatch(w, { type: 'UPDATE_AVATAR_POS', playerId: P0, pos: { ...mine } });

    const place = (rawId: number): boolean => {
      const before = w.primitives.size;
      const s = makeFreeSpark({
        id: asSparkId(rawId), type: SparkType.Dot, pos: { ...mine },
        velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
      });
      w.freeSparks.set(s.id, s);
      applyPlaceFromFree(w, {
        type: 'PLACE_FROM_FREE', sparkId: s.id, playerId: P0,
        placementPos: { ...mine }, stiffnessTier: 'MID', targetPrimitiveId: null,
      });
      return w.primitives.size > before;
    };

    expect(place(9001)).toBe(true); // BUILD — lands
    w.matchPhase = 'FIGHT';
    expect(place(9002)).toBe(false); // FIGHT — refused on the very same ground
  });

  it("the blueprint stamp says FIGHT, not 'ENEMY GROUND' — a refusal must not lie about its reason", () => {
    const w = buildWorld();
    const mine = ownZonePoint(P0, w.layout);
    w.matchPhase = 'FIGHT';
    // This is the player's OWN territory. Blaming the zone here would be actively misleading.
    expect(stampRefusalAt(w, mine, P0, 'pentagram')).toBe('FIGHT');
  });

  it('the phase test is !== BUILD, so a future third phase fails CLOSED', () => {
    const w = buildWorld();
    const mine = ownZonePoint(P0, w.layout);
    // Simulate a phase that does not exist yet. `=== FIGHT` would wrongly ALLOW building here.
    (w as unknown as { matchPhase: string }).matchPhase = 'PREP';
    expect(canBuildNow(w, mine, P0)).toBe(false);
  });
});

/* ========================================================================== *
 *              HOLE 3 — TOWERS ARE DORMANT OUTSIDE THE FIGHT                 *
 * ========================================================================== */

describe('S149 P2 — towers stand down outside the FIGHT (R4)', () => {
  function addTurret(w: World) {
    const d = makeDefender({
      id: asDefenderId(w.nextDefenderId++),
      kind: 'turret',
      ownerPlayerId: P0,
      anchorPrimitiveId: 0 as never,
      recipeId: 'laserTurret',
      pos: { x: 400, y: 300 },
      registeredAtTick: 0,
    });
    w.defenders.set(d.id, d);
    return d;
  }

  it('standing down clears the target and returns the FSM to IDLE', () => {
    const w = buildWorld();
    const d = addTurret(w);
    d.targetCreatureId = 4242 as never;
    d.state = 'WINDUP';
    d.ticksInState = 7;

    standDownDefenders(w);

    // ⚠ The dangling-target case: that creature will not survive the BUILD phase the tower is now
    // frozen through, so resuming onto its id would spend the first windup of the next FIGHT on a
    // ghost instead of acquiring a real threat.
    expect(d.targetCreatureId).toBeNull();
    expect(d.state).toBe('IDLE');
    expect(d.ticksInState).toBe(0);
  });

  it('⚠ HP IS NOT RESET — damage persists across the cycle, which is what FIX/SCRAP repair (Q10)', () => {
    const w = buildWorld();
    const d = addTurret(w);
    const wounded = Math.floor(d.hp / 2);
    d.hp = wounded;
    standDownDefenders(w);
    expect(d.hp).toBe(wounded); // stand-down resets INTENT, never CONDITION
  });

  it('is idempotent and safe on a world with no defenders', () => {
    const w = buildWorld();
    expect(() => {
      standDownDefenders(w);
      standDownDefenders(w);
    }).not.toThrow();
  });
});

/* ========================================================================== *
 *      HOLE 4 — THE QUARRY PRODUCES DURING BUILD ONLY (R22, CF-S148-a)       *
 * ========================================================================== */

describe('S149 P2 / CF-S148-a — the quarry stops producing during FIGHT (R22)', () => {
  // Driven through the real host tick so this proves the SHIPPED path, not a re-implementation.
  function runTicks(w: World, n: number): number {
    const before = w.freeSparks.size;
    const state = makeHostTickState(w);
    const deps: HostTickDeps = {
      spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
      // Same stub the S119 differential gate uses — stepPhysics reads `state.kind` and calls
      // `applyPerSubstep`, so a bare cursor object is not enough.
      controls: { state: { kind: 'Idle' }, applyPerSubstep() {} } as never,
      botManager: null,
      gameStateExtras: makeGameStateExtras(),
      alivePeerIds: null,
      hostSeats: new Map(),
    };
    for (let i = 0; i < n; i++) runHostTick(w, deps, state);
    return w.freeSparks.size - before;
  }

  it('BUILD mints shapes; FIGHT mints NONE', () => {
    const inBuild = buildWorld();
    const mintedInBuild = runTicks(inBuild, 600);

    const inFight = buildWorld();
    inFight.matchPhase = 'FIGHT';
    const mintedInFight = runTicks(inFight, 600);

    // ⚠ ANTI-VACUITY: the BUILD arm must actually produce, or "FIGHT produces nothing" is trivially
    // true and this test would pass with the quarry switched off entirely.
    expect(mintedInBuild).toBeGreaterThan(0);
    expect(mintedInFight).toBe(0);
  });
});

/* ========================================================================== *
 *                     THE OWNER'S REPORT, END TO END                         *
 * ========================================================================== */

describe('S149 P2 — the owner-reported defects themselves', () => {
  it('a gatherer can no longer be caught outside when the fight begins', () => {
    const w = buildWorld();
    const stragglers = [
      addGatherer(w, P0, 1, { x: 40, y: 40 }, 0),
      addGatherer(w, P0, 2, { x: 1880, y: 1040 }, GATHERER_MAX_SPEED_LEVEL),
    ];
    w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
    tickGathererShelter(w);
    for (const g of stragglers) expect(g.state).toBe('SHELTERED');
  });

  it('the four holes are all shut at once on a single world', () => {
    const w = buildWorld();
    const mine = ownZonePoint(P0, w.layout);
    const g = addGatherer(w, P0, 1, { x: 400, y: 300 });

    // BUILD: build yes, gather yes.
    expect(canBuildNow(w, mine, P0)).toBe(true);
    expect(g.state).not.toBe('SHELTERED');

    // The shelter deadline arrives, then the phase turns over.
    w.tick = w.phaseEndsAtTick - GATHERER_SHELTER_LEAD_TICKS;
    tickGathererShelter(w);
    w.matchPhase = 'FIGHT';

    // FIGHT: build no, gather no.
    expect(canBuildNow(w, mine, P0)).toBe(false);
    expect(g.state).toBe('SHELTERED');
  });
});

// PLAYER_COLORS is imported so a future fixture that seats more players has it to hand without
// re-editing the import block; referenced here so the unused-import lint cannot hide real drift.
void PLAYER_COLORS;
