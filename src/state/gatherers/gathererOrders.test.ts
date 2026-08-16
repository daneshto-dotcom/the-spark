/**
 * SPARK — S141 P2 (V6-1.4) GATHERER ORDER QUEUE tests. Owner ruling B4.
 *
 * The rank tests exist because BOTH external Council seats independently rejected the first design.
 * It ranked each gatherer among the currently-SEEKING units, and that set changes every time ANY of
 * the player's gatherers claims a spark or deposits — so a unit that was rank 0 became rank 1 the
 * next tick, retargeted, and could thrash without ever completing a haul. Ranking over ALL owned
 * units makes the slot stable for the life of the match. `rank is stable while peers change state`
 * is the test that would have gone red on the rejected design.
 */

import { describe, expect, it } from 'vitest';
import { bankCount, bankCountOf } from '../castleBank.ts';
import { dispatch, makeWorld, type World } from '../world.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import {
  GATHERER_ORDER_QUEUE_MAX, PLAYER_COLORS, SPAWNER_CENTER_X, SPAWNER_CENTER_Y, SparkType,
} from '../../constants.ts';
import { asGathererId, asPlayerId, asSparkId } from '../../types.ts';
import { makeFreeSpark } from '../../game/spark.ts';
import { makeGatherer, type Gatherer } from './gatherer.ts';
import {
  applyCancelGathererOrder, applyEnqueueGathererOrder, applyGathererTick,
  consumeGathererOrder, orderForGatherer, pickGathererTarget,
} from './gathererLifecycle.ts';
import { coalesceOrders } from '../../render/castlePanel.ts';
import { snapshot, restore } from '../save.ts';
import { CLIENT_INTENT_TYPES } from '../../net/protocol.ts';
import { isBenchDeniedIntent } from '../benchGate.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);

function setup(): World {
  const w = makeWorld(0);
  w.players.set(P0, makeIdlePlayer(P0, PLAYER_COLORS[0]));
  w.players.set(P1, makeIdlePlayer(P1, PLAYER_COLORS[1]));
  return w;
}

function addGatherer(w: World, owner = P0): Gatherer {
  const id = asGathererId(w.nextGathererId++);
  const g = makeGatherer({ id, ownerPlayerId: owner, pos: { x: 100, y: 100 }, spawnedAtTick: 0 });
  w.gatherers.set(id, g);
  return g;
}

let nextSpark = 500;
/** A harvestable spark inside the quarry, `dx` px right of centre. */
function addSpark(w: World, type: SparkType, dx = 0): ReturnType<typeof makeFreeSpark> {
  const s = makeFreeSpark({
    id: asSparkId(nextSpark++), type,
    pos: { x: SPAWNER_CENTER_X + dx, y: SPAWNER_CENTER_Y },
    velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
  });
  w.freeSparks.set(s.id, s);
  return s;
}

const enqueue = (w: World, t: SparkType, playerId = P0): void => {
  applyEnqueueGathererOrder(w, { type: 'ENQUEUE_GATHERER_ORDER', playerId, sparkType: t });
};

