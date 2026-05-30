# PDR — S56 Batch: Client AttractDrag Parity + Anti-Bloat Trim

- **Session:** S56
- **Date:** 2026-05-30
- **Tier:** Standard (batch; highest-tier member = P1 load-bearing netcode)
- **Deliberation:** 3-way Council (Claude + Grok + Gemini), 1 round + Battle Ledger; PRIME-AUDIT + Runtime-Verifiability pass
- **Status:** DRAFT → Council → PRIME-AUDIT → user `go` (user pre-approved scope "top recommended priorities" 2026-05-30)

---

## P1 — Client AttractDrag prediction (Player-2 parity bug) 🔴 URGENT

### 1. OBJECTIVE
Player 2 (the network client/joiner) must see a free spark **glide to follow their cursor** while drag-attracting it out of the spawner — identical to Player 1 (host/solo). Today P2's dragged shape stays frozen at spawn-center and only "teleports" to the release point on LMB-up. Playtest-reported (cross-network, 2026-05-30). Scope = **self-view parity**; opponent-view (host seeing P2's in-progress drag, S52 Δ6) consciously DEFERRED.

### 2. ROOT CAUSE (empirically verified this session)
- The follow feel is produced by `Controls.applyPerSubstep()` → `stepAttractLerp()` ([controls.ts:197-220](../../src/input/controls.ts)).
- `applyPerSubstep()` is called in **exactly one place**: inside `stepPhysics()` ([physicsLoop.ts:83](../../src/physics/physicsLoop.ts)).
- `stepPhysics()` is gated `!isClient` ([main.ts:454-456](../../src/main.ts)). **→ Gap 1: the client never runs the prediction.** Spark sits at last-snapshot pos (spawn). PLACE_FROM_FREE on release → host places → snapshot → "teleport".
- **Gap 2:** `applySnapshotCore` does `world.freeSparks.clear()` + rebuild-as-new-object-at-snapshot-pos every `needsFullApply` ([save.ts:378,419-433](../../src/state/save.ts)). The S52 dragLock only guards `interpolatePositions` (the lerp), NOT this full-apply — so a dragged spark is reset to spawn at 10Hz even when prediction runs → sawtooth jitter.
- This is a "half-wired mechanism": S52 built the dragLock to *preserve* a local prediction that was never *produced* and is *incompletely shielded*. Same failure class as S55's `errorLatched` (declared/checked/reset but never set).

### 3. APPROACH (Architecture 1 — recommended; Architecture 2 presented to Council)
**Arch 1 — complete the S52 dragLock mechanism, reuse host code:**
- **(Gap 1)** In the per-tick `while` loop, when `world.gameState==='PLAYING' && isClient`, run `controls.applyPerSubstep()` × `PHYSICS_SUBSTEPS` (8) — byte-identical lerp cadence to the host (480 lerps/s @ rate 0.06). Replaces the bare `world.tick++` in the client branch with `{ predict ×8; world.tick++ }`. Reuses the exact host code path → maximal parity, zero duplication.
- **(Gap 2)** In `ClientSync.interpolateInto`, inside the `needsFullApply` block: capture the drag-locked spark's `pos`/`prevPos` BEFORE `applyNetSnapshot`, restore them AFTER. `interpolatePositions` already skips the locked spark. Net: the dragged spark's position is fully client-owned during the gesture. ~8 LOC, localized to sync.ts; closes the documented dragLock intent at the one place it leaked.

**Arch 2 (alternative):** add `predictedPos: Vec2` to the AttractDrag control state (client-owned, immune to snapshot rebuild); new `Controls.predictClientDrag()` writes it onto the spark each frame after `interpolateInto`. Avoids touching the net-apply path but duplicates the prediction concept + adds control state. Council to arbitrate.

**Host/solo path unchanged.** `interpolateInto` is client-only ([main.ts:678](../../src/main.ts)); `applyPerSubstep` on host still runs via `stepPhysics`. Reconciliation on release is the existing S52 `pendingPlaceFromFree` 300ms TTL.

### 4. SCOPE / FILES
- `src/main.ts` — client branch of the per-tick loop: run prediction ×8 (~3-5 LOC).
- `src/net/sync.ts` — `interpolateInto` preserve/restore around `applyNetSnapshot` (~8-10 LOC).
- `src/net/sync.test.ts` — NEW unit: drag-locked spark pos survives a `needsFullApply` snapshot that would reset it to spawn.
- `src/input/controls.test.ts` — OPTIONAL pure gating predicate if extracted.
- `e2e/smoke.spec.ts` + `e2e/helpers.ts` — NEW 2-bundle test: joiner mid-drag spark.pos tracks cursor (not frozen at spawn).
- OUT OF SCOPE: opponent-view streaming (S52 Δ6); any protocol/intent change; host/solo behavior.

