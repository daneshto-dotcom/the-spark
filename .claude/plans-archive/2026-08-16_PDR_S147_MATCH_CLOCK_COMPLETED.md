# PDR — S147 · THE MATCH CLOCK

**STATUS: COMPLETED - S147 P1 shipped at 4e586ee, deploy verified 4/4, live. All four exit-gate items met.**

**Status: APPROVED (owner, 2026-08-16: "full session priority pdr approved!")**
Tier: **FULL** (>30K; ~45 edit points across 14 files, protocol bump, 6 test files)
**Session:** S147 · **Date:** 2026-08-16 · **Branch:** master · **PROTOCOL_VERSION: 22 → 23**
**Design authority:** `SPARK_TD_BLUEPRINT.md` (R1–R40) + `SPARK_TD_SESSION_SPECS.md` §2 S147

---

## 1. OBJECTIVE

Give the SPARK sim a deterministic two-phase heartbeat — `BUILD` (90 s) / `FIGHT` (90 s) — that is
tick-derived, host-authoritative, serialized, hashed, and carried in the snapshot. Nothing else
changes behaviour: towers stay always-on, no walls, no zones. Six later sessions gate behaviour on
`matchPhase`, so this must be provably stable before anything is built on it.

Plus **Step 0**: switch the four cut hazards OFF (R14/R23), code retained.

---

## 2. SCOPE

### P1 — S147 THE MATCH CLOCK (this session's whole deliverable)

