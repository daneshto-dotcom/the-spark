---
STATUS: COMPLETED (S89 — all 6 priorities shipped P1 de2f05d / P2 9eeac55 / P3 4df76b1 / P4 43b4c0c / P5 de1d1fd / P6 f425167 + P7 post-audit polish 6432391; vitest 1407/1407, tsc 0, bundle 546.7 KiB; 8-reviewer adversarial audit clean — no critical/high bugs)
SESSION: S89
TIER: Full (>30K; batch — highest-tier rule; P5 netcode + P6 G1b are the heavy items)
DATE: 2026-06-15
USER MANDATE (verbatim): "Run those 5 fixes this session and then go straight into starting G1b. I preapprove full session run + autonomous work through all of this. produce the highest quality output and work in the absolute best interest of this project and session!"
---

> **Binding revisions live in the COUNCIL + PRIME-AUDIT section at the bottom — they override the draft body where they differ.**

# PDR — S89 batch: 5 playtest regression fixes (P1–P5) + G1b magic-combo behaviors (P6)

## STATE-DISCOVERY (Rule 21 — empirical, done BEFORE this draft)
5 parallel read-only investigators + targeted reads/greps ground-truthed every bug against the actual source. **Two reports ended on hypotheses; both were then confirmed by direct read** (sync.ts interpolation coverage; the foul lifecycle). Findings drive each priority below. Key correction surfaced: **#3 is partly a DESIGN decision, not a pure bug** (see P3) — flagged, not blindly "fixed."

Execution order = user's: **P1 → P2 → P3 → P4 → P5 → P6.**

---

## P1 — Quick Match lobby: status-text overlap + per-seat READY indicator  (Standard)

### 1. OBJECTIVE
(a) Kill the illegible text overprint above the READY button in the multiplayer/quickmatch lobby. (b) Show each player whether another seat has clicked READY (a per-seat ✓ tick), so readiness is visible before the match begins.

### 2. SCOPE (files)
- `src/render/lobbyScreen.ts` — **overlap root cause CONFIRMED**: `statusText` (line ~323) and `readyCountText` (line ~400) are BOTH positioned at `y = paneY + PANE_HEIGHT + 40` → head-on collision (both anchored 0.5/0.5, center-aligned). `diagnosticsText` sits at `+62`, `hostDiagnosticsText` at `+82`. Re-lay this status block into non-overlapping y-bands (give the green ready tally its own line above or below the gray status line; keep diagnostics where they are or restack the whole block with a single spacing constant).
- `src/render/lobbyStateMachine.ts` — `SeatPresence.ready?: boolean` ALREADY exists (S87 P4) and flows in via `presenceRoster`. But `SeatView` (the per-seat render struct, ~line 299) has **no `ready` field**. Add `ready?: boolean` to `SeatView`; map it in `lobbyView()` from the matching `presenceRoster[i].ready`.
- `src/render/seatRack.ts` — `seatLabelText()`/cell render (~lines 49–68, 140–225): render a ✓ tick (or "READY" chip) on a seat whose `ready === true`. `ready` is `undefined` in friends lobbies (only quickmatch sets it) → tick only shows when defined+true, so friends lobbies are visually unchanged.
- `src/main.ts` — presence composition (~line 494) already passes `ready` through; confirm no change needed.

### 3. APPROACH
Pure layout + additive render. The readiness DATA pipeline is already built and synced (`RosterEntry.ready` → `LOBBY_PRESENCE` → `SeatPresence`); we are only surfacing it per-seat and de-colliding the status lines. No protocol/wire change.

### 4. TESTING
- Unit: `lobbyView()` maps `presenceRoster[i].ready` → `SeatView.ready` (a quickmatch roster with one ready seat yields exactly one `ready:true` SeatView; a friends roster yields all `undefined`).
- Unit/snapshot: status-block y-positions are pairwise distinct (guard against future re-collision) — assert `statusText.y !== readyCountText.y`.
- Live boot + (where drivable) lobby screenshot showing distinct lines + a ✓ on a ready seat. Visual-gap honesty if Pixi input isn't drivable (S88 lesson).
- Gates: tsc 0 · full vitest green · bundle < 550 KiB.

