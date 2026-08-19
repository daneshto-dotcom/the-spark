**STATUS: COMPLETED — P1 (quadrants + anchors + protocol 24->25 + economy) SHIPPED and deploy-verified. The build-legality half became P5 and is NOT done (attempted and reverted, see the amendment).**

# PDR — S148 · ZONES, CASTLE ANCHORS, BUILD LEGALITY, ECONOMY RE-TUNE

**Tier: FULL** (new module + hashed-geometry migration + protocol bump + 6-site predicate swap + a
measured economy re-tune). **Status: AWAITING OWNER APPROVAL.**
Parent: `.claude/plans-archive/2026-08-19_SCOPE_AMENDMENT_S147_R41_4PLAYER_CAP_IN-PROGRESS.md` (P3).
Roadmap: `SPARK_TD_SESSION_SPECS.md` § S148. Protocol 24 → 25.

---

## 0. PRE-FLIGHT (all green, run this session)

| Check | Result |
|---|---|
| `git rev-list --count origin/master..master` | **0** (and 0 the other way — in sync at `ef59743`) |
| `npx tsc --noEmit` | **0 errors** |
| `npx vitest run` | **2459 passed / 159 files** |
| `npm run build` | **PASS** — entry `index-CkkN5WRI.js` 690.7 KiB, cap 900 KiB, headroom 209.3 KiB |
| `npm run verify-deploy` | **PASS 4/4** — REMOTE / RUN / VERDICT / LIVE all agree |
| `npm run e2e:gating` | **42 passed** (2.6 m) |
| `gh run list` | 8 most recent all `success`, **zero `cancelled`** (the silent-death pattern did not recur) |
| `gh issue list` | empty |

---

## 1. OBJECTIVE

Replace the polar keep ring with a real **zone partition**, derive each castle anchor from its zone,
confine building to your own zone at **every** gate the player can feel, and **re-tune the economy by
measurement** so the ~2.7× longer haul still funds a first tower inside one 90 s BUILD.

---

## 2. A.0 STATE-DISCOVERY — PRIME-AUDIT DELTA (re-run this session)

The S147 amendment banked E1–E12. I re-probed the load-bearing rows against current `master` and ran
the geometry arithmetic. **Four rows re-confirmed. Five NEW deltas — three of them change the plan.**

### Re-confirmed

| # | Claim | Verdict |
|---|---|---|
| E1 | Build legality is **SIX** call sites, not three | ✅ **CONFIRMED on disk** — `state/placePrimitive.ts:124`, `state/placeFromFree.ts:172`, `state/blueprintLegality.ts:84`, `bots/botBrain.ts:303`, `input/controls.ts:593`, `input/dragPreview.ts:109` |
| E5 | `castleAnchor` has 13 non-test consumers spanning sim **and** render | ✅ **CONFIRMED** — `main.ts:1058`, `castlePanel.ts:860/896/980`, `gathererRenderer.ts:160/202`, `castleBank.ts:140`, `gameMode.ts:320/345`, `gathererLifecycle.ts:113/457`, plus `gatherer.ts:150` (`isPointInKeep`) |
| E9 | `territory.ts` survives; only the predicate is swapped | ✅ **CONFIRMED** — `computeTerritorialInfluence` still called from `physicsLoop.ts` |
| — | `src/state/zones.ts` does not exist; `PROTOCOL_VERSION = 24` | ✅ greenfield |

### ⛔ NEW DELTA D1 — **the measurement instrument was DELETED. There is nothing to measure with.**

The spec says *"measure, do not guess"* and `constants.ts:472` names the instrument:
`e2e/bank-throughput.spec.ts`. **That file was deleted in S146 P2** (`7c2def1`, −196 lines) when the
bank cap went limitless, together with its `__TEST_CASTLE_BANK_CAP__` seam. Three live documents still
cite it as if it exists: `src/constants.ts:472`, `src/constants.ts:523`, `CASTLE_BUILD_SPACE_DESIGN.md:75`.

**Consequence:** the economy re-tune is not "run the harness and read the number" — the harness has to
be **rebuilt first**, and that is priced into P3 below.

