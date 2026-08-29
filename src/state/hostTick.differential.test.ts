/**
 * SPARK — S119 P1: runHostTick FROZEN-REFERENCE DIFFERENTIAL (Council-mandated).
 *
 * `referenceHostTick` below is a VERBATIM transcription of the pre-S119 inline
 * host-tick body from main.ts @ commit 840f31f (the drain-loop blocks between
 * the stepPhysics branch and the DROP-BENCH sweep, inclusive), with exactly
 * these mechanical substitutions:
 *   • `const isClient = false` (the reference models the host path — every
 *     `!isClient` conjunct therefore evaluates exactly as it did live);
 *   • `session.hostSeats` → `ref.hostSeats`, and the per-TICK
 *     `new Set(session.netTransport.peerIds())` → `new Set(ref.peerIdsFn())`
 *     (still per tick — so this differential empirically validates the
 *     Council-approved per-frame alive-set read in the new path);
 *   • the client-only substep line is omitted (dead code under isClient=false);
 *   • the screenShake.trigger lines are omitted (render-only, they never touch
 *     world state — their post-drain relocation is proven analytically:
 *     nothing renders mid-drain + ScreenShake.trigger replaces, never stacks);
 *   • the import.meta.env.DEV invariant probe is omitted (console-only,
 *     zero world mutation).
 *
 * Each scenario runs the NEW runHostTick and the REFERENCE side-by-side from
 * identical seeds/inputs and asserts hashWorldState equality EVERY tick plus
 * full-snapshot byte-equality at the end. Forced-state scenarios cover: plain
 * physics, live bots, creatures (voltkin + chewer + drone), all four hazards,
 * spawner + defender re-validation teardown, the pendingCreatureSpawn poll,
 * hunter trigger + bench sweep, the WIN→POSTGAME edge (non-PLAYING tick++
 * path), and DROP-BENCH grace/re-stamp. (The NONET sweep runs as a no-op in
 * every scenario — building a 9-component here would dwarf the test; its
 * determinism is covered by sudokuEvent tests + the S119 replay gate.)
 */

import { describe, expect, it } from 'vitest';
import {
  DRONE_EMIT_INTERVAL_TICKS,
  HUNTER_TRIGGER_SCORE,
  PEER_DROP_BENCH_TICKS,
  PEER_DROP_GRACE_TICKS,
  PHASE_1_WIN_SCORE,
  PLAYER_COLORS,
  REVALIDATE_INTERVAL_TICKS,
  SPAWN_INTERVAL_TICKS,
  STRUCTURE_SELFDESTRUCT_DRONE_COUNT,
  STRUCTURE_SELFDESTRUCT_RADIUS,
  SparkType,
} from '../constants.ts';
import { BotManager } from '../bots/botManager.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { Spawner, DEFAULT_SPAWNER_CONFIG } from '../game/spawner.ts';
import type { Controls } from '../input/controls.ts';
import { computeStubTargetPos } from '../physics/creatureVerlet.ts';
import { stepPhysics } from '../physics/physicsLoop.ts';
import {
  bondMidpoint,
  enemyCastleMarchPos,
  findNearestBondTarget,
  findNearestEnemyCreature,
  isWithinAttackRange,
} from './creatures/creatureAI.ts';
import { underChewerCaps } from './creatures/creatureLifecycle.ts';
import { getCreatureConfig } from './creatures/voltkin-config.ts';
import { recipeStillSatisfied as defenderRecipeStillSatisfied } from './defenders/defenderLifecycle.ts';
import { underDroneCaps } from './droneLifecycle.ts';
import { awardSpawnerKillReward } from './gameMode.ts';
import { makeGameStateExtras, tickGameState, type GameStateExtras } from './gameState.ts';
import type { GodlyTriggerEvent } from './godlyRecipes/types.ts';
import { makeHostTickState, runHostTick, type HostTickDeps } from './hostTick.ts';
import { shouldCookOffInHand } from './potatoLifecycle.ts';
import { mulberry32 } from './rng.ts';
import { snapshot } from './save.ts';
import { tickScoring } from './scoring.ts';
import { canAvatarCleanSplat } from './seagulls/seagullLifecycle.ts';
import { recipeStillSatisfied } from './spawners/spawnerLifecycle.ts';
import { hashWorldStateFull } from './stateHashFull.ts';
import { detectNonet, mintNonetSeed, startSudoku } from './sudokuEvent.ts';
import { asPlayerId, asPrimitiveId, asSparkId, asSpawnerId, type PlayerId } from '../types.ts';
import { dispatch, isNetworked, makeWorld, type World } from './world.ts';

