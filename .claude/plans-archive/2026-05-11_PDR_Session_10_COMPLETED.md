# PDR — Session 10 (Batch, Standard Tier)

**Generated:** 2026-05-11
**Tier:** Standard (~10–30K tokens estimated; 5 source-file priorities + closeout, ~240–280 LOC across `controls.ts`/`world.ts`/`effects.ts`/`effectsRenderer.ts`/`constants.ts`/`main.ts` + tests).
**Trigger:** S9 handoff carry-forward — user confirmed P1 (release teleport) and P2 (cross-structure merge) work; P3 (scoring) implicitly accepted (no callout). User explicitly approved cinematics options B + C + D-lite from `docs/structure-cinematics-options.md` with specific answers to the 4 open questions. New tuning request: AttractDrag "follows" the cursor (snappier) rather than swinging like a slow magnet.
**Status:** DRAFT — awaiting user `approved`.

---

## OBJECTIVE

Deliver the agreed S10 batch:

1. **Tune AttractDrag follow feel** — replace impulse-based pendulum with bounded position-lerp so the spark tracks the cursor responsively without overshoot/swing. User wording: "follow the spark a little faster rather than like a stupid magnet slowly swinging back and forward".
2. **Cinematic B (structure-wide pulse, outward from new primitive)** — on every PLACE_PRIMITIVE, the new primitive's connected component lights up in a BFS-timed ripple outward. Each primitive flashes when the wavefront reaches it; bonds brighten as conduits. Solves the post-S8 ask "structures grow / become more complicated the more you add to it — show it."
3. **Cinematic C (merge-wave with real verlet impulse)** — when a P2 merge-bond joins a previously-disjoint component, apply a small impulse to each candidate's primitives toward the new primitive (`prevPos` nudge → verlet velocity). Then a single structure-wide pulse on the now-merged union. Per user: real physics impulse, not visual-only.
4. **Cinematic D-lite (tier corner-pulse every 15 score)** — when `scoreProgress` crosses an every-15 boundary, emit a corner pulse near the progress bar. Per user: every-15, not every-10.
5. **Cinematics debug toggle** — `C` key flips `world.cinematicsEnabled`. When OFF, suppresses STRUCTURE_GROW / STRUCTURE_MERGE / SCORE_TIER (keeps BOND_COMMIT / SEVER_ERASE — those are bond-level, not structure cinematics). Per user: include the toggle.
6. **Closeout** — commit + push per priority, BACKLOG entry, reflexion (≤50 cap), boot-snapshot regen, PDR archive, handoff, session-state checkpoints.

## SCOPE

### Files touched (estimate)

| File | LOC delta | Purpose |
|---|---|---|
| `src/constants.ts` | +6 | `ATTRACT_FOLLOW_RATE`, `MERGE_IMPULSE_MAGNITUDE`, `SCORE_TIER_STEP`, `STRUCTURE_GROW_HOP_TICKS`, `STRUCTURE_FLASH_TICKS` |
| `src/input/controls.ts` | +10 / −5 | P1 — replace impulse block in `applyPerSubstep` AttractDrag branch with position-lerp toward cursor; zero residual velocity on release |
| `src/game/effects.ts` | +50 | New `GameEffect` variants: `STRUCTURE_GROW`, `STRUCTURE_MERGE`, `SCORE_TIER`; constants for lifetimes |
| `src/state/world.ts` | +60 | Emit `STRUCTURE_GROW` at end of `placePrimitive` with BFS hop-distance map; emit `STRUCTURE_MERGE` inside merge sweep loop + apply impulse to candidate-component prevPos; track `oldScore`/`newScore` and emit `SCORE_TIER` per crossed boundary; add `cinematicsEnabled: boolean = true` field (gate emission of new kinds) |
| `src/render/effectsRenderer.ts` | +120 | Handle new kinds: `STRUCTURE_GROW` per-primitive halo timed by hop * `STRUCTURE_GROW_HOP_TICKS`, bond highlights; `STRUCTURE_MERGE` union flash; `SCORE_TIER` corner pulse near progress bar; lookup live primitive positions from world (passed via `sync`) |
| `src/main.ts` | +6 | `C` keydown handler → toggle `world.cinematicsEnabled` |
| `src/game/session10.test.ts` | new ~150 | New test file: 12 tests covering P1 follow-rate, P2 STRUCTURE_GROW emission + hop map, P3 STRUCTURE_MERGE + impulse on candidate component, P4 SCORE_TIER emission at boundaries, P5 toggle suppression of new kinds + preservation of BOND_COMMIT |

