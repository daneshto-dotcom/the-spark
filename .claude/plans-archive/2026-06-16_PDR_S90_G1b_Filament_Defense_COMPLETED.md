---
STATUS: COMPLETE / SHIPPED. P1 Filament a448fd6 · P2 DEFENSE f8adc57 · post-audit save.replay scoring coverage 7797b01 · post-audit BACKLOG drift + stray-file hygiene 9586c72. Gates: tsc 0 · vitest 1407→1423 · bundle 547.0 KiB < 550 · E2E 2-browser GREEN on tip (f8adc57 run 27604539310 success; P1 commit flaked on the UNRELATED Sym-F territorial placement test). Adversarial Triumvirate CHECK = SHIP (Gemini 5/5/5, 4 Grok refute-first findings filtered). Ultracode final 6-dim adversarial audit = SHIP (both correctness-critical dims CLEAN; AUDIT-1 no-indestructible + AUDIT-4 gate/decrement-agree positively confirmed; 5 surviving findings all doc/hygiene/test-net — 4 fixed, #5 tautology-test left harmless/superseded by 7797b01). MOTION + all G2 DEFERRED with logged carry-forward (see below). The DEFENSE render cue (armored glint + resist clang) was attempted then reverted → carry-forward. OPEN: user playtest (Filament income feel + #1 knob FILAMENT_INCOME_COMPLEXITY; Diamond/Lattice feel + knob DEFENSIVE_SEVER_CHARGE_COST).
SESSION: S90
TIER: Full (>30K batch — highest-tier rule; G1b combo behaviors + novel mechanism signal)
DATE: 2026-06-16
SIGNALS: external_user_facing (player-facing combos → Gemini required) · novel_mechanism (DEFENSE charge-gate behavior → +1 round)
DELIBERATION: 3-way Council (Claude-Opus + Grok-4.20-reasoning + Gemini-2.5-pro), 2 rounds, quality gate PASSED. Battle Ledger + PRIME-AUDIT below.
RESEARCH: 6-reader State-Discovery workflow (wf_f43b7c07-c8b) → .claude/plans/2026-06-16_PDR_S90_G1b_G2_RESEARCH_BRIEF.md
---

# PDR — S90 batch: G1b combo behaviors — ECONOMY Filament trickle (P1) + DEFENSE Diamond/Lattice anti-sabotage (P2)

**SCOPE DECISION (Council Option 1 — highest value-per-risk).** Of the user's priorities 2 (G1b: DEFENSE/MOTION/ECONOMY) + 3 (G2: traits + promotions), this batch ships the two Council-validated *legible* "geometry matters" verbs and DEFERS the rest:
- **SHIP:** P1 ECONOMY Filament income trickle · P2 DEFENSE Diamond/Lattice resist enemy *sabotage*.
- **DEFER (logged carry-forward):** MOTION Wheel/Star (both reviewers rated pure rotation low player-value — "visual noise" without a mechanical verb; revisit when it earns one) · G2-PROMO Dot→Square/Line→Circle (8× scoring jump needs a win-score rebalance + new visuals + playtest — own session; names captured: **Anchor**(Dot→Square) / **Spindle**(Line→Circle)) · G2-TRAITS (needs a `LOCKED_DECISIONS §6` lock-amendment + the territorial stiffnessMultiplier-stacking trap makes LOW families feel floppy — own session).

Execution order: **P1 (Filament, simplest) → P2 (DEFENSE).** Each an independent commit.

---

## P1 — ECONOMY: Filament (Dot→Line) income trickle  (Micro→Standard)

### 1. OBJECTIVE
A standing Filament bond earns a small per-tick score bonus *on top of* its existing magic-bond complexity, making "build a Filament to out-earn over time" a real strategic verb — and the player can SEE it earning.

### 2. SCOPE (files — verified file:line)
- `src/combos.ts:177` — add `isFilamentCombo(a,b)` one-liner (`lookupCombo(a,b).resultName === 'Filament'`, mirrors `isVortexCombo`). Order-dependent (Dot→Line only).
- `src/constants.ts` (after `FUNCTIONAL_BOND_CAP_PER_PRIM` ~:225) — `FILAMENT_INCOME_COMPLEXITY = 0.6` (Grok's conservative default vs runaway R12; doc-comment that the double-count [magic +2.0 AND trickle] is INTENDED — Filament IS the income combo — and this is the **#1 playtest knob**).
- `src/state/scoring.ts:79-92` (`computeComplexity` bond loop) — count `filamentBonds` where `isFilamentCombo(a.type,b.type)` AND not fouled (inherits the existing `fouledPrimitives` skip at :89); add `+ filamentBonds * FILAMENT_INCOME_COMPLEXITY` to the return (:104-108).
- **CUE (render-derived, both-players-safe):** `src/render/bondVisualRenderer.ts` / `structureRenderer.ts` — render a Filament bond with a gentle gold "earning" pulse, computed CLIENT-SIDE from the synced combo type (clients have the combo table). NOT a `world.effects` push (those are host-local, not serialized → only the host would see it). Render-layer only.

### 3. APPROACH
Extra complexity weight INSIDE `computeComplexity` (one accrual path → inherits fouled-skip + single-owner attribution + the mirrored `scoreByPlayer`/`scoreProgress` sync). Host-only (scoring is already host-gated); clients mirror the score. Determinism-clean: integer-count-then-multiply, fixed-arity sum (no collection float-sum → canonical-sort invariant N/A).

### 4. TESTING
- Unit (`scoring.test.ts`): a held Filament adds `FILAMENT_INCOME_COMPLEXITY` on top of its magic-bond complexity; a fouled Filament earns ZERO; a non-Filament magic bond is unaffected.
- Determinism: run-twice-from-seed byte-equal on a board with a Filament (the shared `save.replay.test.ts` does NOT exercise scoring — its own test, R9).
- Gates: tsc 0 · full vitest green · bundle < 550 KiB.

### 5. RISKS
- R12 runaway: Filament is the cheapest magic combo (Dot+Line), uncapped. Start at 0.6, do NOT pre-cap, treat as #1 playtest knob.
- Cue legibility: a silent bonus is a wasted feature (Gemini). The render-derived pulse is the minimum; transient "+1 flow" particles are a host-local nice-to-have (deferred).

---

## P2 — DEFENSE: Diamond (Tri→Tri) / Lattice (Sq→Sq) resist enemy sabotage  (Standard)

### 1. OBJECTIVE
A Diamond or Lattice bond costs an attacking player DOUBLE disruption charges to hostile-sever — so "build a Diamond to protect your key structure from the opponent's sabotage" is a real defensive verb, visibly armored.

### 2. SCOPE (files — verified file:line)
- `src/combos.ts` — add `isDefensiveCombo(a,b)` (`resultName === 'Diamond' || === 'Lattice'`; symmetric — both directions, no order caveat: Diamond=Tri→Tri, Lattice=Sq→Sq are self-paired).
- `src/constants.ts` — `DEFENSIVE_SEVER_CHARGE_COST = 2` (= current `MAX_DISRUPTION_CHARGES`, so an opponent must spend their ENTIRE budget to break one defensive bond — a meaningful premium, not invincibility).
- `src/state/disruptionManager.ts`:
  - `computeBaseCharge:102-113` — hostile + `isDefensiveCombo(primA.type, primB.type)` → `DEFENSIVE_SEVER_CHARGE_COST`; hostile non-defensive → 1; self-sever → 0. **`cause!=='player'` STILL returns 0 (UNCHANGED) — physics/creature/bomb bypass is preserved.**
  - `canSeverBond:68-86` — the hostile floor `disruptionCharges < 1` becomes `< requiredCost` (requiredCost = defensive ? `DEFENSIVE_SEVER_CHARGE_COST` : 1), so an opponent with 1 charge cannot even START breaking a Diamond.
- **CUE (render-derived, both-players-safe):** `src/render/bondVisualRenderer.ts` / `structureRenderer.ts` — render Diamond/Lattice bonds with a persistent "armored" visual (double-stroke / shield-tint), computed client-side from the synced combo type. Both players always see the armor → sets the right expectation (this is the legibility the Council demanded). A transient host-local "clang" on a resisted sever is a deferred nice-to-have.

### 3. APPROACH
The clean player-RMB-sever route IS the Vortex template (pure fn of synced state: bond endpoints + `disruptionCharges`, both synced; SEVER_BOND host-only; client mirrors the surviving-or-gone bond). NO new state, NO wire field, NO save bump, negligible bundle. The Voltkin/bomb absorb route + potato are EXPLICITLY OUT OF SCOPE (logged for a DEFENSE-v2 session — those need cross-tick state + are the bundle risk).

### 4. TESTING (PRIME-AUDIT-driven)
- **CRITICAL regression (R14):** a `cause:'physics'` overstretch sever STILL severs a Diamond (over-tensioned defensive structures must NOT become indestructible); a `cause:'creature'`/`'bomb'` sever still works on a Diamond (anti-sabotage ≠ hazard-immunity). Assert these explicitly.
- Unit (`disruptionManager.test.ts`): hostile player-sever of a Diamond/Lattice costs 2; rejected at 1 charge; non-defensive hostile still costs 1; self-sever still free.
- Determinism: run-twice byte-equal.
- Gates: tsc 0 · full vitest green · bundle < 550 KiB · e2e 2-browser lane green.

### 5. RISKS
- Grok dissent LOGGED: "partial defense is worse than none" (potato/bomb still kill it). MITIGATION: the *anti-sabotage* framing (not invincibility) + the persistent armored visual set the correct expectation. The codex/discovery text must say "resists enemy severing," NOT "indestructible." Playtest-gated — revisit if players read it as broken.
- MAX_DISRUPTION_CHARGES=2 means the opponent CAN still break a Diamond (spends both charges) → no softlock, the structure is not permanently unbreakable. This is intended (a premium, not a wall).

---

## COUNCIL R1+R2 + PRIME-AUDIT (S90, 2026-06-16) — BINDING

**Panel:** Claude-Opus (Prime Architect) · Grok-4.20-reasoning (Disruptor) · Gemini-2.5-pro (Auditor). Full tier, 2 rounds, quality gate PASSED (Grok 6 challenges + risk register R15–R20; Gemini full scorecard).

### Battle Ledger
| # | Decision | Claude | Grok | Gemini | Authority | Resolution |
|---|----------|--------|------|--------|-----------|------------|
| 1 | Filament ship | ship | AGREE (0.6) | ship + needs cue | unanimous | **SHIP** — complexity-weight, default 0.6, + render-derived cue. #1 playtest knob. |
| 2 | MOTION mechanism | direct rigid pose-write | AngularConstraint | — | Claude 1.75 | CONCEDED→Claude (engine has only a distance solver; angular = novel mechanism, more risk). ADOPT Grok drift-free `baseAngle+tick·const` math. *(moot — MOTION deferred)* |
| 3 | MOTION value | feasible, low value | lukewarm | **DEFER** | Gemini 1.75 + Grok | **DEFER** pure rotation (2/3 cool). |
| 4 | DEFENSE ship | clean route safe | DEFER (risk) | SHIP #1 (quality) | SPLIT (both 1.75) | **SYNTHESIS → ship CLEAN player-sever route only** + armored cue — neutralizes every Grok risk objection (they targeted the multi-path absorb/Set/bundle — all cut). Grok "partial worse than none" logged. |
| 5 | G2-PROMO | — | ship + rebalance + silhouettes | defer/all-or-nothing | both gate | **DEFER** (8× balance + visuals + playtest). Names captured: Anchor / Spindle. |
| 6 | G2-TRAITS | — | ship (cheap) | DEFER (invisible) | Gemini 1.75 + governance | **DEFER** (§6 lock-amend + territorial-stacking trap). |

**Confidence: HIGH** on technical resolutions; the single SPLIT (scope) was offered to the user, who declined to narrow → proceed with the recommended Option-1 slice.

### PRIME-AUDIT (Rule 20 — runtime-verifiability)
- **AUDIT-1 [CRITICAL] DEFENSE cause-gating:** the charge bump MUST apply ONLY to `cause==='player'`. `physics`/`creature`/`bomb` must keep bypassing (return true / charge 0) — else over-tensioned Diamonds become physically indestructible (world fills with unbreakable structures → softlock/desync). Confirmed `canSeverBond:78` + `computeBaseCharge:108` already gate on cause; the bump rides INSIDE the existing `cause==='player'` branch. **Test: physics-overstretch still severs a Diamond.**
- **AUDIT-2 [HIGH] cue must be client-visible:** `world.effects` is host-local + NOT serialized (verified — SCORE_TIER precedent), so a transient clang shows only on the host. Both DEFENSE-armored and Filament-earning cues are therefore **render-derived from the synced combo type** (client-computable) → both peers always see them, no wire change.
- **AUDIT-3 [MED] Filament double-count is an intended BUFF, not a bug** (inverts the S88 PRIME-AUDIT nerf lesson): a future auditor must not "fix" it. Doc-comment the intent on `FILAMENT_INCOME_COMPLEXITY`.
- **AUDIT-4 [MED] canSeverBond/computeBaseCharge must agree on cost:** if `canSeverBond` allows entry at <cost while `computeBaseCharge` returns 2, the orchestrator could drive charges negative. Both must read the same `requiredCost`. **Test: opponent with exactly 1 charge cannot sever a Diamond; with 2 can (and is left at 0).**
- **AUDIT-5 [LOW] determinism tests are bespoke:** `save.replay.test.ts` does NOT exercise scoring or the sever charge path → each behavior gets its own run-twice byte-equal test (R9).

### CHECK plan
Per priority: adversarial Triumvirate (RALPH:PATROL spec-conformance + GROK-ANALYST break-it/security + GEMINI-AUDITOR correctness/regression). END-OF-SESSION runtime audit (Rule 22) before /handoff.

## CARRY-FORWARD (logged — never silently dropped)
- **MOTION Wheel/Star** — direct rigid pose-write (clone vortex.ts), midpoint pivot, drift-free `baseAngle+tick·const` sin/cos precomputed at module load, component dedupe (R11), R10 sweep-through accepted. DEFERRED: needs a mechanical verb to justify it (both reviewers cool on pure rotation).
- **DEFENSE v2** — Voltkin-bolt/bomb absorb-first-hit via host-only `Set<BondId>` (reset in `reconcileFouledPrimitives`) + a `DEFENSE_RESIST` cue; potato deliberately excluded (deletes prims directly — anti-sabotage ≠ hazard-immunity). Bundle risk (~1.5–3 KiB) → own session.
- **G2-PROMO** — promote Dot→Square (**Anchor**) + Line→Circle (**Spindle**) to magic WITH: a +win-score rebalance (R16 — 8× jump), silhouettes, a discovery toast. `combos.test.ts:24,26` counts → 14; `:71-77` repoint off Dot→Square; `LOCKED_DECISIONS §6` amend.
- **G2-TRAITS** — rule-based family stiffness traits (only live axis); needs `LOCKED_DECISIONS §6` lock-amendment + watch the territorial stiffnessMultiplier stacking (LOW → 0.06 effective).
- **DISCUSS (deferred):** combinatorial depth 6^6 ≈ 46k — memory/combinatorial-depth-discussion.md.
