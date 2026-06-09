# PDR — S76: Hunter speed · Rainbow rarity · Complexity-income scoring

**Tier:** Full (batch tier = highest; P3 is a game-mechanic redesign >30K).
**Approval:** User-explicit batch approval ("a few things… get cooking autonomously, i approve this session batch"). `unlock_source=user`.
**Deliberation:** Council R1 (Claude + Grok-4.20-reasoning DISRUPTOR + Gemini-2.5-pro AUDITOR) + PRIME-AUDIT. Done before execution.
**Source signal:** Live 2-player playtest — hunter too slow, rainbow never appeared, scoring "not correct" (destruction has no consequence; P1 scores differently).

---

## OBJECTIVE
Three playtest fixes: (P1) make the Pac-Man hunter ~2.5× faster, (P2) make the rainbow pickup appear far more often, (P3) make scoring reflect the user's mental model — your point-**gain rate** scales with the **current total complexity of your standing structures**, so destruction (bomb / potato / sever / disconnect) visibly slows you; and make every player score by **identical** rules (fix the player-1 inconsistency).

## SCOPE

### P1 — Hunter 2.5× faster (Micro)
- `constants.ts`: `HUNTER_MAX_SPEED` 1.4 → **3.5**, `HUNTER_ACCEL` 0.12 → **0.30** (both ×2.5 — preserves the accel/max-speed ratio, hence the momentum/overshoot juke feel; terminal speed = accel/(1−damping) = 10×0.30 = 3.0, sits under the 3.5 cap exactly as 6 sat under 7 / 1.2 under 1.4). `HUNTER_DAMPING` 0.9 unchanged. Update the S75-P2 comment block → S76.
- Verify: hunter unit tests pass literal pursuit args (no constant coupling); `e2e/hunter.spec.ts` — a *faster* hunter catches *sooner*, so the existing catch-window holds. Re-run gating lane.

### P2 — Rainbow more common (Micro)
- `constants.ts`: `RAINBOW_SPAWN_MIN_SPARKS` 35 → **15**, `RAINBOW_SPAWN_MAX_SPARKS` 60 → **28** (still the rarest hazard — potato 10-18, bomb 8-15 — but now appears ~1.5–3 min in instead of ~4-7). `RAINBOW_TTL_TICKS` (20s linger) unchanged. Update comment.

### P3 — Complexity-income scoring (Full)
**Model:** replace the monotonic placement-accumulator with a per-tick **income** whose rate ∝ standing complexity.
- **New `src/state/scoring.ts`:**
  - `computeComplexity(world, playerId): number` — single pass over the **global** `world.primitives` + `world.bonds` (Δ2 hardening: attribute each element to exactly ONE owner via `placedBy` / `bond.a.placedBy`; never per-player iterate). **`complexity = N_prims + MAGIC_BONUS × N_magicBonds`** where prim weight = `SCORE_ANCHOR` (1) and `MAGIC_BONUS = SCORE_MAGIC_BOND − SCORE_FUNCTIONAL_BOND` (= 2). Magic-ness re-derived per bond via `lookupCombo(bond.a.type, bond.b.type).isMagical`. (Δ1: this is functional-bond-NEUTRAL — bonding never lowers your score — and reproduces the old accumulator for tree builds, so threshold 50 stays meaningful.)
  - `tickScoring(world): void` — host-only, once per physics tick: for each player `scoreByPlayer[p] += SCORE_INCOME_PER_COMPLEXITY_PER_SEC × complexity(p) / PHYSICS_HZ`; then `scoreProgress = max(scoreByPlayer.values())` for ALL modes (solo = single-value max). Emits `SCORE_TIER` at the player's avatarPos on a tier-step crossing (Δ5 — keep placement/idle feedback). Pure fn of state + tick → deterministic/replay-safe.
