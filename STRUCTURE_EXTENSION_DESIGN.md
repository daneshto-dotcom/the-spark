# Building a CITY — structures that keep working when you extend them

**Status: RECORDED, NOT BUILT. Owner deferred it deliberately** — *"we will not do it this session
... because I don't want to screw everything up because you still have lots of priorities and I
don't want you to do it on a heavy context."* Next session, fresh context, its own PDR.

---

## What he asked for, in his words

> *"If we have a structure, like we've built in this shape, with the right connectors, with
> everything, and we connect any other shape to it, then the structure ceases to exist. Like we
> build a pentagram, for example, that produces pencil chewers, and then we connect any shape to it,
> and it's not a pentagram anymore. It doesn't have the function that it does. I don't like that."*

> *"Any structure that has the right combination in the right order and the right shape of things
> should produce the buildings that it produces... And if you build new connectors to it, to connect
> many towers together, like in a continuous town, or a city, or a fortress, that should be possible.
> Without destroying the function of the buildings. Just adding strength to the whole structure."*

> *"But it also adds more potential vulnerability, because if you can destroy completely a structure
> in the middle, then the part that has the lowest shapes gets deleted. You know what I mean? Like,
> we have that function."*

---

## ✅ HE IS RIGHT ON ALL THREE COUNTS — VERIFIED S179

### 1. The complaint is real, and it is deliberate design, not a bug

Every recipe uses **exact component isolation**. From `godlyRecipes/pentagram.ts:16` verbatim:

> *"component size MUST be exactly 5 (an extra attached shape ⇒ NO match)"*

and `pentagram.ts:67` — `if (p.bonds.size !== RING_DEGREE) return false;`

The same rule is in `voltkin.ts:292`, `lightningHub.ts:37`, `princessHelga.ts:56`,
`starShape.ts:108`. `starShape.ts:22` even documents his exact scenario: attach a shape to a leaf,
*"the component becomes 7, `isLightningHubComponent` returns false"*, and the building dies.

### 2. ⭐ THE VULNERABILITY MECHANIC HE REMEMBERED ALREADY EXISTS AND IS SHIPPED

`game/structure.ts:107` `severSplit()` — cut a connector, BFS both sides:
- cut lay on a **cycle** → both sides still connected → **nothing dies**;
- otherwise the **SMALLER side is deleted**, the larger survives (`structure.ts:126-136`);
- an exact size tie breaks on the newest-shape tick, so it is **deterministic**.

That is *"the part that has the lowest shapes gets deleted"*, already built. **Nothing to do here.**

### 3. ⭐ AND THE "ADDS STRENGTH" HALF ALREADY WORKS TOO

`structurePoolFifths(n) = n × (n + 5)` is **quadratic**, so joining towers is already dramatically
tougher — it is not a linear sum:

| connectors | pool |
|---|---|
| 5 | 50 |
| 10 | 150 |
| 20 | 500 |
| 40 | **1800** |

So the reward he wants for building a city is *already in the ladder*. It is simply unreachable,
because of §1.

---

## ⛔ SO THE ENTIRE FEATURE IS ONE RULE CHANGE

Every recipe today asks:

> "Is this component **EXACTLY** the pattern?"

It must instead ask:

> "Does the pattern **EXIST INSIDE** this component?"

That is the whole idea. It is real work — it touches the matcher and all ~12 recipes — but it is one
coherent change, not a rewrite.

---

## ⛔ THE ONE QUESTION ONLY HE CAN ANSWER — ASK BEFORE BUILDING

**Can one shape belong to TWO recipes at once?**

Build a pentagram, extend it into a bigger fortress, and part of that fortress also forms a valid
star. Do both buildings run? Only one? Which?

This is a *design* decision, not a technical one, and every implementation choice below depends on
it. **Construct the case and bring it to him — do not guess.** (CLAUDE.md: *"Before asking,
construct the case."* And note S158 already flagged a recipe-overlap consequence for a ruling.)

Three shapes the answer could take:
1. **Both fire.** Richest, and the "city" fantasy is strongest — but one dense lattice could ignite
   many towers at once. Needs a per-shape or per-component cap or it is an exploit.
2. **One fires, by a fixed precedence.** Deterministic and cheap. Precedence must be an explicit
   total order (never `REGISTRY` insertion order — see the determinism note below).
3. **A shape is CLAIMED by the first recipe that uses it**, and is then unavailable to others.
   Closest to how a player thinks about bricks, and it makes extension purely additive.

---

## Engineering notes for whoever builds it

- ⛔ **DETERMINISM.** Subgraph matching must be a **total order** — matches enumerated by sorted
  PrimitiveId, never by `Map` iteration. `godlyRecipes/index.ts`'s `REGISTRY` is ordered by module
  EVALUATION order, which already differs between `main.ts` and `simWorker.ts`; the S179 determinism
  sweep found the relative order within each `kind` happens to match today, so it is latent rather
  than live. **This feature would make that latency load-bearing.** Fix the registry order first.
- **COST.** Exact-component matching is O(component). Subgraph matching is not. A 40-connector city
  re-matched every tick is a real perf risk — match on **topology-change events** (a bond added or
  removed), not per tick.
- **THE POOL GETS BIG.** `structurePoolFifths(40)` = 1800 fifths on ONE component. Check this against
  what a chewer can realistically chew and against `damageConnector`'s per-connector share, or a city
  becomes unkillable rather than merely tough. This is a BALANCE question for him once it is playable.
- **What NOT to touch:** `severSplit` (already correct), and the ladder itself.

---

## Where this sits

The owner ranked it above the end-of-match stat board in importance but **explicitly deferred it**
to protect the rest of the S179 batch. It is the **first candidate for S180**, with the overlap
ruling obtained *before* any code is written.
