/**
 * SPARK — S159 P2 (owner R77): **VOLTKIN CHAIN LIGHTNING.**
 *
 * Owner: *"multiple connectors/targets that are within range of one another … maywe we do max6"*.
 * (⚠ "maywe" is the owner's own typing, kept verbatim — S160 P3 found four sites had silently
 * corrected it to "maybe" INSIDE quotation marks. A ruling is quoted, not tidied.)
 *
 * ## The test the Council asked for by name
 *
 * GEMINI-AUDITOR's R1 challenge was that a naive test ("the Voltkin hits six things") passes even
 * with the tie-break broken, because nothing forces the SEVENTH candidate to be the one left alive.
 * Its prescription — a line-up where exactly one target must survive, and the test names WHICH — is
 * the first case below, and it is the reason the cap is asserted through a survivor rather than
 * through a count.
 *
 * ## And the case that would have shipped a lie
 *
 * The first cut of `voltkinChain.ts` hand-rolled the enemy test as `anchor.placedBy === attacker
 * .ownerPlayerId`. That is a different question from the one the game asks: the shipped discriminant
 * is the endpoint `placerColor` against the owner's LIVE colour, because a territory-captured shape
 * keeps its original allegiance for targeting (`findNearestEnemyPrimitiveFrom` records this) and
 * because a rainbow colour shuffle remaps colours without touching `placedBy`. The captured-shape
 * case below is what holds that.
 */

import { describe, expect, it } from 'vitest';

import {
  CHEWER_DEF,
  CHEWER_HP,
  PLAYER_COLORS,
  SparkType,
  PRIMITIVE_MAX_HP,
  VOLTKIN_ATK,
  VOLTKIN_CHAIN_HOP_RANGE,
  VOLTKIN_CHAIN_JUMP_DIVISOR,
  VOLTKIN_CHAIN_MAX_TARGETS,
  VOLTKIN_PEN,
} from '../../constants.ts';
import { attackFifths, connectorCapacityFifths, structurePoolFifths, unitPoolFifths } from '../stats.ts';
import { asBondId, asPlayerId, asPrimitiveId, type BondId } from '../../types.ts';
import type { Bond } from '../../physics/bonds.ts';
import type { Primitive } from '../../game/primitive.ts';
import { makeIdlePlayer } from '../../game/player.ts';
import { makeWorld, type World } from '../world.ts';
import { applyCreatureAttack } from './creatureAttack.ts';
import { chainJumpFifths, voltkinChainFrom, type ChainLink } from './voltkinChain.ts';
import { asCreatureId, makeCreature, makeVoltkinCreature, type Creature } from './creature.ts';
import { maxPoolFifths } from '../damageOverTime.ts';
import { CHEWER_CONFIG } from './voltkin-config.ts';

const P0 = asPlayerId(0);
const P1 = asPlayerId(1);
const COLOR_P0 = PLAYER_COLORS[0];
const COLOR_P1 = PLAYER_COLORS[1];

function baseWorld(): World {
  const w = makeWorld(0);
  w.players.clear();
  w.players.set(P0, makeIdlePlayer(P0, COLOR_P0));
  w.players.set(P1, makeIdlePlayer(P1, COLOR_P1));
  return w;
}

function prim(id: number, placerColor: number, x: number, y: number): Primitive {
  return {
    id: asPrimitiveId(id),
    type: SparkType.Dot,
    placerColor,
    placedBy: placerColor === COLOR_P0 ? P0 : P1,
    createdTick: 0,
    pos: { x, y },
    prevPos: { x, y },
    bonds: new Set(),
    ownerColor: placerColor,
    lastOwnershipChange: 0,
    radius: 8,
    hp: PRIMITIVE_MAX_HP,
    origin: null,
  };
}

function bondBetween(w: World, id: number, a: Primitive, b: Primitive): Bond {
  const bond: Bond = {
    id: asBondId(id),
    aId: a.id,
    bId: b.id,
    a,
    b,
    restLength: 32,
    stiffnessTier: 'MID',
    damageFifths: 0,
    createdTick: 0,
  };
  w.bonds.set(bond.id, bond);
  a.bonds.add(bond.id);
  b.bonds.add(bond.id);
  return bond;
}

