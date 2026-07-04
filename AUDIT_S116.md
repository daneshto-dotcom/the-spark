# SPARK — Full Project Audit (S116)

**Date:** 2026-07-04 · **Model:** Fable 5 (Ultracode) · **Method:** full deep-read of the core sim (physics/state/net/scoring/combos/save/main) + smell sweeps + cross-artifact consistency + 3-way Council (Grok-4.20-reasoning + Gemini-2.5-pro) + PRIME-AUDIT.
**Baseline:** master @ 7d4d5c8 · tsc 0 · vitest 1779/1779 · bundle 611.0/750 KiB · PROTOCOL_VERSION 14 · LIVE.
**Scope:** research only — NO production code changed. Deliverable = ranked findings + a recommended implementation order for owner picks.

---

## Executive summary

SPARK is in unusually good health for a 38k-LOC game: strict determinism discipline (verified — the **only** `Math.random` in the tree is render-cosmetic sudoku fireworks; `Date.now` appears only in lobby matchmaking + ICE polling, never in the sim), a byte-identical replay test in CI, a central `dispatch` seam, airtight charge/auth gates, and a genuinely thoughtful netcode trust model (room-code = host-pubkey commitment). **Correctness bugs are scarce** — the per-session Council review has kept the sim clean.

The real opportunities are **not** bugs. They are: (1) a concrete per-tick **perf** waste on the host, (2) low-effort **consistency/hygiene** drift, (3) two **half-built architectural foundations** (host-migration, worker-sim) that leave "host death = match death" as the game's biggest live risk, and (4) a **gameplay-depth gap** — the "geometric builder" North Star is under-delivered because most of the 36 combos do nothing distinct.

Both Council members **independently converged** on the same top three: kill the redundant per-tick recomputation (F1), finish the host-migration/worker-sim foundations (F7), and prove the build-system vision with cheap deterministic combo mechanics (F8). The full priority recommendation is at the bottom.

---

## Findings (ranked)

| # | Area | Sev | Effort | One-line |
|---|------|-----|--------|----------|
| **F1** | Perf | **High** | S | Host recomputes per-player complexity + component BFS ~12+×/tick with zero memoization |
| **F7** | Arch | **High** | L | Host-migration (D1 dormant) + worker-sim (hash only) half-built → host death kills the match |
| **F8** | Gameplay | **High** | M | 14/36 combos are placeholders; 9/14 magic combos are visuals+income only — core under-delivers |
| **M1** | Process | Med | XS→owner | CI/CD dead (GitHub Actions billing lock); manual `npm run deploy` is the only path |
| **F9** | Trust | Med | S | No INTENT rate-limit on the host; a modified client can flood the authoritative dispatch |
| **F10** | Perf/leak | Med | S(probe) | **UNVERIFIED** (Council-surfaced): Pixi Graphics/texture destroy discipline over a 20-min match |
| **F2** | Perf | Low | S | Territory pass is O(players×bonds×anchors)/tick; placement re-derives enemy radius per enemy |
| **F3** | Consistency | Low | XS | `areaMultiplier` is dead data — on all 36 combos + LOCKED schema, zero consumers |
| **F4** | Consistency | Low | XS | LOCKED_DECISIONS still says "Magic-12 silhouettes" (stale; now Magic-14, omits Anchor+Spindle) |
| **F5** | Hygiene | Low | XS | 64 `HANDOFF_*.md` in project root (~41 untracked); protocol auto-archives to `.handoff-archive/` |
| **F6** | Deps | Low | XS | pixi 8.18→8.19, trystero 0.25.0→0.25.2, vite/vitest minor behind — no majors |

Effort: XS ≤1h · S ≤½ session · M ≈1 session · L multi-session.

---

### F1 — Redundant per-tick recomputation on the host (High / Small) ⭐

