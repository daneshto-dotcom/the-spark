# SCOPE AMENDMENT — S149 · THE DESIGN IS ON PAPER, NOT IN THE GAME (owner playtest)

**Status: AWAITING OWNER APPROVAL.** Tier: **Full**. Supersedes the S149 batch I had drafted
(castle HP), which the owner deferred mid-session.
**Rule 16** — new scope from a playtest gets its own amendment before any fix. Nothing below is
implemented yet.
**URGENCY PROTOCOL** — raised with frustration, which makes the scope gate *more* important, not less.

---

## 1. WHAT THE OWNER REPORTED, VERBATIM

> 1. *"bots are not building towers from the tower selection but instead take the shapes out of the
>    inventory and build random strucutres. their first priorities should be to build actual
>    towers... obviously increasing complexity gives them better tactics"*
> 2. *"the tower selection should be on the bottom of the map as a footer"*
> 3. *"there should be a fix and scrap button on actual towers that you've built so if it is
>    partially destroyed you can either fix or scrap"*
> 4. *"there are no walls it seems or player zones, players can build wherever and it is inherently
>    wrong based on our current designs"*
> 5. *"the gatherer keeps gathering during fight stage and you can build during fight stage and your
>    towers(helga or whatever) can fight during build stage - there is no split"*

Plus, in the same message: **no deletion of anything** (P4 demolition CANCELLED, NONET explicitly
protected), hazards **paused + archived only**, the probe harness **explained before any ruling**,
**ARCADE mode added** to the front page below CODEX with NONET as a minigame, **all carry-forwards**
done, **walls** done, and **castle HP deferred** to a later session.

**All five complaints verified on disk. Every one is a real gap, not a balance opinion.**

---

## 2. A.0 STATE DISCOVERY — WHAT IS ACTUALLY IN THE CODE

### ⛔ F1 — COMPLAINT 4's ROOT CAUSE: build legality is a BUBBLE, not a partition

Today every build gate calls `state/territory.ts` `isInsideEnemyTerritory`, which is a
**complexity-derived RADIUS around each player's own primitives**:

```
computeAllPlayerRadii(world) → for each enemy: R
   if any enemy primitive is within R of pos → refuse
```

A player who has built nothing near you projects **R = 0**, so nothing is refused. That is exactly
*"players can build wherever"*. It is not a bug in the bubble — the bubble is a **different design**,
inherited from the pre-tower-defence game.

`zones.ts` `canBuildAt(pos, seat, layout)` — the real partition rule, which fails CLOSED on the
shared quarry and on a seat with no ground — **exists, is tested, and is wired into nothing.**

The swap is exactly **six call sites**:

| # | Site | What it gates |
|---|---|---|
| 1 | `state/placePrimitive.ts:124` | host refusal — place from carry |
| 2 | `state/placeFromFree.ts:172` | host refusal — place from a free spark |
| 3 | `state/blueprintLegality.ts:84` | host refusal — blueprint build (`ENEMY GROUND`) |
| 4 | `input/controls.ts:600` | client-side click gate |
| 5 | `input/dragPreview.ts:109` | the drag ghost's legal/illegal tint |
| 6 | `bots/botBrain.ts:304` | `isLegalBuildPos` — so a bot does not waste a trip |

⚠ **Attempted in S148 and REVERTED.** Typechecks clean; **breaks 17 tests across 8 files**. Those
failures are *correct new behaviour*, not bugs — on `PITCH_2P` seat 1 owns the RIGHT half, so a 1v1
test that places P1 at x=600 is now rightly refused, as is anything inside the quarry disc.

### ⛔ F2 — COMPLAINT 5 IS THREE INDEPENDENT HOLES, NOT ONE

| Hole | Probe | Result |
|---|---|---|
| Gatherers work during FIGHT | `grep matchPhase src/state/gatherers/*.ts` | **nothing** |
| Towers fight during BUILD | `grep matchPhase src/state/defenders/*.ts` | **nothing** |
| Quarry produces during FIGHT (**CF-S148-a**, R22) | `physics/physicsLoop.ts:97` | **nothing** |
| You can build during FIGHT | the six gates above | **nothing** |

Only two things in the whole sim read the phase: `hostTick.ts:196` (scoring) and `gameMode.ts:678`
(a spawner-kill bounty). **The match clock shipped in S147 and almost nothing consumes it.**

### ⚠ F3 — COMPLAINT 2 REVERSES THE OWNER'S OWN S136 RULING. Stated plainly, not assumed.

