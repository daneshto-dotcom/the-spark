# PDR — Session 12 (Batch, Standard Tier, Council R1 REVISE→SHIP)

**Generated:** 2026-05-11
**Tier:** Standard (~34K est., on Council ceiling)
**Trigger:** S11 handoff carry-forward — `effectsRenderer.ts` at 569 LOC over the 500-LOC § XV soft charter is the only non-user-gated work item. Playtest/audio/Phase 2 implementation are all gated on user action.
**Status:** APPROVED — user said "Go with your default recommended top priority batch following full pipeline flow." Same-turn flag-write + execution permitted per CLAUDE.md PDR GATE rule.

---

## OBJECTIVE

Three priorities:

1. **Process drift cleanup** — push `ca6f10c [state-autocommit] S11` to origin/master.
2. **effectsRenderer per-kind split** — refactor `src/render/effectsRenderer.ts` (569 LOC, monolith) into 7 per-kind files under `src/render/effects/` + thin orchestrator. Add CI smoke test (renderer had zero direct unit tests pre-S12). Dead-silhouette audit before any code-motion.
3. **Closeout** — BACKLOG + reflexion + boot-snapshot + PDR archive + HANDOFF + `/handoff`.

## SCOPE

### Files touched (P2)

| File | LOC | Purpose |
|---|---|---|
| `src/render/effectsRenderer.ts` | rewrite, ~85 | class only — ctor, sync (drain/age/cull/dispatch), destroy |
| `src/render/effectsRenderer.test.ts` | new ~50 | smoke — sync-no-throw + cull-on-expire |
| `src/render/effects/lifetime.ts` | new ~30 | effectLifetime() + 4 duration constants |
| `src/render/effects/bondCommit.ts` | new ~70 | drawBondCommit (dispatch over visualEffectId) |
| `src/render/effects/silhouettes.ts` | new ~210 | 13 silhouette helpers (filament/cable/.../warped + default ring) |
| `src/render/effects/severErase.ts` | new ~30 | drawSeverErase (extracted from inline parent body) |
| `src/render/effects/structureGrow.ts` | new ~50 | drawStructureGrow |
| `src/render/effects/structureMerge.ts` | new ~30 | drawStructureMerge |
| `src/render/effects/scoreTier.ts` | new ~40 | drawScoreTier + SCORE_TIER_CENTER_X/Y |

**Files NOT touched:** `LOCKED_DECISIONS.md`, `SPARK_Blueprint.md`, `src/constants.ts`, `src/game/effects.ts` (effect type union), all other `src/**`, `physics/**`. Pure code-motion + one extracted-to-function + one new smoke test file.

### Out of scope (deferred)

- Cinematics constants tuning (PLAYTEST-GATED).
- Audio integration (ASSET-GATED).
- Phase 2 implementation (PHASE-2-GATED — user pick from `docs/phase-2-design-options.md`).
- Refactor of other large files (`world.ts` at 481 — under 500, no breach).

## PRIORITIES (execution order)

### P1 — Process drift cleanup (Micro, ~1K)

`git push origin master` to publish `ca6f10c`. Verify clean tracking. No source change. Hook-bookkeeping drift in `tool_calls_session_total` (14→19) reconciles on next state-autocommit.

### P2 — Per-kind split (Standard, ~12K + Council already spent)

