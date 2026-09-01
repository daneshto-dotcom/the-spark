/**
 * SPARK — S158 P4 + P5: **the cutscene once per match; the Voltkin every time.**
 *
 * Owner: *"voltkin cinematic SHOULD be once per game for the first person to have built him. but the
 * voltkin spawn himself should be generated every time someone builds his tower."* S157 B4 shipped
 * the SPAWN half and deferred the cinematic half with a note that is worth repeating, because it is
 * the hazard this file is built around:
 *
 *   the cutscene overlay's own `onComplete` is the SOLE driver of `GODLY_COMPLETE` and of
 *   `pendingCinematics` advancement, so simply not playing the overlay for a repeat would leave
 *   `activeCinematicPlayerId` latched forever and every subsequent Voltkin queued behind it —
 *   strictly worse than the bug being fixed.
 *
 * So a repeat is played SILENTLY, not skipped: same duration, same completion, same queue advance,
 * same `pendingCreatureSpawn` tick — video, voice and vignette dropped. The tests below pin BOTH
 * halves, because a fix that only proved "the second one is silent" would happily ship the latch.
 *
 * P4 (CF-S157-f) rides along here because it is the same field: `applyGodlyAbort` cleared every
 * other collection and left `godlyFiredThisMatch` standing, which is latent today (S157 B4 removed
 * the gate) and would be live the moment P5 started reading it.
 */

import { describe, expect, it } from 'vitest';
import { makeWorld, dispatch, type World } from './world.ts';
import { asPlayerId } from '../types.ts';
import type { GodlyTriggerEvent } from './godlyRecipes/types.ts';

function worldWithPlayers(): World {
  const w = makeWorld(0x5158);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  w.gameState = 'PLAYING';
  return w;
}

function trigger(seat: number): GodlyTriggerEvent {
  return {
    godlyId: 'voltkin',
    triggererPlayerId: asPlayerId(seat),
    targetPos: { x: 500, y: 500 },
    targetComponentPrimitiveIds: [],
    triggerTick: 0,
  } as unknown as GodlyTriggerEvent;
}

describe('S158 P5 — cinematicIsFirstShowing: the flag that decides whether anyone SEES it', () => {
  it('⭐ the first trigger of a godly this match is a FIRST showing', () => {
    const w = worldWithPlayers();
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    expect(w.cinematicIsFirstShowing).toBe(true);
    expect(w.godlyFiredThisMatch.has('voltkin')).toBe(true);
  });

  it('⭐ a later trigger — by ANOTHER player — is NOT (the owner said "the first person")', () => {
    const w = worldWithPlayers();
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    dispatch(w, { type: 'GODLY_COMPLETE' });
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(1) }); // seat 1 this time
    expect(w.cinematicIsFirstShowing).toBe(false);
  });

  it('⛔ the SPAWN half is untouched — a repeat still activates a full cinematic slot', () => {
    // The half that must NOT regress: B4's ruling is that the Voltkin comes every time. If a repeat
    // stopped activating, this would be null and no creature would ever be scheduled.
    const w = worldWithPlayers();
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    dispatch(w, { type: 'GODLY_COMPLETE' });
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(1) });
    expect(w.activeCinematicPlayerId).toBe(asPlayerId(1));
    expect(w.currentCinematicEvent).not.toBeNull();
  });

  it('a QUEUED trigger does not consume the first showing before it plays', () => {
    // A second trigger while one is active is pushed to pendingCinematics and returns early — it
    // must not touch the flag, or the queued cinematic would inherit the wrong verdict.
    const w = worldWithPlayers();
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) }); // active
    expect(w.cinematicIsFirstShowing).toBe(true);
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(1) }); // queued
    expect(w.pendingCinematics).toHaveLength(1);
    expect(w.cinematicIsFirstShowing, 'the ACTIVE cinematic is still the first showing').toBe(true);
  });

  it('the flag travels with currentCinematicEvent — cleared on complete AND on abort', () => {
    for (const closer of ['GODLY_COMPLETE', 'GODLY_ABORT'] as const) {
      const w = worldWithPlayers();
      dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
      expect(w.cinematicIsFirstShowing).toBe(true);
      dispatch(w, { type: closer });
      expect(w.cinematicIsFirstShowing, `${closer} must clear it`).toBe(false);
      expect(w.currentCinematicEvent).toBeNull();
    }
  });

  it('a fresh match shows the cutscene again (godlyFiredThisMatch is per-match)', () => {
    const w = worldWithPlayers();
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    dispatch(w, { type: 'GODLY_COMPLETE' });
    dispatch(w, { type: 'RETURN_TO_TITLE' });
    dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
    w.gameState = 'PLAYING';
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    expect(w.cinematicIsFirstShowing).toBe(true);
  });
});

describe('S158 P4 (CF-S157-f) — abort no longer leaves the record standing', () => {
  it('⭐ GODLY_ABORT clears godlyFiredThisMatch alongside every other collection', () => {
    const w = worldWithPlayers();
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    expect(w.godlyFiredThisMatch.has('voltkin')).toBe(true);
    dispatch(w, { type: 'GODLY_ABORT' });
    // Before the fix this stayed set: applyGodlyTrigger records at cinematic START, and the abort
    // path cleared creatures, spawners, defenders, gatherers, banks and order queues — but not this.
    expect(w.godlyFiredThisMatch.has('voltkin')).toBe(false);
  });

  it('⭐ and so a cutscene interrupted by a peer-drop is not lost for the rest of the match', () => {
    // The consequence, stated as behaviour rather than as a field: the whole point of P4 is that P5
    // can read godlyFiredThisMatch safely. Without the clear above, one peer-drop mid-cutscene would
    // mean nobody ever sees the Voltkin cinematic again in that match.
    const w = worldWithPlayers();
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    dispatch(w, { type: 'GODLY_ABORT' }); // peer drop during the cutscene
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    expect(w.cinematicIsFirstShowing).toBe(true);
  });

  it('CONTROL — abort still clears everything it cleared before', () => {
    const w = worldWithPlayers();
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(0) });
    dispatch(w, { type: 'GODLY_TRIGGER', event: trigger(1) }); // queued
    dispatch(w, { type: 'GODLY_ABORT' });
    expect(w.activeCinematicPlayerId).toBeNull();
    expect(w.currentCinematicEvent).toBeNull();
    expect(w.pendingCinematics).toHaveLength(0);
    expect(w.creatures.size).toBe(0);
    expect(w.creatureSpawners.size).toBe(0);
    expect(w.defenders.size).toBe(0);
    expect(w.pendingCreatureSpawn).toBeNull();
  });
});
