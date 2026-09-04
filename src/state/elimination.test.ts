/**
 * SPARK — S161 P2: SEAT ELIMINATION (owner R127).
 *
 * ⚠ EVERY MULTI-SEAT ASSERTION IN THIS FILE WAS ABSENT BEFORE IT. The full suite stayed green
 * through the win-rule rewrite — 3488 tests, nothing red — because every existing fixture that
 * reaches the castle gate has ONE or TWO seats, and at two seats the old rule ("first castle to
 * fall ends it, winner = `survivors[0]`") and the new one ("last one standing") give the same
 * answer. The `Map`-order bug the old rule carried was therefore unreachable from the suite, and
 * so is its fix. That is the gap these tests close.
 */

import { describe, expect, it } from 'vitest';
import {
  ELIMINATION_INTENT_POLICY,
  isEliminated,
  isEliminationDeniedIntent,
  livingSeats,
  markFallenSeats,
  matchPlacings,
} from './elimination.ts';
import { BENCH_INTENT_POLICY } from './benchGate.ts';
import { CLIENT_INTENT_TYPES } from '../net/protocol.ts';
import { dispatch, makeWorld } from './world.ts';
import { makeGameStateExtras, tickGameState } from './gameState.ts';
import { makeIdlePlayer } from '../game/player.ts';
import {
  CASTLE_MAX_HP,
  GATHERER_PRICE,
  PLAYER_COLORS,
  SPAWNER_CENTER_X,
  SPAWNER_CENTER_Y,
  SparkType,
} from '../constants.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import { makeFreeSpark } from '../game/spark.ts';
import { netSnapshot, applyNetSnapshot, snapshot, restore } from './save.ts';

const P = (n: number) => asPlayerId(n);

/** A board with `n` seats, every castle at full health. */
function boardOf(n: number): ReturnType<typeof makeWorld> {
  const w = makeWorld(0);
  for (let i = 0; i < n; i++) {
    if (!w.players.has(P(i))) {
      w.players.set(P(i), makeIdlePlayer(P(i), PLAYER_COLORS[i % PLAYER_COLORS.length]!));
    }
  }
  return w;
}

const raze = (w: ReturnType<typeof makeWorld>, seat: number): void => {
  w.players.get(P(seat))!.castleHp = 0;
};

describe('ELIMINATION_INTENT_POLICY completeness', () => {
  it('mirrors CLIENT_INTENT_TYPES exactly, in both directions', () => {
    // The benchGate.test.ts contract, for the same reason: adding a client intent must FORCE an
    // explicit allow/deny decision here rather than defaulting a dead seat back into the match.
    expect(new Set(Object.keys(ELIMINATION_INTENT_POLICY))).toEqual(new Set(CLIENT_INTENT_TYPES));
  });

  it('covers exactly the same verbs as the bench policy', () => {
    expect(new Set(Object.keys(ELIMINATION_INTENT_POLICY)))
      .toEqual(new Set(Object.keys(BENCH_INTENT_POLICY)));
  });

  it('is STRICTER than the bench: every bench-denied verb is denied here too', () => {
    for (const [verb, policy] of Object.entries(BENCH_INTENT_POLICY)) {
      if (policy === 'deny') {
        expect(isEliminationDeniedIntent(verb as never), verb).toBe(true);
      }
    }
  });

  it('allows only release verbs and pointer telemetry — nothing that advances a dead seat', () => {
    const allowed = Object.entries(ELIMINATION_INTENT_POLICY)
      .filter(([, v]) => v === 'allow')
      .map(([k]) => k)
      .sort();
    expect(allowed).toEqual(['DROP_POTATO', 'DROP_SPARK', 'UPDATE_AVATAR_POS']);
  });

  it('denies the three standing-order verbs the BENCH allows — the policies really differ', () => {
    // If this ever goes red because someone "unified" the two gates, read elimination.ts's policy
    // docblock: a bench lifts, an elimination does not, so one of the two rulings would be wrong.
    for (const verb of ['SET_GATHERER_PREFERENCE', 'ENQUEUE_GATHERER_ORDER', 'CANCEL_GATHERER_ORDER'] as const) {
      expect(BENCH_INTENT_POLICY[verb]).toBe('allow');
      expect(ELIMINATION_INTENT_POLICY[verb]).toBe('deny');
    }
  });

  it('returns false for host-internal action types — the gate is the intent surface only', () => {
    expect(isEliminationDeniedIntent('GATHERER_TICK')).toBe(false);
    expect(isEliminationDeniedIntent('SPAWN_SPARK')).toBe(false);
    expect(isEliminationDeniedIntent('WIN_TRIGGER')).toBe(false);
  });
});

