/**
 * SPARK — the stat system (S151 P2). Owner rulings R72 · R74 · R75 · R76.
 *
 * ⭐ THE ORGANISING PRINCIPLE OF THIS FILE: every number the owner said out loud is a test.
 *
 * The defect R72 named was that balance numbers had drifted away from any stated intent — one grunt's
 * hit points had silently become the backbone of the damage scale. The guard against that recurring is
 * not "there are tests", it is that the owner's OWN WORKED EXAMPLES are executable. If a future
 * rebalance breaks `2 HP + 2 DEF = 2.8`, it should fail here with the owner's sentence in the message,
 * not be discovered in a playtest three sessions later.
 */

import { describe, it, expect } from 'vitest';
import {
  FIFTHS,
  STAT_POINT_MIN,
  STAT_POINT_MAX,
  multiplierFifths,
  unitPoolFifths,
  attackFifths,
  connectorCapacityFifths,
  structureDefenceFifths,
  structurePoolFifths,
  CREATURE_TARGETS,
  DEFENDER_TARGETS,
  creatureCanTarget,
  defenderCanTarget,
  type TargetClass,
} from './stats.ts';

/** Fifths → the human-readable multiplier the owner speaks in. Test-only; production never divides. */
const asDecimal = (fifths: number): number => fifths / FIFTHS;

describe('S151 P2 — the DEF/PEN ladder is LINEAR, not compounding (owner R72)', () => {
  /**
   * The owner pinned this twice: "def = x1.2" and then "2 hp and 2 [def] he will then have
   * 2x1.4 = 2.8". 1.4, NOT 1.2² = 1.44. A compounding ladder is the single most likely way for
   * someone to "correct" this file in future, so it is refuted explicitly.
   */
  it('steps by exactly +0.2 per point: x1.0, x1.2, x1.4, x1.6, x1.8, x2.0', () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => asDecimal(multiplierFifths(n)))).toEqual([
      1.0, 1.2, 1.4, 1.6, 1.8, 2.0,
    ]);
  });

  it('is NOT the compounding ladder 1.2^n — 2 DEF is 1.4, not 1.44', () => {
    expect(asDecimal(multiplierFifths(2))).toBe(1.4);
    expect(asDecimal(multiplierFifths(2))).not.toBeCloseTo(1.2 ** 2, 5);
  });

  it('keeps climbing past the unit range — structure DEF is UNCAPPED (owner R76)', () => {
    // "No cap - def climbs with the structure complexity."
    expect(asDecimal(multiplierFifths(10))).toBe(3.0);
    expect(asDecimal(multiplierFifths(40))).toBe(9.0);
  });
});

describe("S151 P2 — the owner's worked examples, executable (owner R72)", () => {
  /**
   * "if an enemy has 2 hp and one def his total defensive stat is 2.4. if he has 2 hp and 2 [def] he
   * will then have 2x1.4 = 2.8 and so if a laser tower has 3 attack, then he will be destroyed with
   * one laser hit."
   */
  it('2 HP + 1 DEF rates 2.4', () => {
    expect(asDecimal(unitPoolFifths(2, 1))).toBe(2.4);
  });

  it('2 HP + 2 DEF rates 2.8', () => {
    expect(asDecimal(unitPoolFifths(2, 2))).toBe(2.8);
  });

  it('a 3-ATK laser destroys that 2.8 defender in ONE hit', () => {
    const pool = unitPoolFifths(2, 2); // 14
    const hit = attackFifths(3, 0); // 15
    expect(hit).toBeGreaterThanOrEqual(pool);
    expect(pool - hit).toBeLessThanOrEqual(0);
  });

  /**
   * Owner R74 chose a POOL over a threshold. The distinction is invisible in the one-shot example
   * above and decisive here: under a threshold model a 3-ATK attacker could NEVER kill a 6 HP/1 DEF
   * target (15 < 36), because each comparison is independent. Under a pool it takes three hits.
   */
  it('ATK is a POOL: hits accumulate, so a weak attacker still eventually kills', () => {
    let pool = unitPoolFifths(6, 1); // 36
    const hit = attackFifths(3, 0); // 15
    const sequence: number[] = [];
    let hits = 0;
    while (pool > 0) {
      pool -= hit;
      hits += 1;
      sequence.push(pool);
    }
    expect(sequence).toEqual([21, 6, -9]);
    expect(hits).toBe(3);
  });

  it("'attack = -1 hp point': 1 ATK against 1 HP is a one-hit kill", () => {
    expect(unitPoolFifths(1, 0) - attackFifths(1, 0)).toBe(0);
  });
});

