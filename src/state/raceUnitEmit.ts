/**
 * SPARK — W1-C: THE CASTLE PRODUCES ITS RACE'S UNIT (S165).
 *
 * Owner R107: the castle emits its race's soldier FREE on a ~30 s timer. R120, verbatim:
 * *"every thirty seconds it produces, and they hide inside the [castle], and then they get released
 * during fight stage. And it keeps producing during fight until fight is done, and then they go
 * back."*
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ FOUR THINGS THE INHERITED PLAN GOT WRONG. Each cost a real defect and each is fixed here.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **1. "The R133 sentinel is all it needs."** It is not. R133 clears the SPAWN GATE and the CAPS; it
 * supplies no CADENCE. The spawner poll in `hostTick` iterates `world.creatureSpawners` and reads
 * `sp.nextSpawnTick` off a real record — and a sentinel id is, by construction, absent from that
 * map. Riding that loop would have polled nothing and emitted nothing, silently. Hence this module:
 * the castle gets its OWN call site.
 *
 * **2. "One castle sentinel."** A single shared sentinel is gameplay-fatal and silent.
 * `underGoblinCaps` counts `c.sourceSpawnerId === sourceSpawnerId` with **no owner term**, so one
 * shared id would make `GOBLIN_MAX_PER_SPAWNER = 10` a CROSS-SEAT cap: seat 0's tenth race unit
 * would block every other seat's castle. The sentinel is therefore PER SEAT — see `castleSpawnerId`.
 *
 * **3. "Route it through the goblin caps."** That starves the goblin towers: race units would
 * increment `GOBLIN_MAX_GLOBAL = 200`, a ceiling shared with every tower on the board. Race units
 * get their own family (`RACE_UNIT_MAX_*`, `underRaceUnitCaps`).
 *
 * **4. "No protocol bump owed — it rides P1's 40→41."** True only while P1 and W1-C landed in the
 * same session. P1 shipped alone, so v41 peers are live knowing nothing of `raceUnit`. 41→42.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ R120 IS THE ONE DELIBERATE EXCEPTION TO THE PHASE GATE — DO NOT "FIX" IT BACK.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Every other emitter in this game is dormant outside FIGHT, and that invariant is pinned by
 * `spawnerPhaseGate.test.ts` (*"Nothing is emitted or decremented outside FIGHT"*) and followed by
 * `castleGuns.ts` (`if (world.matchPhase !== 'FIGHT') return;`). The castle is the exception, and
 * the owner's own words are the reason: *"it keeps producing during fight until fight is done"* is
 * only meaningful as a contrast with producing during BUILD too.
 *
 * ⚠ So a future phase-gate audit will find this module looking like an oversight. It is not. The
 * exception is scoped to the castle emitter alone, and `raceUnitEmit.test.ts` asserts it in both
 * phases so that removing it turns a test red rather than quietly halving the unit supply.
 *
 * ⭐ AND THE "SHELTER" HALF OF R120 NEEDS NO NEW STATE. Units are born AT the castle anchor; the
 * whole FSM/AI/attack fan-out is FIGHT-gated (`hostTick`), so during BUILD they simply stand at the
 * keep; and `recallArmies` already walks them home on the FIGHT→BUILD edge. Born-at-the-anchor +
 * the existing gate + the existing recall IS the shelter/release/recall cycle, which is why
 * `recallArmies`' docblock can go on forbidding a `SHELTERED` CreatureState.
 * ⚠ ONE CORRECTION TO THAT ARGUMENT, because the version in the S164 handoff was overstated and a
 * later session should not lean on it: the creature fan-out is NOT wholly FIGHT-gated —
 * `creatureVerletStep` runs every substep of every BUILD tick with no phase guard
 * (`physics/physicsLoop.ts`). Creatures are frozen in DECISION, not in MOTION. The conclusion holds
 * (a unit with no target and no accel does not wander), but the sentence "the whole fan-out is
 * FIGHT-gated" is false and must not be repeated as justification.
 */