A permanent footer band **existed** and was **deleted in S136 P0** on the owner's own ruling:
*"that footer with those options should be clickable once you click on the castle and not always
there."* It became the castle panel (`render/castlePanel.ts`).

The new blueprint R36 reinstates a footer but **differently** — *indexed by CONNECTOR COUNT*
(4, 5, 6, 7 …), each number opening that complexity's menu, rather than a flat always-on list of
every tower. That is a genuinely different surface, so it is a **refinement, not a contradiction** —
but it is still a reversal, and it gets an explicit word rather than my assumption.

**Good news on cost:** `castlePanel.ts` `castleStructuresModel(world)` already returns
`{id, name, cost, enabled, reason, missing[]}` per buildable and decides affordability via
`planBlueprintPayment` — **the same function the reducer uses**. The footer is a *regrouping of an
existing model by `cost`*. The spec's claim holds: **no new sim state, no protocol bump.**

### ⛔ F4 — COMPLAINT 1: bots have no concept of a tower at all

`bots/botBrain.ts` `chooseGoal` returns FLEE / CLEAN / RAINBOW / SEVER / POTATO / BUILD / PULL. The
`BUILD` goal picks a loose spark and places **one primitive**. There is no recipe goal, no
complexity target, no notion of a tower anywhere in the bot. Bots are not *choosing badly* —
**they are structurally incapable of building a tower.**

### ⛔ F5 — COMPLAINT 3: FIX/SCRAP is specified and entirely unbuilt

R13 / R19 / R21: **FIX** = one click, auto-repairs using the exact lost shapes if inventory holds
them. **SCRAP** = tear down; **only still-standing shapes return** (destroyed ones are gone). Both
**BUILD-stage only**. Nothing on disk.

### ✅ F6 — HAZARDS ARE ALREADY PAUSED AND RETAINED. The owner's instruction is already satisfied.

`HAZARD_SPAWN_ENABLED = false` (S147 Step 0, R14/R23). All four hazard families — potato bomb,
regular bomb, seagull, rainbow — keep **every line of their code**, and there is a
`window.__TEST_HAZARDS_ENABLED__` seam that re-enables them for e2e. This is *exactly*
"paused and archived, don't delete". **No work required.** Both Council seats asserted extra work
was needed here and both cited files that do not exist (§4).

### ✅ F7 — ARCADE IS CHEAP because the seam already exists

`SudokuOverlay`'s constructor is `(app: Application, onSubmit: SubmitFn)` — **already decoupled from
the network**. All net/world logic lives in the `onSubmit` callback main.ts injects. An arcade NONET
constructs the same overlay with a local-only handler and touches **no sim state, no wire, no
`world.sudoku`**. `titleScreen.ts` has four buttons today (SOLO / MULTIPLAYER / VS-BOTS / CODEX);
ARCADE is a fifth, below CODEX.

---

## 3. THE PROBE HARNESS — the explanation the owner asked for

**`src/dev/probeHarness.ts` is a measuring instrument, not a game feature.** It was built in S128 to
answer two questions *before* spending seven Full-tier sessions on the v0.6 economy pivot:

- **Is the spark faucet fast enough?** It measures the live standing pool of free sparks and lets
  you sweep the spawn rate with a `?spawn=` URL parameter.
- **Does a big inventory kill the "build big then carve it down" tactic?** It puts an exact-type
  N-slot inventory in your hands (N = 4 / 8 / 12 / unlimited, switchable **mid-match** with `[` and
  `]`) so you can feel both regimes back-to-back and see whether you still choose to build large.

Properties worth knowing before you rule on it:
- **It ships zero bytes to players.** It is `import.meta.env.DEV`-gated, so it is dead-code-eliminated
  from the production bundle. There is a test that greps the built bundle to prove it is absent.
- **It is solo-only** and auto-disarms in a networked match, so it can never touch the wire.
- **It consumes no RNG**, so arming it cannot shift the seeded draw order.
- It reaches the world through only two already-existing actions (`SPAWN_SPARK`, `PICKUP_SPARK`) —
  no new reducer, no protocol change, no save-format change.
- ~679 LOC, all of it dev-only.

**My recommendation: keep it, do nothing.** It costs players nothing, it costs the bundle nothing,
and it is the instrument that would answer the next "is this economy right?" question empirically
instead of by guess. **Your call — I will not touch it either way without your word.**

---

## 4. COUNCIL — 3-way, Round 1, and the PRIME-AUDIT that followed