### ⛔ NEW DELTA D2 — **the "~1100 px haul" in the handoff is not the geometry.** Computed, not recalled:

| | centre→anchor | quarry-rim→anchor (the actual haul) | vs today |
|---|---|---|---|
| today (`KEEP_RING_RADIUS`) | 420 | **295** | — |
| `PITCH_2P` (120,540) | 840.0 | **715.0** | 2.42× |
| `QUADRANTS_4P` (130,130) | 925.7 | **800.7** | **2.71×** |

The spec's *2.6×* ratio is right; the *"420 → ~1100 px"* framing is wrong in both numbers. The re-tune
must be sized against **800.7 px**, not 1100.

### ⛔ NEW DELTA D3 — **the spark TTL is the real economy constraint, and nobody has named it.**

`FREE_SPARK_TTL_TICKS = 600` (10 s) — an unclaimed free spark **dies in 10 seconds**. Escrowed
(hauled/banked) sparks are exempt (`physicsLoop.ts:243`), so the *return* leg is safe. The **seek** leg
is not:

| gatherer speed | 4P seek leg | as % of a spark's whole life | round trip | hauls per 90 s BUILD |
|---|---|---|---|---|
| **1.9** (base, today) | 421 t = **7.0 s** | **70 %** | 14.0 s | ~6.4 |
| 2.7 (+1 upgrade) | 297 t = 4.9 s | 49 % | 9.9 s | ~9.1 |
| **3.5** (+2 upgrades) | 229 t = 3.8 s | 38 % | 7.6 s | ~11.8 |
| 5.9 (max level) | 136 t = 2.3 s | 23 % | 4.5 s | ~19.9 |

At base speed the walk to the quarry consumes 70 % of a target spark's lifetime, so targets expire
mid-walk and the gatherer re-targets repeatedly. Those figures are **upper bounds that ignore
re-target thrash** — the real number is lower, and only measurement says how much.

**Raising `GATHERER_BASE_SPEED` alone may not be the right knob.** `FREE_SPARK_TTL_TICKS` is the
co-equal lever and it is not in the spec's scope. P3 measures both.

### ⚠ NEW DELTA D4 — **the first BUILD is hard-locked to ONE gatherer, and that decides the whole economy.**

- `seedStartingGatherers` gives each seat exactly **one** gatherer (`gameMode.ts:337`).
- `STARTING_VICTORY_POINTS = 100`, `GATHERER_PRICE = 105` → **you cannot buy a second gatherer**, ever,
  in the opening BUILD.
- S147 R3 gated `tickScoring` to FIGHT → **zero income accrues during BUILD**. The opening 100 points
  is the entire budget.
- `GATHERER_SPEED_UPGRADE_PRICE = 50` → the only affordable lever is **exactly two speed upgrades**,
  1.9 → 3.5 px/tick, which lands on the ~11.8-haul row above.

So the exit gate *"a first tower affordable in one 90 s BUILD"* must state **which** of those two worlds
it is measured in — un-upgraded (~6.4 hauls, tight) or twice-upgraded (~11.8, comfortable). The target
is the Stink Tower: `STINK_TOWER_SIZE = 4` = **1 Square + 3 Circle**, four *type-directed* hauls via the
order queue (`pickGathererTarget` honours a preferred type at any distance).

### ⚠ NEW DELTA D5 — **the anchors fit the canvas, but one clears the HUD by ONE pixel.**

The boot snapshot's *"all VERIFIED to fit KEEP_W=74 / KEEP_H=58, no clipping"* is true **for the keep
box only**. Three dependent geometries were never checked:

- ✅ All six keep boxes are inside 1920×1080.
- ⛔ **Score progress bar** occupies x ∈ [12, 92], y ∈ [920, 960] (`ui.ts:216–223`). The bottom-left
  4P keep box is x ∈ [93, 167], y ∈ [921, 979]. **They miss by 1 px.** That is luck, not clearance —
  any future `KEEP_W` or bar-width change collides.
