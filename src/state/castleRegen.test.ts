/**
 * SPARK — S164 P1: castle HP regeneration, bought with victory points (owner R128–R131).
 *
 * The three things worth pinning are not the same thing: that the RATE ladder is the owner's and
 * lands on whole HP, that the REDUCER refuses everything it should, and that the field survives the
 * two carry-FSM rebuilds `tsc` would not have caught had it been optional.
 */

import { describe, expect, it } from 'vitest';

import { dispatch, makeWorld, type World } from './world.ts';
import {
  castleRegenPerSecond,
  castleRegensOnTick,
  castleRegenTick,
  applyUpgradeCastleRegen,
} from './castleRegen.ts';
import { makeIdlePlayer, pickup, drop } from '../game/player.ts';
import { asPlayerId, asSparkId } from '../types.ts';
import {
  CASTLE_MAX_HP,
  CASTLE_MAX_REGEN_LEVEL,
  CASTLE_REGEN_PCT_BASE,
  CASTLE_REGEN_PCT_PER_LEVEL,
  CASTLE_REGEN_UPGRADE_PRICE,
  GATHERER_MAX_SPEED_LEVEL,
  GOBLIN_MELEE_ATK,
  GOBLIN_MELEE_PEN,
  PHYSICS_HZ,
  PLAYER_COLORS,
} from '../constants.ts';
import { attackFifths } from './stats.ts';

const P = (n: number) => asPlayerId(n);

function board(seats = 2): World {
  const w = makeWorld(0xca57);
  dispatch(w, { type: 'START_GAME', mode: '1v1', isHost: true });
  for (let i = 0; i < seats; i++) {
    if (!w.players.has(P(i))) {
      w.players.set(P(i), makeIdlePlayer(P(i), PLAYER_COLORS[i % PLAYER_COLORS.length]!));
    }
  }
  w.gameState = 'PLAYING';
  return w;
}