describe('isEliminated / livingSeats', () => {
  it('is the same `<= 0` threshold castleGuns uses, over-damage included', () => {
    const w = boardOf(2);
    expect(isEliminated(w.players.get(P(0))!)).toBe(false);
    w.players.get(P(0))!.castleHp = 1;
    expect(isEliminated(w.players.get(P(0))!)).toBe(false);
    w.players.get(P(0))!.castleHp = 0;
    expect(isEliminated(w.players.get(P(0))!)).toBe(true);
    w.players.get(P(0))!.castleHp = -250;
    expect(isEliminated(w.players.get(P(0))!)).toBe(true);
  });

  it('lists survivors in seat-id order, never Map order', () => {
    const w = boardOf(4);
    // Re-insert seat 1 last so Map order (0,2,3,1) differs from id order (0,1,2,3).
    const p1 = w.players.get(P(1))!;
    w.players.delete(P(1));
    w.players.set(P(1), p1);
    expect([...w.players.keys()]).toEqual([P(0), P(2), P(3), P(1)]);
    expect(livingSeats(w)).toEqual([P(0), P(1), P(2), P(3)]);
    raze(w, 0);
    expect(livingSeats(w)).toEqual([P(1), P(2), P(3)]);
  });
});

describe('markFallenSeats', () => {
  it('stamps the tick a castle fell, and returns who was stamped', () => {
    const w = boardOf(3);
    w.tick = 900;
    raze(w, 2);
    expect(markFallenSeats(w)).toEqual([P(2)]);
    expect(w.players.get(P(2))!.eliminatedAtTick).toBe(900);
    expect(w.players.get(P(0))!.eliminatedAtTick).toBeUndefined();
  });

  it('is WRITE-ONCE — a later tick must not overwrite the stamp', () => {
    // Without this, every placing collapses to "everyone died at the end".
    const w = boardOf(3);
    w.tick = 100;
    raze(w, 1);
    markFallenSeats(w);
    w.tick = 5000;
    expect(markFallenSeats(w)).toEqual([]); // nothing NEW fell
    expect(w.players.get(P(1))!.eliminatedAtTick).toBe(100);
  });

  it('stamps several seats that fall on the same tick, in id order', () => {
    const w = boardOf(4);
    w.tick = 42;
    raze(w, 3);
    raze(w, 1);
    expect(markFallenSeats(w)).toEqual([P(1), P(3)]);
  });
});

describe('matchPlacings', () => {
  it('ranks survivors first, then the fallen in reverse order of elimination', () => {
    const w = boardOf(4);
    w.tick = 100; raze(w, 2); markFallenSeats(w);
    w.tick = 300; raze(w, 0); markFallenSeats(w);
    w.tick = 900; raze(w, 3); markFallenSeats(w);
    // Seat 1 survives; then 3 (lasted longest of the fallen), then 0, then 2.
    expect(matchPlacings(w)).toEqual([P(1), P(3), P(0), P(2)]);
  });

  it('breaks a same-tick tie by seat id rather than by Map order', () => {
    const w = boardOf(3);
    // Insert out of order so Map order is 2,0,1.
    const p0 = w.players.get(P(0))!;
    w.players.delete(P(0));
    w.players.set(P(0), p0);
    w.tick = 50;
    raze(w, 0);
    raze(w, 1);
    markFallenSeats(w);
    const placings = matchPlacings(w);
    expect(placings[0]).toBe(P(2));            // the survivor
    expect(placings.slice(1)).toEqual([P(0), P(1)]); // tie broken by id, not insertion
  });
});

