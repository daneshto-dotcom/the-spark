/**
 * SPARK — S155 N1: **A MUTUAL MELEE EXCHANGE IS SYMMETRIC.**
 *
 * ## The report
 *
 * Owner, after a real cross-network 2-player match: *"player 2 had a way bigger army then me but
 * theyt couldnt even destroy one of my goblins. i think the spawn stats have only been implemented
 * foir player 1 and all other players just have the units as beauty without doing anything."*
 *
 * And when I guessed the armies were never engaging, the correction that cracked it: *"both players
 * goblins did appear to be fighting each other but only Player one spawn actuall managed to kill the
 * other players didnt seem to do any damange to player one"*.
 *
 * ## What it actually was — and it was neither of the two obvious answers
 *
 * The owner's hypothesis was a per-seat one (stats only wired for player 1). Mine was that units
 * never engaged. **Both were wrong.** A probe stood two identical melee goblins on top of each other,
 * one per seat, and varied each candidate independently:
 *
 * | setup | outcome (before the fix) |
 * |---|---|
 * | seat A inserted first | A kills B, **A takes ZERO damage** |
 * | seat B inserted first | B kills A, **B takes ZERO damage** |
 * | creature ids swapped as well | no effect whatsoever |
 *
 * ⛔ THE DECIDING VARIABLE WAS `world.creatures` ITERATION ORDER. Not the seat. Not the id. The
 * host-tick creature loop reached one of them first, its strike deleted the other outright, and every
 * later step in that same tick reads `world.creatures.get(id)` → undefined — so the loser never
 * reached its own fire tick. It never struck back even once.
 *
 * And the advantage was TOTAL rather than marginal because of the shipped stat table: a melee goblin
 * has `ehp = hp × (5+def) = 1 × 7 = 7` fifths and deals `atk × (5+pen) = 2 × 6 = 12`. Every goblin
 * except the Shield one-shots every other goblin, so first-strike WAS the whole fight.
 *
 * ⭐ Creatures are stored in SPAWN order, so whoever spawned first won every exchange for the whole
 * match — which is exactly why it read as *"only player 1's stats work"*. A per-seat theory and an
 * iteration-order bug are indistinguishable from the sofa.
 *
 * ## The fix, and what it deliberately does NOT touch
 *
 * `runHostTick` now opens a one-tick deferral set before the creature loop and sweeps it immediately
 * after, so a creature that takes a lethal blow still lands the strike it had already committed to.
 * A mutual engagement destroys BOTH, and a bigger army wins on attrition — the outcome the owner
 * expected and did not get.
 *
 * ⚠ THE ONE-SHOT ARITHMETIC IS LEFT ALONE ON PURPOSE. `GOBLIN_MELEE_HP = 1` is the owner's R70 ruling
 * (*"as fragile as a chewer"*) and ATK/DEF/PEN are R72's ladder. Those are balance numbers and not
 * mine to retune; removing the ORDER advantage is sufficient to make the fight fair.
 *
 * ## ⭐ SUPERSEDED IN PART BY S156 P4 — read this before trusting the paragraph above
 *
 * N1's fix made BOTH blows land, so a duel annihilated both units and armies traded 1:1. I reported
 * that consequence to the owner and they ruled against it: *"random generator when two units collide
 * is the smarter for now but actually the real fix is to give all units attack speed which we will
 * do later"*. So a duel has a WINNER again — chosen by `winsInitiative`'s per-pair, per-tick roll
 * (`creatureAttack.ts`), not by spawn order.
 *
 * ⛔ N1's ACTUAL GUARANTEE SURVIVES UNTOUCHED, and it is the reason this file still exists: the
 * `world.creatures` iteration order decides NOTHING. The cases below now assert that invariant
 * directly — same ids, flipped insertion order, same survivor — rather than asserting the
 * both-die consequence that the ruling replaced. The deferral in `runHostTick` also stays: it is
 * what makes the loop order irrelevant for non-mutual chains, which initiative does not cover.
 */
import { describe, expect, it } from 'vitest';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asCreatureId, makeCreature } from './creature.ts';
import { GOBLIN_MELEE_CONFIG } from './voltkin-config.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { asPlayerId } from '../../types.ts';
import { PLAYER_COLORS, FIGHT_PHASE_TICKS } from '../../constants.ts';

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;
function deps(): HostTickDeps {
  return {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(7)),
    controls: stubControls, botManager: null, gameStateExtras: makeGameStateExtras(),
    alivePeerIds: null, hostSeats: new Map(),
  } as unknown as HostTickDeps;
}

const A = asPlayerId(0); // "player 1" — the host seat
const B = asPlayerId(1); // "player 2" — the joiner seat