**Files NOT touched:** `physics/verlet.ts`, `physics/bonds.ts`, `physics/collision.ts`, `physics/spatial.ts`, `state/save.ts` (cinematicsEnabled is debug-only, no persistence), `state/gameState.ts`, `render/structureRenderer.ts`, `render/bondVisualRenderer.ts`, `render/ui.ts`, `combos.ts`, primitive/spark/bond types.

### Out of scope (deferred)

- Audio integration (Suno track still pending).
- Phase 2 features (fog, local-MP, Inject Spiral, Steal).
- Option A (subsumed by B), Option E (renderer/physics divergence — defer to "polish" if user wants later).
- Camera zoom + vignette from Option D (D-lite explicitly chosen).
- Further physics tuning of `STRAIN_BREAK_BY_TIER`, `AUTO_BOND_RADIUS`, `MAX_RELEASE_REACH`, `PHASE_1_WIN_SCORE` — user gave no callout. Stay on current values.

## PRIORITIES (execution order)

### P1 — AttractDrag follow tuning (Micro, ~10–15 LOC)

**Current behaviour** (`controls.ts:98–113`): impulse pushed onto `prevPos` softened by `k = ATTRACT_STRENGTH / max(dist, 60)`. With `VELOCITY_DAMPING=0.998` per substep, momentum decays at ~0.886/sec — spark overshoots cursor and swings back several times before settling. User reads this as "stupid magnet slowly swinging."

**New behaviour**: position-lerp.

```ts
if (this.state.kind === 'AttractDrag') {
  const spark = this.world.freeSparks.get(this.state.sparkId);
  if (!spark || spark.state.kind !== 'Free') { this.state = { kind: 'Idle' }; return; }
  const cx = this.state.cursor.x, cy = this.state.cursor.y;
  const oldX = spark.pos.x, oldY = spark.pos.y;
  // Lerp pos toward cursor per substep. ATTRACT_FOLLOW_RATE=0.06 per substep
  // → 8 substeps/frame → ~38% closure per frame at 60Hz → halve distance in
  // ~30ms. Snappy but not teleport-y.
  spark.pos.x += (cx - oldX) * ATTRACT_FOLLOW_RATE;
  spark.pos.y += (cy - oldY) * ATTRACT_FOLLOW_RATE;
  // prevPos keeps verlet honest: residual velocity = (pos - prevPos)/dt.
  // Setting prevPos = oldPos preserves the lerp delta as instantaneous
  // velocity, so the spark has just enough momentum to feel "alive" without
  // accumulating overshoot. Verlet damping (0.998) then bleeds it.
  spark.prevPos.x = oldX;
  spark.prevPos.y = oldY;
}
```

**Side effect**: at LMB-up, spark is within ~5–10 px of cursor → `MAX_RELEASE_REACH=120` reachability gate almost never fires unless user genuinely flicks. P1 from S9 still works as intended.

**Rollback**: revert to S9 impulse formula by replacing the block with the prior 4 lines.

### P2 — Cinematic B: structure-wide pulse outward from new primitive (M, ~80–100 LOC)

**Effect shape**:
```ts
{ kind: 'STRUCTURE_GROW', tick, originPrimId, hopByPrimId: Map<PrimitiveId, number>, hopByBondId: Map<BondId, number>, color, magicWeight }
```

