# R173 — STRUCTURE HP: THE OWNER'S RULING, AND WHAT IT CHANGES

**STATUS: RULED. Not yet implemented.** Given S173 in response to the divergence report in
`S173_STRUCTURE_HP_DIVERGENCE.md`. This supersedes R76 as recorded in `stats.ts`.

---

## R173-A — DEF LEVEL **IS** THE CONNECTOR COUNT (not count − 1)

> *"death is the number of connectors plus one, not minus one … So three connectors would be one
> point six. Right? Because it's a level three def. Level one is one point two. Level two is one
> point four. Level three is one point six. Very simple."*

| DEF level | multiplier | in fifths |
|---|---|---|
| 1 | ×1.2 | 6 |
| 2 | ×1.4 | 7 |
| 3 | ×1.6 | 8 |
| 4 | ×1.8 | 9 |
| 5 | ×2.0 | 10 |

⇒ `multiplierFifths(level) = 5 + level`, and **DEF level = connector count `n`**.
⇒ **structure pool = `n × multiplierFifths(n)` fifths = `n × (5 + n)`.**

⛔ **SUPERSEDES R76 AS RECORDED.** `stats.ts` says *"the structure's DEF = connectorCount − 1
(1 connector → 0, 2 → 1, 3 → 2)"* and `connectorCapacityFifths(n) = n + 4`. His earlier words are
pinned in `stats.test.ts` as `"3hp x 1.4 = 4.2"` — he now rules 3 → ×1.6. Both statements are his;
**the newer one governs**, and the older test assertions must be re-pinned to it, not deleted
silently.

## R173-B — EACH CONNECTOR COSTS THE **FULL CURRENT STRUCTURE POOL**

> *"Each connector is worth the full defensive stat sum."*

His two worked cases:

- **Two shapes, one connector.** *"the defense would be one and would be worth one point two. The HP
  would also be one … one times one point two times five. So the total defensive stat of this shape
  would be six. And if that one connector is lost, then boom. The whole shape gets destroyed."*
  ⇒ n=1 ⇒ pool **6 fifths**; losing it destroys the structure.
- **A triangle (tier-3 building).** *"we would have an HP of three, a defense of three, which comes
  out as one point six, and we would do three times one point six times five."*
  ⇒ n=3 ⇒ pool **24 fifths** — and that is the cost of **ONE** connector, not of all three.

Then the survivors re-form and the pool **recomputes at the lower count**, which is the accelerating
collapse R76 already describes:

| n | pool to lose ONE connector | running total to level the structure |
|---|---|---|
| 5 | 50 | 50 |
| 4 | 36 | 86 |
| 3 | 24 | 110 |
| 2 | 14 | 124 |
| 1 | 6 | **130** |

⛔ **THE SHIPPED CODE IS NOT THIS.** `damageConnector` banks damage on ONE bond and severs it when
that bond alone reaches `connectorCapacityFifths(n)` — 9 fifths for a 5-connector hub, not 50.

**Blast radius, measured:**

| structure | shipped total | ruled total | factor |
|---|---|---|---|
| 5-connector lightning hub | 35 | **130** | **3.7×** |
| 3-connector tier-3 tower | 18 | **44** | **2.4×** |
| 1-connector pair | 5 | **6** | 1.2× |

A chewer bites for `attackFifths(1,2)` = 7 fifths. Today it takes the first connector off a
5-connector hub on its **second bite**; under R173-B it needs **eight**.

## R173-C — THE CONNECTOR THAT FALLS IS THE ONE BEING ATTACKED

> *"the damage lands on whatever bond the attacker targeted. That's literally what I meant by the
> closest to where the creature is attacking from … the first connector to be targeted is the one to
> fall first."*

So **no new nearest-connector selection is needed** — my concern was unfounded. The targeted bond is
the one that dies. ⚠ But the determinism requirement survives in a different place: when the shared
pool empties, *which* bond pops must still be a **total order** if two attackers have targeted
different bonds. His rule gives the tiebreak — **first targeted wins** — which needs an explicit
ordering (earliest damage tick, then id), never `Map` iteration order.

---

## IMPLEMENTATION NOTES (for the session that builds it)

- `connectorCapacityFifths(n)` becomes `multiplierFifths(n)` = `n + 5`, i.e. the per-connector share
  is the FULL pool rather than `pool / n`. The function name will then be misleading — it is no
  longer a "capacity per connector" in the dividing sense; rename or re-document at the site.
- `structureDefenceFifths(n)` = `n × multiplierFifths(n)` and becomes the **pool that must be
  depleted per connector lost**.
- The accumulation must become **structure-wide**, not per-bond. `Bond.damageFifths` already exists,
  is serialized and is hashed; summing it across the component preserves the wire shape with **no new
  field and no protocol bump**. On a sever, subtract the pool rather than zeroing, so overkill carries.
- ⚠ **RE-PIN, DO NOT DELETE**, the owner-quoted assertions in `stats.test.ts` (`"2HPx1.2DEF which
  makes it 2.4"`, `"3hp x 1.4 = 4.2"`). They record what he said THEN; the file should show both
  rulings and which one governs.
- ⚠ **The balance tripwire will move.** `statsLadder.test.ts`'s *"one basic goblin can kill any unit
  inside a FIGHT phase"* covers creatures, not structures — but raid/chew tests
  (`raid.test.ts`, `towerDefense.test.ts`, `constants.lock.test.ts`) pin the old arithmetic directly
  and WILL go red. That is the guard working; each needs re-pinning against R173, not silencing.
- The S173 health bar already reads `structureDefenceFifths`, so it follows automatically.