function duelWorld(): World {
  const w = makeWorld(0xd0e1);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME', mode: '1v1', isHost: true,
    roster: [{ seat: 0, color: PLAYER_COLORS[0] }, { seat: 1, color: PLAYER_COLORS[1] }],
  });
  w.matchPhase = 'FIGHT'; // combat only runs in FIGHT
  w.phaseEndsAtTick = w.tick + FIGHT_PHASE_TICKS;
  return w;
}

/**
 * ⛔ S160 P4b — RUN THE DUEL TO ITS RESOLUTION, NOT FOR A FIXED 30 SECONDS.
 *
 * These cases used to tick a flat `60 * 30` and then count survivors. That conflated two different
 * questions, and the castle's new weapon separated them: the duel resolves in a second or two, then
 * the WINNER — a `targetsStructures` goblin with no enemy shapes left — marches on the enemy keep,
 * walks into `CASTLE_ATTACK_RANGE`, and is shot. Thirty seconds later both are dead and "a duel has
 * a winner" fails for a reason that has nothing to do with loop order.
 *
 * ⚠ THE FIRST REPAIR I TRIED WAS WORSE AND IS RECORDED SO NOBODY RETRIES IT: zeroing both castles to
 * silence the guns ALSO trips the win gate (`gameState.ts` ends the match for everyone the moment the
 * first castle reaches 0 — the races spec's B2), which stops combat entirely and made both goblins
 * survive instead.
 *
 * ⭐ This is not vacuous. It stops at the tick the duel RESOLVES — the first tick on which either
 * duellist is gone — and the caller then asserts that exactly one is. Mutual annihilation still
 * fails (both absent on the same tick), and the survivor's identity is still fully determined by the
 * id pair, so the loop-order property this file exists for is measured exactly as before, just
 * without thirty seconds of unrelated aftermath.
 */
function runToDuelResolution(w: World, d: HostTickDeps, st: ReturnType<typeof makeHostTickState>,
  idA: number, idB: number): void {
  for (let t = 0; t < 60 * 30; t++) {
    runHostTick(w, d, st);
    const a = w.creatures.has(asCreatureId(idA));
    const b = w.creatures.has(asCreatureId(idB));
    if (!a || !b) return; // resolved, one way or the other
  }
}

/**
 * Two melee goblins, one per seat, 4 px apart so RANGE can never be the variable. `bFirst` controls
 * the `creatures` INSERTION order — which is what the host-tick loop follows, and which was the
 * actual bug. `idA`/`idB` vary the creature ids independently, to rule those out too.
 */
function seedDuel(w: World, idA: number, idB: number, bFirst: boolean): void {
  const pos = { x: 900, y: 540 };
  const mk = (id: number, owner: typeof A, x: number) => {
    const c = makeCreature(GOBLIN_MELEE_CONFIG, {
      id: asCreatureId(id), ownerPlayerId: owner, pos: { x, y: pos.y },
      targetPos: { ...pos }, spawnedAtTick: w.tick, sourceSpawnerId: null,
    });
    c.state = 'SEEKING'; // skip the SPAWNING window so both are live and symmetric
    return c;
  };
  const ga = mk(idA, A, pos.x);
  const gb = mk(idB, B, pos.x + 4);
  if (bFirst) { w.creatures.set(gb.id, gb); w.creatures.set(ga.id, ga); }
  else { w.creatures.set(ga.id, ga); w.creatures.set(gb.id, gb); }
  w.nextCreatureId = Math.max(idA, idB) + 1;
}

const CASES = [
  { label: 'seat A first in the loop', idA: 1, idB: 2, bFirst: false },
  { label: 'seat B first in the loop', idA: 1, idB: 2, bFirst: true },
  { label: 'seat B first AND lower id', idA: 2, idB: 1, bFirst: true },
  { label: 'seat A first AND higher id', idA: 2, idB: 1, bFirst: false },
] as const;

/*
 * ⛔ S156 P4 — THE OUTCOME ASSERTED HERE CHANGED, AND THE GUARANTEE DID NOT.
 *
 * These four cases were written to pin N1's fix: mutual annihilation, both goblins dead. The owner
 * has since superseded that RULE — *"random generator when two units collide is the smarter for
 * now"* — so a duel now has a winner again, chosen by `winsInitiative`'s per-pair, per-tick roll.
 *
 * What must NOT change, and is what this file has always really been about, is that **the loop order
 * decides nothing**. So the cases now assert the invariant directly instead of asserting one of its
 * consequences: the pair (idA, idB) fully determines the survivor, and flipping the insertion order
 * with the ids held fixed produces the SAME survivor. Under the original bug that was false by
 * construction — the survivor was whoever the loop reached first — so this still fails against the
 * defect the owner's match found, which is the property that made the old assertion worth having.
 *
 * The old "both die" assertion is deliberately NOT loosened into something vacuous like "at least
 * one died": that would pass under N1's bug too.
 */