- ⚠ **Porch + deposit point** sit at `anchor.y + 74` (`CASTLE_PORCH_OFFSET_Y` / `GATHERER_DEPOSIT_OFFSET_Y`)
  → **y = 1024** for both bottom keeps, inside the footer band (`FOOTER_TOP_Y = 996`). Survivable *only*
  because S136 P0 deleted the footer plate and its click guard (`ui.ts:227`) — nothing is drawn or
  swallowed there now. Worth an explicit assertion so a future footer revival does not silently eat the porch.
- ✅ Energy gauge x ∈ [1896, 1904] clears both right-hand keeps (max x 1827).
- ✅ `panelOrigin` already clamps the castle panel to the canvas on both axes (`castlePanel.ts:425–431`).

**Blocking questions: two, in §8. Everything else is decided.**

---

## 3. SCOPE

### P1 — THE PARTITION (protocol 24 → 25)
- **New `src/state/zones.ts`** — `ZoneLayout = 'PITCH_2P' | 'QUADRANTS_4P'`, `zoneOf(pos, layout)`,
  `zoneOwner(seat, layout)`, `zoneCastleAnchor(seat, layout)`.
- The **quarry (960,540 r=125) belongs to no zone** — evaluated **first**, by *squared* distance (no
  `Math.sqrt`), returning `null`. Then partition with consistent strict inequalities so no pixel is
  claimed twice and none is unclaimed. **Do not integerise positions** — they are hashed floats already
  identical on both peers.
- `layout` becomes a **hashed `World` field**, set at match start from the seat count (3 players →
  `QUADRANTS_4P` with one zone unowned, R2). Nine sites, exactly as `matchPhase` went in S147:
  `worldTypes.ts` · `world.ts` · `save.ts` ×3 · `stateHashFull.ts` (FIELD_COVERAGE **+** projection) ·
  `workerSim.ts` · `gameMode.ts` ×2 (`applyStartGame` + `RETURN_TO_TITLE`) · `protocol.ts`.
- `castleAnchor(seat)` → **zone-derived**. All 13 consumers follow. `KEEP_RING_SEATS` and
  `KEEP_RING_RADIUS` die (their docblocks already say S148 kills them).
- **Protocol bump is FIVE sites**: the const, the narrative changelog, the `HelloMsg.protoVersion` type
  literal (tsc tripwire), `protocol.test.ts`'s pinned assertion **and its title**, `LOCAL_PROTO_V` in e2e.

### P2 — ONE LEGALITY RULE, SIX GATES
- One canonical `canBuildAt(world, playerId, pos)` = `zoneOf(pos, world.layout) === zoneOwner(seat, world.layout)`,
  imported by **all six** D-E1 sites so the host, the drag ghost and the bots cannot disagree.
- `territory.ts` keeps its other consumers; only the `isInsideEnemyTerritory` predicate is retired from
  those six.

### P3 — MEASURE, THEN TUNE
- **Rebuild the instrument** (D1). Proposed as a **headless vitest harness**, not a Playwright spec:
  deterministic, no browser flake, runs in the normal suite, and it can sweep speed × TTL in seconds.
  (The deleted spec was a `@perf-measure` browser soak — the wrong tool for a parameter sweep.)
- Sweep `GATHERER_BASE_SPEED` × `FREE_SPARK_TTL_TICKS` over a full 5400-tick BUILD, one gatherer, order
  queue set to 1 Square + 3 Circle. Report the table, then set the constants from it.
- Re-record `KEEP_RING_RADIUS`'s measured-consequence docblock against the real number (800.7 px).
- Fix the three stale `bank-throughput.spec.ts` citations (D1).

### OUT OF SCOPE
Border walls + gatherer shelter (S149, owner-ruled R46) · castle HP/guns/elimination (S150) ·
towers/orders (S151) · the zone **tint/divider** visual beyond what is needed to see the partition ·
CF1 worker click-to-build · the lobby colour/race picker (CF-S147-e).

---

## 4. RISKS

