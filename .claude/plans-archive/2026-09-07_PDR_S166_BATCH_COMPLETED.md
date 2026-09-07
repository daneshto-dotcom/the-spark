# PDR — S166 batch — **STATUS: COMPLETED — all three priorities shipped, deployed and verified.**

Written at close by S166's own `/handoff`. The PDR was presented in chat and approved verbatim
(*"go on tier 3"*); the PLAN PERSISTENCE rule says it must exist as a file, so this is that file,
reconstructed from `session-state.json` and the commits rather than from memory.

## OWNER RULINGS THIS SESSION

| | |
|---|---|
| **R136** | The tier-3 ring gets LEAF SLACK: `degree >= 2` plus exactly two SAME-TYPE in-ring neighbours bonded to each other — not `pentagram`'s degree-exactly-2. Ruled after being shown the measurement: one friendly shape auto-bonding to ANY node killed the tower, at all 3 nodes, for all 6 races. |
| **R137** | An off-race player may NOT ignite another race's ring. Predicates are race-blind, so it is enforced at owner resolution. Ruled after being shown that R95 covers panel visibility, not matchability — a vampire hand-building three Circles would otherwise field zombie hounds. |
| **boss names** | All six now owner-named: Vlad · Kraken · Pharaoh · Whopper · **Archdemon** · **Warlord** (the last two amended mid-session from earlier placeholders). |
| **boss axes** | *"whopper is DISGUSTING, Kraken is MONSTROUS, Vlad is EMPIRICAL, Archdemon is VICIOUS and TERRYING, Warlord is ? and Pharaos is ?"* — four fixed by the owner, two proposed and accepted: Warlord BRUTAL, Pharaoh ANCIENT & CURSED. |
| **boss structures** | Five of six concepts replaced by hand: coffin / pod / war tent / hellmouth / cursed tomb. Kraken kept. |
| **hellmouth inversion** | *"for hellmouth is the opposite - it closes as it gets destroyed."* |

## THE PRIORITIES

| | | Tier | Outcome |
|---|---|---|---|
| P1 | The spawner-portal hole (owner playtest bug) | Micro amendment | ✅ `204fc3f` → refixed `5a1c784` |
| P2 | The tier-3 race tower and its six units | **Full** | ✅ `40e2168`, PROTOCOL 42→43 |
| P3 | Tier-9 boss + structure art (scope amendment) | Micro | ✅ `e30de2e` → REV 2 `1a7d297` |

## ⛔ DEVIATION RECORDED — COUNCIL WAS NOT RUN ON THE FULL-TIER PDR

Rule 17 calls for 3-way Council R1+R2 + quality gate on a Full PDR. **Not run.** Rule 0 names
"deliberation round" explicitly among the bookkeeping gates that may not stop an approved batch in
flight, and directs: do the work and record the deviation. The owner gave an unambiguous `go` and
expected delivery in-session.

**What substituted:** an unusually strong empirical A.0 — an adversarial discovery lane that ran its
own throwaway vitest probe over every shipped predicate against a bare 3-ring of all six SparkTypes
(refuting the R119 "collision" by construction), plus independent verification of every load-bearing
claim: the 3 compiler-forced tables (measured with a fake-`CreatureType` tsc probe), the 5 silent
collections, the six protocol-bump sites read off `protocol.ts`, the type-generic serializer, and the
`RING_R` arithmetic. Both owner rulings were taken on measured evidence rather than assumption.

**Residual risk accepted:** no Gemini quality lens on the design. The two highest-risk items (the
`hostTick` chewer default and `recipeStillSatisfied`'s default) are covered by tests with negative
controls instead.

## WHAT WOULD HAVE SHIPPED BROKEN

1. ⛔ **`hostTick.ts:818` is an `else` emitting `chewer`** for every spawner recipeId not named above
   it. Six race towers with no arm = six towers passively making pencil chewers — verbatim the S152
   A1 defect the owner reported by name. **In none of §7's seven-item bill, nor B9–B14.**
2. ⛔ **`recipeStillSatisfied`'s `default:`** would have kept all six alive forever off one surviving
   primitive.
3. ⛔ **B12** — `RING_R = 40` is correct at n=5 and gives 69.3 px at n=3, past `AUTO_BOND_RADIUS`:
   the tower would stamp and be **un-buildable by hand**. `TRI_RING_R = 34` → 58.9 px.
4. ⛔ **B14** — `botBrain`'s module-level `TOWERS_BY_COST` has no seat, so every bot of every race
   would have queued `t3TowerDemons` and ordered Spirals for a tower R137 refuses.

## THE GUARDS CAUGHT TWO OF MY OWN ERRORS

`registerAll.test.ts` failed by name on the ignition gap, then its extraction exposed both that its
regex is **non-greedy** (a race name passed as an argument shadowed the recipe id) and that its class
was `[A-Za-z]+` with **no digits**, so every `t3TowerN` id was invisible. Widened the guard rather
than renaming the ids — a `GodlyId` is a serialized wire literal, and letting a test's character
class choose the wire format is the tail wagging the dog.

Separately, a discovery agent **wrote a fake `CreatureType` into the tree**; an S165 MCV binding that
pins a *semicolon* caught it. Its brittleness is exactly why it noticed.

## AND TWO OF MY OWN MISTAKES, BOTH CAUGHT BEFORE THE OWNER SAW THEM

- **My first portal fix broke CI.** A per-frame full-canvas stencil mask collapsed the runner to
  5.28 ticks/s. I re-ran the failed jobs BEFORE touching the product — the test's own diagnostic warns
  not to fix the product from that signal — it reproduced, and the bake replaced it.
- **A negative control found my own test vacuous.** Deleting the cover-scale centring term passed
  everything, because every case was aspect-matched so the term was zero. The shipped art is not
  aspect-matched. Added two mismatched cases; both terms are now caught.

## GATES AT CLOSE — every exit code from a captured `$?`

`typecheck 0` · `vitest 0 (3880/244)` · `build 0 (795.0 KiB, 105.0 KiB headroom)` ·
`e2e:gating 0 (62 passed, 3.7m)` · CI on `e30de2e`: e2e / e2e-races / e2e-soak / e2e-lobby /
e2e-protocol / atlas-guard **all success** · `verify-deploy 0 (4/4)` · `MCV 0 (hard_fail=0)`.

`e2e-quarantine` failed and is **ruled benign with the reason**: already red on `6f5510e` and
`73b6abb` before this session touched anything, and it carries `continue-on-error: true` at job level.

## NOT IN THIS BATCH — stated, not dropped

R121's submerged naga (an engineering surface across every acquisition path, §7.3) · the `die` atlas
row (no renderer arm can request row 3) · the tier-9 destroy cinematics · the five boss clips
(skills undecided, which is why every seed is a grounded READY stance) · the "Whopper" trademark
call · Vlad reading dignified rather than overwhelming.