describe('S141 P2 — enqueue / cancel (owner ruling B4: click a shape N times => N queued)', () => {
  it('N clicks queue N, in order', () => {
    const w = setup();
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Triangle);
    expect(w.gathererOrders.get(P0)).toEqual([SparkType.Square, SparkType.Square, SparkType.Triangle]);
  });

  it('cancel removes the LAST matching entry, so click-then-cancel is symmetric', () => {
    const w = setup();
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Triangle);
    enqueue(w, SparkType.Square);
    applyCancelGathererOrder(w, { type: 'CANCEL_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Square });
    expect(w.gathererOrders.get(P0)).toEqual([SparkType.Square, SparkType.Triangle]);
  });

  it('an emptied queue is DELETED, so "empty" and "absent" are the same hashable state', () => {
    const w = setup();
    enqueue(w, SparkType.Circle);
    applyCancelGathererOrder(w, { type: 'CANCEL_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Circle });
    expect(w.gathererOrders.has(P0)).toBe(false);
  });

  it('cancelling something not queued, or for a seat with no queue, is a silent no-op', () => {
    const w = setup();
    enqueue(w, SparkType.Circle);
    applyCancelGathererOrder(w, { type: 'CANCEL_GATHERER_ORDER', playerId: P0, sparkType: SparkType.Line });
    applyCancelGathererOrder(w, { type: 'CANCEL_GATHERER_ORDER', playerId: P1, sparkType: SparkType.Line });
    expect(w.gathererOrders.get(P0)).toEqual([SparkType.Circle]);
  });

  it('an unknown player cannot open a queue (no reducer trusts the client)', () => {
    const w = setup();
    enqueue(w, SparkType.Circle, asPlayerId(9));
    expect(w.gathererOrders.has(asPlayerId(9))).toBe(false);
  });

  it('the queue is BOUNDED — it is serialized AND hashed, so unbounded growth is a real cost', () => {
    const w = setup();
    for (let i = 0; i < GATHERER_ORDER_QUEUE_MAX + 25; i++) enqueue(w, SparkType.Dot);
    expect(w.gathererOrders.get(P0)!.length).toBe(GATHERER_ORDER_QUEUE_MAX);
  });

  it('queues are per-player and never bleed across seats', () => {
    const w = setup();
    enqueue(w, SparkType.Square, P0);
    enqueue(w, SparkType.Circle, P1);
    expect(w.gathererOrders.get(P0)).toEqual([SparkType.Square]);
    expect(w.gathererOrders.get(P1)).toEqual([SparkType.Circle]);
  });
});

describe('S141 P2 — rank assignment (the Council fix)', () => {
  it('each gatherer gets the entry at its OWN rank, so a queue is worked in PARALLEL', () => {
    const w = setup();
    const g1 = addGatherer(w);
    const g2 = addGatherer(w);
    const g3 = addGatherer(w);
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Triangle);
    expect(orderForGatherer(w, g1)).toBe(SparkType.Square);
    expect(orderForGatherer(w, g2)).toBe(SparkType.Square);
    expect(orderForGatherer(w, g3)).toBe(SparkType.Triangle);
  });

  it('⭐ rank is STABLE while peers change FSM state (the thrash both seats predicted)', () => {
    // On the rejected design the rank was taken over the currently-SEEKING subset, so g2 leaving
    // SEEKING would promote g3 from rank 2 to rank 1 and make it abandon its target mid-walk.
    const w = setup();
    const g1 = addGatherer(w);
    const g2 = addGatherer(w);
    const g3 = addGatherer(w);
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Circle);
    enqueue(w, SparkType.Triangle);
    const before = [g1, g2, g3].map((g) => orderForGatherer(w, g));
    g2.state = 'HAULING'; // exactly what happens the instant any peer claims a spark
    g1.state = 'WAITING';
    expect([g1, g2, g3].map((g) => orderForGatherer(w, g))).toEqual(before);
  });

  it('a gatherer whose rank exceeds the queue gets null and falls through to nearest-any', () => {
    const w = setup();
    const g1 = addGatherer(w);
    const g2 = addGatherer(w);
    enqueue(w, SparkType.Square);
    expect(orderForGatherer(w, g1)).toBe(SparkType.Square);
    expect(orderForGatherer(w, g2)).toBeNull(); // extra units are never idled by a short queue
  });

  it('rank counts only the OWNER\'s units — another seat\'s gatherers do not shift it', () => {
    const w = setup();
    const mine = addGatherer(w, P0);
    addGatherer(w, P1);
    addGatherer(w, P1);
    enqueue(w, SparkType.Spiral);
    expect(orderForGatherer(w, mine)).toBe(SparkType.Spiral);
  });

  it('no queue means no order (and therefore the nearest-any fall-through)', () => {
    const w = setup();
    expect(orderForGatherer(w, addGatherer(w))).toBeNull();
  });
});