Per host physics tick (60Hz): `tickScoring` calls `computeComplexity` once per player — a full walk of `world.primitives` + `world.bonds` with a `lookupCombo` per bond. **Independently**, `computeTerritorialInfluence` calls `computeTerritorialRadius` per player → `computePlayerComplexity` per player — **another** full prim+bond walk **plus a `componentOf` BFS per primitive-component**. `componentOf` (`game/structure.ts`) rebuilds its BFS from scratch every call with no memoization. At 6 players that's ~12+ full graph traversals + multiple BFS **every tick, on the machine that is also rendering Pixi**.

- Evidence: [scoring.ts:97,173](src/state/scoring.ts), [territory.ts:55,101,180](src/state/territory.ts), [structure.ts:21](src/game/structure.ts).
- Not a correctness bug — it's pure CPU waste that shows up as host-side frame stutter (felt as lag by every client, since the host is authoritative).
- **Fix:** compute each player's complexity **once per tick** into a small cache and share it between `tickScoring` and `computeTerritorialInfluence`; add a per-tick component-label map so `componentOf` is computed once and reused. Council: Grok called this **understated** ("highest-leverage perf defect in the current ship"); Gemini ranked it #1 by value÷effort.

### F7 — Two half-built foundations; host death still kills the match (High / Large) ⭐

Two major systems are landed-but-dormant:
- **Host-migration:** D1 shipped tested crypto primitives (succession-warrant build/sign/verify chaining to the room-code commitment, client identity, additive HELLO pubkey) but **nothing is wired live** — no epoch, no starvation detector, no takeover. Today, if the host closes their tab, **the match dies for everyone** ([HOST_MIGRATION_DESIGN.md](HOST_MIGRATION_DESIGN.md), D2–D4 pending).
- **Worker-sim:** the deterministic state-hash (`stateHash.ts`) + design doc exist, but the sim has **not** been moved behind a Web Worker ([WORKER_SIM_FOUNDATION.md](WORKER_SIM_FOUNDATION.md)).

Council was emphatic here. Gemini promoted this to **Critical** ("the single greatest maintainability threat — architectural rot that complicates every system it touches; host-death is the most acute failure state in a P2P session model"). Grok agreed it's the top **risk-reduction** item and noted the two synergize: worker-sim makes the sim state trivially serializable for migration, and makes F1's memoization a free structured-clone boundary. **Prereq caveat (my PRIME-AUDIT):** cross-browser float determinism is a *non-issue today* (only the single host simulates; clients mirror) but becomes a **hard prerequisite** the moment a successor on a different JS engine must recompute — `stateHash.ts` already flags this. So host-migration D2+ must treat cross-engine determinism as a gate, not an afterthought.

### F8 — The geometric-builder core is under-delivered (High / Medium)

The North Star (BACKLOG): *"connecting shape A to shape B IS the game."* Reality: **14 of 36** combos are literal `Functional placeholder — generic bond`; of the 14 magic combos, only **5** have a mechanical verb (Vortex pull, Filament income, Diamond/Lattice anti-sabotage, Anchor rigidity, Spindle swirl). The other 9 (Cable/Bracket/Wheel/Star/Orbital/Capsule/Whip/Warped + …) are visuals + the income premium only.

- Council **PRIME-AUDIT correction:** I originally flagged this as an architectural "big" — Grok correctly reframed it as **product/design debt, not an architectural red flag** ("chasing 36 distinct verbs is a trap that has killed deeper games"). So the fix is **not** "fill all 24 placeholders." Both models recommend **a few high-leverage, deterministic mechanics** instead (creative section below). Gemini: ship **one** symbiotic combo as a cheap proof-of-vision.

### M1 — Dead CI/CD (Med / owner-gated)

GitHub Actions is dead (account billing lock), so `npm run deploy` (local build → gh-pages) is the only path and `git push ≠ deploy`. Gemini flagged this as a **force-multiplier** risk: manual deploys make every other fix slower and riskier to ship. The code-side fix is trivial (revert Pages source to Actions); the blocker is owner-side (clear the billing lock). Same status for the 2-way→3-way Council (Gemini credits — **now resolved**, Council ran full 3-way this session).