/** A Voltkin belonging to P0, already ATTACKING (the host-tick orchestration invariant). */
function voltkin(w: World, x = 0, y = 0): Creature {
  const c = makeVoltkinCreature({
    id: asCreatureId(0),
    ownerPlayerId: P0,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: 0,
  });
  c.state = 'ATTACKING';
  w.creatures.set(c.id, c);
  return c;
}

/** An enemy chewer (hp 1 ⇒ 5 fifths, so one Voltkin link kills it). */
function chewer(w: World, id: number, x: number, y: number, owner = P1): Creature {
  const c = makeCreature(CHEWER_CONFIG, {
    id: asCreatureId(id),
    ownerPlayerId: owner,
    pos: { x, y },
    targetPos: { x, y },
    spawnedAtTick: 0,
    sourceSpawnerId: null,
  });
  w.creatures.set(c.id, c);
  return c;
}

const seedOf = (c: Creature): ChainLink => ({ kind: 'creature', id: c.id, pos: { x: c.pos.x, y: c.pos.y } });

describe('S159 P2 — the chain WALKS: selection', () => {
  it('stops at VOLTKIN_CHAIN_MAX_TARGETS, and the seventh in the line is the one left standing', () => {
    // Seven enemies in a row, each 100 px from the next — inside VOLTKIN_CHAIN_HOP_RANGE (120), so
    // the ONLY thing that can stop the bolt is the cap. Ids ascend along the line.
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const line = Array.from({ length: 7 }, (_, i) => chewer(w, 10 + i, i * 100, 0));

    // The strike itself: the Voltkin zaps the first of the line, which seeds the chain.
    applyCreatureAttack(w, {
      type: 'CREATURE_ATTACK',
      creatureId: v.id,
      bondId: null,
      targetCreatureId: line[0].id,
    });

    const alive = [...w.creatures.values()].filter((c) => c.ownerPlayerId === P1);
    // eslint-disable-next-line no-console
    console.log(
      `[S159 P2] 7 in a line, cap ${VOLTKIN_CHAIN_MAX_TARGETS}: survivors ${alive
        .map((c) => c.id as unknown as number)
        .join(',')}`,
    );
    /*
     * ⛔⛔ S178 — RE-PINNED, AND THE OLD ASSERTION WAS CONFLATING TWO DIFFERENT CLAIMS.
     *
     * This asserted `alive).toHaveLength(1)` — i.e. that the bolt KILLED six — as the way of proving
     * it STOPPED at six. Those were the same statement only because every link took the Voltkin's
     * full 33 fifths and a chewer's pool is 5, so touching and killing were indistinguishable.
     * Under the owner's S178 falloff ruling they are not: the links take 33 · 16 · 8 · 4 · 2 · 1, so
     * links 4–6 reach their target and leave it standing. That is the ruling working, not a break.
     *
     * So the cap is now pinned by what it actually means — **the seventh was never touched** — and
     * the reach of the bolt is pinned separately, by the first six all having taken damage. A
     * regression in the CAP and a regression in the DAMAGE CURVE now fail different assertions.
     */
    // The far end of the line is untouched: the cap stopped the bolt before it, not the falloff.
    const seventh = w.creatures.get(line[6].id);
    expect(seventh, 'the seventh must still exist').toBeDefined();
    expect(seventh!.ehp, 'the seventh must be UNDAMAGED — the cap, not the curve').toBe(
      maxPoolFifths(seventh!.type),
    );
    // ...and every one of the first six WAS reached, whether or not it survived being reached.
    for (let i = 0; i < VOLTKIN_CHAIN_MAX_TARGETS; i++) {
      const c = w.creatures.get(line[i].id);
      const reached = c === undefined || c.ehp < maxPoolFifths(c.type);
      expect(reached, `link ${i} must have been reached by the bolt`).toBe(true);
    }
    // ⭐ AND THE KILL COUNT IS NOW A CURVE READING, NOT A CAP READING. A chewer's pool is 5 fifths
    // (CHEWER_HP 1, CHEWER_DEF 0), so only the links carrying >= 5 fifths kill: 33, 16 and 8. The
    // 4 / 2 / 1 tail wounds and moves on. Derived from the curve so a re-dial of
    // VOLTKIN_CHAIN_JUMP_DIVISOR moves this with it instead of half-landing.
    const base = attackFifths(VOLTKIN_ATK, VOLTKIN_PEN);
    const chewerPool = unitPoolFifths(CHEWER_HP, CHEWER_DEF);
    // The SEED is jump 0 and is killed by the primary strike, not by this chain; the chain then
    // walks jumps 1..(MAX-1). So the kill count is 1 + however many JUMPS still carry a lethal load.
    const jumpKills = Array.from(
      { length: VOLTKIN_CHAIN_MAX_TARGETS - 1 },
      (_, i) => chainJumpFifths(base, i + 1),
    ).filter((d) => d >= chewerPool).length;
    expect(v.killCount).toBe(1 + jumpKills);
  });

  it('a gap wider than the hop range stops the bolt, however much is behind it', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    chewer(w, 11, 100, 0); // reachable
    // Then a gap of VOLTKIN_CHAIN_HOP_RANGE + 20 before a crowd of four.
    for (let i = 0; i < 4; i++) chewer(w, 20 + i, 100 + VOLTKIN_CHAIN_HOP_RANGE + 20 + i * 10, 0);

    const links = voltkinChainFrom(w, v, seedOf(a));
    expect(links).toHaveLength(1); // just the one across the small step; the crowd is unreachable
    expect(links[0]).toMatchObject({ kind: 'creature', id: asCreatureId(11) });
  });

  it('never revisits a link, so two targets end the chain instead of looping between them', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    chewer(w, 11, 50, 0);
    expect(voltkinChainFrom(w, v, seedOf(a))).toHaveLength(1);
  });

  it('is enemy-only, and never the attacker itself', () => {
    const w = baseWorld();
    const v = voltkin(w, 0, 0);
    const a = chewer(w, 10, 40, 0);
    chewer(w, 11, 60, 0, P0); // OWN unit, well inside hop range
    const links = voltkinChainFrom(w, v, seedOf(a));
    expect(links).toHaveLength(0);
  });

  it('breaks an exact distance tie on the LOWER id, whichever order the map holds them', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    // Two candidates exactly 80 px from the seed, inserted highest-id first so a "first wins" bug
    // would answer 21 rather than 20.
    chewer(w, 21, 0, 80);
    chewer(w, 20, 0, -80);
    const links = voltkinChainFrom(w, v, seedOf(a));
    expect(links[0]).toMatchObject({ id: asCreatureId(20) });
  });

  it('prefers a CREATURE over a BOND at the identical distance — one fixed order across kinds', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0); // ⭐ S177 P9 — was -200: 240 px to the bond midpoint (40,0), Voltkin reach 180
    const seedUnit = chewer(w, 10, 0, 0);
    const unit = chewer(w, 11, 0, 60); // 60 px from the seed
    // An enemy bond whose MIDPOINT is also exactly 60 px from the seed, on the other side.
    const pa = prim(1, COLOR_P1, -10, -60);
    const pb = prim(2, COLOR_P1, 10, -60);
    w.primitives.set(pa.id, pa);
    w.primitives.set(pb.id, pb);
    bondBetween(w, 1, pa, pb);

    const links = voltkinChainFrom(w, v, seedOf(seedUnit));
    expect(links[0]).toMatchObject({ kind: 'creature', id: unit.id });
  });

  it('chains over CONNECTORS too, which is half of what the owner asked for', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0); // ⭐ S177 P9 — was -200: 240 px to the bond midpoint (40,0), Voltkin reach 180
    // A ladder of enemy shapes: bonds 1..3, each midpoint 80 px from the next.
    const ps = [0, 1, 2, 3].map((i) => prim(1 + i, COLOR_P1, i * 80, 0));
    for (const p of ps) w.primitives.set(p.id, p);
    const b1 = bondBetween(w, 1, ps[0], ps[1]);
    bondBetween(w, 2, ps[1], ps[2]);
    bondBetween(w, 3, ps[2], ps[3]);

    const links = voltkinChainFrom(w, v, { kind: 'bond', id: b1.id, pos: { x: 40, y: 0 } });
    expect(links.map((l) => l.kind)).toEqual(['bond', 'bond']);
    expect(links.map((l) => l.id as unknown as number)).toEqual([2, 3]);
  });

  it('reads enemy-ness off placerColor, not placedBy — the captured-shape case', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0); // ⭐ S177 P9 — was -200: 240 px to the bond midpoint (40,0), Voltkin reach 180
    const seedUnit = chewer(w, 10, 0, 0);
    // A bond between two shapes the ENEMY placed, but whose `placedBy` is P0 — the shape of a
    // record after a capture, and the exact input that made the first cut of the scan skip it.
    const pa = prim(1, COLOR_P1, 40, 0);
    const pb = prim(2, COLOR_P1, 60, 0);
    (pa as { placedBy: typeof P0 }).placedBy = P0;
    (pb as { placedBy: typeof P0 }).placedBy = P0;
    w.primitives.set(pa.id, pa);
    w.primitives.set(pb.id, pb);
    const b = bondBetween(w, 1, pa, pb);

    const links = voltkinChainFrom(w, v, seedOf(seedUnit));
    expect(links[0]).toMatchObject({ kind: 'bond', id: b.id });
  });
});