describe('S164 P1 — the regen rate ladder (R128/R130)', () => {
  it("⭐ THE OWNER'S LADDER — his PERCENTAGES, whatever the pool is (S181: 25/30/35/40/45)", () => {
    /*
     * ⭐⭐⭐ S181 — **THIS CASE PREDICTED ITS OWN FAILURE AND THEN CAUGHT IT.** The docblock that
     * stood here read: *"If CASTLE_MAX_HP ever moves, this case is the one that should go red
     * first."* The owner moved it (1500 → 2500) and this was indeed the first thing red. The guard
     * worked; what follows is the ruling it forced someone to re-read.
     *
     * ⛔ **R128 WAS GIVEN IN PERCENT, NOT IN WHOLE HP** — 1.0 / 1.2 / 1.4 / 1.6 / 1.8 % of max per
     * level. `15/18/21/24/27` was the CONSEQUENCE of those percentages at a 1500 pool, never the
     * ruling itself. So raising the pool legitimately raises the regen with it, to 25/30/35/40/45,
     * and pinning the old absolute numbers would have OVERRIDDEN his percentage ruling rather than
     * honouring it.
     *
     * ⚠ AND IT IS A ~67% REGEN BUFF HE DID NOT ASK FOR IN WORDS. He asked for pool and damage; this
     * rode along. It is surfaced to him rather than silently taken, and it is a one-line change to
     * `CASTLE_REGEN_PCT_BASE` if he wants the old absolute rates back at the new pool.
     *
     * ⭐ THE PROPERTY THAT ACTUALLY MATTERS SURVIVED: every level is still WHOLE HP, which is why
     * this feature needs no float accumulator and no rounding rule. 2500 × 1.0% = 25 exactly, and so
     * on up the ladder — asserted below over every level rather than assumed.
     */
    /*
     * ⚠ `toBeCloseTo`, NOT `toBe`, AND THE REASON IS THE POINT OF THE ASSERTION BELOW IT. The
     * percentage arithmetic is float: `2500 × 1.2 / 100` is 30.000000000000004 in IEEE754.
     * Production applies `Math.round` — documented there as *"a guard against a future CASTLE_MAX_HP
     * that does not divide cleanly, not a live rounding rule"*. So the right pair of claims is
     * "within a hair of his percentage" AND "a whole number after the guard", which is exactly what
     * keeps this feature free of a float accumulator.
     */
    const pct = (l: number): number =>
      (CASTLE_MAX_HP * (CASTLE_REGEN_PCT_BASE + CASTLE_REGEN_PCT_PER_LEVEL * l)) / 100;
    for (let l = 1; l <= CASTLE_MAX_REGEN_LEVEL; l++) {
      expect(castleRegenPerSecond(l), `level ${l} is his percentage of the pool`).toBeCloseTo(pct(l), 6);
      expect(Number.isInteger(castleRegenPerSecond(l)), `level ${l} is whole HP`).toBe(true);
    }
    // The shipped ladder, written out so a reader sees the numbers without deriving them.
    expect(castleRegenPerSecond(1)).toBe(25);
    expect(castleRegenPerSecond(5)).toBe(45);
    for (let l = 1; l <= CASTLE_MAX_REGEN_LEVEL; l++) {
      expect(Number.isInteger(castleRegenPerSecond(l)), `level ${l} is whole HP`).toBe(true);
    }
  });

  it('⛔ LEVEL 0 REGENERATES NOTHING — the ladder starts when you buy it', () => {
    // Deliberately not 0.8%: the first 100 VP must buy a real effect, not a marginal one.
    expect(castleRegenPerSecond(0)).toBe(0);
  });

  it('clamps a malformed or over-cap level rather than minting HP', () => {
    expect(castleRegenPerSecond(-3)).toBe(0);
    expect(castleRegenPerSecond(999)).toBe(castleRegenPerSecond(CASTLE_MAX_REGEN_LEVEL));
    expect(castleRegenPerSecond(2.9)).toBe(castleRegenPerSecond(2)); // truncated, never rounded up
  });

  it('the cap matches the gatherer upgrade it was modelled on (R131)', () => {
    expect(CASTLE_MAX_REGEN_LEVEL).toBe(GATHERER_MAX_SPEED_LEVEL);
  });

  it('⭐ THE ARITHMETIC THAT MADE PER-SECOND THE RULING — lv1 offsets 2.5 goblins, not 150', () => {
    /*
     * The brief said "per tick". Per TICK, level 1 is 15 × 60 = 900 HP/s against a goblin's 6 HP/s,
     * i.e. it out-heals 150 attackers and the castle can never fall. This case pins the ruled
     * reading so a future edit cannot quietly reintroduce the per-tick one.
     */
    /*
     * ⭐⭐ S181 — the goblin's damage to a keep is no longer a flat 6. `GOBLIN_DAMAGE_VS_CASTLE` was
     * RETIRED in S180 when the keep went onto the stat ladder (owner: *"every attacker hits anything
     * based on its damage output"*), so a melee goblin deals `attackFifths(2, 1)` = 12 per swing.
     *
     * ⛔ THE RULING UNDER TEST IS *"PER SECOND, NOT PER TICK"*, AND THAT IS WHAT IS PINNED — not the
     * literal 2.5. The per-TICK reading would make level 1 heal `rate × 60` per second, which
     * out-heals any plausible army and makes a keep unfallable. So the assertion is the ORDER OF
     * MAGNITUDE: regen offsets a handful of attackers, not a hundred of them.
     */
    const goblinDps = attackFifths(GOBLIN_MELEE_ATK, GOBLIN_MELEE_PEN); // one swing per second
    const offsets = castleRegenPerSecond(1) / goblinDps;
    expect(offsets).toBeGreaterThan(1);
    expect(offsets, 'a handful of goblins, never 150 — the per-tick reading').toBeLessThan(10);
    // And the per-tick reading, stated as the thing that must stay false.
    expect((castleRegenPerSecond(1) * PHYSICS_HZ) / goblinDps).toBeGreaterThan(100);
  });
});