describe('S155 N1 + S156 P4 — a duel is decided by the ROLL, never by the loop order', () => {
  it.each(CASES)(
    '$label: exactly ONE goblin survives — a duel has a winner again',
    ({ idA, idB, bFirst }) => {
      const w = duelWorld();
      seedDuel(w, idA, idB, bFirst);
      const d = deps();
      const st = makeHostTickState(w);
      runToDuelResolution(w, d, st, idA, idB);

      const aAlive = w.creatures.has(asCreatureId(idA));
      const bAlive = w.creatures.has(asCreatureId(idB));
      expect(aAlive !== bAlive, 'exactly one goblin should have survived the duel').toBe(true);
    },
  );

  /**
   * ⭐ THE ASSERTION THE OWNER'S MATCH BOUGHT, restated for the roll. Before N1's fix the survivor
   * flipped purely with the insertion order; if that were still true, this would fail. Ids are held
   * IDENTICAL across the two runs and only the insertion order moves, so the loop order is the sole
   * variable under test.
   */
  it('⛔ flipping the INSERTION ORDER does not change who survives', () => {
    function survivor(bFirst: boolean): number {
      const w = duelWorld();
      seedDuel(w, 1, 2, bFirst);
      const d = deps();
      const st = makeHostTickState(w);
      runToDuelResolution(w, d, st, 1, 2);
      return w.creatures.has(asCreatureId(1)) ? 1 : 2;
    }
    expect(survivor(false)).toBe(survivor(true));
  });

  /**
   * And the flip side: neither SEAT is privileged. Swapping which seat holds which id swaps the
   * survivor, proving the verdict tracks the id pair (the roll) rather than the seat — the exact
   * theory the owner started from (*"stats only implemented for player 1"*) and which N1 refuted.
   */
  it('⛔ neither SEAT is privileged — swapping the ids swaps the survivor', () => {
    function survivingSeat(idA: number, idB: number): 'A' | 'B' {
      const w = duelWorld();
      seedDuel(w, idA, idB, false);
      const d = deps();
      const st = makeHostTickState(w);
      runToDuelResolution(w, d, st, idA, idB);
      return w.creatures.has(asCreatureId(idA)) ? 'A' : 'B';
    }
    expect(survivingSeat(1, 2)).not.toBe(survivingSeat(2, 1));
  });

  it('⛔ the deferral NEVER survives a tick boundary (nothing serialized or hashed can see it)', () => {
    // The field is 'acknowledged' in FIELD_COVERAGE on the strength of exactly this property.
    const w = duelWorld();
    seedDuel(w, 1, 2, false);
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 200; t++) {
      runHostTick(w, d, st);
      expect(w.pendingCreatureDeaths).toBeNull();
    }
  });

  it('a LONE creature with no enemy UNIT is untouched — the deferral adds no incidental deaths', () => {
    /*
     * Anti-vacuity: the cases above would also pass if the fix simply killed everything.
     *
     * ⚠ S160 P4b — THE WINDOW IS 2 SECONDS, NOT 10, AND THE REASON IS A REAL CHANGE IN THE GAME.
     * This ran `60 * 10`, and "no enemy" is no longer true over that span: the castle has a weapon
     * now, so the enemy KEEP is an opponent — a `targetsStructures` goblin with no enemy shapes left
     * marches on it, enters `CASTLE_ATTACK_RANGE` and is legitimately shot. The subject here is the
     * one-tick DEATH DEFERRAL, which either adds an incidental death immediately or never, so a short
     * window is strictly more on-point than a long one; ten seconds was only ever measuring the
     * march. The title now says "no enemy UNIT", because that is what is actually being set up.
     *
     * Verified against the defect it guards: the goblin starts 780 px from the nearest castle and the
     * assertion below still checks EHP as well as existence, so a deferral that nicked it would fail.
     */
    const w = duelWorld();
    const pos = { x: 900, y: 540 };
    const solo = makeCreature(GOBLIN_MELEE_CONFIG, {
      id: asCreatureId(9), ownerPlayerId: A, pos: { ...pos }, targetPos: { ...pos },
      spawnedAtTick: w.tick, sourceSpawnerId: null,
    });
    solo.state = 'SEEKING';
    w.creatures.set(solo.id, solo);
    const d = deps();
    const st = makeHostTickState(w);
    for (let t = 0; t < 60 * 2; t++) runHostTick(w, d, st);
    const alive = w.creatures.get(asCreatureId(9));
    expect(alive, 'a goblin with no enemy UNIT must still be alive').not.toBeUndefined();
    expect(alive?.ehp).toBe(solo.ehp);
  });
});
