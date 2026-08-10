# PDR — S137 batch (Full tier)

**Session:** S137 · **Date:** 2026-08-10 · **Branch:** master
**Approval:** owner, explicit, in chat — *"i pre approve top recommended top value highest levarage
priorities in a thorough and pedantic batch. work in the absoluyte best interests of this project and
vision to produce the highest quality outputr possible! APPROVED full session and autonomous work"*
**Context at lock:** 186,758 / 1,000,000 (18.7% GREEN)

---

## 1. OBJECTIVE

The owner is away and will **playtest on return**. So this session optimises for exactly one thing:
*what is the most valuable state for the build to be in when they sit down to play?*

Four things, in order:

1. **A green gating lane.** It is 2-red today. Both are diagnosed. A red lane means every future
   claim of "tests pass" is worthless.
2. **New content to actually play** — the in-bubble build space (V6-1.3 P2), the largest remaining
   owner-requested item.
3. **Close the owner's UNVERIFIED item myself** — the rainbow castle party has never been looked at.
   Verifying it visually means the playtest is not spent on something I could have checked.
4. **Turn the one open tuning question into DATA, not a guess.** The bank is now the throughput
   bottleneck. Measure it; do not blind-tune a constant the owner will have an opinion about.

## 2. SCOPE

### P0 — Green the gating lane (2 red → 0)

**P0a · `fog.spec.ts:168` — the layer contract is stale, bump it WITH attribution.**
The assertion is `aboveFogChildren === 13`; it is stably **14**. The 14th child is **attributed**:
a static roll call of every `parent.addChild` into `aboveFogLayer` sums to exactly 14 —

| renderer | main.ts | children |
|---|---|---|
| spawnerZoneRenderer | :486 | 1 |
| creatureRenderer | :489 | 2 (`container` + `cloudGfx`) |
| chewerRenderer | :493 | 1 |
| turretRenderer | :495 | 1 |
| princessRenderer | :496 | 1 |
| hunterRenderer | :502 | 1 |
| **gathererRenderer** | **:506** | **1 ← S135, the 14th** |
| potatoRenderer | :509 | 1 |
| rainbowRenderer | :512 | 1 |
| rainbowFlyoverRenderer | :516 | 2 (`overlay` + `char`) |
| seagullRenderer | :519 | 1 |
| poopRenderer | :520 | 1 |
| | | **= 14** |