**Emission** (`world.ts placePrimitive` after all bonds added, before final return):
- BFS from `prim.id` over the connected component (post-merge — includes all primitives connected through any bond after the place + sweep).
- Build `hopByPrimId` (= hop count) and `hopByBondId` (= max(hop a, hop b) so a bond highlights on the later side).
- `magicWeight` = sum of `SCORE_*` contributions in this place (read from local accumulator, ≤ ~10).
- Gate on `world.cinematicsEnabled`.

**Render** (`effectsRenderer.ts STRUCTURE_GROW` branch):
- Per active effect, age in ticks since `bornTick`.
- For each entry in `hopByPrimId`: arrival = `hop * STRUCTURE_GROW_HOP_TICKS=4` (~67ms/hop), flash window = `STRUCTURE_FLASH_TICKS=18` (~300ms). If `arrival ≤ age ≤ arrival + flash`, draw a halo at the primitive's current position with alpha easing in/out over the window.
- For each entry in `hopByBondId`: same timing, draw a brightened stroke over the live bond endpoints.
- Total effect lifetime = `maxHop * HOP_TICKS + FLASH_TICKS` (auto-derived; max bond depth typically ≤ 10 in Phase 1 → ~600ms total).

**Direction**: outward from new primitive (hop=0 → fan-out).

### P3 — Cinematic C: merge-wave with real verlet impulse (M, ~50–70 LOC reusing B mechanism)

**Effect shape**:
```ts
{ kind: 'STRUCTURE_MERGE', tick, originPos: Vec2, unionPrimIds: PrimitiveId[], color }
```

**Physics impulse** (inside `placePrimitive` merge sweep loop, before adding the merge bond):
- For each primitive in `candComp.primitiveIds`, compute unit vector from primitive's pos toward `prim.pos`.
- Apply small impulse via prevPos:
  ```ts
  candPrim.prevPos.x -= dirX * MERGE_IMPULSE_MAGNITUDE;
  candPrim.prevPos.y -= dirY * MERGE_IMPULSE_MAGNITUDE;
  ```
- `MERGE_IMPULSE_MAGNITUDE = 1.2 px` per primitive — yields ~72 px/sec instantaneous velocity, decays in <1 sec via verlet damping. Bond constraints absorb most of it (HIGH-tier bonds barely move; LOW-tier bonds visibly bow then settle).
- Safety: `STRAIN_BREAK_BY_TIER` worst case = LOW 2.0× — `MERGE_IMPULSE_MAGNITUDE=1.2 px` on a 60-px bond = 2% strain delta, well below break threshold even cumulative.

**Emission**: one `STRUCTURE_MERGE` per merge bond (so cascade merges visually distinguish), with `unionPrimIds` = primary component ∪ candidate component snapshot AFTER the merge.

**Render**: brief structure-wide flash on `unionPrimIds` (single uniform halo on each, 0→1→0 over `STRUCTURE_FLASH_TICKS=18` from `bornTick+4`). No hop timing — merge is "instantaneous union, all light up at once."

### P4 — Cinematic D-lite: corner pulse every 15 score (S, ~30–40 LOC)

**Effect shape**:
```ts
{ kind: 'SCORE_TIER', tick, tier: number, color }
```

**Emission** (end of `placePrimitive`):
```ts
const oldTier = Math.floor(oldScore / SCORE_TIER_STEP);
const newTier = Math.floor(world.scoreProgress / SCORE_TIER_STEP);
for (let t = oldTier + 1; t <= newTier; t++) {
  if (world.cinematicsEnabled) world.effects.push({ kind: 'SCORE_TIER', tick: world.tick, tier: t, color: player.color });
}
```

**Render**: bloom near the progress bar (`PROGRESS_X + PROGRESS_WIDTH * displayProgress, PROGRESS_Y_TOP + h/2`) — a 40-px radial fill + outline ring, color = player.color, easing 0→0.7→0 over ~500ms. `tier` informs the pulse magnitude (tier 1 = subtle, tier 3 = larger, no separate visual escalation in S10 D-lite scope).