import {
  RACE_UNIT_EMIT_INTERVAL_TICKS,
  RACE_UNIT_MAX_GLOBAL,
  RACE_UNIT_MAX_PER_SEAT,
} from '../constants.ts';
import { asSpawnerId, type PlayerId, type SpawnerId } from '../types.ts';
import { castleAnchor } from './gatherers/gatherer.ts';
import { spreadTargetPos } from './creatures/creatureAI.ts';
import { asCreatureId } from '../types.ts';
import { dispatch, type World } from './world.ts';

/**
 * ⭐ THE CASTLE'S SENTINEL `SpawnerId`, PER SEAT (owner R133).
 *
 * Negative ids, one per seat: seat 0 → -1, seat 1 → -2, … Real spawner ids are non-negative and
 * minted from a counter, so a negative id can never collide with one, and the sign makes a castle
 * unit obvious in a debug dump.
 *
 * ⛔ PER SEAT, NOT ONE CONSTANT — see this module's docblock, defect 2. Sharing one id silently
 * turns a per-spawner cap into a cross-seat cap.
 *
 * ⚠ IT IS DELIBERATELY ABSENT FROM `world.creatureSpawners`, and everything that matters already
 * copes. `ownHomePos` (`creatures/creatureAI.ts`) guards `spawner !== undefined` and falls back to
 * `castleAnchor(seat)` — which is exactly where a castle-born unit should retreat to, so the
 * existing miss-path is the semantically correct path by accident. `recipeStillSatisfied` is
 * unreachable for it (that function takes the spawner OBJECT and is only ever reached by iterating
 * the map). `underGoblinCaps` never dereferences an id, only compares it.
 */
export function castleSpawnerId(seat: number): SpawnerId {
  return asSpawnerId(-1 - Math.trunc(seat));
}

/** True when `id` is a castle sentinel rather than a real, map-resident spawner. */
export function isCastleSpawnerId(id: SpawnerId | null): boolean {
  return id !== null && (id as unknown as number) < 0;
}

/**
 * How many ticks since this seat's castle last produced, in `[0, interval)`.
 *
 * ⛔ DERIVED FROM `world.tick`, NEVER ACCUMULATED — the project's standing determinism rule. No
 * stored timer means a mid-match host migration cannot skip or double an emission, and there is no
 * float remainder to drift.
 *
 * ⭐ PHASE-SPREAD BY SEAT (`- seat`), so four castles do not all emit on the same tick and dump
 * four units into one snapshot. Spread by SEAT ID, not by an accumulated counter — the same idiom
 * as `ticksSinceCastleShot`.
 */
export function ticksSinceCastleEmit(seat: number, tick: number): number {
  const i = RACE_UNIT_EMIT_INTERVAL_TICKS;
  return (((tick - Math.trunc(seat)) % i) + i) % i;
}

/** True on exactly the tick this seat's castle produces. */
export function castleEmitsOnTick(seat: number, tick: number): boolean {
  return ticksSinceCastleEmit(seat, tick) === 0;
}

/**
 * Live race units owned by `seat`, and live race units in total.
 *
 * ⚠ Counted rather than cached. A cached count is a second source of truth that a despawn path can
 * forget to decrement, and this is a sentinel backstop that should never bind in a real match — the
 * cost of an O(creatures) scan once every 1800 ticks per seat is not worth that risk.
 */
function countRaceUnits(world: World, owner: PlayerId): { global: number; seat: number } {
  let global = 0;
  let seat = 0;
  for (const c of world.creatures.values()) {
    if (c.type !== 'raceUnit') continue;
    global++;
    if (c.ownerPlayerId === owner) seat++;
  }
  return { global, seat };
}

/**
 * ⭐ THE RACE UNIT'S OWN CAP FAMILY (R123/R124 — "no per-player cap, but a sentinel backstop").
 *
 * ⛔ NOT `underGoblinCaps`. See this module's docblock, defect 3: riding the goblin family would
 * make every race unit eat into `GOBLIN_MAX_GLOBAL = 200` and starve the goblin towers, and would
 * bucket every seat's units into one `perSpawner` count with no owner term.
 */