So the contract went stale in **S135** (V6-1.1's `GathererRenderer(app, aboveFogLayer)`), not this
session. Bump 13→14 and extend the roll-call comment with the gatherer entry, so the number stays
attributable rather than becoming a magic constant someone bumps on red.
**Also add a runtime child-name dump to the spec's failure path** — the reason this took a session to
attribute is that the assertion reports a number and nothing else.

**P0b · `hunter.spec.ts:67` — the spec's premise went stale; fix the ROOT.**
Proven chain (all static, all cited):

| # | file:line | fact |
|---|---|---|
| 1 | `constants.ts:353-356` | every player starts owning 1 gatherer **and 100 VP** |
| 2 | `gameMode.ts:271` | `world.scoreByPlayer.set(pid, STARTING_VICTORY_POINTS)` = 100 |
| 3 | `scoring.ts:264` | `world.scoreProgress = max(scoreByPlayer)` → **100** |
| 4 | `hunter.spec.ts:81` | spec forces `__TEST_HUNTER_TRIGGER_SCORE__ = 1` |
| 5 | `constants.ts:765` | `HUNTER_TRIGGER_SCORE` = that override = **1** |
| 6 | `hostTick.ts:498` | `!hunterSpawned && floor(100) >= 1` → **SPAWN_HUNTER on the first PLAYING tick** |

The spec's own line 103 — `w.scoreByPlayer.set(0, 5); // > __TEST_HUNTER_TRIGGER_SCORE__ (1)` — proves
its author believed score started at **0**. V6-1.2 introduced `STARTING_VICTORY_POINTS = 100` and
silently turned that injection into a no-op, moving the spawn ~90 s earlier than the spec intends.
The test named *"spawns once at the **75% trigger**"* has therefore not been testing the trigger at
all — it has been testing "a hunter exists". It only stayed green because the old placement was
instant; the V6-1.3 pull path takes seconds, which is long enough for the t=0 hunter to reach and
**bench** the player, and `controls.ts:345` (`if (this.isInputLocked()) return;`) then swallows the
keep click before `handleCastleClick` — surfacing as *"castle panel did not open"*.

Fix at the root: raise the trigger seam **above** the 100 VP opening balance so the spawn is once
again caused by the spec's own injection, restoring the stated intent.

⚠ **The bench→lock link is the one inference in this PDR that is not yet empirically confirmed** (the
failure snapshot shows `tick: 261`, and a catch of a centre-held avatar is ~400 ticks). So P0b
**instruments before it fixes**: `pullFromBank`'s throw must report live world state
(`benchedUntilTick`, `hunters.size`, `hunterSpawned`, `sudoku`, `activeCinematicPlayerId`, `tick`),
the spec is run, and the *measured* cause is what gets fixed. Fail-loud-with-diagnostics is this
file's own documented convention.

**P0c · Kill the duplicated keep geometry (the S50-P5 regression class).**
`e2e/helpers.ts:101-103` re-derives the keep position with its own copy of `castleAnchor`'s formula,
including a hardcoded `/7` and a comment asserting `PLAYER_COLORS.length = 7`. That comment is
**currently true** (verified: 7 entries — 6 seats + the S87 silver bots seat), and seat 0 is
`cos(π)`-identical either way, so this is *latent*, not the live bug. It is still exactly the class
the S85 P4c geometry-getter convention exists to delete. Expose a keep-geometry getter on `__SPARK__`
and have the helper consume it.

### P1 — V6-1.3 P2: the in-bubble build space (largest owner item)

Owner item 5's ambitious half: *prebuild a structure inside the castle popup, then pull the whole
structure out*. The one-by-one pull already ships, so this is **purely additive**.

**Design constraint that keeps it safe:** the arrangement is **RENDER-LOCAL**, exactly like
`castlePanel.selectedSeat` already is (`castlePanel.ts:16-20`). A banked shape is already a real
`Spark` held out-of-world (`castleBank.ts:65`), so an "assembly" is nothing more than *a local
ordering + relative offsets over shapes the bank already holds*. That means:

- **no new World field**, so no `FIELD_COVERAGE` / save / protocol / `structuralSignature` /
  positions-buffer cost, and **no new desync surface** — the explicit reason the panel's own
  selection state was kept local;
- **one new reducer action** (`PULL_STRUCTURE_FROM_BANK`) that takes the arranged bank indices and
  places them on the board at an anchor with their relative offsets, then forms the bonds;
- v1 accepts that an un-pulled arrangement is lost on reload — the same trade the open-panel state
  already makes.

### P2 — Verify the rainbow castle party VISUALLY

`keepRainbowTint` is pinned by pure tests; **nobody has ever looked at it**. Drive the flyover window
deterministically and capture real screenshots (Playwright can screenshot even though the preview
pane cannot composite). Produce a before/during/after strip for the owner.

### P3 — MEASURE the bank bottleneck (no blind tuning)

Instrument a headless run and report gatherer HAULING vs WAITING sample counts and shapes-banked/min
at `CASTLE_BANK_CAP` ∈ {5, 6, 8}. Ship the **measurement and a recommendation**; the constant change
is the owner's call.

⚠ `CASTLE_BANK_CAP` is never to be tuned apart from the recipe-size table beside it
(`constants.ts:395-409`), which now carries the NONET-9 row (verified present) that every prior copy
omitted. Any recommendation must state which recipes each cap can hold outright.

## 3. NON-SCOPE (deliberate, with reasons)

- **Sim-worker default-on flip.** Deferred *on purpose*. Shipping a change to the authoritative
  execution model, unattended, hours before the owner playtests, means they would be playtesting an
  untested code path — and a failure there costs the whole playtest. Re-verified facts for whoever
  takes it: **6 `?worker=1` literals across 4 e2e files** (`worker.spec.ts:32`,
  `worker-bots.spec.ts:35`, `worker-duel.spec.ts:69,70`, `worker-heap.spec.ts:433,468`) — the
  handoff's count is CONFIRMED and **`BACKLOG.md:411` is wrong** where it says "5 files";
  `src/dev/probeHarness.ts:339-345` does refuse to arm when the flag is set (CONFIRMED verbatim), so
  it becomes refuse-**by-default** after a flip.
- **B5 match length.** Owner-UNRULED (V6-4.3). The ×6 faucet shortens matches; `PHASE_1_WIN_SCORE`
  and `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` stay untouched.
- **`origin/gh-pages` deletion** — OWNER-GATED.
- **S135 leftovers** (SCORE_TIER corner-bloom replay, carried-potato `onUp` pointer capture) — not
  reachable in a batch this size; carried forward explicitly.

## 4. RISKS & MITIGATIONS

| # | risk | mitigation |
|---|---|---|
| R1 | P0b "fix" masks a real product bug (the castle panel genuinely unusable while benched) | Instrument FIRST. If the measurement shows the panel is unreachable while benched, that is a **product** finding → logged carry-forward, not silently absorbed into a test edit. |
| R2 | P1 grows a new desync surface | Render-local by construction; **no new World field**. A `stateHash`/`FIELD_COVERAGE` diff of zero is an acceptance criterion. |
| R3 | P1's placement lands shapes somewhere physics immediately moves | **S136's hardest-won lesson**: no test in the suite runs the physics loop. P1's acceptance test MUST run real physics for several frames and re-assert positions. |
| R4 | Bumping fog 13→14 hides a real renderer leak | The bump is justified by an itemised roll call that sums to 14, not by "it's red". Plus a runtime child-name dump so the next bump is cheap. |
| R5 | Measurement (P3) is itself wrong | Report raw sample counts and the method, not just a verdict. |
| R6 | Spend-cap death mid-session (killed a 6-agent fleet already; also killed S136's Council) | **No large agent fleets.** Direct work + at most 2 single-shot external Council calls. |

## 5. TESTING & ACCEPTANCE

- `npm run e2e:gating` → **31 passed / 0 failed** (from 29/2). No `@quarantine-flaky` masking — the
  handoff is explicit that neither failure was to be quarantined.
- `npm test` (vitest) → no regressions from the 2069 baseline; P1 adds unit tests for the arrangement
  → placement mapping.
- `npm run typecheck`, `npm run build` (incl. the bundle-size gate) green.
- P1: a real-physics acceptance test (R3).
- P2: actual PNG screenshots produced and shown.
- P3: a table of raw measurements.
- `npm run verify-deploy` → 4/4 after push.

## 6. ROLLBACK

Each priority is its own commit. `git revert <sha>` per priority. P1 is additive and reachable only
from the castle panel, so reverting it cannot affect the shipped one-by-one pull.

## 7. SUCCESS CRITERIA

1. Gating lane green, both failures fixed at the **root**, neither quarantined.
2. The in-bubble build space is playable and adds **zero** serialized state.
3. The owner receives rainbow screenshots and a bank measurement table — two pending items closed
   without spending their playtest.
4. Deploy verified 4/4; handoff written.

## 8. CARRY-FORWARD (explicit, not dropped)

- Worker default-on flip (facts re-verified above; `BACKLOG.md:411` needs its "5 files" corrected).
- B5 match length — still unruled.
- S135: SCORE_TIER corner-bloom replay · carried-potato `onUp` pointer capture.
- No 2-peer/joiner exercise of the castle bank; no host-migration round-trip for it.
- If P0b's instrumentation shows the castle panel is unusable while benched → **product** carry-forward.

---

## A.0 STATE DISCOVERY (Rule 21) — empirical, run before this PDR was locked

| # | claim | verifier | result |
|---|---|---|---|
| 1 | git in sync | `git rev-list --count origin/master..master` | **0 ahead / 0 behind**, clean but `.claude/session-state.json` |
| 2 | deploy landed | `npm run verify-deploy` | **PASS 4/4** (remote / run / verdict / live hash `index-DGsKtma2.js`) |
| 3 | lane really is 2-red | `npm run e2e:gating` | **2 failed / 29 passed** — exactly as handed off |
| 4 | fog 14th child | static roll call of `parent.addChild` into `aboveFogLayer` | **= 14**, attributed to `gathererRenderer` (S135) |
| 5 | hunter spawns at t=0 | `gameMode.ts:271` + `scoring.ts:264` + `hostTick.ts:498` | **CONFIRMED** |
| 6 | helper keep geometry wrong? | `KEEP_RING_SEATS`, `SPAWNER_RADIUS`, `SPAWNER_CENTER_*` | **REFUTED** — helper math is correct (7 seats confirmed) |
| 7 | probeHarness refuses under worker flag | `probeHarness.ts:339-345` | **CONFIRMED** verbatim |
| 8 | worker literal count | repo-wide grep | **6 literals / 4 files** — handoff right, `BACKLOG.md:411` wrong |
| 9 | bank cap + recipe table | `constants.ts:395-409` | cap **5**; 6-row table incl. **NONET-9** present |
| 10 | dev-server port | `preview_start` | 40843 **collided** with another session → moved to `$SESSION_PORT` 24300 |

**Measurement error made and corrected during A.0:** a regex count of `PLAYER_COLORS` returned 9
because it split on commas inside the block comments. Re-read directly: **7**. Recorded because it
would have produced a confident, wrong "helpers.ts geometry is broken" finding.

---

## DELIBERATION (Rule 17) — 2-way Council + PRIME-AUDIT delta

**Seats:** CLAUDE (supervisor) + GROK-PLAN (`grok-4.20-0309-reasoning`).
**GEMINI-AUDITOR unavailable** — `gemini-3.1-pro-preview` returned **HTTP 429, "prepayment credits are
depleted"**. Per the protocol's stated fallback (*Gemini err → 2-way*) this ran as a 2-way Council.
Stated as a deviation, **not** presented as full compliance.

### ADOPTED from GROK (5)

1. **The fog assertion becomes SEMANTIC, not a bumped magic number.** Assert the exact list of child
   **constructor names** against an explicit expected roll call. Strictly better than `=== 14`: it
   fails *with attribution built in* (the thing that cost a whole session), and it catches the case a
   count cannot — one renderer leaking a second child while another adds none still sums to 14.
   This supersedes P0a's "bump + dump on failure".
2. **`PULL_STRUCTURE_FROM_BANK` must re-validate everything host-side** — indices → concrete shapes,
   offsets, overlap, bounds. Never trust client-supplied geometry. (Follows the shipped precedent:
   `castlePanel.ts:275-277` already notes the single-shape pull re-checks the index authoritatively.)
3. **Add a determinism/state-hash test for the new action**, valid *and* invalid arrangements.
4. **Confirm the new reducer survives the Web Worker sim path**, not just the direct path.
5. **Scope realism.** P3 is named the explicit FIRST CUT if budget runs short.

### REFUTED, with evidence (3)

1. ❌ *"HUNTER_TRIGGER_SCORE=75, so the hunter fires on tick 1 in every real game — this is a PRODUCT
   bug."* — **Refuted.** `constants.ts:764` is
   `readTestHunterTriggerScore() ?? Math.floor(PHASE_1_WIN_SCORE * 0.75)` = **1125**
   (`PHASE_1_WIN_SCORE = 1500`, `constants.ts:337`). 100 < 1125, so production is unaffected. Grok
   invented the 75.
2. ❌ *"Bank ordering can differ across clients, so indices are unsafe."* — **Refuted.** `castleBanks`
   is serialized, host-authoritative world state; the shipped pull already re-checks indices host-side.
   (The *validation* requirement in ADOPT-2 stands on its own merits.)
3. ❌ *"Everything but the fog bump should go on a branch."* — **Refuted on project grounds.** This
   repo explicitly dropped branch workflows (project `CLAUDE.md`: solo workflow, commit directly to
   `master`; GitButler deprecated 2026-04-20).

### ⭐ NEW PRODUCT FINDING — surfaced by the challenge, verified independently

Grok's mechanism was wrong but its *direction* was right, and checking it found something real:

`scoreProgress = max(scoreByPlayer)` (`scoring.ts:264`) and **every seat opens at 100**
(`gameMode.ts:271`). Both thresholds gate on that same inflated number:

- WIN — `gameState.ts:62`: `floor(scoreProgress) >= PHASE_1_WIN_SCORE` (1500)
- HUNTER — `hostTick.ts:498`: `floor(scoreProgress) >= HUNTER_TRIGGER_SCORE` (1125)

⇒ a match actually ends after **1,400 EARNED** points, not 1,500, and the hunter fires at **1,025
earned**, not 1,125. **Phase 1 is silently ~6.7% shorter than every comment claims** —
`constants.ts:336` reads "WIN at 1500" as though counting from zero.

This is **owner-unruled B5 (match length)** territory, and the ×6 faucet already shortens matches.
→ **LOGGED AS CARRY-FORWARD. NOT fixed unattended.** Changing it silently would be a balance change
the owner never approved, made hours before they playtest.

### PRIME-AUDIT (Rule 20) — adversarial self-audit before execution

- **What did I rubber-stamp?** The bench→lock causal link. It is the one inference in this PDR and it
  is *not* measured. Held: P0b instruments and measures **before** it fixes.
- **Claim addressed vs actually fixed?** Grok's "fix the product, not the test" is the sharpest
  challenge. Resolution: the test's premise is *provably* stale (its own comment shows it assumed
  score starts at 0), so repairing the test is right — **and** the genuine product observation it
  pointed at is now logged above rather than dismissed. Both halves answered.
- **Where does consensus mask disagreement?** Only two seats voted; a third might have broken the tie
  on ADOPT-1 vs P0a. Recorded, not hidden.
- **Runtime-verifiability (mandatory for this class):** every acceptance here is a real run, not a
  static parse — `e2e:gating` must actually go green, P1 must survive **real physics frames** (R3),
  P2 must produce **actual PNGs**, P3 must produce **actual measurements**.
- **Residual risk accepted:** P1 v1 loses an un-pulled arrangement on reload. Deliberate; logged.
