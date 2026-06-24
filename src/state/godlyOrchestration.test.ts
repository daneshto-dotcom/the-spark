/**
 * SPARK — S99: runGodlyMatcher trigger-on-sever tests.
 *
 * Bug: a player built a big structure then DELETED bonds down to a valid
 * Voltkin chain (4 squares → 4 triangles), but the godly never fired — the
 * matcher only ran on bond CREATION (BOND_FORMED), never on a sever. Fix:
 * runGodlyMatcher now also re-evaluates on a PLAYER-caused BOND_SEVERED (but
 * NOT bomb/creature/physics/godly severs — those must not random-fire a godly
 * in combat). These tests drive runGodlyMatcher directly (the first to do so).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { makeWorld, type World } from './world.ts';
import { SparkType } from '../constants.ts';
import type { Primitive } from '../game/primitive.ts';
import type { Bond } from '../physics/bonds.ts';
import { asBondId, asPlayerId, asPrimitiveId } from '../types.ts';
import {
  runGodlyMatcher,
  makeGodlyOrchestrationState,
  type GodlyOrchestrationCtx,
} from './godlyOrchestration.ts';
import './godlyRecipes/voltkin.ts'; // side-effect: registers VOLTKIN_RECIPE

// runGodlyMatcher only reads netTransport/debugOverlay/debugProbes in the matcher
// path (cutsceneOverlay/vignette/controls are for the cinematic fn) — so a partial
// ctx cast is safe + honest here.
function stubCtx(): GodlyOrchestrationCtx {
  return {
    netTransport: null,
    debugOverlay: null,
    debugProbes: { lastBondFormedTick: -1, bondFormedCount: 0, matcherFiredEver: false, lastMatcherTick: -1 },
  } as unknown as GodlyOrchestrationCtx;
}

const CHAIN_TYPES = [
  SparkType.Square, SparkType.Square, SparkType.Square, SparkType.Square,
  SparkType.Triangle, SparkType.Triangle, SparkType.Triangle, SparkType.Triangle,
];

// Build a CLEAN, ISOLATED linear chain SQ-SQ-SQ-SQ-TR-TR-TR-TR (endpoints degree 1,
// middles degree 2, no off-chain bonds) — exactly what the Voltkin predicate requires.
function buildValidChain(world: World, color: number): void {
  const prims: Primitive[] = CHAIN_TYPES.map((type, i) => ({
    id: asPrimitiveId(i),
    type,
    placerColor: color,
    placedBy: asPlayerId(0),
    createdTick: 0,
    pos: { x: i * 30, y: 0 },
    prevPos: { x: i * 30, y: 0 },
    bonds: new Set(),
    ownerColor: color,
    lastOwnershipChange: 0,
    radius: 8,
  }));
  for (const p of prims) world.primitives.set(p.id, p);
  for (let i = 0; i < prims.length - 1; i++) {
    const id = asBondId(100 + i);
    const a = prims[i];
    const b = prims[i + 1];
    const bond: Bond = {
      id, aId: a.id, bId: b.id,
      a: { pos: a.pos, prevPos: a.prevPos },
      b: { pos: b.pos, prevPos: b.prevPos },
      restLength: 30, stiffnessTier: 'MID', createdTick: 0,
    };
    world.bonds.set(id, bond);
    a.bonds.add(id);
    b.bonds.add(id);
  }
}

describe('S99 — runGodlyMatcher fires on player-sever (Voltkin via reduction)', () => {
  let world: World;
  let color: number;

  beforeEach(() => {
    world = makeWorld(1);
    world.isHost = true;
    world.tick = 100;
    color = world.players.get(asPlayerId(0))!.color;
    buildValidChain(world, color); // a valid chain already standing (as if reduced TO it)
  });

  it('a PLAYER-caused BOND_SEVERED re-evaluates and fires Voltkin (reduce DOWN to a valid chain)', () => {
    world.effects.push({ kind: 'BOND_SEVERED', tick: 100, pos: { x: 0, y: 0 }, cause: 'player' });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.godlyFiredThisMatch.has('voltkin')).toBe(true);
  });

  it('a BOMB-caused sever does NOT fire (no random godly during combat chaos)', () => {
    world.effects.push({ kind: 'BOND_SEVERED', tick: 100, pos: { x: 0, y: 0 }, cause: 'bomb' });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.godlyFiredThisMatch.has('voltkin')).toBe(false);
  });

  it('a CREATURE-caused sever does NOT fire either', () => {
    world.effects.push({ kind: 'BOND_SEVERED', tick: 100, pos: { x: 0, y: 0 }, cause: 'creature' });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.godlyFiredThisMatch.has('voltkin')).toBe(false);
  });

  it('still fires on BOND_FORMED (build UP — regression guard)', () => {
    world.effects.push({ kind: 'BOND_FORMED', tick: 100, pos: { x: 0, y: 0 }, bondCount: 1 });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.godlyFiredThisMatch.has('voltkin')).toBe(true);
  });

  it('does not re-fire when Voltkin already fired this match (once-per-type gate holds)', () => {
    world.godlyFiredThisMatch.add('voltkin');
    world.effects.push({ kind: 'BOND_SEVERED', tick: 100, pos: { x: 0, y: 0 }, cause: 'player' });
    runGodlyMatcher(world, makeGodlyOrchestrationState(), stubCtx());
    expect(world.activeCinematicPlayerId).toBeNull(); // gate skipped it → no new cinematic
  });
});