describe('S141 P2 — target selection honours the queue, and never stops the player earning', () => {
  it('the queued type WINS over a nearer spark of another type', () => {
    const w = setup();
    const g = addGatherer(w);
    g.pos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    const near = addSpark(w, SparkType.Dot, 5);
    const wanted = addSpark(w, SparkType.Square, 60);
    enqueue(w, SparkType.Square);
    expect(pickGathererTarget(w, g)).toBe(wanted.id);
    expect(pickGathererTarget(w, g)).not.toBe(near.id);
  });

  it('an EMPTY queue falls through to nearest-of-any-type (a priority override, not a switch)', () => {
    const w = setup();
    const g = addGatherer(w);
    g.pos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    const near = addSpark(w, SparkType.Dot, 5);
    addSpark(w, SparkType.Square, 60);
    expect(pickGathererTarget(w, g)).toBe(near.id);
  });

  it('a queued type with NONE available still fetches the nearest of any type', () => {
    // The unattended player keeps earning — this is the ruling's explicit requirement.
    const w = setup();
    const g = addGatherer(w);
    g.pos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    const only = addSpark(w, SparkType.Dot, 5);
    enqueue(w, SparkType.Square); // no Square exists
    expect(pickGathererTarget(w, g)).toBe(only.id);
  });

  it('the QUEUE outranks the shipped per-unit preferredType filter', () => {
    // Two mechanics exist for one job and the owner ruled against the filter; the queue must win.
    const w = setup();
    const g = addGatherer(w);
    g.pos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    g.preferredType = SparkType.Dot;
    addSpark(w, SparkType.Dot, 5);
    const queued = addSpark(w, SparkType.Square, 60);
    enqueue(w, SparkType.Square);
    expect(pickGathererTarget(w, g)).toBe(queued.id);
  });

  it('preferredType still applies as the FALLBACK when the queue has nothing for this unit', () => {
    const w = setup();
    const g = addGatherer(w);
    g.pos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    g.preferredType = SparkType.Square;
    addSpark(w, SparkType.Dot, 5);
    const preferred = addSpark(w, SparkType.Square, 60);
    expect(pickGathererTarget(w, g)).toBe(preferred.id);
  });

  it('selection draws NO randomness — the same world picks the same spark every time', () => {
    const w = setup();
    const g = addGatherer(w);
    addSpark(w, SparkType.Circle, 10);
    addSpark(w, SparkType.Circle, 20);
    const picks = new Set(Array.from({ length: 30 }, () => pickGathererTarget(w, g)));
    expect(picks.size).toBe(1);
  });
});

describe('S141 P2 — a DELIVERY consumes one order', () => {
  it('pops the first matching entry, leaving the rest in order', () => {
    const w = setup();
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Circle);
    enqueue(w, SparkType.Square);
    expect(consumeGathererOrder(w, P0, SparkType.Square)).toBe(true);
    expect(w.gathererOrders.get(P0)).toEqual([SparkType.Circle, SparkType.Square]);
  });

  it('a delivery matching NOTHING pops nothing (it did not fulfil an order)', () => {
    const w = setup();
    enqueue(w, SparkType.Square);
    expect(consumeGathererOrder(w, P0, SparkType.Line)).toBe(false);
    expect(w.gathererOrders.get(P0)).toEqual([SparkType.Square]);
  });

  it('END-TO-END: a real haul cycle deposits the shape AND pops its order', () => {
    const w = setup();
    const g = addGatherer(w);
    g.pos = { x: SPAWNER_CENTER_X, y: SPAWNER_CENTER_Y };
    const target = addSpark(w, SparkType.Square, 0);
    enqueue(w, SparkType.Square);
    // Run the real FSM until the shape lands in the bank.
    for (let t = 0; t < 4000 && w.castleBanks.get(P0) === undefined; t++) {
      w.tick = t;
      applyGathererTick(w, { type: 'GATHERER_TICK', gathererId: g.id });
    }
    // S146 P2 — the inventory is a per-TYPE tally, so the delivery is asserted by TYPE. It cannot
    // be asserted by spark id any more: the entity is discarded on deposit and a pull mints a new
    // one. What the order queue actually promises is that the ORDERED TYPE arrived, which is this.
    expect(bankCountOf(w.castleBanks, P0, target.type)).toBe(1);
    expect(bankCount(w.castleBanks, P0)).toBe(1);
    expect(w.gathererOrders.has(P0)).toBe(false); // the order was consumed by the delivery
  });
});