describe('S164 P1 — the cadence is a pure function of (seat, tick)', () => {
  it('fires exactly once per second per seat', () => {
    let hits = 0;
    for (let t = 0; t < PHYSICS_HZ; t++) if (castleRegensOnTick(0, t)) hits++;
    expect(hits).toBe(1);
  });

  it('⭐ PHASE-SPREAD BY SEAT — four castles never heal on the same frame', () => {
    // The castleFiresOnTick idiom, for the same reason: nothing may depend on Map order.
    const ticks = [0, 1, 2, 3].map((s) => {
      for (let t = 0; t < PHYSICS_HZ; t++) if (castleRegensOnTick(s, t)) return t;
      return -1;
    });
    expect(new Set(ticks).size).toBe(4);
    expect(ticks).not.toContain(-1);
  });
});

describe('S164 P1 — castleRegenTick', () => {
  it('a damaged castle at level 1 regains exactly its level-1 rate on its scheduled tick', () => {
    // S181 — DERIVED from the rate rather than the literal 1015, so a pool retune re-pins itself.
    const w = board();
    const me = w.players.get(P(0))!;
    me.castleHp = 1000;
    me.castleRegenLevel = 1;
    while (!castleRegensOnTick(0, w.tick)) w.tick++;
    castleRegenTick(w);
    expect(w.players.get(P(0))!.castleHp).toBe(1000 + castleRegenPerSecond(1));
  });

  it('⛔ NEVER FROM ZERO (R131) — a fallen castle stays fallen', () => {
    /*
     * `castleHp <= 0` IS the elimination predicate, so healing from zero would make elimination
     * self-reversing — and `eliminatedAtTick` is write-once, so a revived seat would sort below
     * every seat it went on to beat. elimination.ts left a note asking for this decision; it is no.
     */
    const w = board();
    const me = w.players.get(P(0))!;
    me.castleHp = 0;
    me.castleRegenLevel = 5;
    while (!castleRegensOnTick(0, w.tick)) w.tick++;
    castleRegenTick(w);
    expect(w.players.get(P(0))!.castleHp).toBe(0);
  });

  it('⛔ NEVER OVERHEALS — the clamp is a WIRE correctness guard, not cosmetics', () => {
    /*
     * save.ts emits castleHp only when BELOW max and rehydrates an absent value as CASTLE_MAX_HP.
     * So a host holding 1700 would emit nothing and every peer would read 1500 — a silent
     * divergence on the number that ends the match, and invisible to both hash oracles because
     * stateHashFull marks players:'acknowledged'.
     */
    const w = board();
    const me = w.players.get(P(0))!;
    me.castleHp = CASTLE_MAX_HP - 3; // less than one tick of regen remaining
    me.castleRegenLevel = 5; // would add 27
    while (!castleRegensOnTick(0, w.tick)) w.tick++;
    castleRegenTick(w);
    expect(w.players.get(P(0))!.castleHp).toBe(CASTLE_MAX_HP);
  });

  it('level 0 heals nothing even on the scheduled tick', () => {
    const w = board();
    w.players.get(P(0))!.castleHp = 900;
    while (!castleRegensOnTick(0, w.tick)) w.tick++;
    castleRegenTick(w);
    expect(w.players.get(P(0))!.castleHp).toBe(900);
  });

  it('does nothing outside PLAYING', () => {
    const w = board();
    const me = w.players.get(P(0))!;
    me.castleHp = 900;
    me.castleRegenLevel = 3;
    w.gameState = 'LOBBY';
    while (!castleRegensOnTick(0, w.tick)) w.tick++;
    castleRegenTick(w);
    expect(w.players.get(P(0))!.castleHp).toBe(900);
  });
});