### 5. RISKS
- Friends-lobby regression: `ready===undefined` must render byte-identically to today (no tick, no layout shift). Test both lobby kinds.
- The diagnostics line content (`sync 3/3 … nostr:7/7 torrent:3/3`) is a dev HUD — keep it, just stop it sharing a y with the tally.

---

## P2 — In-game HUD: "BETA · S17 PHASE-2" badge overprints world primitives  (Micro)

### 1. OBJECTIVE
The top-right version/phase badge no longer visually clashes with gameplay primitives that float into the top-right corner.

### 2. SCOPE (files)
- `src/main.ts` (~lines 185–198, staged at ~377) — the `betaBadge` Text: `anchor(1,0)`, `position(CANVAS_WIDTH-12, 12)`, `alpha 0.55`, monospace 14, added to `app.stage` as a sibling of the world renderers (sparks/structures added earlier ⇒ badge draws on top of any primitive in that corner).
- (Decision-dependent — see Council) one of: relocate/shrink the badge to a non-play chrome zone; OR drop it behind the world layer so gameplay primitives occlude it; OR add a subtle dark backing/de-emphasis. Energy gauge bar (`ui.ts` `GAUGE_X = CANVAS_WIDTH-24`, vertical) is legit HUD and stays.

### 3. APPROACH (leaning)
A version/beta badge is meta-chrome, not gameplay HUD (unlike score/energy). Leading fix: **de-emphasize + reposition** so it never competes with primitives — e.g. smaller font, lower alpha, and/or tuck it tighter to the extreme corner above the gauge where primitives don't rest. Putting it BEHIND the world is the alternative (gameplay always wins visually) but fog covers it in 1v1 (the S81 reason it was moved above fog) — so reposition/de-emphasize is safer. Council picks.

### 4. TESTING
- Live boot screenshot of the top-right in a match (or honesty note if not drivable). No unit surface (pure positional constant). tsc 0 · vitest green · bundle < 550 KiB.

### 5. RISKS
- Don't reintroduce the S81 bug where fog swallowed the top HUD row. Keep the badge on/above the layer that survives fog if it stays in the HUD layer.

---

## P3 — Pooped player + structures stay discolored ("white") after the effect  (Standard — DESIGN DECISION)

### 1. OBJECTIVE
After a poop effect resolves, a player's spark and structures return to the player's seat color instead of staying olive/grey ("white") indefinitely.

### 2. STATE-DISCOVERY — what is actually happening (CONFIRMED)
- The "white" is `POOP_FOUL_TINT = 0x9aa15c` (olive-brown) lerped at `POOP_FOUL_TINT_STRENGTH = 0.65` over the seat color → reads grey/white on the black field.
- **AVATAR** tint is tick-gated (`isCruiserDebuffed` = `tick < poopedUntilTick`) and **self-heals** at expiry. `poopedCursorTarget` clears via `applyUpdateAvatarPos` (first un-debuffed move) + `tickCruiserChase` (host residual-gap close).
- **STRUCTURES** tint from `world.fouledPrimitives` membership (`structureRenderer.foulAwareTint`). **`fouledPrimitives` has NO time-expiry.** A pooped structure (whole component) is added to the set and ZEROES income (`scoring.ts:75/89`), and clears **only** via: (i) the owner flying their avatar onto the splat to WIPE it (`canAvatarCleanSplat`→`applyCleanPoop`), (ii) topology change (`reconcileFouledPrimitives`), (iii) game end (`teardownSeagulls`). **This is a deliberate "you got pooped on — go wipe it" mechanic, not a bug.**
- ⇒ The user's report is the structure foul persisting because the manual-wipe (fly onto the splat) is non-obvious; the player expected auto-revert. The avatar likely self-heals; the dominant visible issue is the permanent structure foul + income-zero.