| Risk | Mitigation |
|---|---|
| **Anchor change is a hashed-state migration** — gatherer spawn positions derive from it | host / worker / promoted-successor bit-for-bit parity test; `workerSim.differential.test.ts` (300 frames, wide hash) is the real gate |
| `FIELD_COVERAGE` omission | it is the **only** tsc-forced site of the nine — never route around it; the other eight are silent |
| Wiring 3 of 6 legality sites | the drag ghost shows "legal" where the host refuses = reads as desync to the player. All six move in **one** commit |
| Economy unfundable at 2.71× haul | measured in-session (P3), both levers on the table (speed **and** TTL), not deferred |
| `hostTick.differential.test.ts` | live-vs-**FROZEN**, pinned to FIGHT — anchors move under it too; expect it to need re-transcription, and read it before trusting the name |
| Protocol drift | the 5-site checklist, verified by grep before commit (this has drifted **5×**; CF-S147-b) |
| Mixed line endings | single-line ASCII anchors, `newline=''` on every python write, verify by **byte count** |
| A green suite is not evidence for render work | Playwright screenshot of both boards; the in-app Browser pane cannot verify SPARK (undisplayed pane = paused rAF) |

---

## 5. TESTING

- **Unit** — `zoneOf` is *total*: every pixel of 1920×1080 on a coarse grid returns a zone or `null`,
  never undefined, never two zones (both layouts); correct at x=960/y=540 exactly, at the four borders,
  at dead centre, and at the quarry rim ±1 px. Every seat maps to a distinct zone. Every anchor is
  inside its own zone.
- **Geometry regression** — pin the D5 findings: keep boxes inside canvas; the progress-bar/keep gap
  asserted explicitly so the 1-px clearance can never silently close; porch y asserted against
  `FOOTER_TOP_Y`.
- **Legality** — one pixel across the border is refused, one pixel inside is allowed, **at all six
  sites** (host, preview, bots agree).
- **Determinism** — host vs worker vs promoted successor agree on anchors bit-for-bit; full BUILD→FIGHT
  cycle differential.
- **Economy** — the new harness asserts the measured tune actually funds 1 Square + 3 Circle inside 5400
  ticks, with an **anti-vacuity control** (the S147 lesson: every negative/threshold test needs a positive
  control proving the thing it watches for was possible).
- **E2E** — a 4-player and a 2-player match each fund a first tower in one BUILD; a screenshot of each board.

## 6. EXIT GATE

`tsc` 0 · full vitest · `e2e:gating` · both layouts total+correct · anchors in-zone · cross-zone build
refused at all six sites · host/worker/successor bit-identical · a first tower affordable in one 90 s
BUILD on both boards **under the stated upgrade assumption** · `verify-deploy` 4/4 · Playwright screenshots.

## 7. ROLLBACK

Each priority is its own commit with its own deploy + green suite. P1 is the only irreversible-ish step
(the protocol bump); reverting it is a `git revert` plus a second bump. P2 and P3 revert cleanly.
Owner bump policy allows two bumps spread out; **S148 uses one** (24 → 25).

---

## 8. BLOCKING QUESTIONS — I need two rulings before I lock this

**Q1 — Which world is the economy exit gate measured in?** (D4)
The opening BUILD is hard-locked to one gatherer and 100 points, and income is off during BUILD, so the
only lever is exactly two speed upgrades (100 pts → 1.9 → 3.5 px/tick).
  **(a)** Tune so a first tower is affordable **un-upgraded** — the board is forgiving, upgrades are a
  bonus, but I will have to raise base speed a lot (or the TTL) and that also speeds every later stage.
  **(b)** Tune so it is affordable **only if you buy the two upgrades** — the opening BUILD becomes a real
  decision and the 100 starting points mean something. Slower, more punishing, more strategic.
  **(c)** Raise `STARTING_VICTORY_POINTS` above `GATHERER_PRICE` so a **second gatherer** is the opening
  choice instead. This is a design change, so it is yours, not mine.

**Q2 — May I touch `FREE_SPARK_TTL_TICKS`?** (D3)
At the new haul distance the walk to the quarry eats 70 % of a spark's 10 s life at base speed, so
gatherers thrash on expiring targets. Speed alone can fix it, but the TTL is the cheaper and more honest
knob — and it is outside the spec's stated scope, so I am not moving it without a word from you.

**Everything else is decided and needs no input.** If you want, I can also put Q1/Q2 to the 3-way
Council (Grok + Gemini) on the HOW before I start — the banked S147 Council never saw D1–D5.