describe('the dispatch gate (owner R127 — "so yes he is out")', () => {
  it('refuses an eliminated seat\'s PICKUP_SPARK and counts it as actorEliminated', () => {
    const w = boardOf(2);
    const s = makeFreeSpark({
      id: asSparkId(1), type: SparkType.Dot, pos: { x: 100, y: 100 },
      velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
    });
    dispatch(w, { type: 'SPAWN_SPARK', spark: s });
    raze(w, 0);
    const before = w.diagnostics.rejectReasons.actorEliminated;
    dispatch(w, { type: 'PICKUP_SPARK', sparkId: s.id, playerId: P(0), pos: { x: 100, y: 100 } });
    expect(w.diagnostics.rejectReasons.actorEliminated).toBe(before + 1);
    expect(w.players.get(P(0))!.kind).toBe('Idle'); // never picked it up
  });

  it('does NOT touch the bench counter — the two rejects stay distinguishable', () => {
    const w = boardOf(2);
    raze(w, 0);
    const benchBefore = w.diagnostics.rejectReasons.actorBenched;
    dispatch(w, { type: 'BUY_GATHERER', playerId: P(0) });
    expect(w.diagnostics.rejectReasons.actorBenched).toBe(benchBefore);
    expect(w.diagnostics.rejectReasons.actorEliminated).toBeGreaterThan(0);
  });

  it('lets a LIVING seat through the same verb — anti-vacuity', () => {
    const w = boardOf(2);
    const before = w.diagnostics.rejectReasons.actorEliminated;
    dispatch(w, { type: 'BUY_GATHERER', playerId: P(1) });
    expect(w.diagnostics.rejectReasons.actorEliminated).toBe(before);
  });

  it('still allows UPDATE_AVATAR_POS, which is what makes "spectator" mean anything', () => {
    const w = boardOf(2);
    raze(w, 0);
    dispatch(w, { type: 'UPDATE_AVATAR_POS', playerId: P(0), pos: { x: 321, y: 654 } });
    expect(w.players.get(P(0))!.avatarPos).toEqual({ x: 321, y: 654 });
  });
});

describe('the economy gate (owner R127 — "cant gather anymore primitives")', () => {
  it('freezes a fallen seat\'s gatherers, and only that seat\'s', () => {
    const w = boardOf(2);
    // ⚠ BUY_GATHERER SPENDS victory points from the buyer's own pool, so a fixture that skips this
    // mints nothing and the assertions below pass vacuously against two undefined units.
    w.scoreByPlayer.set(P(0), GATHERER_PRICE * 4);
    w.scoreByPlayer.set(P(1), GATHERER_PRICE * 4);
    dispatch(w, { type: 'BUY_GATHERER', playerId: P(0) });
    dispatch(w, { type: 'BUY_GATHERER', playerId: P(1) });
    const g0 = [...w.gatherers.values()].find((g) => g.ownerPlayerId === P(0));
    const g1 = [...w.gatherers.values()].find((g) => g.ownerPlayerId === P(1));
    expect(g0).toBeDefined();
    expect(g1).toBeDefined();

    // ⚠ AND THE BOARD NEEDS SOMETHING TO FETCH. A SEEKING gatherer with no harvestable spark
    // returns "hold position", so without this BOTH units stand still and the control assertion
    // below passes for the wrong reason — which is exactly how it failed the first time.
    for (let i = 0; i < 8; i++) {
      const sp = makeFreeSpark({
        id: asSparkId(100 + i), type: SparkType.Dot,
        pos: { x: SPAWNER_CENTER_X + i * 9, y: SPAWNER_CENTER_Y + i * 7 },
        velocity: { x: 0, y: 0 }, dt: 1 / 60, createdTick: 0,
      });
      dispatch(w, { type: 'SPAWN_SPARK', spark: sp });
    }

    raze(w, 0);
    const frozenStart = { ...g0!.pos };
    const livingStart = { ...g1!.pos };
    for (let t = 0; t < 120; t++) {
      w.tick++;
      dispatch(w, { type: 'GATHERER_TICK', gathererId: g0!.id });
      dispatch(w, { type: 'GATHERER_TICK', gathererId: g1!.id });
    }
    expect(g0!.pos).toEqual(frozenStart);          // the dead seat's hauler never moved
    expect(g1!.pos).not.toEqual(livingStart);      // the living one did — anti-vacuity
  });
});