### 3. THE DESIGN DECISION (for Council + user)
The current rule "a single poop hit permanently kills a structure's color + income until manually wiped" is harsh and reads as broken. **Proposed fix: add a deterministic, tick-gated AUTO-EXPIRY to the structure foul** (mirror of `poopedUntilTick`/`poopyUntilTick`): a pooped structure self-cleans after a grace window (restoring color + income), while the manual avatar-wipe stays as the *instant* clean (strategic fast-recovery). This satisfies the user's stated expectation AND preserves the mechanic's intent (a temporary penalty with a skill-based fast-clear).
- *Alternatives:* (A) leave the mechanic, just make the wipe discoverable (a "fly here to clean" cue) — keeps gameplay, fixes only discoverability; (B) auto-expiry (proposed); (C) hybrid — auto-expiry on a long window + a discoverability cue. Council picks; user can veto the gameplay change.

### 4. SCOPE (files — for proposed auto-expiry)
- `src/state/seagulls/seagullLifecycle.ts` — stamp a `fouledUntilTick` per splat (`Poop.fouledUntilTick = tick + POOP_FOUL_TICKS`) at the SPLAT_STRUCTURE branch (~line 248); in the seagull tick, expire splats whose window passed → run the existing clean path (unfoul component + remove splat), reusing `applyCleanPoop`/`reconcileFouledPrimitives` logic. Pure fn of synced `world.tick`.
- `src/constants.ts` — `POOP_FOUL_TICKS` (grace window; propose generous, e.g. ~POOP_CRUISER_SLOW_TICKS×N — Council tunes).
- `src/state/save.ts` — round-trip `fouledUntilTick` on the serialized poop (additive-optional, the `poopedUntilTick` precedent → NO protocol bump).
- Verify the AVATAR genuinely self-heals on the client (it should; add a regression test if any doubt).

### 5. TESTING
- Unit: a pooped structure auto-unfouls at `tick >= fouledUntilTick` (color + income restored); the manual wipe still clears instantly before expiry; income (`scoring`) returns to normal post-expiry.
- Unit: avatar tint reverts at `poopedUntilTick` (regression lock).
- save round-trip of `fouledUntilTick` (additive, keyless decode still works).
- Determinism: pure tick compare, host-authoritative, client mirrors — assert no client-only divergence.
- Gates: tsc 0 · vitest green · bundle < 550 KiB.

### 6. RISKS
- This CHANGES gameplay (foul becomes temporary). Flagged for user veto. If vetoed → fall back to Alternative A (discoverability cue only).
- Must not double-fire the clean (auto-expiry + manual wipe racing) — guard on splat existence (the `applyCleanPoop` `world.primitives.has` precedent).
- `scoring` interaction: income must resume exactly at expiry (test it).

---

## P4 — Hunter ("pacman") moves 25% faster  (Micro)

### 1. OBJECTIVE
The hunter pursues 25% faster.

### 2. SCOPE (files — CONFIRMED, trivial)
- `src/constants.ts:519–520` — scale BOTH by 1.25, preserving the locked accel/max ratio (code comment: "dial MAX_SPEED+ACCEL together, keep the 0.0857 ratio"):
  - `HUNTER_MAX_SPEED 4.2 → 5.25`
  - `HUNTER_ACCEL 0.36 → 0.45`
  - `HUNTER_DAMPING` unchanged (retention ratio, not speed). Effective terminal speed = accel/(1−damping) = 0.45/0.1 = 4.5 px/tick (was 3.6) = exactly +25%; new MAX_SPEED 5.25 keeps the cap from clipping.
- **No lock test, no LOCKED_DECISIONS entry** for hunter speed (verified — `constants.lock.test.ts` locks only `MEMORY_FOG_COLOR`). Deterministic, replay-safe. `hunterLifecycle.test.ts` uses literal values, not the constants → unaffected.