Seats: CLAUDE (proposer) · GROK-PLAN (`grok-4.20-0309-reasoning`) · GEMINI-AUDITOR
(`gemini-3.1-pro-preview`).

### What both seats independently agreed on (ADOPTED)

- **Walls must be DERIVED, never stored.** A border wall is a pure function of `(layout, matchPhase)`
  — and **both of those are already hashed World fields**. So walls cost **zero** of the nine
  hashed-field sites and **cannot desync**. They are geometry from `zones.ts` + a render pass + a
  movement clamp. When *player-built* walls arrive later (R17/R37/R39 — a different object that
  stands through the FIGHT and does block fire), they become ordinary primitives; the border walls
  stay derived. This is the single biggest cost saving in the batch.
- **Tower dormancy is a behaviour reversal with hidden coupling**, not a one-line guard.
- **Cut the batch** well before the end of the owner's list.

### GEMINI-AUDITOR — findings ADOPTED

- **The shelter snap must be ONE discrete pass, sorted by gatherer id.** If gatherers shelter inside
  the ordinary per-gatherer loop, deposit order follows `Map` insertion order — and a joiner
  rebuilding that Map from a snapshot can iterate differently. Sorting by integer id is already this
  repo's idiom (`save.ts` sorts defenders by id for exactly this reason). Also: fix the boundary
  comparison and pin the exact position in the tick, so a gatherer spawned *on* that tick is not
  ambiguous.
- **Clear `Defender.targetCreatureId` on the FIGHT→BUILD edge.** It is a real synced field; a
  defender that goes dormant holding a target id resumes onto a creature that may no longer exist.

### GROK-PLAN — finding ADOPTED

- **Fix the 17 tests with a shared fixture, not 17 individual patches.** A
  `zoneFixtures` helper exporting the canonical in-zone points per seat per layout means the next
  zone change touches one file, not eight.

### ⛔ PRIME-AUDIT — reviewer claims I verified and REFUTED

Per the standing rule that external reviewers fabricate execution claims, I grep-verified every
cited symbol before triage. **Four claims did not survive:**

| Seat | Claim | Verdict |
|---|---|---|
| GROK | *"`state/hazard.ts` still contains deletion paths"* | **FABRICATED — the file does not exist.** |
| GEMINI | *"add a guard to `hazardPhysicsLoop.ts`"* | **FABRICATED — the file does not exist.** |
| GROK | *"the 180-tick BUILD window"* | **WRONG by 30×** — `PHASE_DURATION_TICKS` is **5400**. |
| GROK | *"`isInsideEnemyTerritory` is still called from botBrain and dragPreview after the 6-site swap"* | **DOUBLE-COUNTED** — those two *are* sites 4 and 6 of the six. No extra work. |
| GEMINI | *"gatherer SHELTERED = 9 sites + protocol bump"* | **MIS-SIZED.** `Gatherer` already has `state: GathererState` and is serialized at **full fidelity**. `'SHELTERED'` is a **union widening on an existing serialized field**, not a new World field. Protocol bump yes; nine sites no. |
| GEMINI | *"NONET is heavily wired into `net/sudokuSync.ts` — arcade will leak WebRTC"* | **REFUTED.** `grep sudokuSync src/ --include=*.ts` excluding tests returns **nothing**; `SudokuOverlay`'s constructor takes only `(app, onSubmit)`. The decoupling Gemini prescribed **already exists**. |
| GEMINI | *"for the 17 tests, inject a mock layout where the whole map is one valid zone"* | **REJECTED ON MERIT.** `ZoneLayout` is a two-literal union; inventing a third board that exists only in tests would make 17 tests assert against a board no match is ever played on — the opposite of what they are for. Grok's fixture helper is taken instead. |

---

## 5. PROPOSED SCOPE — eight priorities, dependency-ordered

Each is independently shippable and each ends green + deploy-verified.

