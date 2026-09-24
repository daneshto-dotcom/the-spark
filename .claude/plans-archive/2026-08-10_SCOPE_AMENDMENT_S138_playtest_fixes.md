# SCOPE AMENDMENT (Rule 16) — S138 P2: three owner playtest fixes

**Trigger:** owner played the live build mid-session and reported three items, then instructed:
*"i want you to fix all of those things before checking and analyzing and /handoff"*. That is a scope
EXPANSION beyond the approved P1 (damage substrate), so it gets its own amendment. The owner's
instruction is the approval; no separate go was solicited.

**Tier:** Standard (3 files-groups, ~3 mechanics, no new wire literals except the version bump).

---

## A.0 STATE DISCOVERY (empirical, before any edit)

| owner item | what the code actually says | verdict |
|---|---|---|
| 1. castles at the extremities of each player's zone, not the middle | `castleAnchor()` (`gatherers/gatherer.ts:110-125`) places all keeps on ONE ring at `r = SPAWNER_RADIUS + 150` = **275 px** from arena centre (`SPAWNER_RADIUS = 125`, canvas 1920×1080, centre 960,540). There is **no "starting zone" concept in the code** (design-doc C3 confirmed by grep). So the actionable form is "increase the keep ring radius" | ACTIONABLE — this is R4 from `CASTLE_BUILD_SPACE_DESIGN.md` §1b, already owner-ruled, now pulled forward |
| 2. "each primitive pushes another primitive away as anti-magnetism" | **NOT collision.** `anchorStabilize.ts:9-11` states it outright: *"placed primitives are NOT free-integrated — verletStepAll steps only world.freeSparks; resolveCollisions is spark-only; a placed structure is held purely by the solveBonds distance constraints."* The real source is **`STRUCTURE_GROW_IMPULSE = 0.8`** (`constants.ts:569-586`): an **outward** verlet impulse applied to *every primitive in the primary's pre-existing component* on each placement, *"pushing outward from the component's local centroid"* — a deliberate "puff" added in S13 P2. Applied at `placePrimitive.ts:552` | CONFIRMED + LOCATED. `MERGE_IMPULSE_MAGNITUDE = 3.0` is the **opposite** (INWARD, cross-structure merges only) so it is NOT the reported symptom and is left alone |
| 3. bots grab sparks with their cruisers, not their gatherers | `botBrain.ts:148` → `pickTargetSpark` (`:159-177`) scans **ALL of `world.freeSparks`** — the shared quarry — and `botController.ts:314` dispatches `PICKUP_SPARK`. Meanwhile `gameMode.ts:260-264 seedStartingGatherers` gives **every seat, bots included, one gatherer**. So a bot runs TWO income channels: its gatherer hauling to its bank *and* its cruiser grabbing from the shared quarry | CONFIRMED — this is the `BACKLOG` V6-1.7 *"bots must learn the new economy"* gap |

### Two facts that make item 3 safe to do now

1. **Filtering `pickTargetSpark` is REPLAY-SAFE.** It draws `rng()` **exactly once** on the sloppy path
   (`free[Math.floor(rng() * k)]`) and **zero times** on the smart path (`return free[0].id`),
   regardless of candidate count. So narrowing the candidate set cannot shift the RNG stream.
   (Independently recorded in `BACKLOG.md` V6-1.1 and re-verified by reading the function.)
2. **`BotGoal` has NO wire surface** — grep of `save.ts` + `net/` finds nothing. Adding a goal member
   is free: no serialization, no hash, no protocol implication.

---

## THE FIXES

### Item 2 — delete the outward puff (smallest, do first)
`STRUCTURE_GROW_IMPULSE` → **0**, with the physics application removed at `placePrimitive.ts:552`
rather than left multiplying by zero. The *visual* `STRUCTURE_GROW` flash is a separate effect and
is KEPT — only the physical shove goes. `MERGE_IMPULSE` (inward) is untouched and flagged to the
owner in case they want that gone too.

### Item 1 — push the keep ring out
`castleAnchor`'s `r` becomes a named `KEEP_RING_RADIUS = 420` (design-doc C3 verified R = 275 / 360 /
420 / 460 all fit the 7-seat ring on a 1080-tall canvas; 420 nearly doubles the quarry-rim→keep gap
from 150 px to 295 px and keeps a comfortable margin).

⚠ **MEASURED CONSEQUENCE, surfaced not buried** (design-doc C2): this makes the haul **1.97× longer**,
so gatherer throughput DROPS. At cap 5 the economy banked ~5 shapes/60 s before the move. The bank
cap raise to 12–13 (§1b R2) is the counterweight and is NOT in this amendment. Expect a slower
opening; re-measure with `e2e/bank-throughput.spec.ts` and retune gatherer speed/count in the
build-space session.

### Item 3 — bots build from their OWN porch, via their gatherer
- New pure helper `isOwnPorchSpark(seat, spark)`: `escrow === 'banked'` **and** within
  `CASTLE_PORCH_SLOT_CLEAR_RADIUS` of one of that seat's `porchSlot(seat, i)` positions.
- `pickTargetSpark` takes the seat and considers ONLY that seat's porch shapes ⇒ **a bot cruiser can
  no longer take anything out of the shared quarry.**
- New `BotGoal` member `PULL`: when the porch has nothing but the bank has stock, the bot dispatches
  the already-shipped **`PULL_FROM_BANK`** client intent (index 0) — host-validated, no new wire
  surface. Its gatherer fills the bank; the bot pulls onto its porch; then it collects and places
  from there, mirroring the intended human flow.

⚠ **BALANCE CONSEQUENCE:** bots become gated on gatherer throughput, so vs-bots difficulty DROPS —
compounded by item 1 lengthening the haul. That is the direct intent of "which is not fair", but it
is a real difficulty change and the owner should re-playtest.

## PROTOCOL
⚠ Item 1 changes `castleAnchor`, a **shared constant both peers compute from** (the client calls it to
draw keep boxes and hit-test keep clicks). A stale peer would draw keeps on the old 275 ring and
mis-hit-test them, so the seats would disagree about where a castle IS. By this codebase's
*semantic* bump standard (`protocol.ts:152` — additive-optional + no semantic change ⇒ no bump) this
DOES warrant one: **PROTOCOL_VERSION 16 → 17**, deploy, and reload both sides.

Note this supersedes P1's finding that the damage substrate alone needed no bump (it did not — it is
wire-inert). The bump is being spent on the keep-ring move, and it now also covers P1's `hp` field.

## TESTING
- tsc 0 · full vitest suite green · `e2e:gating` 32/0 · build under the 750 KiB charter.
- Item 1: assert all 7 keeps land on the new radius and stay inside the canvas.
- Item 2: assert no outward impulse is applied on placement (positions unchanged by the grow path).
- Item 3: assert a bot ignores a quarry spark, and pulls from its bank when its porch is empty.
- Deploy + `verify-deploy` 4/4.
