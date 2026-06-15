---
STATUS: COUNCIL-COMPLETE (R1 + PRIME-AUDIT) — awaiting user `go`
SESSION: S88
TIER: Standard (10–30K; batch)
DATE: 2026-06-15
---

> **Binding revisions live in the COUNCIL R1 + PRIME-AUDIT section at the bottom — they override the draft body where they differ.**

# PDR — S88 batch: G3a in-match Discovery loop + roadmap audit-error correction

## CONTEXT / PRIME-AUDIT delta (Rule 20/21 — why this is NOT "G1a + G3a")

State-discovery (4-reader map + direct source read) overturned the roadmap's G1a premise:

- `scoring.ts:90` reads `lookupCombo(a,b).isMagical` **every tick** to split bonds.
- `scoring.ts:104-108` + `constants.ts:211-225`: a **magic bond already earns `MAGIC_BONUS = SCORE_MAGIC_BOND(3) − SCORE_FUNCTIONAL_BOND(1) = +2.0`, UNCAPPED**; a functional bond earns `+0.25`, capped at `floor(1.5×prims)`. That is an **8× premium**, live since S76, with a passing test (`scoring.test.ts:89`).
- Therefore the roadmap line *"magic earns no premium… scores the same as a placeholder"* is **factually false**, and implementing G1a literally (+0.75 magic) would **NERF magic by 62%** (2.0 → 0.75). **G1a is dropped.**
- Confirmed-true audit rows: 24/36 placeholders (`combos.ts:126`), `areaMultiplier` dead, magic-12 have **no behaviors** (the real gap = G1b, future), and **G3a is valid** — nothing in-match celebrates discovery; the Codex tracks only *godly* localStorage unlocks.

This PDR therefore = **G3a (the valid item) + a roadmap correction** so the error doesn't recur.

---

## P1 — G3a: in-match "NEW COMBO!" discovery toast + per-match discovered counter

### 1. OBJECTIVE
First time a **named magic combo** (the magic-12) is formed in a match, every peer sees a transient center-screen toast **"NEW COMBO — <name>!"** (e.g. Filament), and a HUD counter shows **"Combos N/12"** for the match. Deterministic, 1v1-client-mirror-safe, no wire-protocol bump.