describe('S151 P2 — PEN and DEF are algebraically interchangeable in placement', () => {
  /**
   * The PDR claims the multiply form and the divide form are provably identical, so the choice is
   * free. That is a mathematical claim about EVERY input, so it is tested as one rather than by
   * example: attack × (1+0.2P) ≥ hp × (1+0.2D)  ⟺  attack ≥ hp × (1+0.2D)/(1+0.2P).
   */
  it('multiply-the-attacker and divide-the-defender agree on every input in range', () => {
    for (let hp = 1; hp <= STAT_POINT_MAX; hp++) {
      for (let atk = 1; atk <= STAT_POINT_MAX; atk++) {
        for (let def = 0; def <= 8; def++) {
          for (let pen = 0; pen <= 8; pen++) {
            const multiplyForm = attackFifths(atk, pen) >= unitPoolFifths(hp, def);
            const divideForm = atk >= (hp * multiplierFifths(def)) / multiplierFifths(pen);
            expect(multiplyForm).toBe(divideForm);
          }
        }
      }
    }
  });
});

describe('S151 P2 — EVERYTHING is an exact integer in fifths (the determinism guard)', () => {
  /**
   * ⭐ THIS IS THE TEST THAT PROTECTS THE HOST/WORKER MIRROR. `damageEntity` THROWS on a fractional
   * amount, and the ?worker=1 mirror must agree with the host bit-for-bit. A float creeping into the
   * ladder would be a live crash on one path and a desync on the other.
   */
  it('no unit rating in the whole design range is ever fractional', () => {
    for (let hp = STAT_POINT_MIN; hp <= STAT_POINT_MAX; hp++) {
      for (let def = 0; def <= 12; def++) {
        const v = unitPoolFifths(hp, def);
        expect(Number.isSafeInteger(v)).toBe(true);
      }
    }
  });

  it('no attack rating in the whole design range is ever fractional', () => {
    for (let atk = STAT_POINT_MIN; atk <= STAT_POINT_MAX; atk++) {
      for (let pen = 0; pen <= 12; pen++) {
        expect(Number.isSafeInteger(attackFifths(atk, pen))).toBe(true);
      }
    }
  });

  it('no connector capacity is ever fractional, even for an absurd fortress', () => {
    for (let c = 1; c <= 500; c++) {
      expect(Number.isSafeInteger(connectorCapacityFifths(c))).toBe(true);
      expect(Number.isSafeInteger(structureDefenceFifths(c))).toBe(true);
    }
  });
});

