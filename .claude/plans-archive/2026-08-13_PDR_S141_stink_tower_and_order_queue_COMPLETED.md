# PRODUCTION DESIGN REPORT — S141 Batch: the Stink Tower + the gatherer order queue

**Tier:** Full · **Deliberation:** 3-way Council, 2 rounds + quality gate (Rule 17) · **Gate:** owner
pre-approved 2026-08-13 for a full autonomous run on this batch ("I approve full session batch and
full autonomous run on the main priorities in backlog that you can implement in the game"), then
reaffirmed ("dont put a choice just get cooking"). `unlock_source: user`.

**A.0 basis:** Rule-21 sweep, 7 parallel probes + adversarial verification of every CRITICAL/HIGH
hazard, plus ~15 files read by hand before the probes returned. Every load-bearing claim below was
read off the predicate/reducer, never off a docblock — this repo's docblocks are known to lie.

---

## OBJECTIVE

Ship the two things the roadmap says are next and that are **fully unblocked**, and close the latent
correctness holes underneath them.

1. **THE STINK TOWER** — the deferred S139 P3. The first non-godly, 4-shape `DefenderKind`, and the
   first thing in the game that delivers *"assemble a complete tower structure directly"* in the
   fullest sense: at `CASTLE_BANK_CAP = 7` a 4-shape recipe is holdable with three slots to spare.
2. **THE GATHERER ORDER QUEUE** — owner ruling **B4**, ruled in full in S134 and never built. What
   actually shipped is a per-gatherer *type filter* (`SET_GATHERER_PREFERENCE`), which is precisely
   what the ruling forbids in bold: *"⛔ DO NOT IMPLEMENT A PREDICATE/FILTER."*

## CURRENT STATE (measured this session, file:line)

- `DefenderKind = 'turret' | 'princess'` (`defenders/defender.ts:53`). A second, duplicated union
  lives at `godlyRecipes/types.ts:138`-ish and must be widened too or no new recipe typechecks.
- `damageEntity` (`state/damage.ts:56`) is live and has a `'defender'` arm (`:95-127`) that razes the
  anchor then `world.defenders.delete(target.id)` at `:125`.
- **There are exactly TWO defender-removal paths**, and they do not share a code path:
  `damage.ts:125` (death by damage) and `applyRemoveDefender` (`defenderLifecycle.ts:92`), dispatched
  from the recipe-revalidation poll at `hostTick.ts:310-314`. `teardownDefenders` uses
  `world.defenders.clear()` (`:313`) and therefore bypasses both — which is correct and must stay so.
- `REVALIDATE_INTERVAL_TICKS = 30` (`constants.ts:1146`), i.e. the poll runs every 0.5 s.
- `pickGathererTarget` (`gathererLifecycle.ts:238-259`) is **RNG-free** — pure distance math with a
  lowest-id tie-break. A queue-driven preference therefore cannot shift the replay stream.
- `Gatherer.preferredType: SparkType | null` (`gatherer.ts:71`) is serialized (`save.ts:658,1872,1886`)
  and hashed (`stateHashFull.ts:243,396`). Its only player-facing control is a click-to-cycle at
  `controls.ts:376`.
- `rebuildAuthorityAllocators` (`migrationClaim.ts:147-165`) computes `maxSpark` by scanning
  **`world.freeSparks` only** (`:158`). `depositIntoCastle` does `world.freeSparks.delete(carried.id)`
  (`gathererLifecycle.ts:131`), so a banked spark is genuinely out of that map. **The hole is real.**
- The castle panel (`render/castlePanel.ts`) is already built around a `PanelControl` descriptor list
  and a derive-from-the-container bank strip, so both new surfaces are additions, not rewrites.
- `PROTOCOL_VERSION = 19` (`net/protocol.ts:147`), with three records to edit on a bump: the const,
  the narrative list in the `HelloMsg` JSDoc (`:192-210`), and `readonly protoVersion: 19` (`:211`).

## THE RECIPE DECISION — made on measured disjointness, flagged for morning correction

The S139 spec forbids *guessing* the shapes. The owner is asleep and has pre-approved a full
autonomous run and told me to be creative, so I am choosing it on evidence and making it a
one-line retune. **The measured recipe ladder, read off the five predicates:**

| recipe | size | topology | hub type | hub deg | leaves |
|---|---|---|---|---|---|
| pentagram | 5 | closed 5-cycle, all deg-2 | — | — | 5× Triangle |
| lightningHub | 6 | star | **Dot** | 5 | 5× Circle |
| princessHelga | 7 | star | **Triangle** | 6 | 3× Spiral + 3× Circle |
| laserTurret | 7 | star | **Line** | 6 | 6× Spiral |
| voltkin | 8 | linear chain | — | — | 4× Square → 4× Triangle |

⇒ **Square, Circle and Spiral are NEVER used as a hub. Size 4 is a free rung. Degree 3 is unused.**

**RULING (mine, retunable): `stinkTower` = 1 Square hub of bond-degree 3 + 3 Circle leaves.**
Every `{Square,Circle}` bond is the **'Capsule'** magic combo (`combos.ts:108-115`, *"hard corners
learn to roll, leave glow trails"*), so the recipe reads **"1 Square + 3 Capsules"** — the same
combo-named form as *"1 Line + 6 Whips"* and *"3 Warped Anchors + 3 Stars"*. A rolling capsule is
also exactly what a thrown bag is.

**Why this specific choice is the only safe one — the mid-build collision sweep.** A new recipe fires
the instant its component matches, so it must not match a *partial* build of an existing recipe:

| partial build | component at size 4 | collides? |
|---|---|---|
| Voltkin, first 4 Squares placed | 4× Square | **NO** — leaves must be Circles |
| lightningHub, Dot + 3 Circles | Dot hub deg-3 + 3 Circle | **NO** — hub must be a Square |
| princessHelga, Triangle + 3 Circles | Triangle hub deg-3 + 3 Circle | **NO** — hub must be a Square |
| pentagram, 4 of 5 Triangles | 4× Triangle path | **NO** — hub must be a Square |
| laserTurret, Line + 3 Spirals | Line hub deg-3 + 3 Spiral | **NO** — hub *and* leaves both wrong |

Square-hub is the **only** hub type that is simultaneously (a) never a hub in any shipped recipe and
(b) not the leaf type of the one all-same-type 4-subcomponent that exists (Voltkin's four Squares) —
because our leaves are Circles, not Squares. Any *ring*-topology 4-Square recipe **would** have
collided with a mid-build Voltkin, which is why the ring form is rejected.

📌 **`STINK_TOWER_HUB_TYPE` / `STINK_TOWER_LEAF_TYPE` / `STINK_TOWER_SIZE` / `STINK_TOWER_HUB_DEGREE`
ship as exported constants**, and every test pins the *relationship*, never a literal — so a morning
retune is one edit, not a copy migration. That is the S140 lesson applied ahead of the fact.

## SCOPE

### P1 — THE STINK TOWER

1. `defenders/defender.ts` — `DefenderKind += 'stinkTower'`; `STINK_TOWER_DEFENDER_CONFIG`; the
   `DEFENDER_CONFIGS` row (the `Record` is tsc-exhaustive, so this is forced).
2. `godlyRecipes/types.ts` — widen the **second, duplicated** `DefenderKind` union and `GodlyId`.
3. **`Defender.bagsRemaining: number`** — a NEW serialized field. Bags are **ammo**, per the S139
   Council ruling (do not re-derive: a count derived from tick arithmetic refills on load, and
   throwing is target-gated so it is not a pure function of elapsed time). Forced edits:
   `SerializedDefender`, `serializeDefender`, `deserializeDefender`, `DefenderHashed` + the hash emit
   (tsc-forced by `NoUncovered`).
4. `defenders/stinkTower.ts` (create) — behaviour in its own module, not inline in the already-316-LOC
   `defenderLifecycle.ts`:
   - **Throw** one bag every `STINK_THROW_INTERVAL_TICKS` at a target in range, decrementing
     `bagsRemaining`.
   - **Depleted** at 0 bags: a passive stink aura on the `DOT_CADENCE_TICKS` cadence, authored as an
     **integer** % of max HP (the `damageEntity` guard throws on a fraction), **plus an aggro pull**.
   - **Death blast scaling with `bagsRemaining`** — the owner's "bigger cooler explosion".
   - **Owner filter** — bags never damage the thrower's own structures.
5. `state/radialDamage.ts` (create) — the missing radial-collect → per-target `damageEntity` bridge.
   **`applyRadialClear` must NOT be reused**: it *deletes* rather than damages and its prim loop takes
   no predicate, so it would one-shot every primitive in radius including the owner's.
6. **`destroyDefender` — ONE shared destruction hook, called from BOTH kill paths.** This is the S139
   Council's decisive finding and the single highest-risk item in the batch: `hostTick.ts:310-314`
   removes an anchor-dead defender via `REMOVE_DEFENDER`, which is **not** death-by-damage, so a blast
   wired only into `damage.ts` would never fire on the *most likely* kill path. **Centre the blast on
   `d.pos`, never on the anchor** — on the poll path the anchor is already purged. Teardown
   (`world.defenders.clear()`) must NOT fire it.
7. **Burst directions** — `pseudoRand(mix32(defenderId, tick), index)`. Not `Math.random`, not the
   seeded RNG stream (draw-order perturbation is a documented desync hazard), and not
   `gathererMorphShape`/`keepRainbowTint` (render-only; their purity argument rests on being cosmetic).
8. `godlyRecipes/stinkTower.ts` (create) — the 4-shape defender recipe above, with an explicit
   `stillValid`, registered by side-effect import. `CODEX_COPY` is **string-keyed**, so tsc will NOT
   catch a missing entry — the fallback renders `'???'`.
9. `render/stinkTowerRenderer.ts` (create) — procedural, modelled on `turretRenderer.ts`. Bags
   visibly deplete; the tower sags when empty. **No atlas.** Both existing defender renderers are
   *exclusion filters with no registry*, so a new kind renders as **nothing** with no compile error —
   this renderer plus its `main.ts` wiring is what prevents that.
10. **Motion posture, explicitly.** `defenderLifecycle.ts:126` pins only `'turret'`; `:229/:255/:263`
    freeze only `'princess'`. A third kind is **neither**, so its Verlet `prevPos` is never reset and
    it drifts — and `prevPos` is **hashed** ⇒ replay/desync-visible. `stinkTower` joins the turret
    pin branch.
11. **Held state, not one-shot effects, as the client channel** — a `world.effects` push is lost ~5/6
    of the time at a 10 Hz snapshot against a per-frame wipe.

### P2 — THE GATHERER ORDER QUEUE (owner ruling B4, in full)

12. **`world.gathererOrders: Map<PlayerId, SparkType[]>`** — a NEW serialized + hashed world field.
    ONE queue per player, shared by all that player's gatherers (ruled). `FIELD_COVERAGE` in
    `stateHashFull.ts` is a compile-time forcing function keyed on `keyof World`, so omitting it fails
    `tsc` by name.
13. **Two new CLIENT INTENTS** — `ENQUEUE_GATHERER_ORDER` (playerId, sparkType) and
    `CANCEL_GATHERER_ORDER` (playerId, sparkType). ⚠ **A forgotten `CLIENT_INTENT_TYPES_RECORD` row
    compiles clean, passes every test, works in solo and host, and is SILENTLY DROPPED for a
    networked joiner.** Both records get both rows, plus an explicit set-equality assertion.
14. **Ordered, consumed, and PARALLEL across units.** `pickGathererTarget` takes the type at the
    gatherer's *rank* among its owner's SEEKING gatherers (sorted by `GathererId` — deterministic,
    no RNG), so a queue of `[Square, Square, Triangle]` with three gatherers fetches all three at
    once, which is the RTS feel the ruling describes. Falls through to the queue head, then to
    nearest-of-any-type when the queue is empty — **a PRIORITY OVERRIDE, never an on/off switch**, so
    an unattended player never stops earning.
15. **Each delivery POPS one.** On deposit of type T, remove the first queue entry equal to T. A
    fall-through delivery (nothing in the queue matched) pops nothing — the order was not fulfilled.
16. **UI in the CASTLE PANEL, not a footer.** The B4 ruling says "footer bar", but the **later** S136
    P0 owner ruling explicitly retired the footer (*"that footer with those options should be
    clickable once you click on the castle and not always there"*). Later ruling wins; recorded rather
    than silently diverged. Adds a 6-button shape palette (click to enqueue) and a coalesced `×N` chip
    strip (click a chip to cancel one), both derived from the panel width like the S140 bank strip.
17. **`preferredType` is RETAINED, not deleted** (B6 additive-only). The queue takes precedence; the
    per-gatherer field becomes the fallback. Deleting a serialized+hashed field is a wire change with
    no gameplay upside, and keeping it makes the whole priority reversible in one line.

### P3 — LATENT CORRECTNESS HOLES

18. **`rebuildAuthorityAllocators` must scan every place a Spark can live**, not just `freeSparks`.
    Banked sparks are deliberately out of that map, so a successor whose highest free spark is 40
    while a bank holds 57 re-mints 41..57 and **collides**. Fix in the allocator, and audit every
    *other* id allocator for the same shape rather than patching this one instance.
19. **`castleBanks` per-element hash guard.** The container is `Map<PlayerId, Spark[]>` so the
    `ElemOf` trick cannot reach the `Spark`, and the bank projection hashes only id/type — so adding a
    field to `Spark` fires the `SparkHashed` guard for `freeSparks` but **nothing** forces the bank
    projection to carry it. Add the forcing function.

### P4 — HYGIENE, BUMP, DEPLOY

20. **`test:run` script** — `npm test` is bare `vitest` = watch mode, so it hangs to timeout and
    reports **cancelled**, not failure. A logged, never-landed carry-forward.
21. **Stale-doc carry-forwards** — `voltkinFrames.ts` (claims deleted PNGs that exist and ship),
    `stateHash.ts` (`FAMILY_COVERAGE` does not exist; it is `FIELD_COVERAGE`), the `main.ts:1706`
    hash call-site citations, `comboCodexStore.ts` (points at a file deleted in S104).
22. **`PROTOCOL_VERSION` 19 → 20**, one bump covering every serialized change actually landed
    (`bagsRemaining`, `gathererOrders`, two new intents, a new `GodlyId`/`DefenderKind` literal). All
    THREE records edited together. ⚠ **Keep exactly ONE deliberate pin and bind the rest to the
    constant** — four pins had rotted by S140 with titles saying "is 17" while asserting 18.
23. Rule 22 end-of-session runtime audit, MCV bindings, deploy + `verify-deploy` 4/4.

## NO CHANGES TO

`CASTLE_BANK_CAP` · the laser-turret recipe · the sim-worker default-on flip (⚠ **explicitly out** —
BACKLOG V6-1.1 warns not to pair it with a new serialized entity family, and this batch adds two) ·
`CarryingPlayer` · `placePrimitive`'s throw-on-guard contract · `origin/gh-pages` · the e2e
quarantine lane · B5 / `PHASE_1_WIN_SCORE` / `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` (owned by V6-4.3) ·
any atlas or veo art · `findNearestEnemyCreatureFrom` (a sibling is added; the original is untouched
to preserve the tested Voltkin replay guards).

## RISK ASSESSMENT

| # | risk | mitigation |
|---|---|---|
| R1 | **A new `DefenderKind` renders as nothing, silently** — both renderers are exclusion filters, `main.ts` wires two concrete instances with no registry. | Scope 9 + its `main.ts` wiring. Verified by LOOKING at the render, not by state assertions. |
| R2 | **A third kind drifts during WINDUP/FIRE/RECOVER** — neither pinned nor frozen; `prevPos` is hashed ⇒ desync. | Scope 10. Asserted by a REAL-PHYSICS test, not a state read. |
| R3 | **The death blast never fires on the most likely kill path.** | Scope 6 — one shared hook, both paths, blast centred on `d.pos`. Test BOTH paths separately; a test that only covers `damageEntity` is the exact false green S139 predicted. |
| R4 | **`applyRadialClear` looks like the AoE helper and is a trap.** | Scope 5. Test that a 1000-hp primitive in radius **survives** a blast. |
| R5 | **`bagsRemaining` not serialized ⇒ ammo refills on load/migration.** | Scope 3 + a save/load round-trip test. |
| R6 | **Killing the tower must raze its anchor** — `runDefenderIgnition` re-mints any recipe match whose anchor still stands, so a plain delete yields an **immortal** tower. | Keep the shipped `damage.ts:112-122` behaviour; test that a destroyed tower does not resurrect with full bags. |
| R7 | **The new recipe fires during a mid-build of an existing recipe.** | The disjointness sweep above, pinned as an explicit test over all five partial builds. |
| R8 | **A forgotten `CLIENT_INTENT_TYPES_RECORD` row is silently dropped for a joiner** and `tsc` will not catch it (`Partial<...>` + `satisfies`). | Scope 13 + explicit set-equality. |
| R9 | **A new `World` field breaks `FIELD_COVERAGE`, the positions buffer, `structuralSignature`, save and protocol.** | Let `tsc` name it; work the list it produces rather than guessing. |
| R10 | **The panel grows past the canvas** — `panelHeight` feeds `panelOrigin`'s clamp. | Derive both new strips from the panel width (the S140 lesson) and sweep the geometry in tests. |
| R11 | **Bundle**: the entry chunk is gated at 750 KiB and a breach **hard-fails `npm run build` and therefore blocks the deploy**. | Procedural renderers only, no atlas. Measure after each priority. |
| R12 | **The 2-peer check cannot be automated** — the only runtime coverage of the version gate is the quarantine lane, which is fully red and `continue-on-error`. | Stated as an OWNER action, never claimed as verified. |

## TESTING PLAN

- **Unit**: recipe predicate incl. the full mid-build disjointness sweep; FSM per kind; throw cadence;
  bag decrement; depleted-aura cadence; blast scaling across every bag count; owner filter; the
  integer guard firing on a fractional DoT; queue enqueue/cancel/coalesce/pop; rank assignment across
  N gatherers; empty-queue fall-through.
- **Real-physics acceptance** (S136 standing lesson — a state assertion is not evidence): run the
  actual loop and assert the tower does not drift while striking. Import `PHYSICS_DT` from
  `physicsLoop.ts`, never re-derive it — a test once silently ran on `NaN`.
- **Both kill paths**, separately, for the death blast.
- **Determinism**: `hashWorldStateFull` identical host vs `?worker=1` via `workerSim.differential`.
- **Save/load + migration**: `bagsRemaining` and `gathererOrders` survive a round-trip; a razed tower
  does not resurrect; the banked-`SparkId` collision is pinned by a regression test.
- **Regression**: full vitest (baseline **2187**), `tsc` 0, `e2e:gating` **34/0**, bundle under cap.
- **Look at the render.** Legibility cannot be asserted from state.
- **Owner action on return**: two-browser 2-peer check of the v20 HELLO.

## DIFFERENTIAL_TEST_REQUIRED: true
Two new serialized entity/world families and a new hashed world field.

## HOT_PATH_REFACTOR: true
Adds a shared destruction hook to the live damage path and re-points gatherer target selection.

## EST: ~200K committed (P1+P2+P3+P4) · MODEL: claude-fable-5 (ALWAYS-STRONGEST)

═══ GATE: owner pre-approved 2026-08-13 — pending Council + PRIME-AUDIT before execution ═══