### F9 — No INTENT rate-limit on the authoritative host (Med / Small)

The host validates INTENT *type* (`isClientIntentAllowed` allowlist) and *seat* (anti-spoof stamping), and there's a `flood guard` on the pre-verify buffer — but there is **no rate limit** on how fast a peer can drive `dispatch`. A modified client could spam INTENTs to burn host CPU. Practical risk is **low today** (griefing requires the room code = a friend), and valid placements are naturally bounded by carry-1 + spark availability — but raw INTENT parse/dispatch is unthrottled. Worth a token-bucket per peer before any public matchmaking. (Grok's #3 highest-leverage trust item.)

### F10 — Pixi lifecycle leak risk (Med / probe) — UNVERIFIED, Council-surfaced

Grok flagged that a geometric builder mints thousands of prims/bonds per match; if bond/prim destruction doesn't fully `destroy()` its Pixi Graphics/Container/textures, the host (which simulates **and** renders) can stutter or OOM after 15–20 min. Grep shows 39 `.destroy()` + 6 `removeChild` calls in `render/` — i.e. destroy discipline *exists*, but **completeness is not provable from static reads**. Logged per the integrity protocol (never silently dropped): a targeted long-match heap-profile probe is the cheap way to confirm or clear this.

### F2–F6 — Low-severity cleanups
- **F2:** `computeTerritorialInfluence` inner loop is O(players×bonds×anchors); `isInsideEnemyTerritory` re-derives radius per enemy on every placement. Folds naturally into the F1 memoization work.
- **F3:** `areaMultiplier` — defined on every combo + in the LOCKED §6 schema, consumed by **zero** production code. Either wire it to a mechanic (see Prismatic Lensing below) or fold it out with a schema amendment.
- **F4:** [LOCKED_DECISIONS.md:800](LOCKED_DECISIONS.md) — "**Magic-12** silhouettes" lists exactly 12, omitting Anchor + Spindle (magic since S91). Stale count in a LOCKED doc.
- **F5:** 64 `HANDOFF_*.md` in root (~41 untracked local); the `/handoff` protocol auto-archives to `.handoff-archive/` (125 there). Move the strays; add a `.gitignore`/archive sweep.
- **F6:** pixi `^8.5.0` (8.19 avail), trystero pinned `0.25.0` (0.25.2 patch), vite/vitest minor. One low-risk patch PR.

---

## Council-surfaced bug-classes I under-audited (verified verdicts)

Grok + Gemini named risk-classes specific to host-authoritative deterministic P2P. I PRIME-AUDITED each against the code:

- **Hazard/sim RNG nondeterminism** → **REFUTED.** All hazards (rainbow derangement, spawner cadence, bots) use ephemeral `mulberry32` seeded from `(rngSeed, tick)` or pure tick-math; no `Math.random`/wall-clock in `state/physics/game/bots/combos`. `rngSeed` rides `WorldSnapshot` but is *stripped* from `NetSnapshot` (clients never simulate).
- **Full-state vs incremental snapshot divergence** → **REFUTED by architecture.** `NetSnapshot` is the *full* world (minus 5 host-only fields) every 10Hz, not deltas — there is no separate incremental path to drift; reconnect re-applies full snapshots.
- **Golden-replay in CI** → **ADDRESSED.** `save.replay.test.ts` (24 tests) runs in the 1779 suite.
- **Cross-engine float determinism** → **Not a live risk; becomes a host-migration prerequisite** (see F7).
- **Pixi lifecycle leaks** → **PLAUSIBLE, UNVERIFIED** → logged as F10.
- **INTENT flooding** → **CONFIRMED gap** → logged as F9.
- **Comment-density smell** (Gemini): the codebase carries extreme session-tagged archaeology in every file. It's a genuine double-edge — superb history, but exactly the soil F4-style stale comments grow in. Not a bug; a maintainability watch-item.