describe('S151 P2 — connector defence (owner R76)', () => {
  /**
   * "the first two shapes interconnected do not have any def but only 1 HP … three shapes in a row so
   * with only two connectors … each of those two connectors are 1.2 … a triangle form making 3
   * connectors … each of those connectors will be 1.4."
   */
  it('1 connector (two shapes) has NO def — x1.0', () => {
    expect(asDecimal(connectorCapacityFifths(1))).toBe(1.0);
  });

  it('2 connectors (three shapes in a row) → each connector is 1.2', () => {
    expect(asDecimal(connectorCapacityFifths(2))).toBe(1.2);
  });

  it('3 connectors (three shapes in a triangle) → each connector is 1.4', () => {
    expect(asDecimal(connectorCapacityFifths(3))).toBe(1.4);
  });

  /**
   * ⛔⛔ RE-PINNED S177, NOT DELETED — R173 SUPERSEDES R76 AND BOTH OF HIS RULINGS STAY ON THE RECORD.
   *
   * His R76 words, which this test used to assert: *"2HPx1.2DEF which makes it 2.4"* and
   * *"3hpx1.4 = 4.2"* — i.e. DEF level = connectors − 1.
   *
   * His S173/S177 words, which GOVERN: *"each connector is one HP and one level of defense ... level
   * five of defense comes out as two ... five HP times two, times five. So that is fifty."* — i.e.
   * DEF level = connectors. Same quantity, two rulings, both his; the NEWER one wins.
   */
  it('the structure totals match the owner R173: 2 connectors → 2.8, 3 connectors → 4.8', () => {
    expect(asDecimal(structureDefenceFifths(2))).toBe(2.8); // R173 "2 HP x 1.4"  (R76 said 2.4)
    expect(asDecimal(structureDefenceFifths(3))).toBe(4.8); // R173 "3 HP x 1.6"  (R76 said 4.2)
  });

  /** ⭐ HIS OWN WORKED TABLE, S177, asserted verbatim — the row he has now given three times. */
  it('his ladder, exactly: 5 → 50, 4 → 36, 3 → 24, 2 → 14, 1 → 6 fifths', () => {
    expect(structurePoolFifths(5)).toBe(50); // "five HP times two, times five ... fifty"
    expect(structurePoolFifths(4)).toBe(36); // "four HP times one point eight ... times five"
    expect(structurePoolFifths(3)).toBe(24);
    expect(structurePoolFifths(2)).toBe(14);
    expect(structurePoolFifths(1)).toBe(6);
  });

  /**
   * ⭐ THE ALGEBRAIC FORM HE ALLOWED, S177: *"HP times one plus zero point two times defense ... Sure.
   * Yeah. That works."* Asserted as a property so the table above cannot drift from its own formula.
   */
  it('pool(n) === n × (1 + 0.2n) × 5, for every structure size', () => {
    for (let n = 1; n <= 200; n++) {
      expect(structurePoolFifths(n)).toBe(Math.round(n * (1 + 0.2 * n) * 5));
    }
  });

  /**
   * ⭐ HIS CONSEQUENCE, asserted: *"a boss that has twelve attack and five penetration could still
   * destroy a tower with one hit."*
   */
  it("a 12-atk / 5-pen boss takes a 5-connector tower's first connector in ONE hit", () => {
    expect(attackFifths(12, 5)).toBe(120);
    expect(attackFifths(12, 5)).toBeGreaterThanOrEqual(structurePoolFifths(5));
  });

  /** ⭐ The pool is the cost of ONE connector; survivors re-form at the lower count. */
  it('levelling a 5-connector tower costs 130 fifths in total, accelerating', () => {
    const ladder = [5, 4, 3, 2, 1].map((n) => structurePoolFifths(n));
    expect(ladder).toEqual([50, 36, 24, 14, 6]);
    expect(ladder.reduce((a, b) => a + b, 0)).toBe(130);
  });

  /**
   * ⚠ The owner's 10-shape example said "11hp x 3.2def". Under the connectors−1 rule they CONFIRMED
   * ("which is somewhat correct"), 11 connectors give ×3.0, not ×3.2 — so the laser one-shots a
   * connector rather than needing two. This was flagged to the owner at ruling time and the formula
   * was kept. The test records the CONFIRMED formula and the consequence together, so nobody later
   * "fixes" it back to 3.2 from the older message.
   */
  it('11 connectors → x3.0 per connector (NOT the x3.2 of the owner\'s first draft)', () => {
    expect(asDecimal(connectorCapacityFifths(11))).toBe(3.0);
    // ⛔ RE-PINNED S177 (was 33, under R76's DEF = n−1). R173 gives DEF level = n: 11 × 3.2 × 5 = 176
    // fifths = 35.2 — which lands on his ORIGINAL "11hp x 3.2def", the draft R76 talked him out of.
    // His newest ruling agrees with his oldest; it was the middle one that differed.
    expect(asDecimal(structureDefenceFifths(11))).toBe(35.2);
  });

  it('and therefore a 3-ATK laser fells one of its connectors in ONE hit', () => {
    expect(attackFifths(3, 0)).toBeGreaterThanOrEqual(connectorCapacityFifths(11));
  });

  /**
   * ⭐ THE DEFINING PROPERTY, tested as a property rather than by example: the per-connector share is
   * the multiplier itself, because the HP term cancels. If someone later "fixes" the formula by
   * multiplying by connector count somewhere, this fails.
   */
  /**
   * ⛔ RE-PINNED S177 — THE DEFINING PROPERTY IS NOW THE OPPOSITE ONE, AND THAT IS THE RULING.
   *
   * Under R76 the per-connector share was `total / connectors` and the HP term cancelled. Under
   * R173-B there is NO per-connector share: *"each connector is worth the full defensive stat sum"* —
   * one structure-wide pool is depleted to take ONE connector.
   */
  it('the R173 pool is n × multiplier(n), i.e. one DEF level above the superseded R76 share', () => {
    for (let c = 1; c <= 200; c++) {
      expect(structurePoolFifths(c)).toBe(c * (connectorCapacityFifths(c) + 1));
      expect(structureDefenceFifths(c)).toBe(structurePoolFifths(c));
    }
  });

  /**
   * The owner's confirmed mechanic: "if you manage to damage its connectors then it also scales down
   * in defense and will be easier to keep beating down."
   */
  it('is DYNAMIC — losing a connector weakens every surviving one (accelerating collapse)', () => {
    const before = connectorCapacityFifths(11);
    const after = connectorCapacityFifths(10);
    expect(after).toBeLessThan(before);
    // strictly monotonic all the way down, so collapse never stalls
    for (let c = 200; c > 1; c--) {
      expect(connectorCapacityFifths(c - 1)).toBeLessThan(connectorCapacityFifths(c));
    }
  });

  it('complexity is genuinely protective: a triangle outlasts a row of the same three shapes', () => {
    expect(connectorCapacityFifths(3)).toBeGreaterThan(connectorCapacityFifths(2));
  });
});

