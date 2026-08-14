═══════════════════════════════════════════════════════════
    PRODUCTION DESIGN REPORT — S144 Batch: CLICK-TO-BUILD TOWERS + CRUISER DRAG-TO-PLACE
═══════════════════════════════════════════════════════════
STATUS: COMPLETED — 3/3 priorities shipped, live, deploy 4/4 (76a6e28)
Tier: **FULL** (>30K, Tier 3 — novel mechanic, new wire action, protocol bump)
Owner pre-approval: GRANTED 2026-08-13 ("i approve full session top priority top leverage top value
batch… i pre-approve full dpr bath and full autonomous run"), `unlock_source: user`.

OBJECTIVE
  Turn the castle panel from what the owner called "a blob" into a classical-TD build menu, and make
  towers buildable WITHOUT physically assembling their geometry. Owner ruling (verbatim, 2026-08-13):
  *"the gatherers gather ur items and you have a place to click on the tower (you dont even need to
  build it physically) and it builds it for you. then the spark (your cruiser) just drags it to where
  you want it to be!"* — *"like a classical TD (more or less)"*. All 6 recipes are offered to every
  player for this test pass.

CURRENT STATE
  • `src/render/castlePanel.ts` (751 lines) opens on a castle click. It renders a title, a 7-slot BANK
    strip, a 6-button primitive PALETTE, coalesced ORDER-QUEUE chips, and 2 control rows (BUY GATHERER,
    SPEED). **It contains ZERO reference to any tower or godly recipe** — the owner is looking at a
    dark plate of rounded rects and 8–12 px glyphs. That is the "blob".
  • Towers/godlies today are ONLY obtainable by physically building their exact geometry. Detection is
    host-side, structural, on topology change: `runDefenderIgnition` / `findDefenderMatches`
    (`src/state/godlyMatcherCore.ts:155`, `godlyRecipes/index.ts`).
  • ⚠ `stillValid` re-validates every live defender every `REVALIDATE_INTERVAL_TICKS = 30` (0.5 s)
    (`constants.ts:1163`). A defender whose recipe geometry does not hold is REMOVED. **So "it builds
    it for you" cannot mean injecting a defender record — that self-destructs within 0.5 s.**
  • Exact shape bills (verified on disk this session):
      stinkTower    4 = 1 Square(deg3) + 3 Circle            [defender]
      pentagram     5 = 5 Triangle, closed ring, each deg 2   [spawner]
      lightningHub  6 = 1 Dot(deg5) + 5 Circle                [spawner]
      laserTurret   7 = 1 Line(deg6) + 6 Spiral               [defender]
      princessHelga 7 = 1 Triangle(deg6) + 3 Spiral + 3 Circle[defender]
      voltkin       8 = 4 Square → 4 Triangle, linear chain    [cinematic]
  • `CASTLE_BANK_CAP = 7` (`constants.ts:479`), `CASTLE_PORCH_SLOTS = 4` (`:497`).
    ⇒ **voltkin (8) does not fit the 7-slot bank.** Bank ∪ porch = 11 does fit.
  • `codexStore.ts` is ONLY `loadUnlockedSet()` / `unlockGodly()` over localStorage — a **gallery
    record, not a build gate**. Nothing in `src/state/` reads it. ⇒ "everyone has all recipes" costs
    NOTHING in the sim; the panel simply always lists all 6.
  • ⚠ Ordinary placement forms MORE than the intended bond: a primary auto-bond, up to K−1 REDUNDANCY
    bonds, and cross-component MERGE bonds (`computePreviewBonds`, `src/input/dragPreview.ts:102`).
    Routing a blueprint through `placePrimitive` would add chord bonds that break pentagram's exact
    deg-2 ring and voltkin's exact chain degrees, or merge the new tower into a neighbouring structure
    and break its component-size gate.
  • A host-authoritative grab→drag→release gesture already exists in `src/input/controls.ts`
    (pointerdown/pointermove/pointerup, claim-on-grab, `dragLock`). `dragPreview.ts` is a Pixi-free
    pure preview resolver. Both are reusable idiom.

SCOPE (3 priorities, 9 changes, ~12 files)
──────────────────────────────────────────────────────────

**P1 — THE BUILD ENGINE (blueprint stamp)**

