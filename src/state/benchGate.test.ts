/**
 * SPARK — S86 P3 central bench gate tests.
 *
 * Three contracts under lock:
 *   1. COMPLETENESS — BENCH_INTENT_POLICY mirrors CLIENT_INTENT_TYPES exactly
 *      (both directions). Adding a client intent without an explicit bench
 *      policy decision fails here — the Grok S86 R1 "verb drift" defense.
 *   2. GATE SEMANTICS — dispatch() rejects 'deny' intents from a benched
 *      actor (raceRejects + rejectReasons.actorBenched, state untouched),
 *      while 'allow' intents (pointer telemetry, release-only drops) pass,
 *      and the gate self-heals at bench expiry (strict tick compare).
 *   3. RESET — both match-boundary resets clear the two buckets the prior
 *      reset lists missed (pickupPoopedTooFar was leaking since S84).
 */

import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, SparkType } from '../constants.ts';
import { makeIdlePlayer } from '../game/player.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { CLIENT_INTENT_TYPES } from '../net/protocol.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { BENCH_INTENT_POLICY, isBenchDeniedIntent } from './benchGate.ts';
import { applyReturnToTitle, applyStartGame } from './gameMode.ts';
import { dispatch, makeWorld, type World } from './world.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const S0 = asSparkId(0);

/** 1v1 world with a Free spark at (600, 400) and P1 seated nearby. */
function worldWithSpark(): World {
  const w = makeWorld(0);
  w.gameMode = '1v1';
  w.gameState = 'PLAYING';
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1], { x: 1000, y: 500 }));
  w.scoreByPlayer.set(P1, 0);
  w.freeSparks.set(
    S0,
    makeFreeSpark({
      id: S0,
      type: SparkType.Dot,
      pos: { x: 600, y: 400 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    }),
  );
  return w;
}

describe('BENCH_INTENT_POLICY completeness (Grok S86 verb-drift defense)', () => {
  it('covers EVERY client intent — and nothing else', () => {
    const policyKeys = new Set(Object.keys(BENCH_INTENT_POLICY));
    expect(policyKeys).toEqual(new Set(CLIENT_INTENT_TYPES));
  });

  it('denies the acquisitive/structural/offensive verbs, allows telemetry + drops', () => {
    expect(isBenchDeniedIntent('PICKUP_SPARK')).toBe(true);
    expect(isBenchDeniedIntent('PLACE_FROM_FREE')).toBe(true);
    expect(isBenchDeniedIntent('SEVER_BOND')).toBe(true);
    expect(isBenchDeniedIntent('TRIGGER_BOMB')).toBe(true);
    expect(isBenchDeniedIntent('UPDATE_AVATAR_POS')).toBe(false);
    expect(isBenchDeniedIntent('DROP_SPARK')).toBe(false);
    expect(isBenchDeniedIntent('DROP_POTATO')).toBe(false);
  });

  it('does not govern host-internal actions (only the client-intent surface)', () => {
    expect(isBenchDeniedIntent('HUNTER_CATCH')).toBe(false);
    expect(isBenchDeniedIntent('SPAWN_SPARK')).toBe(false);
    expect(isBenchDeniedIntent('WIN_TRIGGER')).toBe(false);
  });
});

describe('dispatch-entry bench gate', () => {
  it('benched PICKUP_SPARK is rejected: spark stays Free, actorBenched + raceRejects increment', () => {
    const w = worldWithSpark();
    w.tick = 100;
    w.players.get(P0)!.benchedUntilTick = 500;
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: S0, playerId: P0, pos: { x: 600, y: 400 } });
    expect(w.freeSparks.get(S0)!.state.kind).toBe('Free');
    expect(w.players.get(P0)!.kind).toBe('Idle');
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(1);
    expect(w.diagnostics.raceRejects).toBe(1);
  });

  it('benched PLACE_FROM_FREE is rejected before any case body (no primitive minted)', () => {
    const w = worldWithSpark();
    w.tick = 100;
    w.players.get(P0)!.benchedUntilTick = 500;
    dispatch(w, {
      type: 'PLACE_FROM_FREE',
      sparkId: S0,
      playerId: P0,
      placementPos: { x: 600, y: 400 },
      stiffnessTier: 'rigid',
      targetPrimitiveId: null,
      mergeCandidateIds: [],
      extraBondTargetIds: [],
    });
    expect(w.primitives.size).toBe(0);
    expect(w.freeSparks.get(S0)!.state.kind).toBe('Free');
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(1);
  });

  it('benched UPDATE_AVATAR_POS still applies (pointer telemetry stays fresh for un-bench)', () => {
    const w = worldWithSpark();
    w.tick = 100;
    w.players.get(P0)!.benchedUntilTick = 500;
    dispatch(w, { type: 'UPDATE_AVATAR_POS', playerId: P0, pos: { x: 222, y: 333 } });
    expect(w.players.get(P0)!.avatarPos).toEqual({ x: 222, y: 333 });
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(0);
  });

  it('benched DROP_SPARK still applies (release-only verbs stay open)', () => {
    const w = worldWithSpark();
    w.tick = 50;
    // Claim while healthy, THEN get benched mid-carry.
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: S0, playerId: P0, pos: { x: 600, y: 400 } });
    expect(w.players.get(P0)!.kind).toBe('Carrying');
    w.players.get(P0)!.benchedUntilTick = 500;
    dispatch(w, { type: 'DROP_SPARK', playerId: P0, pos: { x: 600, y: 400 } });
    expect(w.players.get(P0)!.kind).toBe('Idle');
    expect(w.freeSparks.get(S0)!.state.kind).toBe('Free');
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(0);
  });

  it('self-heals at expiry: benchedUntilTick === tick no longer gates (strict compare)', () => {
    const w = worldWithSpark();
    w.tick = 500;
    w.players.get(P0)!.benchedUntilTick = 500; // expired exactly
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: S0, playerId: P0, pos: { x: 600, y: 400 } });
    expect(w.freeSparks.get(S0)!.state.kind).toBe('Carried');
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(0);
  });

  it("only the BENCHED actor is gated — the other seat's intents flow", () => {
    const w = worldWithSpark();
    w.tick = 100;
    w.players.get(P1)!.benchedUntilTick = 500; // P1 eaten; P0 healthy
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: S0, playerId: P0, pos: { x: 600, y: 400 } });
    expect(w.freeSparks.get(S0)!.state.kind).toBe('Carried');
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(0);
  });
});

describe('match-boundary diagnostic resets (S86 — the buckets prior lists missed)', () => {
  it('START_GAME clears actorBenched AND pickupPoopedTooFar', () => {
    const w = worldWithSpark();
    w.diagnostics.rejectReasons.actorBenched = 7;
    w.diagnostics.rejectReasons.pickupPoopedTooFar = 3;
    applyStartGame(w, { type: 'START_GAME' });
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(0);
    expect(w.diagnostics.rejectReasons.pickupPoopedTooFar).toBe(0);
  });

  it('RETURN_TO_TITLE clears actorBenched AND pickupPoopedTooFar', () => {
    const w = worldWithSpark();
    w.diagnostics.rejectReasons.actorBenched = 7;
    w.diagnostics.rejectReasons.pickupPoopedTooFar = 3;
    applyReturnToTitle(w, { type: 'RETURN_TO_TITLE' });
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(0);
    expect(w.diagnostics.rejectReasons.pickupPoopedTooFar).toBe(0);
  });
});