describe('the win rule (owner R127 — "spectator until there is one player left")', () => {
  it('does NOT end a 4-seat match when the first castle falls', () => {
    const w = boardOf(4);
    const ex = makeGameStateExtras();
    raze(w, 2);
    tickGameState(w, ex, P(0));
    expect(w.gameState).toBe('PLAYING');
    expect(w.players.get(P(2))!.eliminatedAtTick).toBe(w.tick);
  });

  it('does NOT end it when the second falls either', () => {
    const w = boardOf(4);
    const ex = makeGameStateExtras();
    raze(w, 2); tickGameState(w, ex, P(0));
    w.tick += 60;
    raze(w, 0); tickGameState(w, ex, P(0));
    expect(w.gameState).toBe('PLAYING');
  });

  it('ends it when only ONE seat is left, and that seat wins', () => {
    const w = boardOf(4);
    const ex = makeGameStateExtras();
    raze(w, 2); tickGameState(w, ex, P(0));
    w.tick += 60; raze(w, 0); tickGameState(w, ex, P(0));
    w.tick += 60; raze(w, 1); tickGameState(w, ex, P(0));
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(3)); // the survivor — NOT primaryPlayerId, which is seat 0
  });

  it('⛔ the winner is the SURVIVOR, not whoever Map order happens to reach first', () => {
    /*
     * The regression this whole priority exists for. Under the old rule this board ended on the
     * first fall and awarded the win to `survivors[0]` — the first LIVING seat in Map order, which
     * here is seat 3, not seat 1. Re-inserting seat 3 first is what makes the two rules disagree.
     */
    const w = boardOf(4);
    const ex = makeGameStateExtras();
    const p3 = w.players.get(P(3))!;
    w.players.delete(P(3));
    const rest = [...w.players.entries()];
    w.players.clear();
    w.players.set(P(3), p3);
    for (const [k, v] of rest) w.players.set(k, v);
    expect([...w.players.keys()][0]).toBe(P(3)); // Map order now starts at seat 3

    raze(w, 0); tickGameState(w, ex, P(0));
    w.tick += 60; raze(w, 2); tickGameState(w, ex, P(0));
    w.tick += 60; raze(w, 3); tickGameState(w, ex, P(0));
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(1)); // the last one standing
  });

  it('records a full placing order across the match', () => {
    const w = boardOf(4);
    const ex = makeGameStateExtras();
    w.tick = 100; raze(w, 1); tickGameState(w, ex, P(0));
    w.tick = 400; raze(w, 3); tickGameState(w, ex, P(0));
    w.tick = 800; raze(w, 0); tickGameState(w, ex, P(0));
    expect(matchPlacings(w)).toEqual([P(2), P(0), P(3), P(1)]);
  });

  it('SOLO IS UNCHANGED — a lone razed castle still ends the match', () => {
    const w = boardOf(1);
    const ex = makeGameStateExtras();
    expect(w.players.size).toBe(1);
    raze(w, 0);
    tickGameState(w, ex, P(0));
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(0));
  });

  it('1v1 IS UNCHANGED — the surviving seat wins on the first fall', () => {
    const w = boardOf(2);
    const ex = makeGameStateExtras();
    raze(w, 0);
    tickGameState(w, ex, P(0));
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(1));
  });

  it('a simultaneous wipe still terminates rather than hanging', () => {
    const w = boardOf(3);
    const ex = makeGameStateExtras();
    raze(w, 0); raze(w, 1); raze(w, 2);
    tickGameState(w, ex, P(0));
    expect(w.gameState).toBe('WIN');
    expect(livingSeats(w)).toEqual([]);
  });

  it('an untouched board never triggers the castle gate — anti-vacuity', () => {
    const w = boardOf(4);
    const ex = makeGameStateExtras();
    for (let t = 0; t < 30; t++) { w.tick++; tickGameState(w, ex, P(0)); }
    expect(w.gameState).toBe('PLAYING');
    for (const p of w.players.values()) expect(p.eliminatedAtTick).toBeUndefined();
  });
});

describe('the carry-FSM must not un-eliminate a seat', () => {
  it('preserves eliminatedAtTick across pickup and drop', async () => {
    // ⛔ THE ONE FIELD IN THIS FILE tsc CANNOT PROTECT. `eliminatedAtTick` is additive-OPTIONAL, so
    // omitting it from pickup()/drop()'s object literals compiles clean — unlike castleHp, raceId
    // and raidPoints, which are required and would have gone red. A spectating player dropping the
    // spark they happened to be holding would silently rejoin the match.
    const { pickup, drop } = await import('../game/player.ts');
    const w = boardOf(2);
    const p = w.players.get(P(0))!;
    p.castleHp = 0;
    p.eliminatedAtTick = 777;
    const carrying = pickup(p, asSparkId(5));
    expect(carrying.eliminatedAtTick).toBe(777);
    expect(drop(carrying).eliminatedAtTick).toBe(777);
    expect(isEliminated(drop(carrying))).toBe(true);
  });

  it('a living player round-trips with no stamp', () => {
    const w = boardOf(2);
    expect(w.players.get(P(1))!.eliminatedAtTick).toBeUndefined();
    expect(w.players.get(P(1))!.castleHp).toBe(CASTLE_MAX_HP);
  });
});