1. `src/state/blueprints.ts` (create)
   PURE, Pixi-free, world-free. For each of the 6 `GodlyId`s: the bill of materials
   (`readonly SparkType[]`) and a `layout(center) → { positions: Vec2[], bonds: [i,j][] }` producing
   EXACTLY the topology each predicate demands. Spacing is chosen so intra-blueprint distances cannot
   introduce unintended adjacency:
     - stars (stinkTower/lightningHub/laserTurret/princessHelga): hub at centre, leaves on a ring.
       Leaf↔leaf bonds are explicitly ALLOWED by all four predicates (they change neither hub degree,
       component size, nor leaf types) — documented in `laserTurret.ts` as a deliberate loosening.
     - pentagram: regular pentagon, ring bonds only. Each vertex deg exactly 2. Adjacent/next-nearest
       ratio is 1.618, so a chord can never be mistaken for a ring edge.
     - voltkin: straight 8-chain, 4 Square then 4 Triangle, degrees 1,2,2,2,2,2,2,1.
   Bills are DERIVED from the recipe constants (`STINK_TOWER_SIZE`, `TURRET_SIZE`, `HELGA_SIZE`,
   `LIGHTNING_HUB_*`, `VOLTKIN_SIZE`) — never re-typed literals, so a retune stays one edit (the S140
   lesson).

2. `src/state/blueprintBuild.ts` (create) — reducer `applyBuildBlueprint`
   `NO-OP-NEVER-AN-ERROR` shape (matches `applyPullFromBank`, NOT throwing `placePrimitive` — a stale
   client index must never kill the host dispatch loop). Steps: resolve the bill → collect the
   player's OWN available shapes from **bank ∪ own-porch free sparks** (`bankOf`, `isOwnPorchSpark`) →
   if the multiset is not covered, no-op → consume them → mint the primitives at the stamped
   positions and write the EXPLICIT bond list directly, **bypassing auto-bond / redundancy / merge
   entirely** → let the existing matcher ignite on the resulting topology change.
   Drawing from bank ∪ porch (11) rather than bank alone (7) is what makes voltkin (8) buildable
   **without pre-empting the owner's open `CASTLE_BANK_CAP` 7-vs-12/13 ruling** — the cap is untouched.

3. `src/net/protocol.ts` (modify)
   Add `BUILD_BLUEPRINT` to `KNOWN_GAME_ACTION_TYPES_RECORD` and to the CLIENT-INTENT allowlist
   (tsc enforces both directions). **PROTOCOL_VERSION 20 → 21** — a new wire action; old peers are
   rejected at HELLO handshake, the documented precedent set by `PLACE_FROM_FREE` (2→3).

4. `src/state/world.ts`, `src/state/benchGate.ts`, worker boundary (modify)
   Wire the action into the reducer switch; `BUILD_BLUEPRINT: 'deny'` while benched (mirrors
   `PULL_FROM_BANK`); confirm the action crosses `simWorker.ts` / `simWorkerDriver.ts` unchanged.

**P2 — THE PANEL: a real build menu instead of a blob**

5. `src/render/castlePanel.ts` (modify) — new STRUCTURES section
   One row per recipe, **all 6 always listed** (recipes are not gated — see CURRENT STATE). Each row
   shows the recipe NAME and its bill rendered as the ACTUAL board glyphs via `drawSparkGlyph` (the
   same glyph the board draws — a shape must be recognisable as the shape it is), plus per-shape
   `have/need`. Unaffordable rows are dim and NAME THE BLOCKER (the file's existing
   "a disabled control must say why" contract). Layout follows the file's own hard-won rule: derive
   every strip from the PANEL width, never from the contents.

6. `src/render/castlePanel.ts` — `castleStructuresModel(world)` (create, exported, PURE)
   World-only, no Pixi, so the affordability/reason matrix is unit-testable headlessly (the S130
   lesson: logic must not live only in a draw path).

7. Panel height/origin math + `getUiPoints()` (modify)
   Add the section to `panelHeight` BEFORE `panelOrigin` consumes it (the file documents this exact
   ordering trap), and expose `structureCenters` for the e2e harness (the S85 P4c convention).

**P3 — CRUISER DRAG-TO-PLACE**

