/**
 * SPARK — entry point.
 * Sessions 1+2: Verlet physics + spawner + carry-1 + first bond.
 *
 * Frame loop (§ 10.6):
 *   accumulate dt → fixed-step physics ticks at 60 Hz → render
 *   per physics tick:
 *     dispatch SPAWN_SPARK for each spawn this tick
 *     for substep in 0..8:
 *       controls.applyPerSubstep   (attract force / cursor lock)
 *       verletStepAll
 *       solveBonds
 *       enforceBounds              (only for Free sparks)
 *       resolveCollisions
 */

import { Application, Text, TextStyle } from 'pixi.js';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FREE_SPARK_SOFT_CAP,
  PHYSICS_HZ,
  PHYSICS_SUBSTEPS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SPAWNER_RADIUS,
} from './constants.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG, enforceSpawnerBounds } from './game/spawner.ts';
import {
  snapshotInvariants,
  verifyInvariants,
  type InvariantSnapshot,
} from './game/invariants.ts';
import { Controls } from './input/controls.ts';
import { resolveCollisions } from './physics/collision.ts';
import { solveBonds, type Bond } from './physics/bonds.ts';
import { SpatialGrid } from './physics/spatial.ts';
import { verletStepAll } from './physics/verlet.ts';
import { AvatarRenderer } from './render/avatarRenderer.ts';
import { EffectsRenderer } from './render/effectsRenderer.ts';
import { SparkRenderer, makeLegend, makeSpawnerRing } from './render/renderer.ts';
import { StatsOverlay } from './render/statsOverlay.ts';
import { StructureRenderer } from './render/structureRenderer.ts';
import { HUD } from './render/ui.ts';
import { mulberry32 } from './state/rng.ts';
import { dispatch, makeWorld } from './state/world.ts';
import { makeGameStateExtras, softReset, tickGameState } from './state/gameState.ts';
import { saveToLocalStorage } from './state/save.ts';
import { asPlayerId } from './types.ts';
import type { Spark } from './game/spark.ts';

const PHYSICS_DT = 1 / PHYSICS_HZ;
const SUBSTEP_DT = PHYSICS_DT / PHYSICS_SUBSTEPS;
const SPATIAL_CELL_SIZE = 32;
const P1 = asPlayerId(0);