### 2. SCOPE (files)
- `src/state/worldTypes.ts` — 3 additive-optional synced fields: `discoveredCombos?: Set<ComboKey>` (in-mem Set), `comboToastTick?: number` (host-stamped on a NEW discovery), `lastDiscoveredComboName?: string` (resultName for the toast text).
- `src/state/save.ts` — serialize/deserialize the 3 fields following the `rainbowSwitchTick` additive-optional pattern (`discoveredCombos` ⇄ `string[]`, emitted only when non-empty; pre-S88 snapshots stay byte-identical, **no PROTOCOL_VERSION bump**).
- `src/state/placePrimitive.ts` (+ the free-place path) — host-side detection at the bond-formation site: for each newly-formed bond, if `lookupCombo(a,b).isMagical && !discoveredCombos.has(key)` → add key, `comboToastTick = world.tick`, `lastDiscoveredComboName = outcome.resultName`. Per-match GLOBAL (any seat's formation counts; celebrated on all peers — rainbow-flyover global-reach precedent). O(1) Set ops; magic-only path.
- `src/render/comboToastRenderer.ts` (NEW) — exported pure `comboToastPose(elapsed, duration, w, h) → {active, alpha, scale, y}` (no RNG/clock; `INACTIVE_POSE` outside the window guards tick-rewind). `sync(world)` polls `comboToastTick`, renders a single `Text` "NEW COMBO — <name>!". **Mounted on the HUD/main-stage layer, NOT `aboveFogLayer`** → the `fog.spec` `aboveFogChildren===8` contract is untouched (a HUD notification is screen-space, not world-space).
- `src/render/ui.ts` — discovered-counter `Text` ("Combos N/12") created in ctor, updated in `sync()`/`drawMultiplayerHUD`.
- `src/main.ts` — construct `ComboToastRenderer`, call `.sync(world)` in the render loop.
- `src/constants.ts` — `COMBO_TOAST_DURATION_TICKS` (~120 = 2s) + optional `__TEST_COMBO_TOAST_DURATION_TICKS__` seam (mirror of flyover). **No user-locked constant touched → `constants.lock.test.ts` untouched.**
- `src/state/gameMode.ts` — clear the 3 fields on `START_GAME` + `RETURN_TO_TITLE` (where `rainbowSwitchTick` is cleared).

### 3. APPROACH / DESIGN RATIONALE
- **Synced-tick + pure-pose** is the ONLY reliable 1v1 transient pattern (S84 lesson: a one-shot `world.effects` entry reaches the 10Hz client ~1/6 of the time). Mirrors `rainbowFlyoverRenderer` exactly.
- **Magic-12 only**: the 24 placeholders have generic `Bond_X_Y` names — not worth celebrating; counter denominator = 12.
- **Global per-match** (matches roadmap "per-match counter" + celebratory intent). *Alternative considered: per-player discovery — rejected as heavier + off-spec; flag for Council.*
- **HUD layer (not aboveFog)** deliberately avoids the `fog.spec` children-contract churn that bit S84/S87.

### 4. TESTING
- `comboToastRenderer.test.ts` (NEW, unit): pose inactive before `elapsed<0` & after `elapsed>=duration`; `INACTIVE_POSE` on rewind; alpha ≤ photosensitivity cap across the window.
- `discovery detection` (new describe in `scoring.test.ts` OR new `discovery.test.ts`): first magic-combo formation stamps `comboToastTick` + adds key + sets name; **second** formation of the same combo does NOT re-stamp; a **functional** bond does NOT toast; fields cleared on `START_GAME`.
- `save.test.ts`: additive-optional round-trip of all 3 fields + a non-discovery world serializes WITHOUT the keys (byte-compat proof, like `rainbowSwitchTick`).
- e2e: light — DEV probe `__SPARK__.getDiscovery()` asserts a magic-bond formation increments the count (HUD pixel asserts are `.fixme`-blocked per `smoke.spec` Sym E, so probe + unit carry it).
- Gates: `tsc --noEmit` 0 · full vitest (1370 → ~1383) · bundle index < 550 KiB (expect +<1 KiB; ~8.4 KiB headroom) · e2e lane green.

### 5. RISKS / MITIGATIONS
- *Determinism* — discoveredCombos mutated host-side at deterministic bond-formation order; counter is order-independent; `comboToastTick` = last-discovery tick. Client renders from synced fields only. ✓
- *Wire compat* — additive-optional, no bump; both peers in a match share the build (protocol gate). ✓
- *Redundancy bonds / free-place* — detection must hook BOTH bond-creation paths (carried→target AND redundancy weaving) or a combo formed via the second path won't toast. Audit both call sites.
- *Foul interaction* — discovery = formation, independent of income/foul; a fouled-structure magic bond still counts as discovered (correct).

### 6. ROLLBACK
Single revert; fields additive → no migration, old saves load unaffected.

### 7. ESTIMATE
~18–24K tokens; ~9 files; +<1 KiB bundle; +~13 tests.

### 8. DELIBERATION PLAN
Standard tier → 3-way Council (Claude+Grok+Gemini) on the open design choices (global-vs-per-player; magic-12-vs-all-36; HUD-layer-vs-aboveFog; detection call-site completeness) + PRIME-AUDIT before presenting for `go`. CHECK = Triumvirate.

---

## P2 — correct the BACKLOG roadmap audit error (Micro, within batch)

### OBJECTIVE
Stop the false-premise from recurring: fix the `isMagical` row of the S86 "honest gap" table + the G1a item to reflect reality (magic already earns +2.0/8×, uncapped; the real unmet gap is **G1b behaviors**, not scoring).

### SCOPE
`BACKLOG.md` only — amend the gap-table row + the G1 bullet; add a one-line "S88 PRIME-AUDIT correction" note. (BACKLOG.md is the MCV-bound surface → this edit will be bound via the session's `verification[]`.)

### TESTING
Doc-only; verified by re-read + the session MCV `file_contains` assertion.

---

## COUNCIL R1 + PRIME-AUDIT (S88, 2026-06-15) — BINDING

**Panel:** Claude (Supervisor) · Grok-4.20-reasoning (ANALYST) · Gemini-2.5-pro (AUDITOR). 3-way, 1 round.

### Battle Ledger — CONVERGED (unanimous)
- **Drop G1a:** UNANIMOUS. Live +2.0/8× premium with a passing test since S76 is the de-facto spec; a silent −62% nerf is a worse correctness violation than the stale roadmap line.
- **4 design choices — UNANIMOUS:** (1) discovery scope = **GLOBAL per-match**; (2) toast set = **magic-12 only**; (3) render layer = **HUD/main-stage** (not aboveFog); (4) counter = **per-match** (resets on START_GAME).

### PRIME-AUDIT — adopted revisions (override the draft body)
- **R1 [HIGH] Same-tick simultaneous discovery** (Grok + Gemini): a single placement can weave MULTIPLE bonds → >1 NEW magic combo on ONE tick; a single `lastDiscoveredComboName` would silently drop the 2nd toast, and Gemini flagged a replay-determinism angle on which name "wins". **FIX:** field becomes `lastDiscoveredComboNames: string[]` = ALL combos newly discovered AT `comboToastTick`, collected in deterministic bond-creation order; renderer shows all (join `" + "`). Detection is **host-authoritative**, client only mirrors the field (never recomputes) ⇒ name choice is synced, not raced. **Adds a unit test: one placement discovering 2 magic combos stamps both names, counter +2, one toast tick.**
- **R2 [HIGH] Canonical Set serialization** (Grok + Gemini): serialize `discoveredCombos` as a **SORTED** `string[]` so the snapshot byte-representation is canonical for replay/diff regardless of insertion order. **Adds a save.test assertion: serialized array is sorted + round-trips.**
- **R3 [MED] Detect at PLACEMENT level, not per-path** (my open concern, both confirmed): hook the scan once at the post-bond-creation site (where `BOND_FORMED` is emitted), scanning ALL bonds that placement created (primary + redundancy weaving) — this resolves the "both bond-creation paths" gap by construction.
- **R4 [MED] HUD collision spec** (Grok): pin the toast to a defined upper-center y-band that avoids the top-left leaderboard and the center win-banner zones; documented constant, not ad-hoc.
- **R5 [LOW] Backward-compat decode proof** (Grok's "strict decoder" challenge — REFUTED with the `rainbowSwitchTick` precedent, but hardened): **add a save.test that a v8-shaped snapshot WITHOUT the 3 new keys still decodes** (nullish → inactive). Confirms no PROTOCOL_VERSION bump needed.
- **R6 [LOW] Scope-out audio/particles** (Grok): G3a is **visual Text only** — no TTS/ogg/particle work (that would be a separate asset+audio-sync session).

### Accepted-by-precedent (documented, not changed)
- **Rapid-fire overwrite = restart:** a new discovery while a toast animates overwrites `comboToastTick` → toast retargets/restarts. Identical to the shipped `rainbowSwitchTick` semantics; counter always correct.
- **Late join / reconnect:** a client joining after a toast window passed sees the correct synced **counter** but not the past celebration (rainbow-flyover precedent — only the remaining window renders).

### Deferred carry-forward (non-blocking)
- **12/12 "ALL COMBOS!" flourish:** optional distinct celebration on the final discovery — logged, not in this PDR's scope.

### Net effect on estimate
+`lastDiscoveredComboNames` array + 3 tests (same-tick double, sorted-serialize, keyless-decode). Still Standard tier; revised estimate ~20–26K, ~9 files, +<1 KiB bundle, +~16 tests.