### 5. RISKS / EDGE CASES
- **R1 feel mismatch** — client runs only the lerp (no verlet/collision/bounds). Mitigation: lerp dominates host motion too (verlet residual is cosmetic); authoritative truth doesn't track the drag anyway. Perceptible feel = identical.
- **R2 host despawns dragged spark mid-drag** (free-spark cap, `enforceFreeSparkCap`) — spark vanishes from snapshot → `applyPerSubstep` null-check resets to Idle (graceful drag-end). Acceptable; documented.
- **R3 placement reject** (energy/zone/territory) — host leaves spark Free at spawn; after 300ms TTL the snapshot converges spark→spawn (existing S52 "natural convergence"). Acceptable snap-back.
- **R4 sync.ts apply-path edit** is sensitive (defense-in-depth try/catch, schemaVersion). Mitigation: preserve/restore is purely additive around the existing call; unit test pins it.
- **R5 jitter regression** if Gap 2 mis-closed — the preserve/restore unit test is the guard.

### 6. TESTING / VERIFICATION (Runtime-Verifiability mandated — netcode + state-machine)
- Unit: `interpolateInto` preserves a drag-locked spark across a resetting snapshot (node, no DOM). Existing 871 stay green; `tsc -b` clean.
- E2E (Playwright 2-bundle): joiner drags spark; assert `spark.pos` ≈ cursor mid-gesture (delta below threshold), NOT at spawn-center; then place + assert primitive lands. Run `--repeat-each=3 retries=0` (S55 flake-hardening pattern).
- Manual: user 2-peer smoke (parallel; gated on billing/friend).

### 7. ROLLBACK
Both edits additive + isolated; revert the 2 hunks (main.ts loop, sync.ts preserve) to restore prior behavior. No schema/protocol/persistence change → no migration risk.

### 8. SUCCESS CRITERIA
P2's dragged spark visually tracks the cursor with no 10Hz jitter and no teleport; placement lands at release point; 871→(871+N) unit green; E2E green ×3; bundle ≤ +0.2 KB; host/solo unaffected.

---

## P2 — Anti-bloat per-file LOC trim

### OBJECTIVE / SCOPE
Reduce the two genuine §XV per-file-LOC charter violators via behavior-preserving extraction: `src/render/audioManager.ts` (982 LOC) and `src/main.ts` (901 LOC, +P1). **Honest framing:** this serves code-health/maintainability, NOT bundle KB (extraction is bundle-neutral; the 500 KB target is soft + unenforced — verified: no `chunkSizeWarningLimit` in vite.config.ts). Match the project's S14/15/16/S55-P3 extraction pattern.

### APPROACH (candidates — Council to confirm targets/order)
- `audioManager.ts` → extract the SFX synth (clave/fart envelope + osc graph) and/or the localStorage settings schema into `src/render/audio/*.ts`; keep the public API surface stable (re-export). Pure-helper exports already test-covered.
- `main.ts` → candidate extraction of the client/host snapshot-loop orchestration or the lobby-diagnostics strip builder into a named module (mechanical, zero behavior change).

### TESTING / ROLLBACK / SUCCESS
- 871+P1 unit stay green; `tsc -b` clean; bundle ≤ ±0.3 KB (extraction overhead tolerated). E2E baseline+SymA+SymF green. Behavior-preserving = no new logic. Revert = move code back. Success: both files under or materially closer to 500 LOC, zero behavior delta.

---

## PARALLEL (user action — not a code priority)
🔴 **GitHub Actions billing** — github.com/settings/billing → Payment information + Plans/usage → Spending limit > $0. On user confirm: redeploy P3 (072ec44) + verify run goes green. Blocks CI/Deploy for all pushes until resolved.

## DELIBERATION QUESTIONS FOR COUNCIL
1. Arch 1 (preserve-in-sync + reuse applyPerSubstep) vs Arch 2 (client-owned predictedPos)?
2. Gap-2 closure: preserve/restore around applyNetSnapshot, or make applyNetSnapshot dragLock-aware directly?
3. Client cadence = mirror PHYSICS_SUBSTEPS (8×/tick) — correct, or feel/perf risk?
4. Edge cases R2/R3 handled acceptably, or need explicit guards?
5. Test sufficiency: preserve/restore unit + 2-bundle E2E — enough runtime proof?
6. P2 targets/order; confirm bundle-neutral framing; any regression traps in audioManager extraction?