describe('S164 P1 — applyUpgradeCastleRegen (R128/R129)', () => {
  const give = (w: World, seat: number, vp: number) => w.scoreByPlayer.set(P(seat), vp);

  it('buys a level and spends exactly the price', () => {
    const w = board();
    give(w, 0, 250);
    applyUpgradeCastleRegen(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: P(0) });
    expect(w.players.get(P(0))!.castleRegenLevel).toBe(1);
    expect(w.scoreByPlayer.get(P(0))).toBe(250 - CASTLE_REGEN_UPGRADE_PRICE);
  });

  it('⛔ refuses when unaffordable, and takes NOTHING', () => {
    const w = board();
    give(w, 0, CASTLE_REGEN_UPGRADE_PRICE - 1);
    applyUpgradeCastleRegen(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: P(0) });
    expect(w.players.get(P(0))!.castleRegenLevel).toBe(0);
    expect(w.scoreByPlayer.get(P(0))).toBe(CASTLE_REGEN_UPGRADE_PRICE - 1);
  });

  it('⛔ refuses at the cap, and does not take the points', () => {
    const w = board();
    give(w, 0, 10_000);
    for (let i = 0; i < CASTLE_MAX_REGEN_LEVEL; i++) {
      applyUpgradeCastleRegen(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: P(0) });
    }
    const banked = w.scoreByPlayer.get(P(0))!;
    expect(w.players.get(P(0))!.castleRegenLevel).toBe(CASTLE_MAX_REGEN_LEVEL);
    applyUpgradeCastleRegen(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: P(0) });
    expect(w.players.get(P(0))!.castleRegenLevel).toBe(CASTLE_MAX_REGEN_LEVEL);
    expect(w.scoreByPlayer.get(P(0))).toBe(banked); // a capped buy is free, not a tax
  });

  it('⛔ a FALLEN seat cannot buy — it could never regenerate anyway (R131)', () => {
    const w = board();
    give(w, 0, 500);
    w.players.get(P(0))!.castleHp = 0;
    applyUpgradeCastleRegen(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: P(0) });
    expect(w.players.get(P(0))!.castleRegenLevel).toBe(0);
    expect(w.scoreByPlayer.get(P(0))).toBe(500);
  });

  it('⭐ NO PHASE GATE (R129) — buyable in BUILD and in FIGHT alike', () => {
    for (const phase of ['BUILD', 'FIGHT'] as const) {
      const w = board();
      w.matchPhase = phase;
      give(w, 0, 500);
      applyUpgradeCastleRegen(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: P(0) });
      expect(w.players.get(P(0))!.castleRegenLevel, phase).toBe(1);
    }
  });

  it('an unknown seat is a no-op, never a throw', () => {
    const w = board();
    expect(() =>
      applyUpgradeCastleRegen(w, { type: 'UPGRADE_CASTLE_REGEN', playerId: P(9) }),
    ).not.toThrow();
  });
});

describe('S164 P1 — the field survives the carry-FSM rebuild', () => {
  it('⛔ pickup/drop PRESERVE castleRegenLevel — the sites tsc could not have caught', () => {
    /*
     * `player.ts` rebuilds the whole Player object on pickup and on drop. `eliminatedAtTick`'s own
     * docblock records that an ADDITIVE-OPTIONAL field omitted at those two literals compiles
     * cleanly and is silently reset on every spark pickup. `castleRegenLevel` is REQUIRED precisely
     * so that trap became a compile error instead — and this case is the runtime proof, because a
     * future refactor could make it optional again and re-open it.
     */
    const w = board();
    const me = w.players.get(P(0))!;
    me.castleRegenLevel = 4;
    const carrying = pickup(me, asSparkId(1));
    expect(carrying.castleRegenLevel, 'survives pickup').toBe(4);
    const idle = drop(carrying);
    expect(idle.castleRegenLevel, 'survives drop').toBe(4);
  });
});