### 3. TESTING
- vitest green (hunter pursuit tests use literals, stay green). Optional new assertion documenting the +25% terminal speed. tsc 0 · bundle < 550 KiB.

### 4. RISKS
- Difficulty feel — 25% is the user's explicit number. Single source of truth, easy to re-tune. No mode/difficulty variants exist (one global hunter).

---

## P5 — Client-mirror lag: joiner (P2) sees choppy/laggy motion, host (P1) smooth  (Full — netcode; PARKED item graduating)

### 1. OBJECTIVE
The joining client renders smooth motion (sparks, structures, avatars, hazards) instead of stutter/freeze-jump, while the host stays smooth and determinism/1v1-mirror-safety is preserved (render-layer-only change).

### 2. STATE-DISCOVERY — root cause (CONFIRMED)
- Host simulates 60 Hz and renders its own continuous state → smooth.
- Client receives `NetSnapshot` at **`NET_SNAPSHOT_HZ = 10`** (every 6 ticks), and `interpolateInto` lerps prev→current over **`NET_INTERPOLATION_MS = 100`** — but **100ms interp == 100ms snapshot interval = ZERO jitter buffer.** When a snapshot is even slightly late (constant on P2P nostr/torrent/webrtc transport), `t` saturates at 1.0 → the entity FREEZES at the current snapshot, then JUMPS when the late snapshot lands. Freeze-jump on every jittery interval = "everything chopped."
- **Coverage gap:** `interpolatePositions` (sync.ts:222) lerps **only `primitives` + `freeSparks`.** Player avatars use a separate exponential smooth (`smoothTowards`, `AVATAR_SMOOTH_TAU_MS`) so they glide; but **creatures/hazards (hunter, seagulls, poops, potato, voltkin) are NOT interpolated** → they step raw at 10 Hz. (Confirm exact hazard render paths during impl.)
- This is literally the PARKED roadmap item "10 Hz client-mirror pose-stepping smoothing (judge in 1v1 playtest first)" — the user just judged it in 1v1: it's choppy. It graduates to active.

### 3. APPROACH OPTIONS (for Council)
- **A — jitter buffer (constant-only, low risk):** raise `NET_INTERPOLATION_MS` above the snapshot interval (e.g. 120–180ms) so the lerp never completes-then-freezes between snapshots; continuous motion at the cost of a little extra visual latency. 1-line-ish; verify the "lerp restarts at arrival" math interaction.
- **B — render-delay snapshot buffer (robust, larger):** buffer the last N snapshots with arrival timestamps; render at `now − renderDelay` (renderDelay ≈ 1.5–2× snapshot interval), interpolating between the two snapshots bracketing that render time (Valve-style entity interpolation). Jitter-tolerant by construction. Larger change to `ClientSync`.
- **C — raise snapshot rate:** `NET_SNAPSHOT_HZ 10→15`. More frequent updates; +bandwidth on P2P; doesn't fix the zero-buffer root cause alone.
- **D — extend coverage (additive to any of A/B):** interpolate/smooth creatures + hazards too (so nothing steps).
- **Leaning: B + D** (correct + complete) if it fits one session, else pragmatic **A + D**. Council decides risk vs. robustness.