8. `src/render/castlePanel.ts` + `src/input/controls.ts` (modify)
   Clicking an affordable structure row ARMS a carried blueprint — **render-local state, never
   serialized** (exactly the `selectedSeat` precedent: a new World field would owe FIELD_COVERAGE /
   save / protocol / structuralSignature / positions-buffer and risk desync for a UI toggle). A ghost
   of the real recipe geometry (same `blueprints.ts` layout — one source of truth) follows the cursor,
   tinted by legality. Release/click commits `BUILD_BLUEPRINT` at that point; Escape or right-click
   cancels. Honours the existing input locks (`isInputLocked`, sudoku/cinematic/benched) and
   `isOverPanel` click-swallowing.

9. `src/state/blueprintLegality.ts` (create) — PURE predicate
   `canStampAt(world, center, playerId)`: inside own buildable area, outside the spawner zone, outside
   enemy territory (`isInsideEnemyTerritory`), and clear of existing primitives. Consumed by BOTH the
   ghost tint and the host reducer, so the preview cannot disagree with what the release commits
   (the `dragPreview.ts` contract).

NO CHANGES TO
  • `CASTLE_BANK_CAP` — the owner's open 7-vs-12/13 blocker is deliberately NOT resolved here.
  • Any recipe predicate, `stillValid`, or the defender/spawner/cinematic registration paths — the
    stamp produces real geometry and lets the EXISTING matcher fire. Zero per-kind special-casing.
  • The physical build path (`placePrimitive` / `placeFromFree`) — click-to-build is ADDITIVE; building
    by hand still works exactly as today.
  • `codexStore.ts` and the codex overlay; the bank strip, palette, and order queue; `WORKER_DEFAULT_ON`
    (the S143 flip stays untaken); `nextPrimitiveId` semantics (S143 mirror trap).
  • No new World field ⇒ no FIELD_COVERAGE / save / structuralSignature / positions-buffer change.

