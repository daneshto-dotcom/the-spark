# PDR S146 — Limitless castle inventory + no loose-spark repulsion

**Tier:** Full · **Approval:** owner-explicit, verbatim *"dont argue with me or run council about wether
to implement it or not i said make it happen so make it happen, you can run council on how to make it
happen if needed"* + *"i approve the stink tower art for now just build it!"*

Council was run on **HOW ONLY**, per that instruction.

---

## OBJECTIVE

1. Loose shapes must stop shoving each other. Owner: *"the primitives push each other off like an
   antimagnet which becomes a mess... when you click to drag one it pushes the other out of the way...
   now that we have gatherers there is no use for that anymore."*
2. The castle inventory becomes **limitless** and is held as **per-shape-type counts**, displayed as
   `SPIRAL x6 · SQUARE x2`, so the codex library is actually usable to build shapes.
3. Stink tower: owner blessing granted — clear the pending ruling, confirm it is buildable and visible.

## A.0 STATE DISCOVERY (empirical, this session)

| # | Check | Result |
|---|---|---|
| 1 | `npm run build` | PASS — `index-Blrtx25J.js`, **byte-identical to live** |
| 2 | `vitest` | **2438/2438**, 158 files |
| 3 | Prior "anti-magnetism" fix | `constants.ts:644` — removed the **placement impulse** in `placePrimitive.ts`. DIFFERENT mechanism from today's report. |
| 4 | Live mechanism | `resolveCollisions` → `resolvePair` (`physics/collision.ts`), 8 iters/substep over `world.freeSparks` **only** |
| 5 | Bank shape | `CastleBank = Spark[]`, cap 7, `world.castleBanks: Map<PlayerId, Spark[]>` |
| 6 | Bank on the wire | `castleBanks?: Array<{seat, shapes: SerializedSpark[]}>` on **both** disk save and 10 Hz NetSnapshot |

## PRIME-AUDIT — Council claims REFUTED on disk

Both external seats made confident, specific claims about this codebase. Four were wrong:

- **REFUTED — "spatial-grid bucket degeneration / O(N²)".** `grid.insertAll` + `forEachNearbyPair`
  appear **only inside `resolveCollisions`**. Nothing else queries the grid (`vortex.ts:64` explicitly
  declines to). Deleting spark-spark collision removes the grid's only consumer, so the degeneration
  failure mode cannot occur.