### 4. SCOPE (files — approach-dependent)
- `src/net/sync.ts` — `interpolateInto`/`interpolatePositions` (the buffer + bracket logic for B; the window for A; creature/hazard coverage for D).
- `src/constants.ts` — `NET_INTERPOLATION_MS` / `NET_SNAPSHOT_HZ` as chosen.
- Possibly `src/render/*` creature/hazard renderers (if smoothing lives render-side like the avatar's `smoothTowards`).
- **Render-layer-only** — MUST NOT touch synced game state (determinism + mirror invariant). The S52/S56 dragLock interplay must survive.

### 5. TESTING
- Unit: interpolation/buffer math — given a snapshot sequence with jitter, output positions are monotonic/continuous (no t-saturation freeze); bracket selection picks the right pair (B); creature/hazard positions interpolate (D).
- Determinism: synced state untouched by the render lerp (assert world reducer state identical with/without interpolation calls).
- Live: 2-peer feel is the real proof (user playtest — Tier-2 follow-up); in-session, unit + boot + the existing e2e 2-browser harness must stay green.
- Gates: tsc 0 · full vitest green · bundle < 550 KiB · e2e lane green.

### 6. RISKS
- Adding latency (A/B) trades smoothness for responsiveness — keep renderDelay minimal. Local-player input is NOT snapshot-bound (cursor is local), so input latency is unaffected; this only delays REMOTE entity display.
- Don't regress the locally-dragged-spark `dragLockedSparkId` skip (S52 C4) or the S56 GAP-2 sawtooth fix.
- e2e harness sensitivity — the 2-browser lane exercises the client path; watch it.

---

## P6 — G1b: magic combos MATTER mechanically (Council DESIGN round + implement ONE archetype)  (Full)

### 1. OBJECTIVE
The magic-12 stop being paint. Per the S86 roadmap mandate: a Council DESIGN round nominates 3–5 combo BEHAVIORS across ECONOMY / DEFENSE / MOTION, then **ONE archetype is implemented** this session as a pure function of synced state (determinism + 1v1-mirror-safe).

### 2. CANDIDATE BEHAVIORS (from combos.ts table descriptions + roadmap — Council selects)
- **ECONOMY — Vortex (Dot→Spiral)** "Pulls nearby free sparks toward it (anchor pull)" — the literal table description, never built. A bonded Vortex component exerts a capped attraction on nearby FREE sparks (host-authoritative force in the spark physics step). **Marquee "geometry matters" payoff.**
- **ECONOMY — Filament (Dot→Line)** income trickle (small per-tick score for holding a Filament).
- **DEFENSE — Diamond (Triangle→Triangle) / Lattice (Square→Square)** hazard resistance — a hazard (potato blast / Voltkin bolt / hostile sever / poop) costs 2 hits or 2 charges against a Diamond/Lattice component.
- **MOTION — Wheel (Triangle→Circle) / Star (Circle→Triangle)** slow structure rotation; **Capsule (Square→Circle)** glow-trail.

### 3. LEANING (Council confirms)
Implement **Vortex anchor-pull (ECONOMY)** first: it's the most legible "the shape does something" payoff, directly realizes a written-but-unbuilt description, and is a clean additive host-side force on free sparks (which already move via Verlet physics). Determinism is tractable: a pure capped force computed from synced positions each tick, applied host-side, mirrored to clients via the existing snapshot. *Risk to weigh:* it touches the spark physics hot path + interacts with carry/claim/poopy-slow — Council weighs Vortex vs. a more contained DEFENSE behavior (hazard hit-count, which only gates existing hazard reducers and may be lower-risk).

### 4. SCOPE (files — archetype-dependent; firm after Council picks)
- `src/combos.ts` — (if needed) a behavior tag/flag on the chosen outcome(s), or a helper to test "is this component a Vortex/Diamond/…".
- `src/state/*` — the behavior as a pure reducer/physics step (e.g. `vortexPull` in the spark physics tick, computed from synced component positions). Host-authoritative; clients mirror via snapshot (no new wire field if it's pure-derived).
- `src/constants.ts` — behavior tuning constants (pull radius/strength, or hazard hit-count).
- Tests + (maybe) a render cue for the behavior.
- Determinism contract: behavior is a pure fn of synced state; no RNG/clock; runs host-side; same result on replay.

### 5. TESTING
- Unit: the behavior is a pure deterministic fn (Vortex: free spark within R gains a capped velocity toward the anchor; outside R unaffected; carried/poopy sparks handled; zero allocation in the hot loop where feasible). DEFENSE: a Diamond component survives the first hazard hit, breaks on the second.
- Determinism/replay: identical inputs → identical outputs; host+client mirror.
- Gates: tsc 0 · full vitest green · bundle < 550 KiB · e2e lane green.

### 6. RISKS
- Physics hot-path cost (Vortex): cap the per-tick work (only run when a Vortex exists; bounded neighbor scan via the existing spatial grid).
- Gameplay balance: a new behavior can unbalance the duel — keep tuning constants conservative + playtest-gated (Tier-2 follow-up).
- Scope creep: implement ONE archetype only; the rest of the slate is logged for future sessions.

---

## DELIBERATION PLAN
Full tier → 3-way Council (Claude + Grok + Gemini). Focused design round on the THREE design-sensitive decisions — **P3** (foul auto-expiry vs. discoverability-only; window length), **P5** (netcode approach A/B/C/D + risk), **P6** (behavior slate + which archetype first) — plus a light pass on **P2** (badge fix choice). P1/P4 are mechanical (ride the batch). PRIME-AUDIT (Rule 20, runtime-verifiability for the netcode + physics changes) before presenting. CHECK = Triumvirate (RALPH + GROK-ANALYST + GEMINI-AUDITOR) per priority. END-OF-SESSION runtime audit (Rule 22) before /handoff.

## ESTIMATE
~6 priorities; P1/P3/P5/P6 are the weight. Likely 60–110K tokens across the session; ~15–22 files; bundle expected to stay < 550 KiB (watch P5/P6 additions); +~25–40 tests. Context budget GREEN with wide headroom.

## ROLLBACK
Each priority is an independent commit. P2/P4 are single-constant reverts. P1 is layout+additive. P3/P5 are additive-optional (no protocol bump) — single revert each. P6 archetype is a contained behavior reducer — single revert.

---

## COUNCIL R1+R2 + PRIME-AUDIT (S89, 2026-06-15) — BINDING (overrides the draft body)

**Panel:** Claude-Opus (Prime Architect) · Grok-4.20-reasoning (DISRUPTOR) · Gemini-2.5-pro (AUDITOR). Full tier, 2 rounds. Signals: `external_user_facing` (Gemini required) + `novel_mechanism` (+1 round). Quality gate PASSED (Grok 4 challenges + risk register; Gemini full scorecard).

### Battle Ledger
| # | Decision | Claude (lean) | Grok | Gemini | Authority | Resolution |
|---|----------|---------------|------|--------|-----------|------------|
| P2 | badge fix | (a) de-emph | (c) backing plate | (a)+(c) hybrid | Gemini 1.75 (UX) | **SYNTHESIS → (a)+(c):** de-emphasize (smaller/dimmer) + subtle dark backing plate pinned to corner. Establishes a clean chrome/world boundary. Render-only. |
| P3 | foul revert | (B) auto-expiry | (A) keep + cue (reject B) | (B) auto-expiry 30s | Gemini 1.75 (UX) + user's explicit report | **SYNTHESIS → (C): auto-expiry + cue.** Deterministic `fouledUntilTick`, window **30s (≈2× the 15s slow, ~14% of a 210s match)**; manual avatar-wipe stays the INSTANT clean (preserves Grok's tempo/diversion depth — wiping early still pays off); + a subtle deterministic "fouled" timer cue so the fast-wipe is legible. Grok's permanence-is-depth dissent LOGGED but **the user explicitly reported permanence as a bug** → user intent + UX domain win. |
| P5 | netcode | B+D else A+D | **reject A** (just shifts the artifact); lightweight-B: fixed render-delay + 2-snapshot bracket lerp (~40 lines) + D | B+D (commit to robust) | Grok 1.75 (risk) — CONVERGED w/ Gemini | **CONVERGED → render-delay snapshot buffer + bracket lerp (Grok's lightweight-B) + extend coverage to creatures/hazards (D).** A is DROPPED — confirmed broken: on the current "restart-lerp-on-arrival" scheme, a late snapshot resets `currentSnapTime=now`, `t=0`, so a bigger window only shifts the freeze-jump, never buffers it. |
| P6 | first behavior | Vortex | **Defense first** (Vortex riskiest → last) | **Vortex first** (the "aha") | SPLIT: Grok 1.75 (risk) vs Gemini 1.75 (payoff) | **SYNTHESIS → Vortex first, WITH mitigations.** The user's own S86 mandate ("make the geometric connections matter") + Gemini's legible-payoff argument tilt it to Vortex; Grok's determinism risk is honored by: (i) Vortex is sequenced **LAST** (after P5 ships + verifies → isolated commit, clean desync attribution — closes Grok R3); (ii) hard determinism discipline (host-only force, sorted iteration, pure fn, spatial-grid-bounded, replay test); (iii) **documented fallback to DEFENSE (Diamond/Lattice 2-hit)** if budget/risk forces it. |

### Quality Scorecard (Gemini): P3 Quality 5 · P5 Quality 5/Efficiency 2 (robust) · P6 Vortex Quality 5. Overall: "be ruthless in service of the player — fix the poop frustration, commit to the proper netcode, deliver the Vortex 'wow'."

### PRIME-AUDIT (Rule 20 — runtime-verifiability; adopted revisions override the body)
- **AUDIT-1 [HIGH] P5 buffer cold-start / underrun / new-entity (runtime, not static):** the render-delay buffer must degrade gracefully: (i) cold start (<2 snapshots) → render latest, no crash; (ii) buffer underrun (renderTime past newest, a stall) → CLAMP to newest (no extrapolation — simpler + safe); (iii) an entity present in the latest snapshot but absent from the bracketing pair (just spawned) → render at its latest pos. **Add unit tests for all three.** Entity SET + non-position state come from the LATEST snapshot (as today); only POSITIONS interpolate from the buffered bracket.
- **AUDIT-2 [HIGH] P5 must preserve S52 dragLock + S56 GAP-2:** the locally-dragged spark skip and the carried-spark position preservation across snapshot rebuild MUST survive the buffer refactor — these are load-bearing joiner-feel fixes. Regression-test both. renderDelay (~120–150ms, tunable `NET_RENDER_DELAY_MS`) delays REMOTE entity display ONLY; the local cursor/avatar is not snapshot-bound → no input-feel regression (assert).
- **AUDIT-3 [CRITICAL] P6 Vortex host-only force:** the client must NEVER recompute the Vortex pull — it only mirrors the resulting positions via snapshot. Double-application (host force + client force) would desync. The force runs ONLY in the host physics step (clients don't sim). **Determinism test: same inputs twice → byte-identical; host+client mirror.** Iterate sparks + anchors in ID order; pure fn of synced state; no Math.random/Date.now.
- **AUDIT-4 [MED] P3 income resumes exactly at expiry:** scoring reads `fouledPrimitives`; the host clears the component at `fouledUntilTick` → income resumes that tick; client mirrors via the snapshot. **Test income-zero during foul, income-restored at expiry.** Guard the auto-expiry vs manual-wipe race (splat-existence check, the `applyCleanPoop` precedent) so it can't double-fire.
- **AUDIT-5 [LOW] P4 / P2 static-only is fine:** both are pure constants/positions; no runtime path. P4 keeps the locked accel/max ratio.

### Net effect
P5 is upgraded from "constant bump fallback" to **render-delay buffer (mandatory)** — the session's highest-care item. P3 is C (auto-expiry 30s + cue), not bare B. P6 = Vortex-last with determinism discipline + DEFENSE fallback. Execution order unchanged: P1→P2→P3→P4→P5→P6. CHECK = adversarial Triumvirate per priority (spec-conformance / break-it / correctness-regression lenses). END-OF-SESSION runtime audit (Rule 22) before /handoff.
