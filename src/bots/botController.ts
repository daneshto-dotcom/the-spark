/**
 * SPARK — S87: BotController — one bot's FSM + actuation (LAZY chunk).
 *
 * THE RULE: a bot may ONLY act by dispatching the same GameActions a remote
 * human could send — UPDATE_AVATAR_POS / PICKUP_SPARK / PLACE_PRIMITIVE /
 * DROP_SPARK / SEVER_BOND / TRIGGER_RAINBOW / PICKUP_POTATO / PLACE_POTATO /
 * SHRINK_TERRITORY — through dispatch(). It never mutates world state
 * directly, so the bench gate, poop arrival gates, reach validation,
 * spawner-zone and territory blocks all bind bots identically to humans
 * (Council S87 F1). The poop-slow even works for free: while debuffed,
 * applyUpdateAvatarPos converts the bot's cursor into a chase target and
 * tickCruiserChase caps its avatar at 7 px/tick like everyone else.
 *
 * Movement model: the bot's "virtual cursor" IS its avatarPos. Each tick the
 * controller eases an internal cursor toward the current objective
 * (accel ramp + arrive-deceleration + a little perpendicular hand wobble)
 * and dispatches UPDATE_AVATAR_POS with the new position. While Carrying,
 * the S45 Sym A coupling drags the spark along — the haul is visible to the
 * human exactly like a player hauling.
 *
 * FSM (validated EVERY tick against world state — Council F1 fix #1: a
 * target that vanished or got raced away resets the state same-tick, no
 * stale-claim stutter):
 *
 *   IDLE ──think──▶ TO_SPARK ──claim ok──▶ HAUL ──place──▶ IDLE (cooldown)
 *     │                │  └─claim raced──▶ IDLE
 *     └──think──▶ ERRAND(SEVER/RAINBOW/CLEAN/POTATO_GRAB/POTATO_PLANT/FLEE) ──▶ IDLE
 *
 * Stuck guard: any non-IDLE state older than STUCK_TICKS abandons (dropping
 * any carried spark/potato) — a bot can lag or lose races, but never wedge.
 */

import { lookupCombo } from '../combos.ts';
import { SPAWNER_CENTER_X, SPAWNER_CENTER_Y, type StiffnessTier } from '../constants.ts';
import type { Player } from '../game/player.ts';
import { isBenched } from '../state/hunters/hunter.ts';
import { pickHostTargetPrimitive } from '../state/placePrimitive.ts';
import type { GameAction, World } from '../state/world.ts';
import type { BondId, PlayerId, PotatoId, RainbowId, SparkId, Vec2 } from '../types.ts';
import { BOT_CONFIGS, type BotConfig } from './botConfig.ts';
import { chooseBuildPos, chooseGoal, type BotGoal } from './botBrain.ts';
import type { BotDifficulty } from './botTypes.ts';

/** Verb range — how close the avatar must be before claiming/placing. Inside
 *  POOP_PICKUP_ARRIVAL_RADIUS (36) so a debuffed bot's verbs pass the arrival
 *  gates the moment its slowed avatar truly arrives. */
const ARRIVE_RADIUS = 24;
/** Abandon any single objective after 15 s of trying (60 Hz). */
const STUCK_TICKS = 900;
/** Idle micro-wander: hop radius while resting between goals. */
const WANDER_RADIUS = 110;

type ErrandVerb = 'SEVER' | 'RAINBOW' | 'CLEAN' | 'POTATO_GRAB' | 'POTATO_PLANT' | 'FLEE';

type BotState =
  | { kind: 'IDLE' }
  | { kind: 'TO_SPARK'; sparkId: SparkId; since: number }
  | { kind: 'HAUL'; sparkId: SparkId; buildPos: Vec2; since: number }
  | {
      kind: 'ERRAND';
      verb: ErrandVerb;
      targetPos: Vec2;
      refId: number | null;
      since: number;
    };