describe('S151 P2 — the targeting matrix is ONE table (owner R72)', () => {
  /**
   * "Helga only attacks enemy units, chewers only attack towers, goblins of all kinds can do both,
   * laser torretr does both, lightning drones can do both, voltkin can do both."
   */
  it('HELGA attacks UNITS only', () => {
    expect(defenderCanTarget('princess', 'units')).toBe(true);
    expect(defenderCanTarget('princess', 'structures')).toBe(false);
  });

  it('CHEWERS attack STRUCTURES only', () => {
    expect(creatureCanTarget('chewer', 'structures')).toBe(true);
    expect(creatureCanTarget('chewer', 'units')).toBe(false);
  });

  it.each(['goblinMelee', 'voltkin', 'lightningDrone'] as const)('%s attacks BOTH', (type) => {
    expect(creatureCanTarget(type, 'units')).toBe(true);
    expect(creatureCanTarget(type, 'structures')).toBe(true);
  });

  /**
   * ⭐⭐ S182 — **RE-PINNED, NOT SILENCED. THE OWNER RETIRED R72'S TURRET CLAUSE IN S180.**
   *
   * This test used to assert `structures: true` and called itself *"the ruling, ahead of the beam"* —
   * a deliberate placeholder for a mechanic somebody was expected to build. Reading the targeting
   * table back to him he ruled the other way:
   *
   * > *"Yeah, laser turrets, creatures only. That's fine… maybe it doesn't do both. It does only
   * > creatures, so that's fine."*
   *
   * ⭐ So the assertion INVERTS and the test stays. Deleting it would drop the only machine-checked
   * record of the decision and let a future session re-read R72 and "finish" a mechanic he killed.
   * The table now agrees with the shipped beam AND with `SPARK_CANON.md` §5.
   */
  it("⛔ the LASER TURRET attacks CREATURES ONLY (S180 — he retired R72's turret clause)", () => {
    expect(defenderCanTarget('turret', 'units')).toBe(true);
    expect(
      defenderCanTarget('turret', 'structures'),
      "the beam has only ever damaged creatures; S180 settled the table in the code's favour",
    ).toBe(false);
  });

  /**
   * ⛔ S165 — THE ENTRY THIS REPLACES SAID `units` ONLY, AND THE CODE HAS ALWAYS DISAGREED.
   *
   * `stinkThrowBag` calls `applyRadialDamage(world, x, y, STINK_BAG_RADIUS, STINK_BAG_DAMAGE, ...)`
   * — the fifth argument is the PRIMITIVE amount, so every bag does 150 to every structure in the
   * blast. `defenderLifecycle.ts` states it at the call site too. The table was the only thing in
   * the repository claiming otherwise, and it claimed it in a sentence beginning "it has never
   * had a structure-attack path".
   *
   * ⭐ Pinned as a TEST rather than only fixed in place, because the thing that went wrong was a
   * confident comment nobody re-measured. This one fails if the splash ever stops being a
   * structure-breaker, which is the only way the old sentence could become true.
   */
  it('the STINK TOWER attacks BOTH — its bag splash damages primitives', () => {
    expect(defenderCanTarget('stinkTower', 'units')).toBe(true);
    expect(defenderCanTarget('stinkTower', 'structures')).toBe(true);
  });

  /**
   * ⚠ ANTI-VACUITY (the S145/S146 lesson, and CF3's whole subject): a matrix where every attacker
   * happened to hit everything would pass every test above while encoding no rule at all. Assert that
   * the table actually DISCRIMINATES.
   */
  it('the table is not vacuous — at least one attacker is excluded from each class', () => {
    const creatures = Object.values(CREATURE_TARGETS);
    const defenders = Object.values(DEFENDER_TARGETS);
    const all = [...creatures, ...defenders];
    for (const cls of ['units', 'structures'] as TargetClass[]) {
      expect(all.some((s) => !s.has(cls))).toBe(true);
    }
  });

  it('every attacker can attack SOMETHING — no unit is inert by table', () => {
    for (const [type, set] of Object.entries(CREATURE_TARGETS)) {
      expect(set.size, `${type} can attack nothing`).toBeGreaterThan(0);
    }
    for (const [kind, set] of Object.entries(DEFENDER_TARGETS)) {
      expect(set.size, `${kind} can attack nothing`).toBeGreaterThan(0);
    }
  });
});