RISK ASSESSMENT
  R1 **Stamped geometry fails its own predicate → tower vanishes in 0.5 s.** The single highest risk,
     and the reason the design stamps real geometry rather than injecting a defender. Mitigation: a
     per-recipe test that stamps the blueprint into a fresh world and asserts BOTH the predicate
     matches AND `stillValid` still holds after `REVALIDATE_INTERVAL_TICKS` — all 6, no exceptions.
     This is the acceptance test for P1; an aggregate "some tower built" assertion is explicitly
     rejected (the S143 lesson: a SUM cannot see a per-family hole).
  R2 **Unintended bonds break exact-degree recipes.** Mitigated by minting bonds directly and never
     routing through auto-bond/redundancy/merge; plus a test asserting the stamped component has
     EXACTLY the intended bond count and per-node degrees for pentagram and voltkin specifically.
  R3 **Protocol bump 20→21 breaks a live/stale peer.** Accepted and precedented — HELLO rejects a
     mismatched peer rather than desyncing. Both peers deploy together. e2e:gating covers the handshake.
  R4 **Accidental recipe collision** — a stamped blueprint landing within bond reach of existing shapes
     could later merge when the player places nearby. Bounded by R2's legality clearance check, and the
     existing self-healing/no-punish contract (`destroyDefender` gates the death blast on the anchor
     being gone) already makes this benign, per `stinkTower.ts`.
  R5 **Panel overflow / off-canvas** at 6 new rows — the exact class that shipped green in S140.
     Mitigated by deriving from PANEL_W, adding to `panelHeight` before `panelOrigin`, a test that
     labels FIT (`ROW_INNER_W` / `ROW_FONT_ADVANCE`), and **looking at the render**, not only assertions.
  R6 **Bundle cap.** 678.2 KiB of 750 — 71.8 KiB headroom. New code is small and Pixi-free-heavy, but
     `npm run build` gates every priority. Per standing memory: if the cap binds, RAISE the charter,
     never debug around it.
  R7 **Scope creep into "more TD".** The owner explicitly deferred that ("later we will make it more
     TD but for now do what i say"). This batch delivers click-build + drag-place only.

TESTING PLAN
  • `npx tsc --noEmit` → 0 errors; `npm run build` → bundle under charter.
  • `npx vitest run` → 2304/2304 existing must stay green, plus new suites:
      - `blueprints.test.ts` — all 6 bills match their recipe constants; layouts produce the exact
        intended degrees; pentagram chord-vs-edge separation; voltkin chain degree sequence.
      - `blueprintBuild.test.ts` — the R1 acceptance test (stamp → predicate matches → `stillValid`
        holds past 0.5 s) for **each of the 6 recipes individually**; bank∪porch consumption is exact;
        insufficient shapes no-ops without consuming; benched denial; unknown id no-ops.
      - `castlePanel.test.ts` (extend) — all 6 rows present regardless of codex state; affordability
        and reason matrix; labels fit; panel height/origin stay on-canvas for every seat.
      - `blueprintLegality.test.ts` — spawner zone, enemy territory, occupancy.
  • `npm run e2e:gating` → 36/36 (the ONLY lane that reports the 2-browser protocol check).
  • `gh workflow run e2e.yml` and audit **JOB** conclusions, never the run conclusion (S143 trap).
  • Rebuild, then `npm run verify-deploy` → 4/4.
  • ⛔ Never edit `src/` while a suite runs against a live vite dev server (S143 cost: one wasted run
    and a near-miss misattribution of 3 phantom regressions).
  • Owner playtest is the final acceptance: click a tower, watch it build, drag it, place it.

TOOL TRIAGE
  Visual output needed?      **Yes** — this is a UI redesign the owner judged by eye. Playwright
                             screenshots of the redesigned panel + the drag ghost, delivered to the
                             owner. (Imagen/Veo NOT used: no new character art in scope.)
  Research/external data?    **No** — every fact needed is in this repo; A.0 probes + direct reads
                             established the shape bills, the revalidation trap, and the bond model.
  Artifact delivery needed?  **No** — the deliverable is shipped code plus screenshots in-chat; no
                             Drive/PPTX/PDF export requested.

DIFFERENTIAL_TEST_REQUIRED: **false**
  SCOPE touches none of `~/.claude/lib/`, `~/.claude/hooks/`, `router.sh`, LLM-prompt construction, or
  session-state schema migrations. It is game-source only. The R1 per-recipe predicate+`stillValid`
  test is the behavioural-equivalence instrument that matters here.

HOT_PATH_REFACTOR: **false**
  Same scope set as above — no `lib/`/`hooks/`/router/classifier/prompt/schema surface. (Already at
  Full tier ⇒ 3-way Council R1+R2 regardless, so no escalation is being dodged.)

ESTIMATED TOKENS: ~85K
MODEL: strongest pinned (claude-fable-5 — S171 ALWAYS-STRONGEST)

═══════════════════════════════════════════════════════════
    GATE: Owner pre-approved (full autonomous run). Council deliberation + PRIME-AUDIT still run.
═══════════════════════════════════════════════════════════

## COUNCIL DELIBERATION (3-way, Full tier) — Battle Ledger

**Seats:** CLAUDE (author) · GROK-ANALYST (`grok-4.20-0309-reasoning`) · GEMINI-AUDITOR
(`gemini-3.1-pro-preview` — 2.5-pro is retired). GROK: **REJECT**. GEMINI: **ADOPT-WITH-CHANGES**.

| # | Challenge | Ruling | Disposition |
|---|-----------|--------|-------------|
| G1 | Add `isDefenderFrozen`; skip frozen components in bonding; `stillValid` reads the flag FIRST | **REJECTED** (Gemini concurs) | Would delete the documented self-healing + no-punish contract (`stinkTower.ts`) AND make stamped towers immune to creature chewing — a core loop. Also rests on a false premise: bonds form ONLY at placement, so a stamped structure cannot spontaneously mutate. |
| G2 | Block on the `CASTLE_BANK_CAP` ruling; drop bank∪porch sourcing | **PARTIALLY ADOPTED** | Blocking rejected — only 1 of 6 recipes is affected and the owner said "make it so"; pre-empting an owner ruling is forbidden. The UX nugget is real and adopted: consume **bank-first, porch only as overflow**, and show the pooled count, so the one surprising case is confined to voltkin. |
| G3 | "Still physical building" → use a virtual anchor entity exposing no primitives | **REJECTED** (Gemini concurs) | Misreads the owner: "you dont even need to build it physically" scopes the *player's* actions, not the substrate. Every tower in SPARK *is* primitives. A parallel representation would duplicate the whole defender lifecycle (damage, chewing, severing, rendering). |
| G-TOOL | No test keeps `blueprints.ts` aligned with the predicates; stamp → ignite → survive N revalidations or fail the build | **ADOPTED — upheld by both seats** | Promoted to the batch's **acceptance gate**. Strengthened past my original R1: assert survival across MANY `REVALIDATE_INTERVAL_TICKS` polls, per recipe, individually. |
| G-QUALITY | Replace duplication with a data-driven `RecipeRegistry` generating the predicates | **REJECTED** (Gemini: "textbook over-engineering") | Rewriting 6 shipped, individually tuned predicates carrying documented collision-sweep reasoning is disproportionate. Mitigation kept: bills DERIVED from recipe constants + the empirical stamp→ignite test, which verifies behaviour rather than structure. |
| M1 | Build at the castle, then haul the finished tower with the cruiser | **NOTED, not adopted** | Dragging a *bonded multi-primitive component* is not a supported operation and would be a large new mechanic; the owner also said "like a classical TD", which is menu→ghost→place. Shipping ghost-on-cursor: the player's own cursor carries it, which reads as "your cruiser drags it". Flagged to the owner as a one-line switch if they want the literal haul later. |
| M2 | Bypassing the bonding functions bypasses the topology event ⇒ shapes sit inert | **ADOPTED — CRITICAL** | See PRIME-AUDIT below. Verified true, and true for **all six** recipes. |
| M3 | Porch consumption could sever a bonded shape and trigger a death blast | **ADOPTED (modified)** | Premise is off — porch shapes live in `world.freeSparks`, a different collection from `primitives`, so they carry no bonds. The REAL adjacent hazard is consuming a spark that is mid-carry by a player or gatherer. Filter: consume only own-porch sparks with `state.kind === 'Free'`. |

## ⭐ PRIME-AUDIT DELTA (Rule 20 — runtime-verifiability lens)

**The Council found a defect that would have shipped a silently dead feature, and my own first
refinement of it was ALSO wrong.** Recorded rather than quietly fixed:

- Gemini M2 claimed the matcher is event-driven. My first pass at verifying it concluded "structural
  scan — only voltkin is affected", because `runGodlyMatcherCore` calls `runSpawnerIgnition` and
  `runDefenderIgnition` unconditionally *before* the `world.effects` scan.
- **That was wrong.** Reading the function bodies rather than the call site: BOTH ignition functions
  open with their own `hasTopologyChange` sweep over `world.effects` and `if (!hasTopologyChange)
  return;` (`godlyMatcherCore.ts:137` and `:155`). The unconditional *call* does nothing without a
  qualifying effect.
- ⇒ Writing bonds directly with no effect emitted means **all six** recipes fail to ignite, with no
  error anywhere — the exact "fails SILENTLY in both directions" class this repo keeps getting bitten
  by. Static reading of the call site would have passed it; only reading the callee's guard caught it.
- **MANDATORY FIX, now part of P1's contract:** `applyBuildBlueprint` MUST push exactly one collapsed
  `{ kind: 'BOND_FORMED', tick: world.tick, pos: <stamp centre>, bondCount: <bonds created> }`
  (the `placePrimitive.ts:550` shape — one emit per placement, never one per bond), and MUST call
  `detectComboDiscoveries` so a menu-built tower discovers its combos like a hand-built one.
- ⚠ Carried trap for implementation: the cinematic cursor comparison is strict `<`, and the code
  documents that dispatches between physics ticks emit with an un-advanced `world.tick`. Voltkin's
  ignition specifically depends on getting that tick right — verify voltkin ignites, don't assume it.

**Net:** the design is unchanged in architecture and materially stronger in two places (mandatory
effect emission; per-recipe survival test as the acceptance gate). Both seats' surviving objections
are addressed; the four disproportionate fixes are refused on record with mechanisms cited.

**Verification honesty note:** the workflow's symbol-verifier agent died on a spend limit
(`agents_error: 1`), so the 3 probe reports are NOT independently symbol-checked. Every fact this PDR
relies on was read first-hand by me on disk instead — the probes were corroboration, not the source.
