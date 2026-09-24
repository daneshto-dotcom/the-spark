/**
 * SPARK — S189 C8 (owner playtest): **HELGA'S PATROL STAYS ON THE BOARD.**
 *
 * > *"Helga moves behind the map … I built the Helga tower near the castle, and she now moves behind
 * > when she does her little patrol … I thought that you added invisible walls around the whole map"*
 * > — owner, S189
 *
 * The walls he meant exist — `clampIntoPlayfield`, every creature, since S178 — and Helga's mirror
 * integrator (`defenderMotion.ts`) had been left out of them on the grounds that her hub leash kept
 * her off the edges. S183's patrol broke that premise: her IDLE walks to a derived point up to
 * `attackRange × PRINCESS_PATROL_RADIUS_FRAC` from her hub, in ANY direction, and seat 0's keep is 120
 * px from the left touchline. She walked off the board toward the patrol points that lay past it.
 *
 * ## What is pinned
 *   · REACH, through the real host tick: a hall stamped by the REAL reducer as close to seat 0's
 *     castle edge as the edge rule allows, ignited by the REAL matcher, patrolled for ten legs —
 *     every sampled position AND every destination inside the bounds creatures are held to, and she
 *     demonstrably reaches the margin (so the clamp was exercised, not merely present).
 *   · the arithmetic of the point clamp;
 *   · the integrator half: walked at an off-board target she is held at the margin with `prevPos`
 *     moved alongside (pressed, never flung);
 *   · negative: a hall in open ground patrols exactly as before — nothing clamps, she still roams.
 *   ⭐ MUTATION-TESTED: dropping the patrol-point clamp turns the REACH case red (an off-board
 *   destination); dropping the integrator clamp turns the integrator case red.
 */
import { describe, expect, it } from 'vitest';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PLAYER_COLORS,
  PRINCESS_HOME_EPSILON,
  PRINCESS_PATROL_LEG_TICKS,
  WORLD_EDGE_MARGIN,
} from '../../constants.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { asDefenderId, asPlayerId, type Vec2 } from '../../types.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from '../hostTick.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../../game/spawner.ts';
import { mulberry32 } from '../rng.ts';
import { makeGameStateExtras } from '../gameState.ts';
import type { Controls } from '../../input/controls.ts';
import { applyBuildBlueprint } from '../blueprintBuild.ts';
import { stampRefusalAt } from '../blueprintLegality.ts';
import { runGodlyMatcherCore } from '../godlyMatcherCore.ts';
import { blueprintBill } from '../blueprints.ts';
import { makeCastleBank } from '../castleBank.ts';
import { zoneCastleAnchor } from '../zones.ts';
import { clampPointIntoPlayfield, stepDefenderWalk } from './defenderMotion.ts';
import { getDefenderConfig, makeDefender, type Defender } from './defender.ts';
// ⚠ SIDE-EFFECT IMPORT, REQUIRED — the recipe registers itself; without it nothing ignites and the
// REACH case would pass on an empty board.
import './../godlyRecipes/princessHelga.ts';

const P0 = asPlayerId(0);
const LO = WORLD_EDGE_MARGIN;
const HI_X = CANVAS_WIDTH - WORLD_EDGE_MARGIN;
const HI_Y = CANVAS_HEIGHT - WORLD_EDGE_MARGIN;
const onBoard = (p: Vec2): boolean => p.x >= LO && p.x <= HI_X && p.y >= LO && p.y <= HI_Y;

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

function twoSeatInBuild(): World {
  const w = makeWorld(0xc8);
  w.gameState = 'TITLE';
  dispatch(w, {
    type: 'START_GAME',
    mode: '1v1',
    isHost: true,
    roster: [
      { seat: 0, color: PLAYER_COLORS[0] },
      { seat: 1, color: PLAYER_COLORS[1] },
    ],
  } as never);
  w.gameState = 'PLAYING';
  w.isHost = true;
  w.matchPhase = 'BUILD';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  w.creatures.clear();
  return w;
}

/** Stamp + ignite a Helga hall for seat 0 at `at` through the production reducer and matcher. */
function buildHelga(w: World, at: Vec2): Defender {
  const bank = makeCastleBank();
  for (const [type, count] of blueprintBill('helga')) bank[type as number] = (bank[type as number] ?? 0) + count;
  w.castleBanks.set(P0, bank);
  applyBuildBlueprint(w, { type: 'BUILD_BLUEPRINT', playerId: P0, blueprintId: 'helga', centre: at } as never);
  w.tick += 1;
  runGodlyMatcherCore(w, { lastMatcherTick: 0 });
  const helga = [...w.defenders.values()].find((d) => d.kind === 'princess');
  if (helga === undefined) throw new Error(`fixture: no Helga ignited at ${at.x},${at.y}`);
  return helga;
}

/** The legal Helga site nearest the LEFT touchline, beside seat 0's keep. */
function edgeSiteBesideCastle(w: World): Vec2 {
  const castle = zoneCastleAnchor(0, w.layout);
  let best: Vec2 | null = null;
  for (let x = 0; x <= 400; x += 4) {
    for (let y = castle.y - 300; y <= castle.y + 300; y += 4) {
      if (stampRefusalAt(w, { x, y }, P0, 'helga') !== null) continue;
      if (
        best === null ||
        x < best.x ||
        (x === best.x && Math.abs(y - castle.y) < Math.abs(best.y - castle.y))
      ) {
        best = { x, y };
      }
    }
    if (best !== null) break; // the first legal column is the one nearest the edge
  }
  if (best === null) throw new Error('fixture: no legal Helga site beside the castle');
  return best;
}