describe('the elimination stamp crosses the wire and the disk', () => {
  it('round-trips through a NetSnapshot', () => {
    const w = boardOf(3);
    w.tick = 615;
    raze(w, 1);
    markFallenSeats(w);
    const peer = boardOf(3);
    applyNetSnapshot(netSnapshot(w), peer);
    expect(peer.players.get(P(1))!.eliminatedAtTick).toBe(615);
    expect(peer.players.get(P(0))!.eliminatedAtTick).toBeUndefined();
    // And the peer therefore agrees about who is out — the whole point of serializing it.
    expect(livingSeats(peer)).toEqual([P(0), P(2)]);
  });

  it('round-trips through a disk save', () => {
    const w = boardOf(2);
    w.tick = 88;
    raze(w, 0);
    markFallenSeats(w);
    const loaded = boardOf(2);
    restore(snapshot(w), loaded);
    expect(loaded.players.get(P(0))!.eliminatedAtTick).toBe(88);
  });

  it('⛔ is ABSENT from the wire while nobody is out — byte-identity with v39', () => {
    // Additive-optional means a live board must serialize exactly as it did before this priority.
    const w = boardOf(4);
    for (const p of netSnapshot(w).players) {
      expect(Object.prototype.hasOwnProperty.call(p, 'eliminatedAtTick')).toBe(false);
    }
  });

  it('⛔ a v39 snapshot (no key) rehydrates as STILL PLAYING, never as eliminated-at-zero', () => {
    // The `?? 0` trap: `undefined` is the meaning here, not a missing value.
    const w = boardOf(2);
    const snap = netSnapshot(w);
    for (const p of snap.players) delete (p as { eliminatedAtTick?: number }).eliminatedAtTick;
    const peer = boardOf(2);
    applyNetSnapshot(snap, peer);
    for (const p of peer.players.values()) expect(p.eliminatedAtTick).toBeUndefined();
    expect(livingSeats(peer)).toEqual([P(0), P(1)]);
  });
});

/**
 * ⭐ S162 P4 (OF-2) — **A DROPPED PEER'S INTACT CASTLE USED TO BLOCK THE MATCH FROM ENDING.**
 *
 * `livingSeats` filters on `castleHp <= 0` alone, so a seat whose peer simply vanished counted as a
 * living contender forever. After R127 removed the first-castle-ends-it exit, the survivors had to
 * raze an absent player's keep — which was still shooting back — before anyone could win. A new way
 * for a match to HANG, opened by fixing something else.
 *
 * ⛔ THE PREDICATE IS HOST-ONLY AND OPTIONAL, and these tests pin both halves of that: passing it
 * subtracts a contender, and OMITTING it must reproduce the old behaviour byte for byte — because
 * `main.ts`'s client call omits it, and a client that reached a different verdict than the host
 * would be a divergence.
 */
