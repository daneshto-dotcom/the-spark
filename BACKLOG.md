# SPARK — Build Backlog

**Plan horizon:** 5–6 main sessions to working Phase-1 prototype + 3 buffer.
**Locked decisions:** [LOCKED_DECISIONS.md](LOCKED_DECISIONS.md).
**Spec:** [SPARK_Blueprint.md](SPARK_Blueprint.md) v0.5.1.

---

## Session 8 — Bond-Visual Polish + PRIME-AUDIT Delta Closure [COMPLETED] (2026-05-11)

**Triggered by S7 PRIME-AUDIT delta + close re-read of `bondVisualRenderer.ts`.**
S7 PRIME-AUDIT flagged whip wave static + lattice cross-hatch fading at
small bond lengths; close re-read against the wheel/vortex/orbital pattern
surfaced a sister defect (drawWarped also static despite the name) and
one creative-coherent add (filament starburst should shimmer with energy).
**No physics tuning** — AUTO_BOND_RADIUS / ATTRACT_STRENGTH / strain
thresholds are playtest-gated per the S7 carry-forward and stayed
deferred.

**P1 — Whip wave drift (Micro).** Added `driftPhase = p.tick * 0.022`
inside the wave's sin term so the wave propagates A→B at one wavelength
every ~2.4s. Closes whip half of S7 PRIME-AUDIT delta.

**P2 — Lattice cross-hatch contrast (Micro).** Replaced `width: 1,
alpha: 0.5` constants with `crossWidth = Math.max(1.2, p.width * 0.55)`
and `crossAlpha = p.alpha * 0.65`. HIGH-tier cross-hatch jumps from
1.0px to 1.65px vs outline 2.4px — visible 70% weight (was 42%). Closes
lattice half of S7 PRIME-AUDIT delta.

**P3 — Warped 3-fold rotation + breathing (Micro, sister fix).** Added
`rotPhase = p.tick * 0.008` inside `sin(a*3 + rotPhase)` (full turn
~13s) and `breatheAmp = 0.3 + sin(tick*0.025)*0.08` (0.22–0.38 extent,
period ~4.2s) replacing the static 0.3 multiplier. At tick=0 breatheAmp
reads 0.3 — backward-compat with prior visual baseline.

**P4 — Filament starburst shimmer (Micro, creative add).** Ray alpha
modulates `0.40–0.70` of `p.alpha` over ~2.6s via `sin(p.tick * 0.04)`.
Main bond stroke unchanged. GraphicsMock extended to capture
`[width, color, alpha]` so alpha-only animations show up in serialize-
comparison tests; verified safe across the existing 35 S7 tests.

**P5 — Static-equality test consolidation (Micro).** Replaced the
singleton `non-animated fx.cable is identical` test with `it.each` over
the 6 silhouettes that must NOT introduce tick dependence (cable,
bracket, diamond, star, lattice, capsule). Guards the OPPOSITE regression
class — a future refactor accidentally wiring `p.tick` into a structural
silhouette.

After S8 the 12 magic silhouettes formally split: **6 ANIMATED** (wheel,
vortex, orbital — pre-existing; whip, warped, filament — added in S8) +
**6 STATIC** (cable, bracket, diamond, star, lattice, capsule). The split
matches combo tier semantics: LOW-tier unstable + HIGH-tier energetic
animate; MID-tier structural stay frame-stable. Each silhouette now has
a paired regression test (animated → tick-diff; static → tick-equality).

**P6 — Process closeout.**

**Exit gate:** 151/151 tests (was 142 + 9 net new), typecheck clean,
browser-verified at 60px bond length (pixel-hash diff at tick=0 vs
tick=120 for whip/warped/filament; identical hash for lattice — static-
silhouette signature confirmed). 5 priority commits + 1 closeout commit
on master.

---

## Session 7 — Connection-Range Gate + Per-Combo Persistent Bond Visuals [COMPLETED] (2026-05-09)