describe('S159 P2 — the chain FIRES: damage, arcs and who gets one', () => {
  it('severs the connectors it broke, and emits one ARC_FLASH per hop', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0); // ⭐ S177 P9 — was -200: 240 px to the bond midpoint (40,0), Voltkin reach 180
    const ps = [0, 1, 2].map((i) => prim(1 + i, COLOR_P1, i * 80, 0));
    for (const p of ps) w.primitives.set(p.id, p);
    const b1 = bondBetween(w, 1, ps[0], ps[1]);
    const b2 = bondBetween(w, 2, ps[1], ps[2]);
    w.effects.length = 0;

    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: v.id, bondId: b1.id });

    // A Voltkin's 33 fifths is far past `count + 4`, so both give way: the primary through the
    // shipped path, the chained one through the chain's own deferred sever.
    expect(w.bonds.has(b1.id)).toBe(false);
    expect(w.bonds.has(b2.id)).toBe(false);
    const arcs = w.effects.filter((e) => e.kind === 'ARC_FLASH');
    expect(arcs.length).toBeGreaterThanOrEqual(2); // the primary's, plus one per hop
  });

  it('fires even when the primary connector HELD — the bolt hit it either way', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0); // ⭐ S177 P9 — was -200: 240 px to the bond midpoint (40,0), Voltkin reach 180
    const ps = [0, 1].map((i) => prim(1 + i, COLOR_P1, i * 80, 0));
    for (const p of ps) w.primitives.set(p.id, p);
    const b1 = bondBetween(w, 1, ps[0], ps[1]);
    // A chewer 60 px from the bond midpoint, so it is the chain's first hop.
    const victim = chewer(w, 10, 40, 60);
    // Make the primary unbreakable for this strike by pre-loading NEGATIVE headroom is not possible,
    // so instead assert the CHAIN's effect: whatever happens to the bond, the unit dies.
    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: v.id, bondId: b1.id });
    expect(w.creatures.has(victim.id)).toBe(false);
  });

  it('ONLY a Voltkin chains — a chewer\'s gnaw stays a single bite', () => {
    const w = baseWorld();
    const gnawer = makeCreature(CHEWER_CONFIG, {
      id: asCreatureId(0),
      ownerPlayerId: P0,
      pos: { x: -50, y: 0 },
      targetPos: { x: 40, y: 0 },
      spawnedAtTick: 0,
      sourceSpawnerId: null,
    });
    gnawer.state = 'ATTACKING';
    w.creatures.set(gnawer.id, gnawer);
    const ps = [0, 1, 2].map((i) => prim(1 + i, COLOR_P1, i * 80, 0));
    for (const p of ps) w.primitives.set(p.id, p);
    const b1 = bondBetween(w, 1, ps[0], ps[1]);
    const b2 = bondBetween(w, 2, ps[1], ps[2]);

    applyCreatureAttack(w, { type: 'CREATURE_ATTACK', creatureId: gnawer.id, bondId: b1.id });
    // Whatever the chewer did to its own target, the NEIGHBOUR must be untouched: no chain, and not
    // one fifth of chain damage banked on it either.
    const survivor = w.bonds.get(b2.id) as Bond | undefined;
    expect(survivor).toBeDefined();
    expect(survivor?.damageFifths).toBe(0);
  });

  it('the cap counts the SEED, so a full bolt is the primary plus five jumps', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    for (let i = 1; i < 10; i++) chewer(w, 10 + i, i * 100, 0);
    expect(voltkinChainFrom(w, v, seedOf(a))).toHaveLength(VOLTKIN_CHAIN_MAX_TARGETS - 1);
  });

  it('is a PURE selection: computing the chain twice on the same world gives the same answer', () => {
    const w = baseWorld();
    const v = voltkin(w, -100, 0);
    const a = chewer(w, 10, 0, 0);
    for (let i = 1; i < 6; i++) chewer(w, 10 + i, i * 90, 0);
    const first = voltkinChainFrom(w, v, seedOf(a)).map((l) => `${l.kind}:${l.id as unknown as number}`);
    const second = voltkinChainFrom(w, v, seedOf(a)).map((l) => `${l.kind}:${l.id as unknown as number}`);
    expect(second).toEqual(first);
    expect(w.effects).toHaveLength(0); // and it mutated nothing
  });

  it('an empty board leaves the single-target zap exactly as it was', () => {
    const w = baseWorld();
    const v = voltkin(w, -50, 0);
    const only = chewer(w, 10, 0, 0);
    w.effects.length = 0;
    applyCreatureAttack(w, {
      type: 'CREATURE_ATTACK',
      creatureId: v.id,
      bondId: null,
      targetCreatureId: only.id,
    });
    expect(w.creatures.has(only.id)).toBe(false);
    expect(w.effects.filter((e) => e.kind === 'ARC_FLASH')).toHaveLength(1); // one bolt, no chain
    expect(v.killCount).toBe(1);
  });
});