export class BotController {
  readonly seat: PlayerId;
  readonly difficulty: BotDifficulty;
  private readonly cfg: BotConfig;
  private readonly rng: () => number;
  private readonly totalSeats: number;
  private state: BotState = { kind: 'IDLE' };
  /** Internal eased cursor — authoritative copy of where the bot is steering. */
  private cursor: Vec2 | null = null;
  private vel = 0;
  private buildReadyAtTick = 0;
  private wanderTarget: Vec2 | null = null;

  constructor(
    seat: PlayerId,
    difficulty: BotDifficulty,
    rng: () => number,
    totalSeats: number,
  ) {
    this.seat = seat;
    this.difficulty = difficulty;
    this.cfg = BOT_CONFIGS[difficulty];
    this.rng = rng;
    this.totalSeats = totalSeats;
  }

  debugState(): { seat: number; difficulty: BotDifficulty; state: string } {
    return {
      seat: this.seat as number,
      difficulty: this.difficulty,
      state: this.state.kind === 'ERRAND' ? `ERRAND:${this.state.verb}` : this.state.kind,
    };
  }

  /** One host physics tick. `send` is the dispatch seam (never mutate world). */
  tick(world: World, send: (action: GameAction) => void): void {
    const me = world.players.get(this.seat);
    if (me === undefined) return;
    if (this.cursor === null) {
      this.cursor = { x: me.avatarPos.x, y: me.avatarPos.y };
    }

    // Benched (eaten / offline-bench): every meaningful verb is gate-denied
    // anyway; park the FSM so we re-decide fresh on release.
    if (isBenched(me.benchedUntilTick, world.tick)) {
      this.state = { kind: 'IDLE' };
      this.vel = 0;
      return;
    }

    // ── per-tick state validation (Council F1 fix: invalidate stale targets
    //    the tick they die, not on the next think) ─────────────────────────
    this.validateState(world, me.kind === 'Carrying');

    // Self-heal: idle while still Carrying (bench released mid-haul, or a
    // placement reject path) → route the held spark to a fresh build point.
    // Without this, the next BUILD goal would dispatch PICKUP_SPARK while
    // Carrying, and fsmPickup THROWS CarryViolation on the un-try/caught
    // host dispatch path (carry-1).
    if (this.state.kind === 'IDLE' && me.kind === 'Carrying') {
      const buildPos = chooseBuildPos(world, this.seat, this.totalSeats, this.cfg, this.rng);
      this.state = {
        kind: 'HAUL',
        sparkId: me.carriedSparkId,
        buildPos,
        since: world.tick,
      };
    }

    // ── stuck guard ──────────────────────────────────────────────────────
    if (this.state.kind !== 'IDLE' && world.tick - this.state.since > STUCK_TICKS) {
      this.abandon(world, send, me);
      return;
    }

    // ── think (IDLE only; staggered by seat so 6 bots never spike one tick) ─
    if (
      this.state.kind === 'IDLE' &&
      world.tick % this.cfg.thinkEveryTicks === (this.seat as number) % this.cfg.thinkEveryTicks
    ) {
      this.adoptGoal(
        chooseGoal(world, this.seat, this.cfg, this.rng, world.tick >= this.buildReadyAtTick),
        world,
        send,
      );
    }

    // ── steer + act ──────────────────────────────────────────────────────
    const objective = this.objectivePos(world);
    if (objective !== null) {
      this.steerToward(objective, send, world);
      const d = dist(me.avatarPos, objective);
      if (d <= ARRIVE_RADIUS) this.onArrival(world, send, me.kind === 'Carrying');
    } else {
      this.vel = Math.max(0, this.vel - this.cfg.cursorAccel * 2);
    }
  }

  /* ───────────────────────── goal adoption ───────────────────────── */