**Triggered by post-S6 user playtest.** Two issues surfaced in real play:
(a) bonds spanning the canvas (user: "you can connect from any part of the
map, which doesn't make sense"); (b) all bonds rendering as the same line
even though the 36 combos differ in stiffness/area/effectId (user: "every
shape you connect to the structure it changes the structure shape
mathematically right? ... for now it just makes a line, which is not bad
for session 6 but still not really any interesting").

**P1 — Connection-range gate (Micro).** Root cause was cursor↔spark-pos
divergence in AttractDrag: `pickPrimitiveInRange` measured from cursor while
placement used the lagged `spark.pos`. Bond length = dist(spark→cursor) +
60, unbounded. Fixed by snapping `spark.pos = cursor` at LMB-up before
PICKUP/PLACE so all three (placement, in-zone test, auto-bond range) share
cursor as source-of-truth. Bond length ≤ AUTO_BOND_RADIUS=60 by
construction. Side effect (intentional UX): cursor-into-zone now cancels
the place. 3 new vitest tests in `session7.test.ts`.

**P2 — Per-combo persistent bond visuals (Standard).** New module
`bondVisualRenderer.ts` (~290 LOC, under 500 charter). 12 magic combos
render their named silhouette stretched/anchored between bond endpoints
(filament, cable, bracket, diamond, wheel, star, orbital, lattice,
capsule, vortex, whip, warped); the 24 functional combos keep the default
straight line. Animation tied to `world.tick` (pauses with physics) for
wheel rotation, vortex phase, orbital pulse. Stress-tint + width still
applied at the structureRenderer layer — silhouettes inherit the lerped
color, near-break red-overlay pulse remains an additive top layer. 35 new
vitest tests covering dispatch + degenerate-bond fallback + animation
differentiation. Browser-verified at 110px and 60px bond lengths.

**P3 — BACKLOG.md hygiene** (this entry + S6 retro-entry). **P4 — handoff +
dev server up for next-day playtest.**

**Exit gate:** 142/142 tests, typecheck clean, browser-verified grid of all
12 magic combos. Per-priority commits (4d82b8b, 83140e0).

---

## Session 6 — Polish Pass + Git + Carry-Forwards [COMPLETED] (2026-05-09)

**P0 — Git initialization.** Project ran 5 sessions without a git repo;
initial commit (`bc89a53`) captured the full post-S5 state. Subsequent
session-6 commits per priority on top.

**P1 — Bond stiffness tier defensive refactor (S3 carry-forward).** Static
trace disproved the "tier=MID for Dot→Line" hypothesis from the original
handoff (the actual code path keeps the spark in `freeSparks` after
PICKUP_SPARK, so the lookup succeeded). Defensive refactor applied anyway:
`computeStiffnessTier` now takes `SparkType` directly, captured BEFORE
`PICKUP_SPARK` dispatch — code-clarity win even if the bug wasn't real.

**P2 — Effects-list hard count cap (S3 carry-forward).** New constant
`MAX_ACTIVE_EFFECTS=64`. Belt-and-braces over the existing lifetime ageing.

**P3 — 12 per-combo placeholder silhouettes (S3 carry-forward).** Plumbed
`visualEffectId` through PLACE_PRIMITIVE → BOND_COMMIT effect; renderer
switches per id to draw distinct ephemeral flair (filament starburst,
cable parallels, bracket triangle, diamond, wheel, star, orbital, lattice,
capsule, vortex, whip, warped + default ring for the 24 functional). All
silhouettes are ephemeral one-shot pops at the bond-commit moment —
became persistent in S7 P2.

**P4 — Browser verification + screenshots.** 13-effect probe grid via
`__SPARK__.world` mutation (Pixi pauses ticking when Claude Preview tab is
hidden, so static state-mutation + manual render is the way).

**Exit gate:** 104/104 tests, typecheck clean, 4 commits on master.

---

## Session 5 — Playability Pass [TOP PRIORITY] (2026-05-09)

**Why first:** Session 4 made the game spec-correct (distinct shapes, colorless free, player-color placed, no-build zone) but a hands-on attempt revealed the game is still unplayable due to physics tuning + input fidelity issues. None of these are spec-locked numbers — they're playability defaults that S1-S3 picked without playtest data.

**P1 — In-zone spark physics too fast.** With 10+ free sparks the zone becomes a chaotic blur. Sparks should drift slowly so the player can actually grab them.
- Likely fix: lower `SPARK_INITIAL_VELOCITY_MIN/MAX` (currently 20–80) to ~5–20
- Increase per-substep damping or add a global slow-down on free sparks inside the zone
- Possibly clamp max speed to a "drifting" cap (~30 px/sec)
- Verify the soft-cap of 50 still feels right at the new pace; may need to drop to 20–25

**P2 — Spawn rate too aggressive.** Currently 1.5/sec — players get any shape they want immediately. Should be ~10× slower so getting the right type becomes a strategic bet.
- `SPAWN_RATE_PER_SECOND` from 1.5 → ~0.15
- Re-validate the soft-cap math (at 0.15/sec a population of 50 takes ~5 min to fill, which is fine)
- Check that the stress test still works under the slower spawn

**P3 — Cursor↔spark misalignment.** Cursor and the spark/avatar are not aligned, feels weird.
- Likely root cause: `Controls.updateCursor()` scales by `canvas.width / rect.width` but Pixi's `autoDensity + resolution` doubles the internal canvas. The mouse-coord scaling is probably double-counting DPR.
- Verify against [controls.ts:187-193](src/input/controls.ts:187) — the `sx`/`sy` formula
- Test: cursor at top-left should put avatar at canvas (0,0), not (0,0)/2 or (0,0)*2

**P4 — LMB/RMB drag unreliable.** Sometimes pointer events don't fire / drag doesn't engage.
- Likely cause: `pointerdown` listener may be losing pointer capture; `pointerup` outside the canvas isn't handled (only `pointerleave`)
- Fix candidates: `setPointerCapture` on pointerdown; listen on `window` for `pointerup` instead of canvas; use `passive: false` if scroll is competing
- Also verify right-click context-menu is actually suppressed in all browsers (Chrome/Edge/Safari)

**Exit gate:** User can sit down, build a 10-primitive structure without frustration. Sparks drift slowly, new shapes are scarce-feeling, cursor visibly tracks the avatar pixel-perfect, every drag attempt commits.

---

---

## Session map

| Sess | Theme | Goal | Exit gate |
|---|---|---|---|
| **0** | Plan + scaffold | (DONE) Locked decisions + Vite/Pixi project booting | typecheck clean, dev server starts |
| **1** | Physics foundation | (DONE) Verlet + spawner + spark rendering | 6 spark types bouncing in spawner, 60s no NaN, dev stats overlay green |
| **2** | Core interaction | (DONE) Mouse + Carry-1 FSM + first bond | Grab spark, drag back, bond commits, structure renders |
| **3** | Game logic | (DONE) 36-combo lookup + structure + self-sever (BFS) + energy stub | Build 5-spark structure with 3 combos, sever splits correctly |
| **4** | Game state loop | (DONE) Win condition + state machine + save/load (WorldSnapshot) | SETUP→PLAYING→WIN→POSTGAME with JSON save |
| **5** | Playability pass | (DONE 2026-05-09) Drift speed, spawn rate, cursor alignment, drag reliability, single-action place | 50 sparks drifting cleanly; auto-bond on release-outside-zone within 60 px |
| **6** | Polish + git + carry-forwards | (DONE 2026-05-09) git init + bond-tier defensive refactor + effects-list cap + 12 ephemeral combo silhouettes | 4 commits on master, 104/104 tests, browser-verified probe grid |
| **7** | Connection-range gate + per-combo persistent bond visuals | (DONE 2026-05-09) snap-to-cursor + bondVisualRenderer for 12 magic combos | 142/142 tests, browser-verified 12-combo grid at 60px and 110px |
| **8** | Bond-visual polish + PRIME-AUDIT delta closure | (DONE 2026-05-11) whip drift + lattice contrast + warped rotation + filament shimmer + animated/static regression-test pair | 151/151 tests, browser-verified all 4 visual fixes via pixel-hash diff |
| **9** | **User playtest tuning** [NEXT] | User confirms post-S8 build; tune AUTO_BOND_RADIUS / ATTRACT_STRENGTH / strain thresholds; audio if Suno track lands | User says "yes, this works, ship Phase 2" |
| **10** | Buffer / Phase 2 prep | Reserved for remaining tuning + Phase 2 design (fog, local-MP, full disruption) | — |

If Session 9 closes all gates early → Session 10 begins Phase 2 design (fog, local-MP, full disruption: Inject Spiral + Steal).

---

## Session 1 — Physics foundation (THE GATING SESSION)

**Why this is first:** Per Grok Round 3 audit, the Verlet+spring solver gates every other system. Bugs here cascade. Land it stable before adding any interaction.

**Priorities:**
1. `src/physics/verlet.ts` — position-based integrator (60 Hz, 8 substeps, damping 0.998)
2. `src/physics/bonds.ts` — Hooke-style constraint relaxation (NOT force) with stiffness 0.2/0.5/0.8 + position-correction clamp 0.5×rest_length
3. `src/physics/collision.ts` — soft pairwise positional resolution (free sparks within zone)
4. `src/physics/spatial.ts` — cell-grid spatial hash for neighbor queries (Phase 1 ~50 entities, scales to 400)
5. `src/game/spawner.ts` — confined 250-px zone, 1.5/sec Poisson spawn, elastic boundary bounce
6. `src/game/spark.ts` — entity with `state: Free | Carried | Bonded` discriminated union
7. `src/render/renderer.ts` — Pixi v8 `Application` boot; ParticleContainer for free sparks
8. `src/render/statsOverlay.ts` — toggle `~`: FPS, physicsMs, renderMs, sparkCount

**Tests** (start lightweight in Vitest):
- `verlet.test.ts` — deterministic 300-tick run, snapshot final positions, assert no NaN
- `spawner.test.ts` — seeded 500-tick run, all sparks remain in zone

**Exit gate:** Run `npm run dev`. See 6 type-distinct sparks (one of each) bouncing in spawner zone for 60+ seconds. No NaN, no explosions. Stats overlay shows physics ≤ 5.5 ms, render ≤ 7.0 ms, FPS = 60.

---

## Session 2 — Core interaction

**Priorities:**
1. `src/input/controls.ts` — mouse listeners; drag-state FSM
2. `src/game/player.ts` — Carry-1 enforced via discriminated union `IdlePlayer | CarryingPlayer` + runtime guard on every transition
3. `src/game/primitive.ts` — placed spark with `readonly pos` post-`commit()`; stores `placerColor`, `createdTick`, `bonds: Set<BondId>` from day 1 (per LOCKED_DECISIONS § 10.1)
4. `src/state/world.ts` — single `dispatch(action: GameAction)` seam (per LOCKED_DECISIONS § 10.2)
5. Drag-attract: hold LMB on free spark in zone → spark accelerates toward cursor; release inside zone keeps it free, outside zone locks as carried
6. Drag-connect: hold RMB while carrying, drag to existing primitive in your structure → bond commits via `dispatch({type: 'PLACE_PRIMITIVE', ...})`
7. First bond proves out the constraint solver under user load

**Tests:**
- `player.test.ts` — Carry-1 FSM: pickup-then-pickup throws, drop after carry returns to idle, type-level guard prevents double-carry

**Exit gate:** grab a Dot from spawner, drag outside zone, grab another Dot, RMB-drag to first → see bond render and tug elastically when sparks move. No double-carry possible.

---

## Session 3 — Game logic

**Priorities:**
1. Wire `src/combos.ts` `lookupCombo()` into bond commit — apply `stiffnessTier`, `areaMultiplier`, render `visualEffectId` placeholder
2. Verify all 36 combos resolve (test all entries via `comboSystem.test.ts`)
3. `src/game/structure.ts` — connected-component tracking via Union-Find OR adjacency-driven BFS
4. **Self-sever** — double-RMB on a bond → BFS split → smaller side deletes (§ VIII.4); tiebreaker = max `createdTick` on each side
5. Edge cases (per spec): single-primitive side always loses; cut on connector chain → bridge deletes
6. Energy: flat `+5/sec` accumulating in `Player.energy`; render small peripheral gauge (no number, just bar fill)

**Tests:**
- `comboSystem.test.ts` — `test.each` for all 36 ordered pairs; assert `isMagical` count = 12
- `sever.test.ts` — 8 hand-crafted graphs (chain, tree, cycle, balanced split, single-primitive limb, anchor isolation); assert exact deleted set per tiebreaker rule

**Exit gate:** Build a 5-spark structure with ≥3 distinct combos (e.g., Dot→Line→Triangle→Triangle→Circle). Sever a bond → smaller side erases visibly. Energy gauge ticks up.

---

## Session 4 — Game state loop

**Priorities:**
1. `src/state/gameState.ts` — FSM: `SETUP → COUNTDOWN → PLAYING → WIN → POSTGAME`
2. Win condition: `claimedArea / canvasArea ≥ 0.51` per primitive's `areaMultiplier`. **Phase 1 placeholder for solo:** trigger WIN at 30 placed primitives (constant `PHASE_1_WIN_PRIMITIVE_COUNT`).
3. WIN state: gameplay halts, simple "WIN" text overlay (per spec § XIII Phase 1: "placeholder cinematic")
4. POSTGAME: snapshot saved via `src/state/save.ts` → `WorldSnapshot` JSON to localStorage with timestamp
5. Reset/restart on click → SETUP

**Tests:**
- `gameState.test.ts` — FSM transitions; can't enter PLAYING from POSTGAME without SETUP
- `save.test.ts` — round-trip serialize/deserialize a 30-primitive `WorldSnapshot`

**Exit gate:** Full SETUP → PLAYING → WIN → POSTGAME loop. Save file generated. Reload restores state.

---

## Session 5 — Smoothness pass

**Goals:** every Phase 1 done-gate (LOCKED_DECISIONS § 8) closes.

**Priorities:**
1. Stress runs (3 × 10 min) — log any explosions / NaN / softlocks → fix
2. Frame-budget verification — physics ≤ 5.5 ms, render ≤ 7.0 ms; if over, optimize per LOCKED_DECISIONS § 10.7
3. Verify all 6 invariants (LOCKED_DECISIONS § 11) have type-level + runtime enforcement
4. Edge-case fuzz: rapid clicks, edge-of-canvas builds, sever-during-bond-commit, carry-during-sever
5. Visual feedback tightening: bond commit pop, sever erase, energy gauge animation
6. If a Pixi-side issue: ParticleContainer for free sparks, single Graphics per Structure (per LOCKED_DECISIONS § 10.7)

**Exit gate:** all 3 Phase-1 done gates pass. Project ready for hands-on user playtest.

---

## Session 8 — User playtest tuning [NEXT]

User drives. Claude assists with quick iteration on whatever feels off in
the post-S7 build (snap-to-cursor placement + per-combo persistent bond
visuals).

**Likely tuning targets (gated on user input):**
- `AUTO_BOND_RADIUS` (60) — tighten or relax based on play feel
- `ATTRACT_STRENGTH` (60_000) — likewise
- Strain auto-sever thresholds (LOCKED_DECISIONS § 11.4 STRAIN_BREAK_BY_TIER)
- Bond visual polish — whip wave drift, lattice cross-hatch contrast at small bond lengths, star size

**Exit gate:** user explicitly says "yes, this works, ship Phase 2."

If issues remain → continues into Sessions 9-10.

---

## Sessions 9-10 — Buffer

Reserved for:
- Tuning/iteration on user feedback
- Audio integration (when user uploads Suno didgeridoo trance track + small connection SFX)
- Phase 2 design (fog of war, local-MP, full disruption: Inject Spiral + Steal)
- Phase 2 multi-color/structure work
- Mega-combo connector chains

---

## Cross-cutting rules

- **Each session ends with**: typecheck clean, tests green, git commit (or commit-equivalent), session-state.json updated.
- **Every commit** must respect § XV anti-bloat charter — no module > 500 LOC, no unrequested features, no audio (until user uploads track).
- **No vision changes.** All deviations from spec § XIII Phase 1 deliverables flagged in this doc as Phase 2+ scope.
- **Council usage**: targeted only — Grok for execution decisions, Gemini for math validation. NOT for creative redesign.
- **LOCKED_DECISIONS is sacred.** If a number must change during Phase 1, log as Open Items v2 — don't sneak.

---

## NOT in Phase 1 (per spec § XIII + LOCKED_DECISIONS)

- ❌ Networking (Phase 3)
- ❌ Multiplayer / opponents (Phase 2 local-MP first)
- ❌ Fog of war (Phase 2)
- ❌ Disruption beyond self-sever (Phase 2: Inject Spiral, Steal)
- ❌ Multi-color structures via Steal (Phase 2)
- ❌ Mega-combos / connector chains (Phase 2)
- ❌ Tutorial, menus (charter § XV)
- ❌ **Audio** — deferred until user uploads Suno didgeridoo track
- ❌ Full victory cinematic with migration/collapse (Phase 3)
- ❌ Accounts / persistence beyond local snapshot (Phase 4)

---

## Phase 1 done = working base

All 3 done-gates pass + full game loop exists + save/load works. Then Phase 2 design begins.