| # | Priority | Owner item | Tier | Protocol |
|---|---|---|---|---|
| **P1** | **ZONES ARE REAL** — wire `canBuildAt` into all six gates; `zoneFixtures` helper; resolve the 17 tests individually on merit | complaint 4a | Standard | no |
| **P2** | **THE PHASE SPLIT IS REAL** — gatherer shelter snap (sorted, one pass), no building in FIGHT, tower dormancy in BUILD + target clear, quarry BUILD-only (**CF-S148-a**) | complaint 5 | **Full** | **bump** |
| **P3** | **BORDER WALLS** — derived from `(layout, matchPhase)`; up + invulnerable in BUILD, down in FIGHT; movement clamp | complaint 4b | Standard | no |
| **P4** | **THE FOOTER BAND** — indexed by connector count (R36), regrouping `castleStructuresModel` by `cost` | complaint 2 | Standard | no |
| **P5** | **ARCADE + NONET** — fifth title button below CODEX; local-only overlay | new ask | Standard | no |
| **P6** | **FIX + SCRAP** — R13/R19/R21, BUILD-only, with the conservation invariant | complaint 3 | **Full** | **bump** |
| **P7** | **BOTS BUILD TOWERS** — a recipe goal in `chooseGoal`, complexity-ranked | complaint 1 | **Full** | no |
| **P8** | **CARRY-FORWARDS** — CF-S147-b, CF-S148-c, CF-S148-d, CF-S147-c, CF1, CF3 | owner ask | Standard | no |

**Dependency note (Council-corrected):** P2 does **not** depend on P3. The shelter snap is an
unconditional deterministic snap at `phaseEndsAtTick − 60`, not a race to reach a wall, so it needs
no wall to exist. P3 *does* depend on P1 (walls sit on the zone borders P1 makes authoritative).

**Both Council seats independently put the cut line after P4–P5** and recommend deferring P6 and P7
as Full-tier items with real design risk. I am **not** applying that cut — you asked for all five
complaints, and scaling your scope down is your call, not mine. §7 is where I ask you to make it.

---

## 6. WHAT I WILL **NOT** DO WITHOUT A RULING

- **Delete anything.** P4 demolition is cancelled. NONET, hazards, and the probe harness all keep
  every line. (Hazards are already paused — F6 — so that instruction needs no code at all.)
- Touch the probe harness in any direction until you rule on §3.
- Retune any balance number. Every gap here is a missing *mechanism*, not a wrong constant.
- Start castle HP / elimination — explicitly deferred by you to a later session.

## 7. OWNER RULINGS — 2026-08-20, RECEIVED. **STATUS: APPROVED, EXECUTING.**

- **R53 — ATTEMPT BOTH P6 AND P7; CUT P8 INSTEAD.** Both Council seats put FIX+SCRAP and
  BOTS-BUILD-TOWERS beyond a realistic cut line; the owner overrode that and cut the **carry-forwards**
  (P8) to a later session instead. ⚠ **CF-S148-a is NOT deferred** — it lives inside P2, so the R22
  quarry fix still ships this session. The five remaining carry-forwards (CF-S147-b, CF-S147-c,
  CF-S148-c, CF-S148-d, CF1, CF3) carry to S150 as an explicit logged deferral, **not** a silent drop.
- **R54 — THE PROBE HARNESS IS KEPT UNTOUCHED.** No code change, no archival switch, no doc pass.
  It stays dev-only and stripped from production exactly as it is today.
- **P4 DEMOLITION REMAINS CANCELLED.** Nothing is deleted this session. NONET, all four hazard
  families and the probe harness keep every line.

**Revised batch: P1 → P2 → P3 → P4 → P5 → P6 → P7.** P8 deferred by owner ruling.

## 8. EXIT GATE (every priority, no exceptions)

`tsc` 0 · full vitest green · `e2e:gating` 45/45 · `npm run build` under the bundle charter ·
push · `verify-deploy` **4/4** · MCV verification bindings authored and the verifier run to **exit 0**.

Plus, per priority:
- **P1** — a 1v1 and a 4-player match both refuse an out-of-zone placement at all six gates; the
  drag ghost and the host agree on every pixel; the quarry is unbuildable for everyone.
- **P2** — zero gatherers outside at the wall-drop **at every speed level 0–5**, cargo conserved; no
  build accepted during FIGHT; no defender fires during BUILD; **and the `workerSim.differential`
  anti-vacuity guards still see non-empty entity families** (the recorded trap: three families were
  once seeded only by accident and went silently empty).
- **P3** — walls present in BUILD, absent in FIGHT, invulnerable while up; host and worker hashes
  identical across a full BUILD→FIGHT→BUILD cycle.
- **P4** — every number in the footer is derived from the recipe registry, never hardcoded; a tile's
  enabled state matches what the reducer actually does.
- **P5** — ARCADE opens NONET from the title screen with no network activity and no `world` mutation.
- **P6** — fix-then-scrap round-trips conserve inventory **exactly**, with no shape duplication.
- **P7** — a bot builds a real tower in a fresh VS-BOTS match, inside its own zone.