`SCORE_TIER_STEP = 15`.

### P5 — Cinematics debug toggle (S, ~25 LOC)

**State**: `world.cinematicsEnabled: boolean = true` (init in `makeWorld`, NOT persisted in save.ts).

**Keybind**: `C` key (uppercase or lowercase) toggles. Wire in `main.ts` alongside the existing `R`/`~` handlers.

**Gating**: emission sites in `placePrimitive` check `world.cinematicsEnabled` before pushing `STRUCTURE_GROW` / `STRUCTURE_MERGE` / `SCORE_TIER`. `BOND_COMMIT` and `SEVER_ERASE` remain unconditional (bond-level, not structure cinematics — user said "skip cinematic" not "skip all effects").

**Side effect**: when toggled OFF mid-pulse, currently-active effects continue draining (renderer doesn't read the flag); future placements emit nothing. Re-enable mid-game and the next place re-starts the cinematics. Clean.

### P6 — Closeout

1. Final test run 161/161 + new tests = ~171/171.
2. Typecheck clean.
3. BACKLOG.md S10 entry + session map update (S10 DONE → Phase 2 begins).
4. reflexion_log.md prepended with S10 entries (keep ≤50 total).
5. boot-snapshot.md regen.
6. PDR archive to `.claude/plans-archive/2026-05-11_PDR_Session_10_COMPLETED.md`.
7. HANDOFF_2026-05-11.md updated (S10 close) + archive copy.
8. Per-priority commit + push throughout (S9 rule). Final closeout commit + push.

## ALTERNATIVES (considered + rejected)

| Alternative | Why rejected |
|---|---|
| **P1**: keep impulse, just bump `ATTRACT_STRENGTH` to 200_000 | Faster onset but worse overshoot — same pendulum, just whippier. Doesn't address "swinging back and forward." |
| **P1**: impulse + per-substep extra damping | Conserves "physical feel" but slower to converge than direct lerp. User wants snappy follow, not damped pendulum. |
| **P2**: pulse inward toward COM | User explicitly said "outward from new primitive." |
| **P2**: simpler version — flash all primitives in component at once, no BFS hop timing | Loses the "wave reaching across the structure" feel; reduces to a glorified ring pop. The hop-timed cascade is the answer to "show the structure reacting." |
| **P3**: visual-only impulse (lerp render pos, not real physics) | User explicitly chose real verlet impulse. |
| **P3**: apply impulse to BOTH sides of merge (primary + candidate components) | Adds oscillation risk under cascade merges with little gain — primary side is already anchored by being where the new prim placed; impulse on candidate alone gives the "drawn in" feel. |
| **P4**: every-10 or every-5 boundary | User explicitly chose every-15. |
| **P4**: full Option D with vignette + zoom | Per cinematics doc: out of scope for S10, D-lite only. |
| **P5**: persist `cinematicsEnabled` in save.ts | Debug toggle — no persistence needed; defaults true on each load. |
| **P5**: `~+C` chord instead of bare `C` | Bare `C` is simpler and unused. `~` is already taken by stats. Bare key fine since canvas isn't a text input. |
| **Council deliberation** | S7/S8/S9 precedent waived for playtest-velocity priority. Design is fully specified by `docs/structure-cinematics-options.md` (already reviewed and picked) + user's 4 specific answers. Council adds tokens without surfacing decisions. PRIME-AUDIT after each priority remains mandatory. **Recommend waiver; user can override.** |

## RISKS

1. **R1 — P3 impulse cascade oscillation**: 3-component merges fire impulses on each candidate component independently. With `MERGE_IMPULSE_MAGNITUDE=1.2 px` and verlet damping 0.998, decay is ~0.886/sec. Cascade of 3 merges within 1 frame → ~3.6 px effective impulse, possibly visible "wobble" instead of "satisfying click." **Mitigation**: magnitude is conservative (single-impulse stable at LOW-tier worst case); if playtest shows wobble, bump down to 0.6 px and ship hot-fix.
2. **R2 — P2 BFS cost on huge components**: Phase 1 caps at ~30 placements via `PHASE_1_WIN_SCORE=50` (all-functional). BFS at emit time is O(V+E), one-shot per place. Worst case ~30 nodes × O(degree) → negligible (<<1ms). **Mitigation**: none needed, but if Phase 2 raises component sizes >200, switch to incremental hop-distance update.
3. **R3 — P2 effect drawing cost per frame**: each active `STRUCTURE_GROW` iterates its hop map. With `STRUCTURE_GROW_HOP_TICKS=4` and max hop 10, lifetime is ~700ms. Player can spam-place once per ~200ms → max ~4 concurrent effects, each touching ~30 entries → 120 lerp evaluations per frame. Easy under 7ms render budget. **Mitigation**: respect `MAX_ACTIVE_EFFECTS=64` cap (existing).
4. **R4 — P1 lerp removes "feel" of dragging through molasses**: some playtest reactions might miss the heft of the prior impulse. **Mitigation**: tunable via `ATTRACT_FOLLOW_RATE` constant; user can request 0.03 (heavier) or 0.10 (snappier) in S11 if needed. The "swinging" complaint is the explicit blocker, not the impulse character.
5. **R5 — P5 toggle hidden from players**: no on-screen hint, only `C`. **Mitigation**: legend hint line in main.ts gets a `· C cinematics` append. Or skip — it's a debug toggle, not a player feature.
6. **R6 — Multiple per-place effect emissions inflate effects queue**: a single PLACE_PRIMITIVE with 3 merge candidates could emit 1 STRUCTURE_GROW + 3 STRUCTURE_MERGE + N SCORE_TIER = ~5–10 effects. `MAX_ACTIVE_EFFECTS=64` cap absorbs ~6 places worth. **Mitigation**: existing cap covers normal play; spam-place still works under existing oldest-first culling.
7. **R7 — Save/restore breaks if `cinematicsEnabled` ends up in WorldSnapshot**: keep it OUT of `save.ts` deliberately, document that it's debug-only. **Mitigation**: explicit comment in `world.ts` field declaration.
8. **R8 — Hot-reload during S10 work**: HMR has worked through S6–S9; should continue. **Mitigation**: visually verify HMR after each priority commit. If HMR breaks (e.g. effect-state lingers across reloads), document + plan structured cold-reload.
9. **R9 — `BOND_COMMIT` already fires per-bond and the new pulse stacks on top**: with a 3-merge place, you get 4 BOND_COMMITs PLUS the new STRUCTURE_GROW PLUS 3 STRUCTURE_MERGEs. May feel busy. **Mitigation**: STRUCTURE_GROW has its own halos NOT at the bond endpoint, so visually separate from BOND_COMMIT rings. If too much, debug toggle off → only BOND_COMMITs remain (current S9 behavior).

## MITIGATIONS

Already captured per-risk above. Cross-cutting: PRIME-AUDIT after each priority (locked); browser-verify after each priority commit (HMR + visual check); per-priority commit + push (S9 rule).

## TESTING

**Per-priority vitest tests** in `src/game/session10.test.ts` (new file):

### P1 (3 tests)
- AttractDrag: spark.pos moves toward cursor by ~ATTRACT_FOLLOW_RATE * dist per substep call.
- AttractDrag: after 4 substep calls at static cursor 100 px away, spark within ~22 px of cursor (mathematical: (1-r)^4 * 100 with r=0.06 = ~78, residual 22; tolerance ±5).
- AttractDrag: prevPos = old pos (residual velocity = lerp delta, not impulse-accumulated).

### P2 (3 tests)
- `placePrimitive` with 4-prim chain target emits STRUCTURE_GROW with hopByPrimId having entries 0..3 inclusive.
- STRUCTURE_GROW hopByBondId covers all bonds in component.
- `cinematicsEnabled=false` → no STRUCTURE_GROW emission, BOND_COMMIT still emitted.

### P3 (3 tests)
- 2-component place with mergeCandidateIds → emits STRUCTURE_MERGE per merge bond with unionPrimIds covering both sides.
- Merge impulse applied: candidate-component prim.prevPos shifted by ~MERGE_IMPULSE_MAGNITUDE in direction (prim → new prim).
- Cascade 3-component merge → 2 STRUCTURE_MERGEs emitted (2 disjoint candidates after primary), each with its own union.

### P4 (2 tests)
- scoreProgress crossing 15 emits SCORE_TIER tier=1; crossing 30 + 45 in one place (theoretical multi-magic merge) → 2 SCORE_TIER events.
- No emission within a tier band.

### P5 (1 test)
- Toggle `world.cinematicsEnabled=false` → next placePrimitive: zero STRUCTURE_GROW / STRUCTURE_MERGE / SCORE_TIER, still BOND_COMMIT (unconditional).

**Total new tests**: 12. Target post-S10: ~173/173 (161 + 12).

**Existing tests**: ALL must still pass (S9 baseline 161/161). No rewrites expected — existing P1/P2/P3 semantics preserved (release teleport, cross-structure merge, scoring all unchanged in behavior).

**Browser verification** (per priority, post-commit):
- P1: drag a free spark, observe smooth tracking with no swing. Release at >120 px → reject. Release at <120 px → place at spark.pos.
- P2: place a primitive into a 5-prim chain → see pulse fan outward over ~700ms.
- P3: place a primitive between two structures → see both sides briefly nudge inward, then unified flash.
- P4: place enough primitives to cross 15 → corner pulse near progress bar.
- P5: press `C` → next place does not emit structure cinematics. Press `C` again → re-enabled.

## ROLLBACK

- Per-priority commits are atomic — `git revert <sha>` rolls back one priority without touching others.
- `cinematicsEnabled=false` (via `C` key or hard-coded in dev console: `__SPARK__.world.cinematicsEnabled = false`) gives a runtime fallback to pre-S10 visual behavior without code change.
- All new state fields are additive (no schema migration in save.ts). Pre-S10 saves load identically.

## SUCCESS_CRITERIA

- **P1**: User can drag a free spark and the spark visibly tracks the cursor without overshoot. No "swinging back and forward" feedback in next playtest.
- **P2**: Placing a primitive into a multi-prim structure produces a visible wave outward from the new prim across the connected component, decaying within ~1 sec.
- **P3**: Placing between two distinct structures produces a brief inward nudge on the candidate side(s) followed by a unified flash on the merged whole.
- **P4**: Crossing every 15-point boundary produces a visible corner pulse near the progress bar.
- **P5**: `C` key toggles structure cinematics off/on; bond-level effects (BOND_COMMIT pop, SEVER_ERASE) remain in both states.
- **Tests**: ~173/173 passing, typecheck clean, browser HMR clean across priorities.
- **Charter**: every touched module remains <500 LOC.
- **Process**: per-priority commit + push, BACKLOG + reflexion + boot-snapshot + handoff + PDR archive on close.

## DELIBERATION

**Council waiver recommended** (precedent: S7/S8/S9 batches). Reason: design fully specified by `docs/structure-cinematics-options.md` (which itself was the deliberation artifact for the cinematics work), user provided unambiguous answers to all 4 open questions, and the tuning priority (P1) is a well-understood algorithm swap. PRIME-AUDIT after each priority remains mandatory.

If user rejects waiver: run 1-round Council via `council-of-models` before P1 starts; quality gate before merging. Estimated overhead: ~8–12K tokens.

## GATE FIELDS

Once user replies `approved` (or `go`, `ship it`, etc.):
- `pdr_approved: true`
- `deliberation_completed: true`
- `unlock_source: user`
- Top-level AND per-priority entries in `session-state.json`.
- This file then archives to `.claude/plans-archive/2026-05-11_PDR_Session_10_COMPLETED.md` at close.