  private adoptGoal(goal: BotGoal, world: World, send: (a: GameAction) => void): void {
    const t = world.tick;
    switch (goal.kind) {
      case 'BUILD':
        this.state = { kind: 'TO_SPARK', sparkId: goal.sparkId, since: t };
        return;
      case 'SEVER':
        this.state = { kind: 'ERRAND', verb: 'SEVER', targetPos: goal.pos, refId: goal.bondId as number, since: t };
        return;
      case 'RAINBOW':
        this.state = { kind: 'ERRAND', verb: 'RAINBOW', targetPos: goal.pos, refId: goal.rainbowId as number, since: t };
        return;
      case 'CLEAN':
        this.state = { kind: 'ERRAND', verb: 'CLEAN', targetPos: goal.pos, refId: null, since: t };
        return;
      case 'POTATO_GRAB':
        this.state = { kind: 'ERRAND', verb: 'POTATO_GRAB', targetPos: goal.pos, refId: goal.potatoId as number, since: t };
        return;
      case 'SHRINK':
        // Instant verb — no travel. Gate re-checked by the reducer (charge).
        send({ type: 'SHRINK_TERRITORY', playerId: this.seat });
        this.state = { kind: 'IDLE' };
        return;
      case 'FLEE':
        this.state = { kind: 'ERRAND', verb: 'FLEE', targetPos: goal.pos, refId: null, since: t };
        return;
      case 'REST':
        this.maybeWander(world);
        return;
    }
  }

  /* ─────────────────────── per-tick validation ───────────────────── */

  private validateState(world: World, carrying: boolean): void {
    const s = this.state;
    if (s.kind === 'TO_SPARK') {
      const spark = world.freeSparks.get(s.sparkId);
      if (spark === undefined || spark.state.kind !== 'Free') {
        this.state = { kind: 'IDLE' }; // raced away / consumed / now carried
      }
      return;
    }
    if (s.kind === 'HAUL') {
      // Eaten mid-haul (force-drop), or the spark vanished: nothing to place.
      if (!carrying) this.state = { kind: 'IDLE' };
      return;
    }
    if (s.kind === 'ERRAND') {
      if (s.verb === 'SEVER' && !world.bonds.has(s.refId as BondId)) {
        this.state = { kind: 'IDLE' }; // physics/bomb got there first
      }
      if (s.verb === 'RAINBOW' && !world.rainbows.has(s.refId as RainbowId)) {
        this.state = { kind: 'IDLE' }; // clicked by someone else / dissipated
      }
      if (s.verb === 'POTATO_GRAB' && !world.potatoes.has(s.refId as PotatoId)) {
        this.state = { kind: 'IDLE' };
      }
    }
  }

  /* ───────────────────────── movement ────────────────────────────── */

  private objectivePos(world: World): Vec2 | null {
    const s = this.state;
    switch (s.kind) {
      case 'IDLE':
        return this.wanderTarget;
      case 'TO_SPARK': {
        const spark = world.freeSparks.get(s.sparkId);
        return spark !== undefined ? spark.pos : null; // validated above; belt+suspenders
      }
      case 'HAUL':
        return s.buildPos;
      case 'ERRAND':
        return s.targetPos;
    }
  }

