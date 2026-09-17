# BRANCH 3 — `s182/placement`

Three build-UX defects the owner hit in a live two-player match. All three confirmed in code.

---

## ITEM 1 — YOU CANNOT BUILD ON GROUND NEAR THE QUEUE MENU

> *"Where the queue is with all the shapes — in that area you can't place towers. That's weird. You
> should be able to place them out there."*

### The cause: a CIRCLE guarding a shape that is not a circle

`src/state/blueprintLegality.ts:63` and `:77-82` use the **scalar circumradius** `blueprintRadius`
(`blueprints.ts:424-427` — the distance to the *farthest* node) as the edge margin for every
blueprint.

A blueprint is not a disc. A wide, flat recipe is refused across a band as deep as its **longest**
arm in *every* direction, so playable ground near the bottom edge — exactly where the queue HUD sits —
is rejected for shapes that would fit comfortably.

### The fix

**Replace the circumradius margin with the blueprint's TRUE footprint.** Add a pure
`blueprintExtent(id)` beside `blueprintRadius` in `blueprints.ts`, returning
`{ minDx, maxDx, minDy, maxDy }` derived from `BLUEPRINTS[id].nodes` — same one-loop shape as
`blueprintRadius`, so the two cannot drift.

⛔ **THE SAFETY DIRECTION MATTERS AND IT CUTS BOTH WAYS.** Too large = lost ground (his complaint).
Too small = planting a shape under a panel you cannot see — **which is a bug S181 actually shipped**
(the character card was registered in only two of three UI-surface guards, so releasing a spark drag
over it planted a shape on hidden ground). Your fix must not trade one for the other. State in your
commit how you avoided it.

### ⛔ ENUMERATE EVERY UI-SURFACE GUARD BEFORE YOU TOUCH ONE

There were **three** in S181 and a surface registered in some but not all is the defect class. grep
the "is the pointer over a UI panel" predicate, name each guard, name every surface registered in
each, and report any asymmetry — **that asymmetry is a bug whether or not it is this one.**

Establish also whether the refusal is at **INPUT** (the click is swallowed) or at **VALIDATION** (the
placement is attempted and rejected). Those are different fixes. Prove which.

**Determinism:** `blueprintLegality` is consumed by the reducer. Any change must be identical on host,
worker sim and replay. Derive from `BLUEPRINTS`, never from a rendered bound.

---

## ITEM 2 — YOU CAN BUILD A TOWER ON TOP OF YOUR OWN CASTLE

> *"You can place any tower over the castle. The castle doesn't read anything. Castle should have an
> area around it where you can't place anything. At least in the immediate vicinity."*

### The fix

Add **one castle term to the ONE shared predicate**, plus one footprint-aware arm on the stamp gate.
Nothing else.

1. `src/state/zones.ts` — a new exported `CASTLE_NO_BUILD_RADIUS`, and one arm at the **top** of
   `canBuildAt`, before the zone test: for each zone index of `layout`, squared distance from `pos`
   to `ANCHORS[layout][i]`.
2. `src/state/blueprintLegality.ts` — a footprint-aware arm and a new `StampRefusal` member so the
   ghost can explain the refusal rather than silently rejecting.

### ⛔⛔ DETERMINISM — THE LOAD-BEARING PART

Placement is a **reducer**. It runs on the host, on the worker sim **and** in replay, and its output
is **hashed**. A guard added only in `controls.ts` (the client pre-check) and not in the reducer means
the host and a joiner form **different worlds from the same intent** → hash divergence.
**Both sites get it. Name both in your commit.**

### The radius

⚠ **This number is YOURS, not the owner's.** Per this repo's rule, its docblock must say so, with the
measurement behind it. Derive it from what the castle actually **draws** plus a margin — do not pick a
round number. Check first whether an existing constant already fits (gatherer spawn clearance, the
castle bank, the gun range); reusing one beats minting one.

⚠ **Check the bot.** `src/bots/` places towers. Make sure it does not now spin retrying a refused
position near a castle.

⚠ `CASTLE_BUILD_SPACE_DESIGN.md §1 Q2` states the **opposite** as the then-current law
(*"Wherever you drop it. Same legality rules as today"*). That document is now superseded by his S182
report. Note it; do not silently contradict it.

---

## ITEM 3 — NO COST PREVIEW ON THE CARRIED TOWER

> *"When you click on a tower, before you place it, when you're carrying the template, it should show
> you 'this will cost you this much and this much'. In a consistent manner without writing over the
> shapes. It should be a very understandable place."*

This is a **missing readout, not a broken one.** Every surface that draws during carry was enumerated
and none of them prints the bill. Nothing is host-gated, nothing is unserialized.

### ⭐ THE BILL ALREADY EXISTS — REUSE IT, DO NOT WRITE A SECOND CALCULATOR

S181 shipped "build recipe above the health bar" on the character sheet. The model that computes
*"this recipe costs N of shape X"* is already written: `blueprintBill(id)`, consumed in
`castlePanel.ts`'s `castleStructuresModel` `ALL_SPARK_TYPES` loop (`:466-474`).

**A duplicate cost calculator that drifts is this repo's named top defect.** Use the existing one.

### The fix

Render-only, reusing the existing bill and the existing row geometry:

1. `castlePanel.ts` — in that same loop, collect a second array `bill: Array<{type, need, have}>`
   holding **every** type in the blueprint's bill (not only the short ones) and add it to
   `StructureRow`. Same loop, same `blueprintBill(id)` call, same total order. Add a sibling to
   `shortfallEntries`.
2. `footerBand.ts` — draw it during carry.
3. `blueprintGhost.ts` — `sync` currently draws exactly three things (footprint ring at
   `blueprintRadius`, the blueprint shape, validity tint). Keep it consistent with those.

⚠ **S181 SHIPPED TWO BUGS OF EXACTLY THIS CLASS**: a new UI block that drew but never advanced the
layout cursor, and another that drew on top of an existing row. **Say in your commit how your block
participates in the existing layout rather than drawing at an absolute position.**

No `PROTOCOL_VERSION` bump. Nothing new is serialized.

---

## GATES

`typecheck` · `vitest` · `build` · **`e2e:gating` — REQUIRED, all three items move UI geometry or the
placement reducer. This is the lane that catches "a panel that cannot be closed".**

## FILE BOUNDARY

**Yours:** `state/blueprintLegality.ts` · `state/blueprints.ts` · `state/zones.ts` ·
`state/zones.fixtures.ts` · `render/blueprintGhost.ts` · `render/footerBand.ts` ·
`render/castlePanel.ts` · `input/controls.ts` *(placement path only)* · `src/bots/` *(if the refusal
affects it)*

⚠ `src/constants.ts` is shared with branch 5 — append your constants in your own section.
⚠ `input/controls.ts` is shared with branch 2, which owns the **sheet-open** path (`:976`, `:1076`).
You own the **placement** path. Stay out of each other's arms.

## TESTS OWED

- `blueprintExtent` derived from `BLUEPRINTS`, asserted per recipe.
- A legality test proving ground near the bottom edge accepts a wide blueprint that the circumradius
  rejected — **and** that a shape still cannot be planted under a UI panel.
- Castle keep-out asserted in the **reducer**, not only the client pre-check — plus a source-text
  tripwire that both sites carry the term.
- A footer-band layout test that the cost block advances the layout cursor and overlaps nothing.