interface PatrolLog {
  readonly positionsOffBoard: number;
  readonly destinationsOffBoard: number;
  readonly minX: number;
  readonly distinctSpots: number;
  readonly samples: number;
}

function patrol(w: World, helgaId: Defender['id'], legs: number): PatrolLog {
  w.matchPhase = 'FIGHT';
  w.phaseEndsAtTick = w.tick + 1_000_000;
  const d = deps();
  const s = makeHostTickState(w);
  let positionsOffBoard = 0;
  let destinationsOffBoard = 0;
  let minX = Infinity;
  let samples = 0;
  const spots = new Set<string>();
  for (let t = 0; t < legs * PRINCESS_PATROL_LEG_TICKS; t++) {
    runHostTick(w, d, s);
    const h = w.defenders.get(helgaId);
    if (h === undefined) throw new Error('fixture: Helga was removed mid-patrol');
    samples += 1;
    if (!onBoard(h.pos)) positionsOffBoard += 1;
    if (h.walkTargetPos !== null && !onBoard(h.walkTargetPos)) destinationsOffBoard += 1;
    if (h.pos.x < minX) minX = h.pos.x;
    if (t % PRINCESS_PATROL_LEG_TICKS === PRINCESS_PATROL_LEG_TICKS - 1) {
      spots.add(`${Math.round(h.pos.x)},${Math.round(h.pos.y)}`);
    }
  }
  return { positionsOffBoard, destinationsOffBoard, minX, distinctSpots: spots.size, samples };
}

// ─────────────────────────────────────────────────────────────────────────────
describe('S189 C8 — Helga patrols ON the board', () => {
  it('⭐⭐ HIS BOARD, THROUGH THE REAL HOST TICK: a hall at the castle edge, ten legs, never off the board', () => {
    const w = twoSeatInBuild();
    const site = edgeSiteBesideCastle(w);
    const helga = buildHelga(w, site);
    // Sanity, or this proves nothing: her patrol disc really does cross the touchline from here.
    const disc = getDefenderConfig('princess').attackRange * 0.35;
    const hubX = w.primitives.get(helga.anchorPrimitiveId)!.pos.x;
    expect(hubX - disc).toBeLessThan(LO);

    const log = patrol(w, helga.id, 10);
    expect(log.samples).toBe(10 * PRINCESS_PATROL_LEG_TICKS);
    expect(log.positionsOffBoard).toBe(0);
    // ⛔ And she is never WALKING somewhere she cannot reach — the destination is on the board too.
    expect(log.destinationsOffBoard).toBe(0);
    // ⭐ REACHED, not merely present: at least one leg took her to the margin itself.
    expect(log.minX).toBeLessThanOrEqual(LO + PRINCESS_HOME_EPSILON);
    // She still roams between spots — the clamp moves a destination, it does not pin her.
    expect(log.distinctSpots).toBeGreaterThan(1);
  });

  it('the arithmetic: a point is held to the same box every creature is held to', () => {
    expect(clampPointIntoPlayfield({ x: -70, y: 540 })).toEqual({ x: LO, y: 540 });
    expect(clampPointIntoPlayfield({ x: 2000, y: 1200 })).toEqual({ x: HI_X, y: HI_Y });
    expect(clampPointIntoPlayfield({ x: 900, y: -5 })).toEqual({ x: 900, y: LO });
    // On the board it is the identity — the byte-identity every existing patrol relies on.
    expect(clampPointIntoPlayfield({ x: 600.25, y: 480.5 })).toEqual({ x: 600.25, y: 480.5 });
  });

  it('the integrator half: walked at an off-board target she is PRESSED at the margin, never flung', () => {
    const d = makeDefender({
      id: asDefenderId(1),
      kind: 'princess',
      ownerPlayerId: P0,
      anchorPrimitiveId: 1 as never,
      recipeId: 'helga',
      pos: { x: 60, y: 540 },
      registeredAtTick: 0,
    });
    const cfg = getDefenderConfig('princess');
    for (let t = 0; t < 120; t++) {
      stepDefenderWalk(d, { x: -500, y: 540 }, cfg.moveAccel, 50);
      expect(d.pos.x).toBeGreaterThanOrEqual(LO);
      // `prevPos` moved WITH `pos`: the implicit velocity never points back inward.
      expect(d.pos.x - d.prevPos.x).toBeLessThanOrEqual(0);
    }
    expect(d.pos.x).toBe(LO);
  });

  it('negative — a hall in open ground patrols exactly as before: nothing clamps, she still roams', () => {
    const w = twoSeatInBuild();
    const castle = zoneCastleAnchor(0, w.layout);
    let site: Vec2 | null = null;
    for (let x = castle.x + 300; x <= castle.x + 600 && site === null; x += 10) {
      if (stampRefusalAt(w, { x, y: castle.y }, P0, 'helga') === null) site = { x, y: castle.y };
    }
    expect(site).not.toBeNull();
    const helga = buildHelga(w, site!);
    const log = patrol(w, helga.id, 6);
    expect(log.positionsOffBoard).toBe(0);
    expect(log.minX).toBeGreaterThan(LO + 50); // never near an edge: the clamp was a no-op here
    expect(log.distinctSpots).toBeGreaterThan(1);
  });
});