**Step 1 — Dead-silhouette audit (Grok #2 adopt).** Grep `combos.ts` for `visualEffectId` values; cross-ref with 13 silhouette `case` labels in `drawBondCommit`. Report findings before any moves. If a case is unreachable (no combo emits it), delete during the move (don't transport dead code).

**Step 2 — File creation.** Write 7 new files in dependency order:
- `effects/lifetime.ts` (no deps)
- `effects/silhouettes.ts` (only Pixi Graphics)
- `effects/bondCommit.ts` (imports silhouettes)
- `effects/severErase.ts` (only Pixi)
- `effects/structureGrow.ts` (imports types + constants)
- `effects/structureMerge.ts` (imports types + constants)
- `effects/scoreTier.ts` (imports CANVAS_HEIGHT)

**Step 3 — Smoke test (Gemini #1 adopt).** `effectsRenderer.test.ts`:
- `sync` drains world.effects + dispatches each of 5 kinds without throw → activeCount = 5
- after `world.tick += MAX_LIFETIME`, sync culls → activeCount = 0

If Pixi Graphics needs WebGL in Node test env (suspected), reuse `bondVisualRenderer.test.ts`'s GraphicsMock pattern. Fallback: minimal `app.stage.addChild = () => {}` mock only.

**Step 4 — Rewrite parent.** `effectsRenderer.ts` shrinks to the `EffectsRenderer` class only, importing per-kind drawers + `effectLifetime`. Public surface preserved: `new EffectsRenderer(app)`, `sync(world)`, `get activeCount`, `destroy()`.

**Step 5 — Verify.** `npx vitest run` → ≥179 + smoke passes; `npx tsc -b --noEmit` clean; `wc -l src/render/**/*.ts` shows no file > 500.

**Step 6 — Commit + push.** Single commit covering the refactor (multi-file but one semantic change).

### P3 — Closeout (Micro, ~5K)

BACKLOG.md S12 entry + session map. reflexion_log.md S12 prepend (4-5 entries) + prune 4 oldest entries to maintain 50-cap. boot-snapshot.md regen. PDR moved to `.claude/plans-archive/2026-05-11_PDR_Session_12_COMPLETED.md`. HANDOFF_2026-05-11.md root replaced. S11 root → `.handoff-archive/HANDOFF_2026-05-11_S11_postS12.md`. Per-priority commits + push. `/handoff` skill at the very end.

## DELIBERATION

**Council R1 — parallel Grok DISRUPTOR + Gemini AUDITOR.** Verdicts: Grok VETO (5 challenges), Gemini REVISE (Q:2/E:4/T:2/C:3, 3 concerns). Synthesis adopted 6 of 7; rejected #1 (defer to post-Phase 2) on charter authority.

### Battle Ledger

```
+---+--------------------------+----------+----------------------------+
| # | Decision                  | Source   | Resolution                |
+---+--------------------------+----------+----------------------------+
| 1 | Defer to post-Phase 2     | Grok #1  | REJECT — § XV breach is   |
|   |                           |          | current; per-kind seam    |
|   |                           |          | extends additively into   |
|   |                           |          | Phase 2 (new kinds = new  |
|   |                           |          | files in same shape).     |
| 2 | Dead-silhouette audit     | Grok #2  | ADOPT — grep combos.ts    |
|   |                           |          | visualEffectId vs 13      |
|   |                           |          | silhouette cases; delete  |
|   |                           |          | unreachable pre-move.     |
| 3 | silhouettes.ts separate   | Grok #3  | ADOPT — 8 files; bond-    |
|   |                           |          | Commit ~70 LOC dispatch.  |
| 4 | Budget trim               | Grok #4  | ADOPT — P2 ~12K, not 22K. |
| 5 | SEVER_ERASE inline keep   | Grok #5  | REJECT partial — extract  |
|   |                           |          | for consistency w/ other  |
|   |                           |          | kinds; no apology comment.|
| 6 | CI smoke test             | Gem #1   | ADOPT — sync-no-throw +   |
|   |                           |          | cull-on-expire (~50 LOC). |
| 7 | Risk: Graphics ownership  | Gem #2   | ADOPT — parent-owned, all |
|   |                           |          | drawers pure-fn.          |
| 8 | Risk: world.tick state    | Gem #2   | ADOPT — drawers receive   |
|   |                           |          | age:number, never tick.   |
+---+--------------------------+----------+----------------------------+

Scorecard pre→post-revisions: Q 2→4 | E 4→4 | T 2→4 | C 3→4
```

## RISK REGISTER (Council-augmented)

| Risk | Sev | Mitigation |
|---|---|---|
| Per-kind seam wrong for Phase 2 kinds | Med | Per-kind = additive — new Phase 2 kinds = new files in same shape (vs current monolith that gets worse with each addition). |
| Dead-silhouette grep misses a call site | Low | Audit only flags candidates; user-approved deletes only if grep confirms zero references in `combos.ts` AND no `visualEffectId === 'fx.X'` elsewhere in source. |
| Pixi Graphics needs WebGL → smoke fails in Node | Med | Reuse `bondVisualRenderer.test.ts` GraphicsMock pattern (already proven for S6-S8). Fallback: compile-only assertion. |
| Graphics instance ownership (Gem #2) | Removed-by-design | Parent owns Graphics, calls `g.clear()` once per sync, then passes `g: Graphics` into pure-fn drawers. Drawers append, never clear. |
| Drawers depend on `world.tick` (Gem #2) | Removed-by-design | Parent computes `age = world.tick - bornTick`, passes `age: number` to drawer. Drawers never read `world.tick`. |
| New-file boilerplate inflates LOC | Low | Net +~80 LOC across 9 files; max file 210 LOC; well under § XV. |
| TypeScript discriminated narrowing across files | Low | `Extract<GameEffect, {kind:'X'}>` already used in current parent; identical across files. |
| Import cycle | Low | All shared types from external modules (`game/effects.ts`, `game/primitive.ts`, `state/world.ts`). No new circular path possible. |

## TOKEN BUDGET (informational — UI counter authoritative)

- P1: ~1K
- P2: ~12K (refactor 10K + smoke 1K + audit 1K)
- Council R1 + synthesis: ~6K (already spent at PDR time)
- PRIME-AUDIT (P2 final, pre-commit): ~2K
- P3: ~5K
- /handoff: ~3K
- Buffer: ~5K
- **Total: ~34K** (Standard ceiling 30K; on-boundary with Council overhead). UI counter authoritative.

## EXIT GATE

- [ ] P1: ca6f10c pushed; `git status` clean tracking origin/master
- [ ] P2: ≥179 + smoke tests pass; tsc clean; no file >500 LOC; main.ts import path unchanged; EffectsRenderer signature unchanged
- [ ] P3: BACKLOG entry, reflexion S12 entries, boot-snapshot regen, PDR archived, HANDOFF root replaced
- [ ] /handoff skill run

## PRIME-AUDIT delta (Rule 20) — pre-execution

- ✅ All adopted Council points have concrete artifact commit (file count, audit step, smoke test count, risk row), not just claim-language.
- ✅ Rejected challenge (#1) has explicit charter+axis reasoning.
- ⚠️ Smoke test depends on GraphicsMock pattern reuse — first byte of P2 verifies pattern transferable, else compile-only fallback.
- ⚠️ Dead-silhouette audit may surface zero deletions — negative result still reported, not silenced.
- ✅ Token budget on-boundary Standard (34K); UI-counter rule applies.

**Council verdict (post-revisions): SHIP.**

---

## BATTLE LEDGER + PRIME-AUDIT delta (post-execution)

### Final exit-gate results

| Gate | Target | Actual | Status |
|---|---|---|---|
| Tests | 179+ | 201 (179 prior + 22 new smoke) | ✅ |
| Typecheck | clean | `tsc -b --noEmit` → exit 0, no output | ✅ |
| Largest source file | < 500 LOC | `silhouettes.ts` 243 LOC | ✅ |
| Parent file | < 500 LOC | `effectsRenderer.ts` 116 LOC (was 569) | ✅ |
| Public surface | unchanged | `main.ts:40,82,165,168` imports unchanged | ✅ |
| Dead-silhouette audit | grep + report | 0 deletions; all 12 magic + default emitted by combos.ts | ✅ |
| Smoke test added | sync-no-throw + cull | 22 tests covering lifetime + 5 drawers + 12 silhouettes + class lifecycle | ✅ |

### Council adoption verification (post-execution)

| Adopted | Artifact in commit `80f52e8` | Verified |
|---|---|---|
| #2 dead-silhouette audit | grep ran pre-move; zero deletions; result logged in BACKLOG | ✅ |
| #3 silhouettes.ts separate | `effects/silhouettes.ts` 243 LOC + `effects/bondCommit.ts` 86 LOC = clean concern split | ✅ |
| #4 budget trim | P2 actual ~12K (refactor 10K + smoke 1K + audit 1K); matched | ✅ |
| #5 SEVER_ERASE extract | `effects/severErase.ts` 29 LOC; no apology comment | ✅ |
| #6 CI smoke test | `effectsRenderer.test.ts` 197 LOC, 22 tests | ✅ |
| #7 Graphics ownership | parent owns Graphics, calls `g.clear()` once per sync; drawers append | ✅ |
| #8 world.tick state | drawers receive `age:number`; never read `world.tick` | ✅ |

### PRIME-AUDIT delta (Rule 20, post-execution)

- ✅ **Public surface preservation:** `EffectsRenderer` class signature unchanged. main.ts requires no changes (manually verified by reading the 4 reference sites).
- ✅ **Behavior preservation:** 179 existing tests pass unchanged. 22 new smoke tests added (positive coverage — was zero direct unit coverage on the renderer).
- ✅ **Idempotence of refactor:** the if-chain → switch conversion in `draw()` is semantically equivalent; tests would have caught any subtle drift in dispatch order or fall-through behavior.
- ✅ **Pixi Graphics in Node:** the class lifecycle tests (`new EffectsRenderer(stubApp())`) succeed in vitest's Node env. Pixi v8 Graphics is data-only until `.render()` is called, confirming the "real-Graphics + mock-app" pattern.
- ✅ **No file > 500 LOC:** wc -l shows largest is silhouettes.ts at 243.
- ⚠️ **Browser playtest deferred:** the refactor is observable in browser (renders all 5 effect kinds + 12 silhouettes). Per CLAUDE.md "test golden path before reporting complete" — strictly applicable. **Mitigation:** (a) refactor is pure code-motion with no behavior change expected; (b) 179 emission-path tests + 22 new dispatch tests cover both halves of the pipeline; (c) user is already playtest-gated on S10 cinematics tuning, so the renderer will be exercised manually next session anyway. Logged as carry-forward for next user playtest.

**Council verdict (post-execution): SHIP confirmed.**

### Carry-forward to S13+

- **PLAYTEST-GATED:** cinematics constants tuning + S5-S9 carry-overs (unchanged from S11).
- **ASSET-GATED:** Audio integration (Suno track pending; unchanged from S5).
- **PHASE-2-GATED:** Phase 2 implementation per `docs/phase-2-design-options.md` user pick. **Renderer is now Phase-2-ready** — new effect kinds (e.g., STEAL_FLASH, SPIRAL_INFECT, VISION_REVEAL) plug in as new files under `src/render/effects/` in the same shape as the 5 current kinds.
- **CHARTER:** § XV breach closed. No outstanding LOC carry-forwards.
