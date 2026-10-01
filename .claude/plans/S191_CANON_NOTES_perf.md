# S191 — s191/perf canon notes (for the merge owner; this branch does NOT edit SPARK_CANON.md)

## No canon number moved
s191/perf is a pure performance change. No stat, pool, damage, cadence, range, radius or protocol value
is touched; `src/canon.test.ts` and `SPARK_CANON.md` are untouched. `PROTOCOL_VERSION` is untouched and
no bump is owed: nothing serialized or on the wire changed, and no rule a client computes changed —
`s191Perf.differential.test.ts` proves the sim's outputs and `hashWorldStateFull` byte-identical to
master 42cc2ee across waves 1–5.

## Suggested canon text (§5b's last paragraph is the S190 precedent)
⭐ **THE TERRITORY PASS IS GRIDDED (S191 `s191/perf`), WITH BYTE-IDENTICAL OUTPUTS.** Each seat's shapes are
bucketed once per tick into cells of side R + 1, and an enemy bond's endpoints are tested only against the
nine cells around them; outside a ±1e6 envelope the old exhaustive test runs. The rule itself is unchanged:
a bond is engulfed (stiffness × 0.3) when some shape of seat P lies strictly within P's radius of either
endpoint and NEITHER endpoint is P's colour. `s191Perf.differential.test.ts` + `territoryGrid.differential.test.ts`.

## Facts this branch relied on (all unchanged)
- Territory radius: R = 60 + 12·log2(complexity + 1), complexity = prims + 0.5·same-colour bonds +
  0.1·components; halved under the shrink debuff; 0 with no shapes.
- ⚠ CORRECTED DOCBLOCK (Council S191 item 1): cross-colour bonds are NOT impossible (a weld bonds two
  seats' shapes; `makeBond` checks no colour). For seat P the influence pass skips a bond when EITHER
  endpoint is P's colour, so a mixed X/Y bond is engulfable only by a THIRD seat. Unchanged behaviour;
  the old comment claimed the case could not arise.

## ⚠ A FINDING FOR THE OWNER — REPORTED, NOT ACTED ON
**On a plain four-seat bots match the territorial engulf never fires.** Measured: waves 1–3, 27 000 host
ticks, 0 bonds engulfed. Seats build inside their own zones, so no enemy connector is ever within R
(~60–140 px) of another seat's shapes. The pass still costs a share of every tick (13.6–15 % before this
branch, ~3–7 % self after) to compute "no" for every bond. Whether the mechanic should be retired, kept
dormant, or made reachable is his call; this branch changes none of it.

## Suggested canon text for the nav-unit index (beside the S190 bond index in §5b)
⭐ **THE UNIT RE-ACQUIRE IS INDEXED TOO (S191 `s191/perf`), WITH BYTE-IDENTICAL OUTPUTS.** Inside the same
creature-loop epoch, `pickNavUnit` re-acquires from a per-seat list of the enemy creatures instead of the
whole Map; membership re-validated before every call, everything else read live. The rule is unchanged:
nearest enemy unit within 220 px (`GOBLIN_UNIT_ACQUIRE_RADIUS`) by squared distance, lower id on a tie,
held while it stays inside 300 px (`GOBLIN_UNIT_LEASH_RADIUS`) and targetable.

## ⚠ A SECOND FINDING FOR THE OWNER — REPORTED, NOT ACTED ON (Council S191 item 2)
**A unit killed earlier in the same tick can still be picked as a chase target.** Under the S155 N1
deferral a creature reduced to 0 ehp stays in the Map until the sweep after the creature loop, and the
nav-unit search has never checked `ehp` or `pendingCreatureDeaths`. Measured on the real four-seat bots
match: the live scan returned such a unit 604 times (waves 1–3) and 2 616 times (waves 1–5, 120
creatures). This branch keeps that behaviour exactly (a filter would change outputs). Whether a dying
unit should stop being a target is a ruling; if he wants it, the reference fixture
(`navUnitReference.fixtures.ts`) changes FIRST, then the index.