**(a) Step 0 — hazards OFF (R14/R23), code fully retained**
- NEW `constants.ts`: `HAZARD_SPAWN_ENABLED = false` (one-line restore, per R14's explicit intent).
- Gate the **four dispatch sites** in `physics/physicsLoop.ts:100,107,114,121` —
  `if (HAZARD_SPAWN_ENABLED && world.bombs.size < BOMB_MAX_ACTIVE)`.
- **`*_MAX_ACTIVE` constants stay at 1 and `*_SPAWN_MIN/MAX_SPARKS` are NOT touched.** See §5 D1/D2.
- NEW e2e re-enable seam `__TEST_HAZARDS_ENABLED__` mirroring the shipped `readTest*` pattern
  (`constants.ts:758`), so the 4 gating e2e hazard specs keep their coverage instead of being skipped.

**(b) Data model — 2 fields, following the `rainbowSwitchTick` + `gameState` templates exactly**

    // worldTypes.ts
    export type MatchPhase = 'BUILD' | 'FIGHT';
    matchPhase: MatchPhase;      // REQUIRED (gameState template), starts 'BUILD' (Q12)
    phaseEndsAtTick: number;     // REQUIRED, = tick + PHASE_DURATION_TICKS at each edge
    // constants.ts
    export const PHASE_DURATION_TICKS = 90 * PHYSICS_HZ;  // 5400

The nine sites the scalar template demands (§5 D4), per field:
`worldTypes.ts` decl · `world.ts:329 makeWorld` init · `stateHashFull.ts:70 FIELD_COVERAGE` row
(**TSC-FORCED**) · `stateHashFull.ts:340 determinismParts` term · `save.ts` `WorldSnapshot` decl ·
`save.ts snapshot()` emit · `save.ts applySnapshotCore` rehydrate · `workerSim.ts` sync ·
`gameMode.ts:191,429` two reset sites.

Both fields ride `NetSnapshot` by default (`save.ts:930` Omit list excludes only 5 host-only keys) —
which is what we want: host-authoritative, joiner cannot disagree about the deadline.

**(c) The flip — `hostTick.ts`, one block**
Inserted after the `stepPhysics`/`tick++` branch (`:139-142`) and BEFORE the `tickScoring` gate
(`:147`), so this tick's phase is settled before scoring decides. Gated on `gameState === 'PLAYING'`.
`>=` boundary (S27 reflexion: integer boundaries must clear equality). Emits `PHASE_CHANGED`.

**(d) Scoring gate (R3/R7/R16) — one conjunct**
`hostTick.ts:147` becomes `if (world.gameState === 'PLAYING' && world.matchPhase === 'FIGHT')`.
Verified: `tickScoring` has exactly **one** production call site. The income engine is already
correct (blueprint A.0 finding). Anti-coast leader decay (R28) switched off behind
`LEADER_DECAY_ENABLED = false`; it lives *inside* `tickScoring` (`scoring.ts:266-284`), retained.

**(e) Protocol bump 22 → 23 — the FIVE-site checklist (not two)**
1. `net/protocol.ts:178` `PROTOCOL_VERSION = 22 as const` → 23
2. `net/protocol.ts:251` `readonly protoVersion: 22` → 23 (**tsc tripwire**)
3. `net/protocol.ts:60-177` narrative changelog — add the S147 entry
4. `net/protocol.test.ts:75` test **title** + `:87` `expect(PROTOCOL_VERSION).toBe(22)` → 23
5. `e2e/smoke.spec.ts:71` `LOCAL_PROTO_V = 22` → 23 (`NEWER_PEER_V` derives)

Plus a free sweep of 3 stale comments (`smoke.spec.ts:644,658`, `hostmigration.spec.ts:14`) and the
**already-stale** `HelloMsg` JSDoc at `protocol.ts:223-250` (missing the S146 21→22 entry).

**(f) HUD** — pure exported `formatPhaseBanner(phase, ticksRemaining)` + one `Text` on `class HUD`
(`render/ui.ts:243`), matching the shipped `formatSoloScore` formatter+unit-test pattern. Derived from
`(phaseEndsAtTick - tick) / PHYSICS_HZ`. Works on the client for free (§5 D6).

**(g) Tests** — see §4.

### P2 — S148 ZONES + ANCHORS + BUILD LEGALITY — **CONDITIONAL, deferred by default**
Only if P1's exit gate passes AND context is still GREEN. Requires its own measured economy re-tune
(the haul grows ~2.6×). **Recommendation: do NOT batch it.** The blueprint says S147 ships
"almost alone", and S148 building on an unproven clock is the exact failure the sequencing exists to
prevent. Listed so the deferral is a decision, not an omission.

### OUT OF SCOPE
Zones, walls, castle HP/guns, tower dormancy, projectiles, goblins, modes, balance. **CF1** (worker
click-to-build) stays open — opt-in only, zero live blast radius, unrelated to the clock.

---

## 3. RISKS + MITIGATIONS

| # | Risk | Mitigation |
|---|---|---|
| R1 | **`Date.now()` desync** — the blueprint's #1 CRITICAL | Zero wall-clock. Flip reads `world.tick` only. Grep-assert no `Date.now(` in the diff. |
| R2 | **The FIGHT gate silently breaks all 8 frozen-reference differential scenarios** (§5 D3) | `buildScenarioWorld` sets `matchPhase='FIGHT'` — one harness line; frozen reference stays byte-valid and the gate stays meaningful. |
| R3 | Cadence-zero would ship hazards at MAX frequency (§5 D1) | Gate the dispatch site; never touch the countdown constants. RNG streams stay byte-identical. |
| R4 | A silent serialization miss desyncs a joiner | FIELD_COVERAGE is tsc-forced for the row; the other 8 sites are SILENT → each is an explicit checklist item with a verification binding. |
| R5 | Protocol bump follows the spec's 2-site list and reds the gating suite | The 5-site checklist is transcribed above verbatim. |
| R6 | NONET freeze burns phase time (§5 D5) | Documented + unit-tested as accepted behaviour: deterministic, flips on resume via `>=`. |
| R7 | 5400-tick phases make a full-cycle test infeasible | Tests re-stamp `phaseEndsAtTick` directly — no production test-only seam. |
| R8 | A future session shortening the phase below 800 ticks silently breaks D1–D8 | A named guard test asserts `PHASE_DURATION_TICKS > 800` with the reason. |

---

## 4. TESTING

**Unit (new `src/state/matchPhase.test.ts`)**
- Flips exactly on the boundary tick, not one early/late (`>=` equality case).
- `phaseEndsAtTick` re-stamps to `tick + PHASE_DURATION_TICKS` at each edge.
- BUILD→FIGHT→BUILD→FIGHT over 4 edges with re-stamped short deadlines.
- No flip while `gameState !== 'PLAYING'`.
- Score is **exactly 0** across a whole BUILD; **strictly rising** across a whole FIGHT.
- Leader decay does not run with `LEADER_DECAY_ENABLED = false`.
- Guard: `PHASE_DURATION_TICKS > 800` (protects D1–D8).

**Determinism**
- `hostTick.differential.test.ts` D1–D8 stay green with the one-line `matchPhase='FIGHT'` harness set.
- NEW scenario **D9**: a full BUILD→FIGHT→BUILD cycle on short re-stamped deadlines, hashes equal every tick.
- `workerSim.differential.test.ts` — the REAL host-vs-worker gate (300 frames, netSnapshot JSON +
  `hashWorldState` byte-identical): a phase edge inside the 300 frames.
- **Host migration across a phase edge** — phase + deadline survive a promoted successor.
- Full vitest (2,148+ tests) · `tsc` 0 (vitest does NOT typecheck — run it).

**E2E** — the 4 hazard gating specs re-enable via `__TEST_HAZARDS_ENABLED__` and stay green; new
assertion that the HUD label flips and the countdown advances. `npm run e2e:gating` 39/39 + the
`e2e:protocol` lane (gating since S142, no `continue-on-error`).

**Ship gate** — `npm run build` · `verify-deploy` 4/4 · push.

---

## 5. A.0 STATE-DISCOVERY — PRIME-AUDIT DELTA TABLE

Method: 8-probe Workflow; **7 probes + synthesis died on the spend limit** (the S140/S141 pattern in
memory). 1 probe result salvaged from `journal.jsonl`; **the other 7 were re-run by hand via Bash and
are SELF-VERIFIED** — every row below cites a line read directly. Stated as a deviation: no
independent second source, so rows are single-source unless marked.

| # | Spec claim | Status | Actual | Consequence |
|---|---|---|---|---|
| **D1** | "set their spawner cadences to zero" (`SESSION_SPECS:83`, R14) | **REFUTED** | Cadence is `MIN + floor(rng()*(MAX-MIN+1))` (`spawner.ts:359,377,395,413`) — a **spark countdown**. `MIN=MAX=0` ⇒ span 1, countdown 0 ⇒ spawns on the **very next spark**. | **Zero = MAXIMALLY frequent, the exact opposite of OFF.** Following the spec literally ships all four hazards at max rate. Correct switch = the 4 dispatch gates (`physicsLoop.ts:100,107,114,121`). |
| **D2** | (unstated) touching the cadence is safe | **REFUTED** | Spawner is **skip-and-redraw**: it mints the request and redraws its countdown regardless, on a **separate RNG stream** per hazard (`spawner.ts:215-245`, comments say "sequences byte-unchanged"). | Editing MIN/MAX changes draw *values* ⇒ perturbs replay determinism. Gating at dispatch leaves every RNG stream **byte-identical** ⇒ zero replay churn. This is why D1's fix is also the cheap one. |
| **D3** | "Differential: BUILD→FIGHT→BUILD with identical hashes **host-vs-worker**" (`SESSION_SPECS:108`) | **REFUTED** | `hostTick.differential.test.ts` is **not** host-vs-worker — it is `runHostTick` vs a **frozen verbatim transcription** of the pre-S119 body (`:1-31`), which calls `tickScoring` unconditionally. Both worlds come from the same `buildScenarioWorld` (`:506-508`). | **HIGHEST CONSEQUENCE.** With `matchPhase='BUILD'` by default the new path accrues no score while the reference does ⇒ the wide hash diverges on `scoreProgress` ⇒ **D1–D8 all fail**. The real host-vs-worker gate is `workerSim.differential.test.ts` (300 frames). Fix = R2. |
| **D4** | "Both fields serialized + hashed + in FIELD_COVERAGE" reads as ~3 edits | **PARTIAL** | Tracing `rainbowSwitchTick` (a hashed tick scalar) gives **9 sites**; only the `FIELD_COVERAGE` row is TSC-FORCED (`Record<keyof World,…>`, `stateHashFull.ts:70`). The other 8 are **SILENT**. | Understates the work ~3×. Each silent site is an explicit checklist item + verification binding. |
| **D5** | (unstated) the tick clock always advances inside `runHostTick` | **PARTIAL** | Two further `world.tick++` sites: `main.ts:1593` (NONET freeze — advances tick and `continue`s **past `runHostTick` entirely**) and `main.ts:1637` (client path). | A NONET trial burns phase time and the flip lands on resume (`>=` absorbs it) — deterministic but must be documented + tested, not discovered later. |
| **D6** | "HUD: phase name + seconds remaining" | CONFIRMED (+bonus) | `class HUD` `render/ui.ts:243`, PIXI `Text`, pure-formatter+test pattern at `:48-72`. Client advances `tick` locally at 60 Hz (`main.ts:1637`) while both fields ride the 10 Hz snapshot. | Countdown is **smooth on the client for free**. No new sim state, no protocol cost beyond (b). No existing timer precedent — this is the first. |
| **D7** | "Protocol. Bump … Update `LOCAL_PROTO_V`" (2 sites) | **REFUTED** | **FIVE** sites: `protocol.ts:178` const · `:251` `HelloMsg.protoVersion` type literal (tsc tripwire) · `:60-177` changelog · `protocol.test.ts:75` title + `:87` assertion · `smoke.spec.ts:71`. Authoritative list lives only in a test comment (`protocol.test.ts:84-86`). | Following the spec reds the gating vitest suite and fails `tsc`. Transcribed into §2(e). Drift has recurred 4× (S133/139/140/141). |
| **D8** | (S138 audit) three stale protocol literals in `smoke.spec.ts` | **REFUTED — obsolete** | All three are gone; the file now derives from `LOCAL_PROTO_V` (`:675,702-704,712,717`). | **Do not plan those edits.** Prior-audit findings do not carry across sessions. |
| **D9** | (unstated) golden hash literals must be re-recorded | CONFIRMED ABSENT | No `toBe('<hex>')` hash literals in `save.replay.test.ts` / `hostTick.differential.test.ts`. | A cost that **is not there**. |
| **D10** | (unstated) `MAX_ACTIVE=0` would be an equivalent switch | **PARTIAL** | Only the **seagull** reducer self-gates (`seagullLifecycle.ts:134`); bomb/potato/rainbow do not. | `MAX_ACTIVE=0` would silently no-op D4's `dispatch(SPAWN_SEAGULL)` and break `seagull.test.ts`. Another reason to gate at dispatch. |
| **D11** | "@quarantine-flaky means the version gate can't fail the build" (S138) | **PARTIAL** | Still tagged (`smoke.spec.ts:626`) and grep-inverted, **but** since S142 P2 a dedicated gating `e2e-protocol` lane runs it (`e2e.yml:229-255`, no `continue-on-error`). | The escape hatch is **closed**. Do not drop the tag or the lane. |
| **D12** | `mcv_session_nonce` usable | **PARTIAL** | Present but **stale** (`S141-…`). | Use `file_contains`/`file_lacks`/`grep_count` only; no `nonce_match`. |

**Greenfield confirmed:** `matchPhase` / `MatchPhase` / `phaseEndsAtTick` / `PHASE_DURATION` return
**zero** hits across `src/` and `e2e/` — no collision, no migration.

**Blocking open questions: NONE.** Every Q in `SESSION_SPECS` §1 has an answer; every delta above has
a concrete resolution in §2.

---

## 6. DELIBERATION PLAN
Full tier ⇒ **mandatory 3-way Council** (Claude + Grok + Gemini), Battle Ledger, 2 rounds + quality
gate, 3+ challenges incl. tool/quality. CHECK = Triumvirate. Gemini via `gemini-3.1-pro-preview`
(2.5-pro retired). Then PRIME-AUDIT with a **runtime-verifiability** question: would this survive
`npm run build` + a real 2-peer join, or only a static parse?

## 7. ROLLBACK
Single-commit priority. `HAZARD_SPAWN_ENABLED = true` restores all four hazards in one line (R14).
The clock is additive: reverting the commit removes both fields and returns `tickScoring` to
unconditional. Protocol 23 → 22 is the same 5 sites.

## 8. EXIT GATE (blueprint-mandated, must ALL be true)
1. A differential cycle BUILD→FIGHT→BUILD with **identical hashes every tick**.
2. **Host migration across a phase edge** preserves phase + deadline.
3. Score **0** in BUILD, **rising** in FIGHT.
4. `tsc` 0 · full vitest green · `e2e:gating` 39/39 · `build` under charter · `verify-deploy` 4/4.