async function bootstrap(): Promise<void> {
  const app = new Application();
  await app.init({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: 0x000000,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  const root = document.getElementById('app');
  if (!root) throw new Error('No #app element in DOM');
  root.appendChild(app.canvas);

  app.stage.addChild(makeSpawnerRing(SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SPAWNER_RADIUS));
  app.stage.addChild(makeLegend(app));

  const SEED = 0xc0ffee;
  const world = makeWorld(SEED);
  const rng = mulberry32(SEED);
  const spawner = new Spawner(DEFAULT_SPAWNER_CONFIG, rng);
  const gameStateExtras = makeGameStateExtras();
  const controls = new Controls(app, world, P1);
  const sparkRenderer = new SparkRenderer(app);
  const structureRenderer = new StructureRenderer(app);
  const effectsRenderer = new EffectsRenderer(app);
  const avatarRenderer = new AvatarRenderer(app, P1);
  const hud = new HUD(app);
  const stats = new StatsOverlay(app);
  const grid = new SpatialGrid(SPATIAL_CELL_SIZE);

  const hint = new Text({
    text: 'LMB drag spark out of zone → carry · RMB drag onto a primitive → bond · ~ stats · C cinematics',
    style: new TextStyle({ fontFamily: 'monospace', fontSize: 11, fill: 0x444444 }),
  });
  hint.position.set(10, CANVAS_HEIGHT - 22);
  app.stage.addChild(hint);

  if (import.meta.env.DEV) {
    (globalThis as { __SPARK__?: unknown }).__SPARK__ = {
      get world() { return world; },
      get controls() { return controls; },
      app,
    };
  }

  let lastGameState = world.gameState;
  const resetIfPostgame = (): void => {
    if (world.gameState === 'POSTGAME') {
      softReset(world, gameStateExtras);
    }
  };
  app.canvas.addEventListener('click', resetIfPostgame);
  window.addEventListener('keydown', (e) => {
    // 'R' or 'r' resets in POSTGAME — keyboard alternative to clicking.
    if ((e.key === 'r' || e.key === 'R') && world.gameState === 'POSTGAME') {
      resetIfPostgame();
    }
    // S10 P5: 'C' toggles structure cinematics (STRUCTURE_GROW, STRUCTURE_MERGE,
    // SCORE_TIER). Bond-level effects (BOND_COMMIT pop, SEVER_ERASE fade)
    // remain on — those are core combat feedback, not "cinematics."
    if (e.key === 'c' || e.key === 'C') {
      world.cinematicsEnabled = !world.cinematicsEnabled;
    }
  });

  // Invariant snapshot — compared post-tick in DEV to catch immobility /
  // NaN / color-inheritance violations the tick they happen.
  let invariantSnap: InvariantSnapshot = snapshotInvariants(world.primitives);
  let lastViolationLogTick = -Infinity;

  let physicsAccumulator = 0;

  app.ticker.add((tickerObj) => {
    const dtSec = Math.min(tickerObj.deltaMS / 1000, 0.05);
    physicsAccumulator += dtSec;

    const physStart = performance.now();
    while (physicsAccumulator >= PHYSICS_DT) {
      if (world.gameState === 'PLAYING') {
        stepPhysics(world, spawner, grid, controls);
      } else {
        world.tick++;
      }
      tickGameState(world, gameStateExtras, P1);
      if (import.meta.env.DEV) {
        const violations = verifyInvariants(world.primitives, world.freeSparks, invariantSnap);
        // Throttle the log so a stuck violation doesn't spam the console
        // every tick — once per second is enough to investigate.
        if (violations.length > 0 && world.tick - lastViolationLogTick > 60) {
          console.error('[SPARK] invariant violation tick=' + world.tick, violations);
          lastViolationLogTick = world.tick;
        }
        invariantSnap = snapshotInvariants(world.primitives);
      }
      // Snapshot to localStorage exactly once on entering POSTGAME.
      if (world.gameState === 'POSTGAME' && lastGameState !== 'POSTGAME') {
        saveToLocalStorage(world);
      }
      lastGameState = world.gameState;
      physicsAccumulator -= PHYSICS_DT;
    }
    stats.recordPhysics(performance.now() - physStart);

    const renderStart = performance.now();
    const freeSparkArr = freeSparkArray(world.freeSparks);
    sparkRenderer.sync(freeSparkArr);
    structureRenderer.sync(world, controls.state);
    effectsRenderer.sync(world);
    avatarRenderer.sync(world, controls);
    hud.sync(world);
    stats.recordWorld(world, effectsRenderer.activeCount);
    stats.recordFrame(world.freeSparks.size + world.primitives.size);
    stats.recordRender(performance.now() - renderStart);
  });
}

function stepPhysics(
  world: Parameters<typeof dispatch>[0],
  spawner: Spawner,
  grid: SpatialGrid,
  controls: Controls,
): void {
  // SPAWN — dispatched as actions for the audit log seam (§ 10.2).
  const spawned: Spark[] = [];
  spawner.tick(PHYSICS_DT, world.tick, spawned);
  for (const s of spawned) dispatch(world, { type: 'SPAWN_SPARK', spark: s });

  enforceFreeSparkCap(world);

  // Energy passive accrual for each player.
  for (const player of world.players.values()) {
    dispatch(world, { type: 'TICK_ENERGY', playerId: player.id, deltaSec: PHYSICS_DT });
  }

  // Snapshot list once per tick — Map iteration overhead is real.
  const sparkArr = freeSparkArray(world.freeSparks);
  let bondArr: Bond[] = Array.from(world.bonds.values());

  // S5 hot-fix: spark currently being AttractDrag'd is exempt from boundary
  // reflection so the player can yank it out of the spawner zone.
  const attractedId = controls.state.kind === 'AttractDrag' ? controls.state.sparkId : null;

  for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
    controls.applyPerSubstep();
    verletStepAll(sparkArr, SUBSTEP_DT);
    if (bondArr.length > 0) {
      const broken = solveBonds(bondArr);
      if (broken.length > 0) {
        // Strain-break: sever each over-stretched bond via the dispatch
        // seam (so BFS topology rule + effects fire). Refresh the local
        // bond array so subsequent substeps don't keep solving deleted
        // bonds (Bond.a/Bond.b refs would still be valid but the bond
        // itself is gone from world.bonds, and the BFS loser side of
        // primitives may have been deleted too — Bond holds direct refs,
        // not lookups).
        for (const bondId of broken) {
          if (world.bonds.has(bondId)) {
            dispatch(world, { type: 'SEVER_BOND', bondId });
          }
        }
        bondArr = Array.from(world.bonds.values());
      }
    }
    enforceSpawnerBounds(sparkArr, undefined, attractedId);
    resolveCollisions(sparkArr, grid);
  }
  world.tick++;
}

function freeSparkArray(map: ReadonlyMap<unknown, Spark>): Spark[] {
  return Array.from(map.values());
}

/**
 * Soft-cap the Free spark population. Carried sparks live in `freeSparks`
 * but never count toward the cap (the player FSM owns those). Excess Free
 * sparks despawn oldest-first (lowest createdTick) via the dispatch seam.
 */
function enforceFreeSparkCap(world: Parameters<typeof dispatch>[0]): void {
  let freeCount = 0;
  for (const s of world.freeSparks.values()) {
    if (s.state.kind === 'Free') freeCount++;
  }
  if (freeCount <= FREE_SPARK_SOFT_CAP) return;

  const candidates: Spark[] = [];
  for (const s of world.freeSparks.values()) {
    if (s.state.kind === 'Free') candidates.push(s);
  }
  candidates.sort((a, b) => a.createdTick - b.createdTick);

  const excess = freeCount - FREE_SPARK_SOFT_CAP;
  for (let i = 0; i < excess; i++) {
    dispatch(world, { type: 'DESPAWN_SPARK', sparkId: candidates[i].id });
  }
}

bootstrap().catch((err) => {
  console.error('SPARK boot failure:', err);
});