---

## Creative / vision ideas (deterministic, host-authoritative-friendly)

These serve F8 without adding hazards, and all are pure functions of synced state (replay-safe). The strongest ones turn the **connection graph itself** into the gameplay canvas — which is exactly the North Star.

1. **Symbiotic chaining** *(cheap, highest proof-of-vision)* — a combo grants a stat bonus to specific neighbor *types* directly bonded to it (e.g. an Anchor grants +health to bonded Spindles; a magic node grants +income to bonded Anchors). One neighbor-scan at bond creation. Makes **build order** a tactical decision. Gemini's pick to ship first.
2. **Harmonic resonance** — when ≥3 bonds on one anchor form a near-symmetric fan (angles ~120° apart, `Math.atan2` is deterministic), the anchor becomes "resonant" → income boost or a small defensive field. Rewards deliberate geometry over spam.
3. **Meta-combos / threshold verbs** *(Grok's pick over new combos)* — instead of 9 more special-cases, let **complexity thresholds change territory parameters**: e.g. a Diamond/Lattice owner gets exponential stiffness-preservation inside their radius. Emergent verbs from the systems you already have (territory engulf-sag is described by both models as "extremely high-leverage physics").
4. **Geometric scaffolding** — a completed shape (e.g. a perfect triangle) doesn't pay income; it marks its bonds `reinforced`, *unlocking* a powerful structure that can only attach to a reinforced bond. Multi-step strategic objectives from pure geometric checks.
5. **Prismatic lensing** *(also retires F3's dead `areaMultiplier`)* — a specific alignment projects a beam (line-segment) between two nodes; enemy bonds crossing it take slow damage. Cheap per-tick segment-intersection test; turns base layout into a territorial weapon.

---

## Recommended implementation order (for owner picks)

The audit **re-prioritizes** the current queue. My recommendation, synthesizing both Council members:

**Tier A — do first (cheap, every-match value / unblocks the rest):**
- **A1. F1 memoization** (½ session, Micro/Standard). Both models' #1 by value÷effort. Pure internal refactor, replay-guarded.
- **A2. Consistency+hygiene batch: F3+F4+F5+F6** (≤1h total, Micro). Clears the doc rot and clutter the audit found; makes the tree honest for everything after.

**Tier B — the strategic fork (owner call):**
- **B1. Host-migration D2** (the parked PDR, already 3-way-deliberated) — biggest **risk reduction**; makes "host death kills the match" a solvable next step. *This was the pre-audit plan.*
- **B2. Worker-sim cutover** — biggest **smoothness/stability** win; Grok argues it should precede migration because it makes both migration *and* F1 easier. Larger, riskier.
- **B3. One symbiotic combo (F8 proof-of-vision)** — smallest way to make the **core game** feel deeper this session; Gemini's pick.

**Tier C — investigate / owner-side:**
- **C1. F10 Pixi-leak heap probe** (cheap; clears or confirms a real stability risk).
- **C2. F9 INTENT token-bucket** (before any public matchmaking).
- **C3. M1** — clear the GitHub billing lock (owner-side) to restore CI/CD.

**My single recommendation if you want one call:** ship **Tier A this session** (A1+A2 — safe, high-value, fully inside a fresh PDR), *then* pick the Tier-B strategic direction (B1 migration vs B2 worker-sim vs B3 combo-depth) as its own batch. Tier A is the "make the sim faster and the tree honest" foundation that every Tier-B path benefits from.

---

*Grounding: all file:line references verified against the working tree @ 7d4d5c8. Council = Grok-4.20-reasoning (ANALYST) + Gemini-2.5-pro (AUDITOR) + Fable 5 (Supervisor); every Council-surfaced risk was PRIME-AUDITED against the code before inclusion. No production code was modified.*