- **REFUTED — "an exact stack is unpickable / the top spark shields the rest"** (Grok: *"65-80% of
  visible sparks unpickable"*; Gemini: *"permanently shields"*). `controls.ts:786 pickSpark()` is a
  **linear nearest-to-cursor scan over `freeSparks`** that never touches the grid, and it skips
  `state.kind !== 'Free'`. Each grab flips the spark out of `Free`, so a stack **peels one per click**.
- **REFUTED — mixed-version host migration corrupting the bank** (Grok: *"1 in 6 host-migrations"*).
  `protocol.ts` is explicit that every bump is **hard-rejected at HELLO**. Peers of differing
  PROTOCOL_VERSION can never share a match, so the mixed-shape migration scenario is unreachable.
- **REFUTED — retire `PULL_FROM_BANK`** (both seats' Q2 recommendation). `botBrain.ts:161` +
  `botController.ts:190` make PULL **the entire bot supply chain** (gatherer → bank → porch → place).
  Retiring it leaves every bot opponent unable to build. **PULL stays.**

Kept from Council: the counts-vs-entity wire argument (an uncapped `SerializedSpark[]` at 10 Hz is a
real cost), the fixed-key/sorted hashing discipline, and the stranded-FSM-state warning.

## SCOPE

**P1 — Kill loose-spark repulsion.** Remove spark↔spark positional resolution. Spawner-zone
containment (`enforceSpawnerBounds`) is retained — that is containment, not repulsion.

**P2 — Limitless counts inventory.**
- `CastleBank` → per-`SparkType` counts, **uncapped**, fixed 6-key deterministic order.
- `PULL_FROM_BANK` **kept**, re-implemented to MINT a spark onto the porch from a **negative,
  descending id space** — provably disjoint from the Spawner's ascending positives, so the
  id-collision argument the old docblock demanded is discharged by construction.
- `migrationClaim`'s S141 bank scan becomes unnecessary (a counts bank holds no ids) — hazard class
  deleted, not merely avoided.
- Retire cap-only machinery: `bankIsFull`, the decant-to-make-room click path, `CAP - bankCount()`
  free-slot math, WAITING-on-full. The gatherer `WAITING` case is **kept but forced to exit**, so a
  unit restored mid-state from a save cannot strand.
- UI: castle panel bank strip and the keep glyph row become per-type count rows.
- `PROTOCOL_VERSION` **21 → 22**; loader tallies a legacy `shapes[]` bank into counts.

**P3 — Stink tower.** Owner blessing recorded; confirm buildable + visible under the new model.

**P4 — Ship.** build · tsc · vitest · e2e:gating · push · verify-deploy 4/4.

## OUT OF SCOPE (logged, not dropped)

- **CF1** — `?worker=1` BUILD_BLUEPRINT ignition failure. Opt-in, `WORKER_DEFAULT_ON=false`, zero live
  blast radius. Static work this session **refuted** its leading theory (`workerSim.ts:218` sets
  `world.isHost = true`; `netSnapshot` does carry `defenders`; `applySnapshotCore` rehydrates them
  unconditionally) — so the note's mechanism (1) is dead and it needs a runtime probe. Stays open.
- CF2 `CASTLE_BANK_CAP` 7-vs-12 — **superseded**: the owner has ruled limitless.
- CF3 seeding-hides-failures sweep; the worker flip; R7; energy-vs-score; goblin fog; Q6.

---

# SCOPE AMENDMENT 1 (Rule 16) — owner, mid-session

Verbatim: *"when you click on the gatherer it opens small menue like the castle has now and there is
a line reading preference: closest and when you click it it toggles to preference:triangle,
preference:spiral, Preference:square, etc etc etc... (the castle will only show the inventory of what
has arrived and how many primitives it holds and what kinds (how many of each type). then to build the
different towers or godlies you will have a footer with all of them shown and they become available
once the castle holds the primitives that you need for that recipe. that way its truly like a
classical tower defence (where all the towers are on the bottom footer band)... you can use the
already built specs (use what we already made just restructure the architecture based on what i said)"*

**This is a RESTRUCTURE, not a rebuild** — the owner is explicit about reusing shipped specs. Three
surfaces separate cleanly:

- **CASTLE PANEL = inventory ONLY.** Per-type counts of what the gatherers have delivered. The
  structures/recipe rows currently living here MOVE OUT.
- **FOOTER BAND = the build bar.** Every tower + godly shown at the bottom, each enabled the moment
  the castle inventory covers its recipe. Reuses the shipped `castleStructuresModel` affordability
  logic (cost / `missing[]` / `NEED n MORE`) — that model is retained and re-hosted, not rewritten.
- **GATHERER MENU = pickup preference.** Click a gatherer → a small castle-style panel with one
  toggling line: `PREFERENCE: CLOSEST → TRIANGLE → SPIRAL → SQUARE → …`. Reuses the shipped S141
  gatherer order-queue targeting (`ENQUEUE_GATHERER_ORDER` / `pickGathererTarget`), re-surfaced as a
  **standing per-gatherer preference** instead of a consumed queue.

Revised priority list: **P1** repulsion · **P2** counts inventory (castle = inventory only) ·
**P3** footer build band · **P4** gatherer preference menu · **P5** stink tower · **P6** ship.

## TESTING

Unit: counts arithmetic, uncapped deposit, PULL mint id-disjointness, legacy-bank tally on load,
stateHash determinism under fixed key order, gatherer FSM has no unreachable-but-enterable state.
Render: panel count rows. e2e: `e2e:gating` green; a deposit→count→build loop with no cap.
Regression guard: a test asserting no spark↔spark positional correction is applied.