export function underRaceUnitCaps(world: World, owner: PlayerId): boolean {
  const n = countRaceUnits(world, owner);
  return n.global < RACE_UNIT_MAX_GLOBAL && n.seat < RACE_UNIT_MAX_PER_SEAT;
}

/**
 * Host-side, once per tick. Emits one free race unit per seat on that seat's cadence.
 *
 * ⚠ NOT phase-gated — R120, and the one deliberate exception in the game. See the module docblock.
 *
 * ⛔ A FALLEN CASTLE DOES NOT PRODUCE. `castleHp <= 0` means the keep is gone, and a destroyed
 * castle that kept minting soldiers would make its own destruction cosmetic. This mirrors
 * `castleGuns.ts`' own guard exactly.
 * ⚠ NOTE WHAT THIS DOES *NOT* DO: it does not touch units already on the board. Owner ruling
 * `cf_s161_a` — *"Keep fighting (status quo) — a fallen seat's towers/creatures/spawners keep
 * acting until razed."* The emitter stops; the army it already made carries on.
 */
export function raceUnitEmitTick(world: World): void {
  // A castle only recruits during a live match. WIN and POSTGAME still advance `world.tick`
  // (`hostTick` increments it there on purpose, for a replay-safe ceremony clock), so without this
  // the cadence would keep firing into the endgame sequence and mint units nobody can command.
  if (world.gameState !== 'PLAYING') return;

  // ⛔ EXPLICIT ID ORDER. `players` is a Map and its iteration order must never decide anything —
  // here it would decide which seat wins the last slot under the global backstop. Same rule, and
  // the same one-line fix, as `castleGunsTick`.
  const seats = [...world.players.keys()].sort(
    (a, b) => (a as unknown as number) - (b as unknown as number),
  );

  for (const playerId of seats) {
    const player = world.players.get(playerId);
    if (player === undefined) continue;
    if (player.castleHp <= 0) continue; // the keep is gone — see above
    const seat = playerId as unknown as number;
    if (!castleEmitsOnTick(seat, world.tick)) continue;
    if (!underRaceUnitCaps(world, playerId)) continue;

    const anchor = castleAnchor(seat, world.layout);

    /*
     * ⭐ SPREAD, OR EVERY UNIT STACKS ON ONE PIXEL. Creatures are excluded from the constraint
     * solver and have no separation force, so N units emitted from one anchor would occupy exactly
     * the same point forever and read as a single sprite.
     *
     * ⛔ DETERMINISTIC, and that is not optional in this sim: `spreadTargetPos` derives the offset
     * from the creature ID via a golden-angle spiral. No `Math.random`, no wall clock, no
     * accumulated remainder — two hosts replaying the same tick place the unit identically.
     *
     * ⚠ The id is minted from `world.nextCreatureId` BEFORE dispatch so the same value seeds both
     * the spread and the creature, rather than spreading against an id the reducer has not chosen
     * yet.
     */
    const id = asCreatureId(world.nextCreatureId);
    const pos = spreadTargetPos(anchor, id, RACE_UNIT_SPAWN_SPREAD);

    dispatch(world, {
      type: 'SPAWN_CREATURE',
      creatureType: 'raceUnit',
      ownerPlayerId: playerId,
      pos,
      // Born standing at its own keep. During BUILD the FSM is frozen so it simply waits there,
      // which is R120's "they hide inside" without a new state; on the first FIGHT tick the AI
      // fan-out gives it a real target.
      targetPos: pos,
      sourceSpawnerId: castleSpawnerId(seat),
    });
  }
}

/**
 * How far around the anchor a freshly produced unit is placed.
 *
 * ⚠ THIS NUMBER IS MINE, NOT THE OWNER'S. Chosen as roughly one castle-anchor radius so a knot of
 * units reads as a squad at the keep rather than a pile or a scattered picket. It changes nothing
 * mechanical — the spread only sets a spawn position — and it is the kind of number the owner
 * should overrule on sight if it looks wrong on the board.
 */
const RACE_UNIT_SPAWN_SPREAD = 46;