describe('S162 P4 (OF-2) — an absent peer stops blocking the last-one-standing win', () => {
  it('⛔ CONTROL — with NO predicate the match still hangs, which is the bug as reported', () => {
    const w = boardOf(3);
    const ex = makeGameStateExtras();
    raze(w, 2); // one castle down; seat 1's peer has "left" but its castle stands
    tickGameState(w, ex, P(0));
    expect(w.gameState).toBe('PLAYING'); // two "living" seats — nobody can win
  });

  it('⭐ with the host predicate the SURVIVOR wins, and it is not primaryPlayerId by luck', () => {
    const w = boardOf(3);
    const ex = makeGameStateExtras();
    raze(w, 2);
    tickGameState(w, ex, P(0), (seat) => seat === P(1)); // seat 1's peer is long gone
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(0));
  });

  it('⭐ …and the same board awards it to seat 1 when it is seat 0 that vanished', () => {
    // Anti-vacuity: proves the winner tracks the predicate rather than falling back to seat 0,
    // which is `primaryPlayerId` here and would pass the test above for the wrong reason.
    const w = boardOf(3);
    const ex = makeGameStateExtras();
    raze(w, 2);
    tickGameState(w, ex, P(0), (seat) => seat === P(0));
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(1));
  });

  it('⛔ an absence ALONE never ends a match — no castle has fallen, so this is abandonment', () => {
    // `fallenCount` is deliberately derived from `living`, not from `contenders`. Ending a 1v1 the
    // moment the opponent's connection blinked would be a game-design decision nobody has ruled on.
    const w = boardOf(3);
    const ex = makeGameStateExtras();
    tickGameState(w, ex, P(0), (seat) => seat === P(1) || seat === P(2));
    expect(w.gameState).toBe('PLAYING');
  });

  it('an absent seat is NOT eliminated — it keeps its castle, its HP and no stamp', () => {
    const w = boardOf(3);
    const ex = makeGameStateExtras();
    raze(w, 2);
    tickGameState(w, ex, P(0), (seat) => seat === P(1));
    const gone = w.players.get(P(1))!;
    expect(gone.castleHp).toBe(CASTLE_MAX_HP);
    expect(gone.eliminatedAtTick).toBeUndefined(); // it left; it was never destroyed
    expect(livingSeats(w)).toContain(P(1)); // `living` is untouched, only `contenders` shrank
  });

  it('a predicate that says nobody is absent behaves exactly like omitting it', () => {
    const withNone = boardOf(3);
    const withOmit = boardOf(3);
    const exA = makeGameStateExtras();
    const exB = makeGameStateExtras();
    raze(withNone, 2);
    raze(withOmit, 2);
    tickGameState(withNone, exA, P(0), () => false);
    tickGameState(withOmit, exB, P(0));
    expect(withNone.gameState).toBe(withOmit.gameState);
    expect(withNone.lastWinnerId).toBe(withOmit.lastWinnerId);
  });

  it('⭐ a still-standing absent seat cannot WIN either — it is subtracted, not favoured', () => {
    const w = boardOf(3);
    const ex = makeGameStateExtras();
    raze(w, 0);
    raze(w, 1); // both present seats are dead; only the ABSENT seat 2 still has a castle
    tickGameState(w, ex, P(0), (seat) => seat === P(2));
    // contenders is empty, so this falls back to primaryPlayerId rather than crowning the peer who
    // walked away. Pinned so a future edit cannot quietly hand a match to a disconnected player.
    expect(w.gameState).toBe('WIN');
    expect(w.lastWinnerId).toBe(P(0));
  });
});

/**
 * ⭐ S162 P6 (OF-8) — **HOST-ONLY WAS ASSERTED IN THREE DOCBLOCKS AND GATED IN NONE.**
 *
 * `markFallenSeats` is documented HOST-ONLY at `elimination.ts` (twice) and at
 * `Player.eliminatedAtTick`, which names the hazard outright: *"writing it on a client would let two
 * peers disagree about who lost first."* The only production call site had no gate, and
 * `tickGameState` runs on every peer — so every joiner wrote the field.
 *
 * It self-healed on the next snapshot, which is why nothing ever caught it. These two cases are the
 * gate the comments always described.
 */
describe('S162 P6 (OF-8) — only the host stamps eliminatedAtTick', () => {
  it('⛔ a CLIENT does not write the stamp — it arrives by snapshot instead', () => {
    const w = boardOf(3);
    w.isHost = false;
    const ex = makeGameStateExtras();
    raze(w, 2);
    tickGameState(w, ex, P(0));
    expect(w.players.get(P(2))!.eliminatedAtTick).toBeUndefined();
    // and the seat is still recognised as fallen — the GATE is on the stamp, not on the predicate
    expect(livingSeats(w)).toEqual([P(0), P(1)]);
  });

  it('⭐ the HOST stamps, and isHost DEFAULTS true so solo and vs-bots are untouched', () => {
    const w = boardOf(3);
    // The load-bearing default: if this ever flipped, gating the stamp would break single-player.
    expect(w.isHost).toBe(true);
    const ex = makeGameStateExtras();
    raze(w, 2);
    tickGameState(w, ex, P(0));
    expect(w.players.get(P(2))!.eliminatedAtTick).toBe(w.tick);
  });
});