/** Bond ids used above, kept for readability of the ladder assertions. */
export type _BondIdAlias = BondId;

describe('S160 P3 — the ≤ 29 CONNECTOR CEILING, the number the owner is quoted', () => {
  /**
   * ⛔ WHY THIS EXISTS. Three documents tell the owner that a Voltkin bolt "one-shots any connector in
   * a structure of <= 29 connectors, so a full bolt can take SIX connectors off a base in one
   * strike". S160 P3 re-derived it and it is EXACT — but nothing in the suite asserted it, so the
   * whole claim rested on arithmetic written in a handoff. This project's own rule is that a handoff
   * number is a claim, not a measurement.
   *
   * The derivation, in one line each:
   *   attackFifths(VOLTKIN_ATK 3, VOLTKIN_PEN 6) = 3 x (5 + 6)      = 33 fifths
   *   connectorCapacityFifths(n)                  = n + 4
   *   the sever test is INCLUSIVE (`>=`), so 33 >= n + 4  <=>  n <= 29
   *
   * Written against the constants rather than the literal 29, so a deliberate retune moves the
   * boundary instead of reddening for no reason — while an ACCIDENTAL change to atk, pen or the
   * capacity curve still shows up as a moved ceiling.
   */
  /*
   * ⛔⛔⛔ S178 — **THIS TEST ASSERTED A THRESHOLD THAT HAD BEEN SUPERSEDED FOR A WHOLE SESSION, AND
   * IT PASSED GREEN THE ENTIRE TIME.** It measured a 33-fifth bolt against
   * `connectorCapacityFifths(n)` = `n + 4` and concluded "≤ 29 connectors" — a claim also written as
   * derived fact in `constants.ts`. But `damageConnector` has read `structurePoolFifths(n)` =
   * `n × (n + 5)` since S177 P1 (owner R173-B), and against THAT a lone 33-fifth bolt severs only
   * while `n × (n + 5) ≤ 33`, i.e. **n ≤ 3**. The old figure was wrong by a factor of ten, and the
   * test kept passing because `connectorCapacityFifths` is still a valid pure function — it is
   * simply one nothing in the damage path calls any more. A tautology wearing a guard's uniform.
   *
   * Re-pinned against the function the sim actually reads. The single-bolt ceiling is now stated in
   * the same breath as the thing that makes it misleading on its own: ONE bolt is not one hit, it is
   * up to six, and before S178 they compounded into an unshrinking pool.
   */
  it('⭐ a SINGLE link severs only the smallest structures — n ≤ 3, not the retired n ≤ 29', () => {
    const bolt = attackFifths(VOLTKIN_ATK, VOLTKIN_PEN);
    expect(bolt, 'a bolt is 33 fifths').toBe(33);

    let ceiling = 0;
    for (let n = 1; n <= 200; n++) if (bolt >= structurePoolFifths(n)) ceiling = n;
    expect(ceiling, `${bolt} fifths against a STRUCTURE pool of n x (n + 5)`).toBe(3);

    // A boundary on both sides, against the shipped pool.
    expect(bolt >= structurePoolFifths(3), 'n=3: pool 24, severs').toBe(true);
    expect(bolt >= structurePoolFifths(4), 'n=4: pool 36, HOLDS').toBe(false);

    // ⚠ AND THE RETIRED FUNCTION IS NAMED HERE SO THE NEXT READER SEES THE GAP RATHER THAN THE
    // NUMBER. `connectorCapacityFifths` still returns n + 4; it just does not govern anything.
    expect(connectorCapacityFifths(29)).toBe(33);
    expect(structurePoolFifths(29)).toBe(986); // what a 29-connector structure ACTUALLY costs
  });

  /*
   * ⭐⭐⭐ S178 (owner) — **THE FALLOFF, AND THE OUTCOME HE ASKED FOR.**
   *
   * *"It should be chain lightning with a diminishing power per attack."* This pins BOTH halves:
   * the curve itself, and the thing the curve exists to prevent — one bolt taking a whole tower.
   */
  describe('S178 — the bolt diminishes as it walks', () => {
    it('halves per jump, integer-only, with the seed at full strength', () => {
      const base = attackFifths(VOLTKIN_ATK, VOLTKIN_PEN);
      expect(base).toBe(33);
      const curve = Array.from({ length: VOLTKIN_CHAIN_MAX_TARGETS }, (_, j) => chainJumpFifths(base, j));
      expect(curve).toEqual([33, 16, 8, 4, 2, 1]);
      // Every term whole — float accumulators are banned in the sim.
      for (const d of curve) expect(Number.isInteger(d)).toBe(true);
      // Monotonically weakening, and never zero: an ARC the player can SEE always does something.
      for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeLessThan(curve[i - 1]);
      for (const d of curve) expect(d).toBeGreaterThanOrEqual(1);
      expect(VOLTKIN_CHAIN_JUMP_DIVISOR).toBe(2);
    });

    it('⛔ ONE BOLT NO LONGER LEVELS A 5-CONNECTOR TOWER — his "every connector along the way dies"', () => {
      /*
       * Walk the real banking rule by hand: damage pools STRUCTURE-WIDE (R173-B), severs are queued
       * and dispatched only after the loop so the pool does NOT shrink mid-bolt, and a sever SPENDS
       * the pool while overkill CARRIES. Before the falloff every link took 33: the bank ran
       * 33 · 66(SEVER) · 49 · 82(SEVER) · 65(SEVER) · 48 — THREE of five connectors to one bolt,
       * leaving a 2-connector remnant holding 48 against a 14 pool. Now it takes exactly one.
       */
      const base = attackFifths(VOLTKIN_ATK, VOLTKIN_PEN);
      const pool = structurePoolFifths(5);
      expect(pool).toBe(50);

      const sever = (perLink: (j: number) => number): number => {
        let banked = 0;
        let severs = 0;
        for (let j = 0; j < VOLTKIN_CHAIN_MAX_TARGETS; j++) {
          banked += perLink(j);
          if (banked >= pool) { banked -= pool; severs += 1; }
        }
        return severs;
      };

      expect(sever(() => base), 'the OLD flat bolt').toBe(3);
      expect(sever((j) => chainJumpFifths(base, j)), 'the S178 bolt').toBe(1);
    });
  });

  it('⚠ and the SIX is a ceiling, not a typical case — units compete for the same slots', () => {
    /*
     * The six-connector figure assumes all six links land on bonds. They do not, in general:
     * creatures and bonds are scanned in ONE nearest-first contest against a shared best-distance,
     * and a creature WINS an exact tie. So any defender nearer than the next connector consumes a
     * link. This asserts the tie-break that makes "up to six" the honest phrasing, which is the
     * wording S160 P3 put at the constant.
     */
    const w = baseWorld();
    const v = voltkin(w, 0, 0);
    const seed = chewer(w, 1, 40, 0);
    // A chewer and a bond midpoint at the SAME distance from the seed.
    const other = chewer(w, 2, 40 + 60, 0);
    const a = prim(10, PLAYER_COLORS[1]!, 40 + 60, -30);
    const b = prim(11, PLAYER_COLORS[1]!, 40 + 60, 30);
    bondBetween(w, 20, a, b); // midpoint is (100, 0) — identical distance to `other`

    const links = voltkinChainFrom(w, v, seedOf(seed));
    const first = links[0];
    expect(first, 'the chain jumped somewhere').toBeDefined();
    expect(
      first!.kind,
      'at an exact tie the CREATURE wins, so a nearby unit eats a link a connector would have had',
    ).toBe('creature');
    expect(first!.id).toBe(other.id);
  });
});