  private steerToward(target: Vec2, send: (a: GameAction) => void, world: World): void {
    const cur = this.cursor as Vec2;
    const dx = target.x - cur.x;
    const dy = target.y - cur.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.5) {
      this.vel = 0;
      if (this.state.kind === 'IDLE') this.wanderTarget = null;
      return;
    }
    // Accel ramp + arrive-deceleration (Council F1 fix #3 — no robotic lurch).
    this.vel = Math.min(this.cfg.cursorSpeed, this.vel + this.cfg.cursorAccel);
    const speed = Math.min(this.vel, Math.max(1, d * 0.25));
    const ux = dx / d;
    const uy = dy / d;
    // Perpendicular hand wobble (deterministic rng draw per moving tick).
    const w = (this.rng() * 2 - 1) * this.cfg.wobble;
    cur.x += ux * speed - uy * w;
    cur.y += uy * speed + ux * w;
    send({
      type: 'UPDATE_AVATAR_POS',
      playerId: this.seat,
      pos: { x: cur.x, y: cur.y },
    });
    void world;
  }

  private maybeWander(world: World): void {
    if (this.wanderTarget !== null) return;
    const me = world.players.get(this.seat);
    if (me === undefined) return;
    // Stroll near the current position (alive-looking rest, no goal).
    const a = this.rng() * Math.PI * 2;
    const r = this.rng() * WANDER_RADIUS;
    this.wanderTarget = {
      x: me.avatarPos.x + Math.cos(a) * r,
      y: me.avatarPos.y + Math.sin(a) * r,
    };
  }

  /* ───────────────────────── arrival verbs ───────────────────────── */

  private onArrival(world: World, send: (a: GameAction) => void, carrying: boolean): void {
    const s = this.state;
    const me = world.players.get(this.seat);
    if (me === undefined) return;

    if (s.kind === 'TO_SPARK') {
      const spark = world.freeSparks.get(s.sparkId);
      // me.kind guard: fsmPickup throws CarryViolation while Carrying — the
      // self-heal above makes this unreachable, but a throw here would kill
      // the whole tick loop, so belt-and-suspenders.
      if (spark === undefined || spark.state.kind !== 'Free' || me.kind !== 'Idle') {
        this.state = { kind: 'IDLE' };
        return;
      }
      send({
        type: 'PICKUP_SPARK',
        sparkId: s.sparkId,
        playerId: this.seat,
        pos: { x: spark.pos.x, y: spark.pos.y },
      });
      // Synchronous local dispatch → confirm the claim landed (S86 P3
      // claim-outcome pattern). A raced/gated reject leaves us Idle.
      const after = world.players.get(this.seat);
      if (after !== undefined && after.kind === 'Carrying' && after.carriedSparkId === s.sparkId) {
        const buildPos = chooseBuildPos(world, this.seat, this.totalSeats, this.cfg, this.rng);
        this.state = { kind: 'HAUL', sparkId: s.sparkId, buildPos, since: world.tick };
      } else {
        this.state = { kind: 'IDLE' };
      }
      return;
    }

    if (s.kind === 'HAUL') {
      if (!carrying || me.kind !== 'Carrying') {
        this.state = { kind: 'IDLE' };
        return;
      }
      // Place the carried spark HERE (spark.pos == avatarPos via the S45
      // coupling). Remote-origin re-pick resolves the bond target from
      // placementPos; we predict it only to compute the stiffness tier the
      // same way controls.ts does (anchor → MID). NOTE: placePrimitive
      // consumes player.carriedSparkId — read THAT, not the bookkeeping id.
      const spark = world.freeSparks.get(me.carriedSparkId);
      if (spark === undefined) {
        this.state = { kind: 'IDLE' };
        return;
      }
      const placementPos = { x: me.avatarPos.x, y: me.avatarPos.y };
      const predictedTargetId = pickHostTargetPrimitive(world, placementPos, me.color);
      const predicted = predictedTargetId !== null ? world.primitives.get(predictedTargetId) : null;
      const tier: StiffnessTier =
        predicted !== null && predicted !== undefined
          ? lookupCombo(spark.type, predicted.type).stiffnessTier
          : 'MID';
      send({
        type: 'PLACE_PRIMITIVE',
        playerId: this.seat,
        targetPrimitiveId: null, // host re-pick path (S48 P2) is authoritative
        stiffnessTier: tier,
        placementPos,
      });
      const after = world.players.get(this.seat);
      if (after !== undefined && after.kind === 'Idle') {
        // Placement landed (or was rejected AND the gate preserved carry —
        // distinguished below). Idle = spark consumed = success.
        this.buildReadyAtTick = world.tick + this.cfg.buildCooldownTicks;
        this.state = { kind: 'IDLE' };
      } else {
        // Still Carrying = silent reject (zone/territory race). Re-route to a
        // fresh build point rather than hammering the same illegal spot.
        const buildPos = chooseBuildPos(world, this.seat, this.totalSeats, this.cfg, this.rng);
        this.state = { kind: 'HAUL', sparkId: s.sparkId, buildPos, since: world.tick };
      }
      return;
    }

    if (s.kind === 'ERRAND') {
      switch (s.verb) {
        case 'SEVER': {
          // Stand-off check is built into arrival; cut only if still hostile-
          // valid and charged (reducer re-validates — this avoids waste).
          if (me.disruptionCharges >= 1 && world.bonds.has(s.refId as BondId)) {
            send({
              type: 'SEVER_BOND',
              bondId: s.refId as BondId,
              playerId: this.seat,
              cause: 'player',
            });
          }
          this.state = { kind: 'IDLE' };
          return;
        }
        case 'RAINBOW': {
          if (world.rainbows.has(s.refId as RainbowId)) {
            send({ type: 'TRIGGER_RAINBOW', rainbowId: s.refId as RainbowId, playerId: this.seat });
          }
          this.state = { kind: 'IDLE' };
          return;
        }
        case 'CLEAN':
          // Host auto-cleans by owner proximity (seagullLifecycle) — being
          // here IS the verb. Done.
          this.state = { kind: 'IDLE' };
          return;
        case 'POTATO_GRAB': {
          if (world.potatoes.has(s.refId as PotatoId)) {
            send({ type: 'PICKUP_POTATO', potatoId: s.refId as PotatoId, playerId: this.seat });
            const after = world.players.get(this.seat);
            if (after !== undefined && after.carriedPotatoId !== undefined) {
              // Deliver to the nearest enemy prim; cook-off (3 s) keeps the
              // pressure on — IMBA speed makes the window real.
              const enemy = nearestEnemyPrimPos(world, this.seat, me.avatarPos);
              this.state = {
                kind: 'ERRAND',
                verb: 'POTATO_PLANT',
                targetPos: enemy ?? { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y },
                refId: null,
                since: world.tick,
              };
              return;
            }
          }
          this.state = { kind: 'IDLE' };
          return;
        }
        case 'POTATO_PLANT': {
          if (me.carriedPotatoId !== undefined) {
            send({
              type: 'PLACE_POTATO',
              playerId: this.seat,
              pos: { x: me.avatarPos.x, y: me.avatarPos.y },
            });
          }
          this.state = { kind: 'IDLE' };
          return;
        }
        case 'FLEE':
          this.state = { kind: 'IDLE' };
          return;
      }
    }
  }

  /* ───────────────────────── stuck recovery ──────────────────────── */

  private abandon(world: World, send: (a: GameAction) => void, me: Player): void {
    if (me.kind === 'Carrying') {
      send({
        type: 'DROP_SPARK',
        playerId: this.seat,
        pos: { x: me.avatarPos.x, y: me.avatarPos.y },
      });
    }
    if (me.carriedPotatoId !== undefined) {
      send({ type: 'DROP_POTATO', playerId: this.seat });
    }
    this.vel = 0;
    this.state = { kind: 'IDLE' };
    void world;
  }
}

/** Local helper mirroring botBrain.nearestEnemyPrim but returning a bare Vec2
 *  offset to a SEVER-style standoff (plant next to, not on top of, the prim —
 *  PLACE_POTATO arms at the avatar, the blast radius does the rest). */
function nearestEnemyPrimPos(world: World, seat: PlayerId, from: Vec2): Vec2 | null {
  let best: { x: number; y: number; d: number } | null = null;
  for (const prim of world.primitives.values()) {
    if (prim.placedBy === seat) continue;
    const dx = prim.pos.x - from.x;
    const dy = prim.pos.y - from.y;
    const d = dx * dx + dy * dy;
    if (best === null || d < best.d) best = { x: prim.pos.x, y: prim.pos.y, d };
  }
  if (best === null) return null;
  return { x: best.x, y: best.y };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