const P1 = asPlayerId(0);
const CHEWER_SEEK_RESELECT_TICKS = 6; // frozen copy of the pre-S119 main.ts const

const stubControls = { state: { kind: 'Idle' }, applyPerSubstep() {} } as unknown as Controls;

function determinismJson(world: World): string {
  const snap = snapshot(world);
  const { savedAt: _ignore, ...rest } = snap;
  void _ignore;
  return JSON.stringify(rest);
}

// ═══════════════════════════════════════════════════════════════════════════
// FROZEN REFERENCE — verbatim pre-S119 main.ts inline host tick (see header)
// ═══════════════════════════════════════════════════════════════════════════

interface RefCtx {
  spawner: Spawner;
  controls: Controls;
  botManager: BotManager | null;
  gameStateExtras: GameStateExtras;
  hostSeats: ReadonlyMap<string, PlayerId>;
  /** Per-TICK transport read, exactly like the inline original; null = no transport. */
  peerIdsFn: (() => readonly string[]) | null;
  peerAbsentSinceTick: Map<string, number>;
}

function referenceHostTick(world: World, ref: RefCtx): void {
  const isClient = false;
  if (world.gameState === 'PLAYING' && !isClient) {
    stepPhysics(world, ref.spawner, ref.controls);
  } else {
    world.tick++;
  }
  if (world.gameState === 'PLAYING' && !isClient) {
    tickScoring(world);
  }
  tickGameState(world, ref.gameStateExtras, P1);

  if (
    world.gameState === 'PLAYING' &&
    !isClient &&
    world.sudoku === null &&
    !world.sudokuFiredThisMatch
  ) {
    const nonetOwner = detectNonet(world);
    if (nonetOwner !== null) startSudoku(world, nonetOwner, mintNonetSeed(world));
  }

  if (
    world.gameState === 'PLAYING' &&
    !isClient &&
    world.pendingCreatureSpawn !== null &&
    world.tick >= world.pendingCreatureSpawn.fireAtTick
  ) {
    const { event } = world.pendingCreatureSpawn;
    world.pendingCreatureSpawn = null;
    const spawnTargetPos = computeStubTargetPos(world.tick, event.triggererPlayerId);
    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'voltkin',
      ownerPlayerId: event.triggererPlayerId,
      pos: { x: event.targetPos.x, y: event.targetPos.y },
      targetPos: spawnTargetPos,
    });
  }

  if (world.gameState === 'PLAYING' && !isClient && world.bombs.size > 0) {
    for (const [bombId, bomb] of [...world.bombs]) {
      if (world.tick >= bomb.dissipateAtTick) {
        dispatch(world, { type: 'DISSIPATE_BOMB', bombId });
      }
    }
  }

  if (world.gameState === 'PLAYING' && !isClient && world.creatureSpawners.size > 0) {
    for (const [spawnerId, sp] of [...world.creatureSpawners]) {
      if (world.tick - sp.lastValidatedTick >= REVALIDATE_INTERVAL_TICKS) {
        sp.lastValidatedTick = world.tick;
        if (!world.primitives.has(sp.anchorPrimitiveId) || !recipeStillSatisfied(world, sp)) {
          awardSpawnerKillReward(world, sp);
          dispatch(world, { type: 'REMOVE_SPAWNER', spawnerId });
          continue;
        }
      }
      if (world.fouledPrimitives.has(sp.anchorPrimitiveId)) {
        while (world.tick >= sp.nextSpawnTick) sp.nextSpawnTick += SPAWN_INTERVAL_TICKS;
        continue;
      }
      if (sp.recipeId === 'lightningHub') {
        if (world.tick >= sp.nextSpawnTick) {
          const anchor = world.primitives.get(sp.anchorPrimitiveId);
          if (sp.spawnedCount >= STRUCTURE_SELFDESTRUCT_DRONE_COUNT) {
            if (anchor !== undefined) {
              dispatch(world, {
                type: 'STRUCTURE_SELFDESTRUCT',
                pos: { x: anchor.pos.x, y: anchor.pos.y },
                radius: STRUCTURE_SELFDESTRUCT_RADIUS,
              });
            }
            dispatch(world, { type: 'REMOVE_SPAWNER', spawnerId });
          } else if (anchor !== undefined && underDroneCaps(world, spawnerId)) {
            dispatch(world, {
              type: 'SPAWN_CREATURE',
              creatureType: 'lightningDrone',
              ownerPlayerId: sp.ownerPlayerId,
              pos: { x: anchor.pos.x, y: anchor.pos.y },
              targetPos: { x: anchor.pos.x, y: anchor.pos.y },
              sourceSpawnerId: spawnerId,
            });
            sp.nextSpawnTick += DRONE_EMIT_INTERVAL_TICKS;
            sp.spawnedCount++;
          }
        }
      } else if (world.tick >= sp.nextSpawnTick && underChewerCaps(world, spawnerId)) {
        const anchor = world.primitives.get(sp.anchorPrimitiveId);
        if (anchor !== undefined) {
          dispatch(world, {
            type: 'SPAWN_CREATURE',
            creatureType: 'chewer',
            ownerPlayerId: sp.ownerPlayerId,
            pos: { x: anchor.pos.x, y: anchor.pos.y },
            targetPos: { x: anchor.pos.x, y: anchor.pos.y },
            sourceSpawnerId: spawnerId,
          });
          sp.nextSpawnTick += SPAWN_INTERVAL_TICKS;
          sp.spawnedCount++;
        }
      }
    }
  }

  if (world.gameState === 'PLAYING' && !isClient && world.defenders.size > 0) {
    for (const [defenderId, d] of [...world.defenders]) {
      const did = defenderId as unknown as number;
      if (world.tick % REVALIDATE_INTERVAL_TICKS === did % REVALIDATE_INTERVAL_TICKS) {
        if (!world.primitives.has(d.anchorPrimitiveId) || !defenderRecipeStillSatisfied(world, d)) {
          dispatch(world, { type: 'REMOVE_DEFENDER', defenderId });
          continue;
        }
      }
      dispatch(world, { type: 'DEFENDER_TICK', defenderId });
    }
  }

  if (world.gameState === 'PLAYING' && !isClient && world.creatures.size > 0) {
    const creatureIds = Array.from(world.creatures.keys());
    for (const id of creatureIds) {
      const creature = world.creatures.get(id);
      if (creature !== undefined && creature.state === 'SEEKING' && getCreatureConfig(creature.type).selfExplode) {
        const nextTarget = findNearestBondTarget(world, creature, true);
        creature.targetBondId = nextTarget;
        if (nextTarget !== null) {
          const targetBond = world.bonds.get(nextTarget);
          if (targetBond !== undefined) {
            const mid = bondMidpoint(targetBond);
            creature.targetPos.x = mid.x;
            creature.targetPos.y = mid.y;
          }
        }
      } else if (creature !== undefined && creature.state === 'SEEKING') {
        const isChewer = creature.sourceSpawnerId !== null;
        let doReselect: boolean;
        let enemyOnly: boolean;
        if (!isChewer) {
          doReselect = true;
          enemyOnly = false;
        } else {
          enemyOnly = true;
          doReselect =
            creature.chewProgress === 0 &&
            world.tick % CHEWER_SEEK_RESELECT_TICKS ===
              (creature.id as unknown as number) % CHEWER_SEEK_RESELECT_TICKS;
        }
        if (doReselect) {
          const nextTarget = findNearestBondTarget(world, creature, enemyOnly);
          creature.targetBondId = nextTarget;
          if (nextTarget !== null) {
            const targetBond = world.bonds.get(nextTarget);
            if (targetBond !== undefined) {
              const mid = bondMidpoint(targetBond);
              creature.targetPos.x = mid.x;
              creature.targetPos.y = mid.y;
            }
          } else {
            /*
             * ⭐ S157 B5 — MIRRORED INTO THE FROZEN REFERENCE, DELIBERATELY.
             *
             * This file is a verbatim transcription of the pre-S119 host tick, and its whole value is
             * that it diverges when the extraction drifts. So an intentional BEHAVIOUR change has to
             * be written into both sides — otherwise the gate reports a refactor bug that is not one,
             * and the next real drift hides behind a failure everyone has learned to expect.
             *
             * The change (owner): *"after all enemy structures are destroyed pencil chewers just
             * stand there idle"* — with no bond to chew they now march on the enemy keep, the same
             * fallback goblins have had since S153. Kept in the `nextTarget === null` arm on both
             * sides so the castle stays the LAST resort and a chewer never abandons a live commit.
             */
            const march = enemyCastleMarchPos(world, creature);
            if (march !== null) {
              creature.targetPos.x = march.x;
              creature.targetPos.y = march.y;
            }
          }
        }
        if (!isChewer) {
          creature.targetCreatureId = findNearestEnemyCreature(world, creature);
        }
      }

      const droneCandidate = world.creatures.get(id);
      if (
        droneCandidate !== undefined &&
        droneCandidate.state === 'SEEKING' &&
        getCreatureConfig(droneCandidate.type).selfExplode
      ) {
        const inRange =
          droneCandidate.targetBondId !== null &&
          isWithinAttackRange(world, droneCandidate, droneCandidate.targetBondId);
        const fuseExpiring = world.tick >= droneCandidate.despawnAtTick - 1;
        if (inRange || fuseExpiring) {
          dispatch(world, { type: 'DRONE_EXPLODE', creatureId: id });
          continue;
        }
      }

      dispatch(world, { type: 'CREATURE_TICK', creatureId: id });

      const after = world.creatures.get(id);
      if (
        after !== undefined &&
        after.state === 'ATTACKING' &&
        after.ticksInState === getCreatureConfig(after.type).attackFireTick &&
        (after.targetCreatureId !== null || after.targetBondId !== null)
      ) {
        if (after.targetCreatureId !== null) {
          dispatch(world, {
            type: 'CREATURE_ATTACK',
            creatureId: id,
            bondId: null,
            targetCreatureId: after.targetCreatureId,
          });
        } else {
          dispatch(world, {
            type: 'CREATURE_ATTACK',
            creatureId: id,
            bondId: after.targetBondId,
          });
        }
        // (screenShake.trigger omitted — render-only; see file header)
      }
    }
  }

  if (world.gameState === 'PLAYING' && !isClient && ref.botManager !== null) {
    ref.botManager.tick(world);
  }

  if (world.gameState === 'PLAYING' && !isClient) {
    if (!world.hunterSpawned && Math.floor(world.scoreProgress) >= HUNTER_TRIGGER_SCORE) {
      dispatch(world, { type: 'SPAWN_HUNTER' });
    }
    if (world.hunters.size > 0) {
      for (const hid of Array.from(world.hunters.keys())) {
        dispatch(world, { type: 'HUNTER_TICK', hunterId: hid });
      }
    }
    for (const player of world.players.values()) {
      if (player.benchedUntilTick !== undefined && world.tick >= player.benchedUntilTick) {
        player.benchedUntilTick = undefined;
      }
    }
    // V6-1.2 — gatherer haul-cycle fan-out, mirrored here in LOCKSTEP with hostTick.ts.
    // ⚠ WHY THE FROZEN REFERENCE GAINS A LINE. This transcription exists to prove a REFACTOR did
    // not change behaviour; it is not a museum piece. A genuinely NEW entity tick must be added to
    // both sides in the same change, exactly as the hunter and defender fan-outs above were —
    // otherwise the gate silently degrades into "no new feature may ever ship", and the first
    // person to hit it deletes the assertion instead of the divergence. Verified by construction:
    // this loop is a character-for-character copy of the hostTick.ts block, so the gate still
    // detects any ORDERING or CONDITION drift between the two.
    if (world.gatherers.size > 0) {
      for (const gid of Array.from(world.gatherers.keys())) {
        dispatch(world, { type: 'GATHERER_TICK', gathererId: gid });
      }
    }
  }

  if (world.gameState === 'PLAYING' && !isClient && world.potatoes.size > 0) {
    for (const [potatoId, potato] of [...world.potatoes]) {
      if (potato.state === 'CARRIED' && potato.carrierId !== null) {
        const carrier = world.players.get(potato.carrierId);
        if (carrier === undefined) {
          dispatch(world, { type: 'POTATO_DETONATE', potatoId });
          continue;
        }
        potato.pos.x = carrier.avatarPos.x;
        potato.pos.y = carrier.avatarPos.y;
        if (shouldCookOffInHand(potato, world.tick)) {
          dispatch(world, { type: 'POTATO_DETONATE', potatoId });
          continue;
        }
      }
      if (world.tick >= potato.detonateAtTick) {
        if (potato.state === 'FREE') {
          dispatch(world, { type: 'DISSIPATE_POTATO', potatoId });
        } else {
          dispatch(world, { type: 'POTATO_DETONATE', potatoId });
        }
      }
    }
  }

  if (world.gameState === 'PLAYING' && !isClient && world.rainbows.size > 0) {
    for (const [rainbowId, rainbow] of [...world.rainbows]) {
      if (world.tick >= rainbow.dissipateAtTick) {
        dispatch(world, { type: 'DISSIPATE_RAINBOW', rainbowId });
      }
    }
  }

  if (world.gameState === 'PLAYING' && !isClient && world.seagulls.size > 0) {
    for (const sid of Array.from(world.seagulls.keys())) {
      dispatch(world, { type: 'SEAGULL_TICK', seagullId: sid });
    }
  }
  if (world.gameState === 'PLAYING' && !isClient && world.poops.size > 0) {
    for (const pid of Array.from(world.poops.keys())) {
      dispatch(world, { type: 'POOP_TICK', poopId: pid });
    }
    for (const [poopId, poop] of [...world.poops]) {
      if (poop.state !== 'SPLAT_STRUCTURE') continue;
      if (poop.fouledPrimId === undefined || !world.primitives.has(poop.fouledPrimId)) {
        dispatch(world, { type: 'CLEAN_POOP', poopId });
        continue;
      }
      for (const player of world.players.values()) {
        if (canAvatarCleanSplat(world, player, poop)) {
          dispatch(world, { type: 'CLEAN_POOP', poopId });
          break;
        }
      }
    }
  }

  if (
    world.gameState === 'PLAYING' &&
    !isClient &&
    isNetworked(world) &&
    ref.hostSeats.size > 0 &&
    ref.peerIdsFn !== null
  ) {
    const present = new Set(ref.peerIdsFn());
    for (const [peerId, seat] of ref.hostSeats) {
      if (present.has(peerId)) {
        ref.peerAbsentSinceTick.delete(peerId);
        continue;
      }
      const since = ref.peerAbsentSinceTick.get(peerId);
      if (since === undefined) {
        ref.peerAbsentSinceTick.set(peerId, world.tick);
      } else if (world.tick - since >= PEER_DROP_GRACE_TICKS) {
        dispatch(world, {
          type: 'BENCH_OFFLINE_PLAYER',
          playerId: seat,
          untilTick: world.tick + PEER_DROP_BENCH_TICKS,
        });
      }
    }
  } else if (ref.peerAbsentSinceTick.size > 0) {
    ref.peerAbsentSinceTick.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Scenario engine — build two identical worlds, drive NEW vs REFERENCE,
// assert hash equality every tick + snapshot byte-equality at the end.
// ═══════════════════════════════════════════════════════════════════════════

interface Scenario {
  seed: number;
  ticks: number;
  /** 0 = solo (direct PLAYING); >0 = START_GAME bots with N bot seats. */
  botCount: number;
  /** Applied identically to BOTH worlds before tick t (models between-frame input). */
  beforeTick?: (world: World, t: number) => void;
  /** DROP-BENCH inputs; alive(t) is the transport peer list at tick t. */
  net?: { hostSeats: ReadonlyMap<string, PlayerId>; alive: (t: number) => readonly string[] };
  /** Post-run structural assertion on the NEW-path world (coverage proof). */
  expectAtEnd?: (world: World) => void;
}

function buildScenarioWorld(scen: Scenario): World {
  const world = makeWorld(scen.seed);
  if (scen.botCount > 0) {
    world.gameState = 'TITLE';
    const roster = Array.from({ length: scen.botCount + 1 }, (_, seat) => ({
      seat,
      color: PLAYER_COLORS[seat],
    }));
    const botSeats = Array.from({ length: scen.botCount }, (_, i) => i + 1);
    dispatch(world, { type: 'START_GAME', mode: 'bots', isHost: true, roster, botSeats });
    // ⚠ S139 P2 — REMOVE the free starter goblins from this fixture, deliberately.
    // `referenceHostTick` above is a FROZEN COPY of the pre-S119 host tick, so it cannot
    // contain the structure-targeting branch a goblin needs. With goblins present the two
    // implementations diverge the moment SPAWNING ends (tick 30) — which says nothing about
    // whether the S119 refactor preserved behaviour, and that is the ONLY thing this gate is
    // for. Note D3 (voltkin + chewer + drone fan-out) still passes untouched, which is the
    // positive evidence that the new branch does not perturb the shipped creature paths.
    // Goblin determinism is covered by its own same-world double-run test instead.
    world.creatures.clear();
    world.nextCreatureId = 0;
  } else {
    world.gameState = 'PLAYING';
  }
  // ⭐ S147 P1 — PIN THE MATCH PHASE TO **FIGHT** FOR EVERY SCENARIO. Same reasoning as the S139 P2
  // goblin removal directly above, and load-bearing for all eight scenarios.
  //
  // `referenceHostTick` is a FROZEN transcription of the pre-S147 body, so it calls `tickScoring`
  // UNCONDITIONALLY. The live `runHostTick` now gates scoring to the FIGHT phase (R3). A world left in
  // the production default of BUILD therefore accrues NO income on the live side while the reference
  // accrues it every tick, and the WIDE hash diverges on `scoreProgress`/`scoreByPlayer` within a few
  // ticks — which says nothing whatsoever about whether the S119 extraction still holds, and that is
  // the ONLY thing this gate exists to prove.
  //
  // ⚠ THIS IS AN EQUIVALENCE STATEMENT, NOT A WORKAROUND. The frozen reference literally encodes the
  // pre-phase world, which scored on every tick — and the phase in which the live sim scores on every
  // tick IS `FIGHT`. Pinning FIGHT is what makes the two comparable; it is not hiding a behavioural
  // change. Laundering would be editing the reference BODY to know about phases, which would destroy
  // the gate. Nothing here weakens it: with FIGHT pinned, the scoring call is reached identically on
  // both sides, so every pre-existing divergence this gate could ever catch is still caught.
  //
  // ⛔ AND THE PHASE CLOCK IS *NOT* TESTED HERE — deliberately. Phase-cycle determinism is proven in
  // the harnesses where BOTH sides run the LIVE tick body: `matchPhase.test.ts` (flip arithmetic,
  // parity across long freezes, score 0 in BUILD / rising in FIGHT) and
  // `workerSim.differential.test.ts` (host-vs-worker, phase edge inside its 300 frames). Adding a
  // phase-cycling scenario HERE would be impossible by construction, for the exact reason above.
  //
  // Safe because PHASE_DURATION_TICKS (5400) exceeds the longest scenario (800 ticks), so no edge can
  // land mid-run and silently flip a scenario into BUILD. `matchPhase.test.ts` asserts that bound BY
  // NAME so a future phase re-tune fails there with the reason, instead of reddening eight unrelated
  // determinism scenarios and sending the next session hunting a desync that is really a fixture bug.
  // ⚠ S149 P2 — THE PIN MOVED TO THE **END** OF THIS FUNCTION. See the block below `return`.
  // It cannot happen here any more: everything after this point BUILDS the fixture material,
  // and from S149 P2 a placement is refused outside BUILD. Pinning FIGHT first made every
  // PLACE_PRIMITIVE below a silent no-op, which left the player stuck in `Carrying` and made the
  // NEXT PICKUP_SPARK throw CarryViolation — all eight scenarios died in SETUP, before a single
  // differential tick ran.

  // Scattered field + a bonded 3-prim chain (the S107 fixture) so physics,
  // scoring and the creature AI all have real material from tick 0.
  for (let i = 0; i < 12; i++) {
    const s = makeFreeSpark({
      id: asSparkId(5000 + i),
      type: (i % 6) as SparkType,
      pos: { x: 50 + i * 140, y: 60 + (i % 4) * 240 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: s });
  }
  for (let i = 0; i < 3; i++) {
    const s = makeFreeSpark({
      id: asSparkId(6000 + i),
      type: SparkType.Line,
      pos: { x: 300 + i * 40, y: 500 },
      velocity: { x: 0, y: 0 },
      dt: 1 / 60,
      createdTick: 0,
    });
    dispatch(world, { type: 'SPAWN_SPARK', spark: s });
    dispatch(world, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P1, pos: { x: s.pos.x, y: s.pos.y } });
    dispatch(world, {
      type: 'PLACE_PRIMITIVE',
      playerId: P1,
      targetPrimitiveId: i === 0 ? null : asPrimitiveId(i - 1),
      stiffnessTier: 'MID',
    });
  }

  // ⭐ S147 P1 / MOVED S149 P2 — PIN THE MATCH PHASE TO **FIGHT** FOR EVERY SCENARIO,
  // and do it LAST, once all the fixture material is already standing.
  //
  // WHY PIN AT ALL (S147 P1, unchanged): `referenceHostTick` is a FROZEN transcription of the
  // pre-S147 body, so it calls `tickScoring` UNCONDITIONALLY, while the live `runHostTick` gates
  // scoring to FIGHT (R3). Left in the production default of BUILD the live side would accrue no
  // income while the reference accrued it every tick, and the wide hash would diverge on
  // `scoreProgress` within a few ticks — which says nothing about whether the S119 extraction
  // still holds, the only thing this gate exists to prove. This is an EQUIVALENCE STATEMENT, not
  // a workaround: the phase in which the live sim scores every tick IS `FIGHT`. Laundering would
  // be editing the reference BODY to know about phases, which would destroy the gate.
  //
  // WHY IT MOVED (S149 P2): building is now refused outside BUILD, so the fixture above has to
  // be assembled while the world is still in its default BUILD phase. Setting up in BUILD and
  // running in FIGHT costs the gate nothing — not one differential tick observes the setup
  // phase, because the pin lands before any tick is run.
  //
  // ⛔ AND THE PHASE CLOCK IS *NOT* TESTED HERE — deliberately. Phase-cycle determinism is proven
  // where BOTH sides run the LIVE body: `matchPhase.test.ts` and `workerSim.differential.test.ts`.
  // Safe because PHASE_DURATION_TICKS (5400) exceeds the longest scenario (800 ticks), so no edge
  // can land mid-run and silently flip a scenario back into BUILD.
  world.matchPhase = 'FIGHT';
  return world;
}

function runDifferential(scen: Scenario): void {
  const worldNew = buildScenarioWorld(scen);
  const worldRef = buildScenarioWorld(scen);
  const stateNew = makeHostTickState(worldNew);
  const ref: RefCtx = {
    spawner: new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(scen.seed)),
    controls: stubControls,
    botManager: scen.botCount > 0 ? new BotManager(['MID', 'HARD'].slice(0, scen.botCount) as never, scen.seed) : null,
    gameStateExtras: makeGameStateExtras(),
    hostSeats: scen.net?.hostSeats ?? new Map(),
    peerIdsFn: null, // set per tick below (per-TICK read, like the inline original)
    peerAbsentSinceTick: new Map(),
  };
  const spawnerNew = new Spawner(DEFAULT_SPAWNER_CONFIG, mulberry32(scen.seed));
  const botsNew = scen.botCount > 0 ? new BotManager(['MID', 'HARD'].slice(0, scen.botCount) as never, scen.seed) : null;
  const extrasNew = makeGameStateExtras();

  for (let t = 0; t < scen.ticks; t++) {
    scen.beforeTick?.(worldNew, t);
    scen.beforeTick?.(worldRef, t);
    // NEW path: deps rebuilt per "frame" (one tick = one frame here) with a
    // per-frame alive-set — the exact main.ts wiring.
    const depsNew: HostTickDeps = {
      spawner: spawnerNew,
      controls: stubControls,
      botManager: botsNew,
      gameStateExtras: extrasNew,
      alivePeerIds: scen.net !== undefined ? new Set(scen.net.alive(t)) : null,
      hostSeats: scen.net?.hostSeats ?? new Map(),
    };
    runHostTick(worldNew, depsNew, stateNew);
    // REFERENCE path: per-tick transport read, like the pre-S119 inline code.
    ref.peerIdsFn = scen.net !== undefined ? () => scen.net!.alive(t) : null;
    referenceHostTick(worldRef, ref);

    // S133 P1 — WIDE hash. The narrow `hashWorldState` used here previously covered
    // only primitives/bonds/freeSparks/score, so a per-tick divergence in creatures,
    // spawners, defenders or any hazard family produced an IDENTICAL hash. The
    // end-of-run `determinismJson` compare (a full `snapshot()`) did cover those, so
    // what this swap actually buys is (a) per-TICK localization of an entity
    // divergence and (b) detection of a TRANSIENT divergence that reconverges before
    // the final compare — which the end-state check cannot see by construction.
    const hNew = hashWorldStateFull(worldNew);
    const hRef = hashWorldStateFull(worldRef);
    if (hNew !== hRef) {
      throw new Error(`differential divergence at tick ${t}: new=${hNew} ref=${hRef}`);
    }
  }
  expect(determinismJson(worldNew)).toBe(determinismJson(worldRef));
  scen.expectAtEnd?.(worldNew);
}