- **`constants.ts`:** add `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` (default **0.15** — #1 playtest tunable; complexity-20 → win in ~17s, complexity-5 → ~67s, complexity-0 → never). Keep `SCORE_ANCHOR/FUNCTIONAL/MAGIC_BOND` (now reused as complexity weights). `PHASE_1_WIN_SCORE` stays 50.
- **`gameMode.ts`:** unify `addScore` to a SINGLE path (`scoreByPlayer[p] += delta; scoreProgress = max`) — removes the solo-vs-networked divergence → **fixes #3b**.
- **`placePrimitive.ts`:** remove the 3 `addScore` calls + the synchronous `SCORE_TIER` tier-crossing block (`oldScore` snapshot). Placement now only raises complexity. (Check `placeFromFree.ts` for the same.)
- **`main.ts`:** call `tickScoring(world)` in the host-only sim block (`!isClient`, `PLAYING`) BEFORE `tickGameState` (so WIN sees fresh score) and before the hunter-trigger check.
- **`gameState.ts` + `main.ts` hunter-trigger:** float-safe gate (Δ3) — `Math.floor(world.scoreProgress) >= PHASE_1_WIN_SCORE` / `… >= HUNTER_TRIGGER_SCORE`, so the HUD's floored "50/50" coincides with the win.
- **`ui.ts`:** display `Math.floor(score)` (score is now a float).
- **Tests:** rewrite `session9` P3 (build-scoring → `computeComplexity` + accrual via `tickScoring`, `toBeCloseTo`), `session10/13` `SCORE_TIER` (moved to `tickScoring`), `gameState` WIN setup, any `placeFromFree`/`session15` placement-scoring asserts. NEW `scoring.test.ts`: complexity formula, accrual rate, **destruction-degrades-rate**, **player-consistency (P1 == others)**, determinism.
- **save.ts:** unchanged (scoreProgress/scoreByPlayer already serialize; float in JSON is fine).
- **No PROTOCOL_VERSION bump** (no new wire action/field; wire shape unchanged — stays v6).

## TESTING / CHECK (Full → Triumvirate)
`tsc` 0 · `vitest` all green (rewritten + new scoring suite) · `vite build` <550KB · **Playwright gating lane** (runtime boot-then-smoke: score actually accrues + WIN fires + hunter triggers in a real browser build) · hunter + rainbow + bomb + potato specs green.

## DELIBERATION SUMMARY (Council R1 + PRIME-AUDIT)
- **Δ1 CRITICAL (Grok):** complexity formula corrected to `N_prims + 2×N_magic` (R1 draft punished functional bonding — a "don't-connect" exploit). ADOPT.
- **Δ2 CRITICAL (Gemini):** single-pass global ownership attribution (no double-count if a cross-color bond ever exists). ADOPT.
- **Δ3 HIGH (Gemini):** `Math.floor` win/hunter gate (float-safe). ADOPT.
- **Δ4 MED (Gemini):** `tickScoring` host-only; client reads snapshot scoreProgress (host-authoritative preserved). VERIFIED.
- **Δ5 (Grok mitigation):** keep `SCORE_TIER` pulses + `BOND_COMMIT`/structure-grow visuals → placement still has feedback. ADOPT.
- **REJECTED:** Grok's "monotonic + 30–40% destruction tax" — a clawback, not the user's literal "gain *slower*" (a rate). Logged as a future option.
- **Runtime-verifiability:** the income loop runs in the live tick path → verified by the Playwright gating lane, not just static parse.

## RISKS / TUNABLES (flag in handoff)
- Balance is un-playtestable while user is away → `SCORE_INCOME_PER_COMPLEXITY_PER_SEC` is the #1 one-line dial (range ~0.05–0.25). Income gives a built-in "defend your winning structure for ~7s" climax (opponents can bomb/hunt the leader) — anti-runaway is the existing hazard set + the 75% hunter.
- Pure income = no instant score-number pop on placement (idle-ish feel) — mitigated by Δ5 visuals; alternative "destruction-tax" model noted if the feel is wrong.