describe('S141 P2 — the wire, the disk and the gates', () => {
  it('queues survive a full JSON round-trip with their ORDER intact', () => {
    const w = setup();
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Circle);
    enqueue(w, SparkType.Square);
    enqueue(w, SparkType.Line, P1);
    const w2 = setup();
    restore(JSON.parse(JSON.stringify(snapshot(w))), w2);
    expect(w2.gathererOrders.get(P0)).toEqual([SparkType.Square, SparkType.Circle, SparkType.Square]);
    expect(w2.gathererOrders.get(P1)).toEqual([SparkType.Line]);
  });

  it('a world with NO queues round-trips with none (additive-optional, no byte cost)', () => {
    const w = setup();
    const snap = JSON.parse(JSON.stringify(snapshot(w)));
    expect(snap.gathererOrders).toBeUndefined();
    const w2 = setup();
    restore(snap, w2);
    expect(w2.gathererOrders.size).toBe(0);
  });

  it('a load CLEARS stale queues rather than merging (a successor must not inherit ghosts)', () => {
    const w = setup(); // no queues
    const w2 = setup();
    enqueue(w2, SparkType.Dot); // w2 has a stale queue from before the load
    restore(JSON.parse(JSON.stringify(snapshot(w))), w2);
    expect(w2.gathererOrders.size).toBe(0);
  });

  it('⛔ BOTH intents are in the CLIENT_INTENT allowlist (or a joiner is silently ignored)', () => {
    // A missing row compiles clean, passes every test, works in solo and on the host seat, and is
    // then dropped for a networked joiner — the seat-asymmetry desync.
    expect(CLIENT_INTENT_TYPES.has('ENQUEUE_GATHERER_ORDER')).toBe(true);
    expect(CLIENT_INTENT_TYPES.has('CANCEL_GATHERER_ORDER')).toBe(true);
  });

  it('queueing is ALLOWED while benched (it acquires nothing and builds nothing)', () => {
    expect(isBenchDeniedIntent('ENQUEUE_GATHERER_ORDER')).toBe(false);
    expect(isBenchDeniedIntent('CANCEL_GATHERER_ORDER')).toBe(false);
    // …but the bench still stops the benched player USING what gets hauled.
    expect(isBenchDeniedIntent('PULL_FROM_BANK')).toBe(true);
  });

  it('teardown clears the queues with the economy they instruct', () => {
    const w = setup();
    enqueue(w, SparkType.Square);
    addGatherer(w);
    // RETURN_TO_TITLE is one of the inline teardown sites that does NOT route through
    // teardownGatherers — the S136 lesson was to assert teardown through a real dispatched action.
    dispatch(w, { type: 'RETURN_TO_TITLE' });
    expect(w.gathererOrders.size).toBe(0);
  });
});

describe('S141 P2 — the panel coalesces the queue for display (owner ruling B4)', () => {
  it('collapses repeats into one chip with a count, in FIRST-APPEARANCE order', () => {
    expect(coalesceOrders([SparkType.Square, SparkType.Square, SparkType.Triangle, SparkType.Square]))
      .toEqual([{ type: SparkType.Square, count: 3 }, { type: SparkType.Triangle, count: 1 }]);
  });

  it('preserves "leftmost is next" — the first chip is the type at the head of the queue', () => {
    const q = [SparkType.Circle, SparkType.Square, SparkType.Square, SparkType.Square];
    const chips = coalesceOrders(q);
    expect(chips[0].type).toBe(q[0]); // NOT the most numerous type
    expect(chips[0].count).toBe(1);
  });

  it('an empty queue yields no chips', () => {
    expect(coalesceOrders([])).toEqual([]);
  });
});