// ═══════════════════════════════════════════════════════════════════════════

describe('S119 P1 — runHostTick vs frozen pre-refactor reference (DIFFERENTIAL GATE)', () => {
  it('D1: plain solo physics world (500 ticks)', () => {
    runDifferential({ seed: 0xd1f001, ticks: 500, botCount: 0 });
  });

  it('D2: live bots building (2 bots, 800 ticks)', () => {
    runDifferential({
      seed: 0xd1f002,
      ticks: 800,
      botCount: 2,
      expectAtEnd: (w) => expect(w.tick).toBe(800),
    });
  });

  it('D3: creatures — voltkin + chewer + drone fan-out paths (400 ticks)', () => {
    runDifferential({
      seed: 0xd1f003,
      ticks: 400,
      botCount: 0,
      beforeTick: (w, t) => {
        if (t === 20) {
          dispatch(w, {
            type: 'SPAWN_CREATURE',
            creatureType: 'voltkin',
            ownerPlayerId: P1,
            pos: { x: 200, y: 480 },
            targetPos: { x: 320, y: 500 },
          });
          dispatch(w, {
            type: 'SPAWN_CREATURE',
            creatureType: 'chewer',
            ownerPlayerId: asPlayerId(1),
            pos: { x: 500, y: 480 },
            targetPos: { x: 340, y: 500 },
            sourceSpawnerId: asSpawnerId(77),
          });
          dispatch(w, {
            type: 'SPAWN_CREATURE',
            creatureType: 'lightningDrone',
            ownerPlayerId: asPlayerId(1),
            pos: { x: 600, y: 480 },
            targetPos: { x: 360, y: 500 },
            sourceSpawnerId: asSpawnerId(78),
          });
        }
        if (t === 30) {
          // pendingCreatureSpawn poll (fires at t≈40): the post-cinematic voltkin.
          w.pendingCreatureSpawn = {
            fireAtTick: w.tick + 10,
            event: {
              godlyId: 'voltkin',
              triggererPlayerId: P1,
              targetPos: { x: 400, y: 300 },
            } as unknown as GodlyTriggerEvent,
          };
        }
      },
    });
  });

  it('D4: all four hazards — bomb/potato/rainbow/seagull+poop TTL paths (700 ticks)', () => {
    runDifferential({
      seed: 0xd1f004,
      ticks: 700,
      botCount: 0,
      beforeTick: (w, t) => {
        if (t === 10) {
          dispatch(w, { type: 'SPAWN_BOMB', pos: { x: 640, y: 400 } });
          dispatch(w, { type: 'SPAWN_POTATO', pos: { x: 660, y: 420 } });
          dispatch(w, { type: 'SPAWN_RAINBOW', pos: { x: 680, y: 440 } });
          dispatch(w, { type: 'SPAWN_SEAGULL', pos: { x: 0, y: 200 }, vx: 3 });
        }
      },
    });
  });

  it('D5: spawner + defender re-validation teardown (200 ticks)', () => {
    runDifferential({
      seed: 0xd1f005,
      ticks: 200,
      botCount: 0,
      beforeTick: (w, t) => {
        if (t === 15) {
          // Existing anchor, recipe NOT satisfied → poll revalidates → reward + REMOVE.
          dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(0), recipeId: 'pentagram' });
          // Missing anchor → the anchor-gone branch.
          dispatch(w, { type: 'REGISTER_SPAWNER', ownerPlayerId: P1, anchorPrimitiveId: asPrimitiveId(900), recipeId: 'pentagram' });
          dispatch(w, {
            type: 'REGISTER_DEFENDER',
            defenderKind: 'princess',
            ownerPlayerId: P1,
            anchorPrimitiveId: asPrimitiveId(1),
            recipeId: 'helga',
            pos: { x: 340, y: 500 },
          });
        }
      },
      expectAtEnd: (w) => {
        expect(w.creatureSpawners.size).toBe(0); // both torn down by the poll
      },
    });
  });

  it('D6: hunter trigger + bench-expiry sweep (300 ticks)', () => {
    runDifferential({
      seed: 0xd1f006,
      ticks: 300,
      botCount: 0,
      beforeTick: (w, t) => {
        // Via scoreByPlayer — tickScoring recomputes scoreProgress from the
        // banked per-player scores each tick, so forcing scoreProgress alone
        // would be overwritten before the hunter check reads it.
        if (t === 50) w.scoreByPlayer.set(P1, HUNTER_TRIGGER_SCORE);
      },
      expectAtEnd: (w) => expect(w.hunterSpawned).toBe(true),
    });
  });

  it('D7: WIN → POSTGAME edge — the non-PLAYING host tick++ path (400 ticks)', () => {
    runDifferential({
      seed: 0xd1f007,
      ticks: 400,
      botCount: 0,
      beforeTick: (w, t) => {
        // scoreByPlayer, not scoreProgress — same reason as D6.
        if (t === 100) w.scoreByPlayer.set(P1, PHASE_1_WIN_SCORE);
      },
      expectAtEnd: (w) => expect(w.gameState).toBe('POSTGAME'),
    });
  });

  it('D8: DROP-BENCH grace + re-stamp, per-frame vs per-tick alive-set parity (400 ticks)', () => {
    const hostSeats = new Map<string, PlayerId>([['peer-A', asPlayerId(1)]]);
    runDifferential({
      seed: 0xd1f008,
      ticks: 400,
      botCount: 2, // bots mode inherits isNetworked semantics → the sweep gate is live
      net: {
        hostSeats,
        alive: (t) => (t < 100 ? ['peer-A'] : []), // absent from tick 100 on
      },
      expectAtEnd: (w) => {
        // Absence persisted to the end past the grace window → seat 1 is
        // bench-stamped every tick → still benched at the final tick.
        expect(w.players.get(asPlayerId(1))?.benchedUntilTick).toBeDefined();
      },
    });
  });
});
