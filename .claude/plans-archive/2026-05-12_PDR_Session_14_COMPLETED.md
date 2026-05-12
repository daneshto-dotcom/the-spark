# PDR — Session 14 (Avatar Disambiguation + Multi-Endpoint Redundant Bonding)

**Tier:** Standard (10–30K estimated; Council R1 mandatory, 1 round, Battle Ledger)
**Date:** 2026-05-12
**Status:** DRAFT → Council R1 → PRIME-AUDIT → user gate
**Trigger:** Direct post-S13 playtest user report (this session). Two issues distilled in the user message:
> "this highlighted cruiser on the left side is just stuck and is not the main cruiser… if i put a new shape near existing structure and end points, it only connects to the nearest endpoint. however it needs to connect to all nearest endpoints, right? … building backup lines so that your structure doesn't get deleted from raiding"

The first is a visual ambiguity report (player avatar at cursor vs. a placed Dot primitive in player color). The second is a design-level mechanic ask (auto-redundant bonding for raid-resistance). Both fit one batch because they are independent code paths (`render/avatarRenderer.ts` vs. `state/world.ts` + `input/controls.ts`) but share a single playtest verification session.

---

## P1 — Avatar disambiguation (Micro within batch)

### 1.1 OBJECTIVE
Visually distinguish the player avatar (cursor-following glow) from a placed `Dot` primitive in the same player color so the player can tell at a glance which is "alive" and which is a static structural element.

### 1.2 SCOPE
- **Files touched:** `src/render/avatarRenderer.ts` (sole owner of avatar drawing; currently 63 LOC).
- **No changes to:** `constants.ts`, `controls.ts`, `world.ts`, primitive rendering, color logic.
- **LOC delta:** ~+10 net in `avatarRenderer.ts` (pulse amplitude + phase from a monotonic clock); no new files.
- **New constants:** `AVATAR_PULSE_HZ`, `AVATAR_PULSE_DEPTH` — local module constants (NOT in `constants.ts`, since they are not gameplay-tunable; pure UI feel).

### 1.3 CONTEXT
The visual collision is exact-grade, not approximate:
- Avatar (`avatarRenderer.ts:20–23`): `AVATAR_INNER_RADIUS=4`, `AVATAR_OUTER_RADIUS=11`, fill at `player.color` (= `0xff3b6b` crimson for P1).
- Dot primitive (`constants.ts:46`, `primitive.ts:53`): `SPARK_VISUAL_SIZE[Dot]=4` → `radius = max(8, 4 × 0.45) = 8` for collision; render layer paints at `placerColor` (= same `0xff3b6b` for P1-placed dots). Inner disc of the Dot primitive is essentially the same pink filled circle as the avatar's inner core.
- During play the avatar is "alive" (follows cursor), while a placed Dot primitive is immobile (§ VI.5). The user reads both as identically-shaped dots and (correctly!) loses track of which is which when the cursor is moved away from the placed dot's vicinity.

### 1.4 APPROACH
**Chosen:** sinusoidal alpha-pulse on the avatar's outer halo + inner core, driven by `performance.now()`.

**Mechanism:**
```ts
const t = performance.now() / 1000;                  // seconds
const phase = Math.sin(t * 2 * Math.PI * AVATAR_PULSE_HZ);  // -1..1
const outerAlpha = AVATAR_OUTER_ALPHA + AVATAR_PULSE_DEPTH * phase;
const innerAlpha = AVATAR_INNER_ALPHA - 0.5 * AVATAR_PULSE_DEPTH * phase;
```
- `AVATAR_PULSE_HZ = 1.2` (1.2 Hz ≈ 833ms period — sub-heartbeat, perceptually "breathing" without feeling jittery)
- `AVATAR_PULSE_DEPTH = 0.20` (±20% alpha modulation on outer; ±10% on inner, anti-phase so the avatar appears to "throb" rather than "fade-flash")
- Anti-phase inner/outer creates a perceived "size pulse" without changing radii (cheaper + crisper than radius modulation)

**Why `performance.now()` not `world.tick`:** the avatar must keep pulsing during POSTGAME pause and tab-foreground unpaused windows where physics is paused. `world.tick` would freeze the avatar in those states — bad UX. `performance.now()` is monotonic, always advancing.

**Alternatives considered and rejected:**
- *Comet tail (last N cursor positions):* costs a tracked array + N additional draws/frame; visually noisy at slow cursor speed.
- *Recolor Dot primitives to neutral:* destroys ownership info (§ VI.4 LOCKED — placed primitives MUST tint to placer color).
- *Different shape for avatar (e.g. star/ring):* breaks "you ARE a spark" mental model (spec § I LOCKED: "a single glowing spark").
- *Brighter avatar:* doesn't disambiguate from a glowing primitive; just shifts the confusion.

### 1.5 RISKS
- **R1.1 — Pulse rate annoyance:** 1.2 Hz could read as anxious. Mitigation: empirically derived from "calm breathing" (12–18 BPM ≈ 0.2–0.3 Hz — too slow to register as alive) and "perceived heartbeat" (60–100 BPM ≈ 1.0–1.7 Hz — alive but not panicked). 1.2 Hz lands mid-range. Tunable in one constant if playtest pushes back.
- **R1.2 — Alpha pulse hidden under bloom:** if a future renderer change wraps the avatar in additive bloom, alpha modulation is suppressed (additive composition saturates). Mitigation: avatar is drawn on its own `Container` (`avatarRenderer.ts:30–34`); no shared filter chain. If bloom is later applied per-container, the pulse persists.
- **R1.3 — Test coupling:** there is no existing avatar test file. Sole risk is that `avatarRenderer.sync` becomes time-dependent — a snapshot test would fail nondeterministically. Mitigation: extract `computeAvatarAlphas(t, baseOuter, baseInner)` as a pure function; the time argument is injected.

### 1.6 TESTING
- **New unit tests** in `src/render/avatarRenderer.test.ts` (~30 LOC):
  - `computeAvatarAlphas(0, ...)` returns base alphas (phase=0).
  - `computeAvatarAlphas(t, ...)` outer alpha is bounded `[base - depth, base + depth]`; inner anti-phase within ±half-depth.
  - Quarter-period: outer is at max when phase=1, min when phase=-1.
  - Bounded outputs in [0,1] for all `t` (no negative or >1 alpha — already-low base+depth combination is safe; assert explicitly).
- **Existing tests:** none touch avatarRenderer; baseline 216/216 unchanged.
- **Browser:** verify pulse is visible-but-not-distracting in playtest. Compare side-by-side with a placed pink Dot primitive (the failure mode the user reported).

### 1.7 ROLLBACK
Single-file revert: `git revert <P1 commit>` restores the static avatar. No data shape changes, no migration. Safe to revert independently of P2 (separate commits).

### 1.8 SUCCESS CRITERIA
- Avatar visibly distinct from a placed Dot primitive at all canvas locations and during cursor-stationary moments.
- All existing 216 tests still pass; new tests pass.
- User confirms in playtest "yes, I can now tell which dot is me."

---

## P2 — Multi-endpoint redundant bonding (Standard core)

### 2.1 OBJECTIVE
On placement, in addition to the primary bond to the nearest in-component target (current behavior), create up to `K−1` additional bonds to other primitives in the **same connected component** within `AUTO_BOND_RADIUS=60`, subject to an angular-spread filter so the redundancy bonds form a fan, not a colinear cluster. The result: a single placement creates a small triangulated cell rather than a single edge, raising the cost of a single-cut raid (per spec § VIII.4) and matching the spec's "densely interconnected structures (no long thin chains exposed to single-cut amputation)" guidance (Blueprint § XIV "Topology is gameplay").

### 2.2 SCOPE
- **Files touched:**
  - `src/constants.ts` (+~10 lines: 3 new constants + 2 explainer comments)
  - `src/input/controls.ts` (+~30 lines: new helper `redundantBondTargetsInSameComponent`)
  - `src/state/world.ts` (+~40 lines: handle `extraBondTargetIds` in placePrimitive; per-bond effects + scoring; STRUCTURE_GROW still emitted once at the end)
  - `src/game/session14.test.ts` (NEW, ~150 LOC across ~10 cases)
- **Total LOC budget:** ~80 LOC source + ~150 LOC tests = ~230 LOC.
- **No changes to:** primitive shape (`primitive.ts`), bond solver (`bonds.ts`), severSplit (`structure.ts`), spawner, save/load. P2 is purely additive on the placement path.

### 2.3 CONTEXT (current code state)

**Current placement bond fan-in** (`world.ts:312–340`):
1. `targetPrimitiveId` (primary, picked at `AUTO_BOND_RADIUS=60`) → ONE bond.
2. `mergeCandidateIds` (cross-component within `MERGE_REACH_RADIUS=100`) → one bond per OTHER connected component, picking the nearest primitive in that component.

**Gap:** there is no path for multiple bonds INTO the primary's own component. If the new primitive lands near three endpoints of the same structure all within 60 px, only the nearest gets a bond. The other two near-endpoints are ignored even though bonding them would (a) cost the raider 3 sever cuts to amputate the new primitive instead of 1, and (b) match user mental model "I'm clearly placing in the middle of these endpoints — connect them all."

**Spec authority** (Blueprint § XIV "Topology is gameplay" lines 481–484):
> The mechanic now rewards: Densely interconnected structures (no long thin chains exposed to single-cut amputation); Multi-anchor structures (no single point of failure); Decoy chains; Redundant connector bridges.

The spec frames these as *player strategy axes* — the player builds defensively. P2 makes the default placement path itself produce a small slice of that defensive topology without requiring the player to plan it primitive-by-primitive. The skill axis isn't removed; it's relocated upward — the player still chooses *where* to place, but each placement now contributes raid-resistance instead of single-edge appendages.

### 2.4 APPROACH

**New constants** (`src/constants.ts`):
```ts
// Maximum total bonds a single placement can create to its primary's component.
// 1 = current behavior (primary only). 3 = primary + up to 2 redundancy bonds.
// Capped to limit verlet cost growth (each bond is one constraint per substep).
// Cross-component merge bonds (MERGE_REACH_RADIUS sweep) are NOT counted in this
// budget — those are governed by component count, not radius density.
export const REDUNDANT_BOND_K = 3;

// Minimum angular separation between the primary-target axis and a candidate
// redundancy bond (and between any two selected redundancy bonds). Prevents
// near-colinear redundancy where 3 bonds along the same line provide no
// raid-resistance (a single sever near the new prim's connection point still
// amputates all of them). 30° (π/6) means selected bonds span at least a third
// of a hexagon — meaningful angular coverage.
export const REDUNDANT_BOND_MIN_ANGLE_RAD = Math.PI / 6;  // 30 deg

// Hard cap on candidate consideration to bound the O(N) sweep cost in
// pathologically dense areas. 16 = safe upper bound on "primitives within
// AUTO_BOND_RADIUS=60" given that primitive radius is ≥8 and soft collision
// keeps placed primitives from overlapping.
export const REDUNDANT_BOND_MAX_CANDIDATES = 16;
```

**Selection algorithm** (`controls.ts`, new helper, called inside `onUp` after primary `target` resolved):

```ts
private redundantBondTargetsInSameComponent(
  primary: Primitive,
  newPrimPos: Vec2,
  k: number,                       // REDUNDANT_BOND_K
): PrimitiveId[] {
  if (k <= 1) return [];
  const component = componentOf(primary, this.world.primitives, this.world.bonds);
  // Collect candidates: in primary's component, NOT primary itself, within AUTO_BOND_RADIUS of newPrimPos.
  const r2 = AUTO_BOND_RADIUS * AUTO_BOND_RADIUS;
  const candidates: { id: PrimitiveId; pos: Vec2; distSq: number; angle: number }[] = [];
  for (const id of component.primitiveIds) {
    if (id === primary.id) continue;
    const p = this.world.primitives.get(id);
    if (p === undefined) continue;
    const dx = p.pos.x - newPrimPos.x;
    const dy = p.pos.y - newPrimPos.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > r2) continue;
    candidates.push({ id, pos: p.pos, distSq, angle: Math.atan2(dy, dx) });
    if (candidates.length >= REDUNDANT_BOND_MAX_CANDIDATES) break;  // O(N) cap
  }
  // Sort by distance — nearest first (raid-resistance: nearer endpoints are
  // tighter triangles which are stiffer and harder to sever).
  candidates.sort((a, b) => a.distSq - b.distSq);
  // Greedy angular-spread selection.
  const primaryAngle = Math.atan2(primary.pos.y - newPrimPos.y, primary.pos.x - newPrimPos.x);
  const selectedAngles: number[] = [primaryAngle];
  const selectedIds: PrimitiveId[] = [];
  for (const c of candidates) {
    if (selectedIds.length >= k - 1) break;
    let ok = true;
    for (const a of selectedAngles) {
      if (angularDistance(c.angle, a) < REDUNDANT_BOND_MIN_ANGLE_RAD) { ok = false; break; }
    }
    if (!ok) continue;
    selectedIds.push(c.id);
    selectedAngles.push(c.angle);
  }
  return selectedIds;
}
```

**`angularDistance(a, b)`** is the standard wrapped delta: `|((a − b) + π) mod 2π − π|`.

**Action shape extension** (`world.ts`, `PLACE_PRIMITIVE` action):
```ts
{
  type: 'PLACE_PRIMITIVE';
  playerId: PlayerId;
  targetPrimitiveId: PrimitiveId | null;
  stiffnessTier: StiffnessTier;
  mergeCandidateIds?: ReadonlyArray<PrimitiveId>;
  // P2: extra in-same-component target IDs for redundancy bonds. Created in
  // addition to (not in place of) the primary bond. Empty/absent ⇒ no change
  // from S13 behavior.
  extraBondTargetIds?: ReadonlyArray<PrimitiveId>;
}
```

**placePrimitive logic** (`world.ts`, post primary bond, pre merge sweep):
- For each `extraBondTargetId`:
  - Verify it exists (`world.primitives.get(id)`).
  - Verify it is in primary's component (defensive — caller should have ensured this; assert in DEV via the existing invariant pattern).
  - Verify no existing bond between new prim and that target (the new prim is freshly created so it has 0 bonds — the dedup is paranoia against a misuse where the same ID appears twice in `extraBondTargetIds`; use a `Set<PrimitiveId>` to track).
  - `makeBond` with the combo's stiffness tier (`lookupCombo(prim.type, target.type).stiffnessTier`) — same logic as merge bonds.
  - Push BOND_COMMIT effect (each bond gets its own visual, just like merge bonds).
  - Increment `scoreProgress` by `combo.isMagical ? SCORE_MAGIC_BOND : SCORE_FUNCTIONAL_BOND` — same as primary + merge bonds. Each redundancy bond is a real bond, scored uniformly.
- `primaryPreExistingPrims` snapshot (S13 P2) is taken AFTER the primary bond but BEFORE redundancy bonds, so STRUCTURE_GROW's outward impulse still applies to the pre-existing component including the redundancy-bonded prims. The redundancy bonds become part of the post-bond component the STRUCTURE_GROW BFS traverses, so they light up in the wave.
- `mergedComponents` set already tracks the primary's full component; redundancy bonds don't change which components are "covered" (still just one — the primary's), so the cross-component merge sweep that runs after is unaffected.

**Edge case — anchor placement (`targetPrimitiveId === null`):**
- Anchor placements have no primary component → no redundancy bonds possible. The helper returns empty; world.ts naturally skips. `mergeCandidateIds` and the cross-component merge sweep still operate as before (anchor place can still merge multiple distinct components into a new union).

**Edge case — primary's component has only one primitive (i.e., primary is a lone anchor):**
- `component.primitiveIds.size === 1` → no other candidates → empty list. Same result as anchor placement minus the bond to primary itself.

**Edge case — `K=1` (configured min):** Helper returns empty immediately. Path is a pure superset of S13 behavior.

**Edge case — DEV invariant violation (`extraBondTargetIds` contains a non-same-component id):** in `import.meta.env.DEV`, throw via the existing pattern (matches `placePrimitive`'s carry-1 check at line 267). In production, defensively skip the bad id (continue the loop) — never crash the user.

### 2.5 INTERACTIONS WITH EXISTING SYSTEMS

| System | Interaction | Resolution |
|---|---|---|
| `MERGE_IMPULSE` (S13 P3 inward push on cand component) | Cross-component merge bonds still apply their impulse. Redundancy bonds (intra-component) do NOT trigger any impulse — both endpoints already belong to the same rigid-equilibrium structure; an inward impulse would induce non-zero net force inside the structure, perturbing equilibrium. | Redundancy bonds emit BOND_COMMIT only; no verlet impulse. |
| `STRUCTURE_GROW` outward impulse (S13 P2 on primary's pre-existing component) | Post-bond component now includes the redundancy-bonded primitives. They are part of the centroid calculation and receive the outward push. This is the correct physical reading — the whole structure puffs out, including the redundantly-bonded prims. | Snapshot `primaryPreExistingPrims` exactly once after the primary bond and BEFORE the redundancy bonds, but the redundancy targets are *already* in primary's pre-existing component (that's the whole condition), so they're included by definition. |
| `severSplit` BFS topology rule (`structure.ts:118`) | Redundancy bonds create cycles in the new primitive's neighborhood. Per `severSplit:131`: "If sideA reached b, the cut was on a cycle — both sides are still connected; nothing to delete." Cutting one of the redundancy bonds now leaves the structure intact rather than amputating the new primitive. **This is the entire point of P2.** | No code change needed — `severSplit` already handles cycles correctly. P2 just creates more of them by default. |
| `bfsHopMap` (`structure.ts:58`, used by STRUCTURE_GROW) | Cycles now occur naturally at depth-1 hop from `originPrimId`. Existing BFS handles cycles via `hopByPrimId.has(otherId)` check (line 80) — a primitive's hop is set once, on first visit. Redundancy bonds become extra edges at the same hop level — the bond's hop is `max(curHop, otherHop)`, so they animate at the appropriate time. | No code change. Existing logic absorbs cycles. |
| `lookupCombo` order-dependence (`combos.ts`, § V.1 LOCKED) | Each redundancy bond gets its own combo lookup `(new.type → target.type)`. Different targets can yield different stiffness tiers; this is correct — each bond is its own combo. | Confirmed; already the merge-bond pattern. |
| `scoreProgress` + SCORE_TIER pulse | Each redundancy bond adds to score per its combo (magic +3 / functional +1). SCORE_TIER tier-crossing detection compares `oldScore` (captured before primary bond) vs. `world.scoreProgress` (after all bonds including redundancy + merge) — so multi-tier crossings via redundancy fire one SCORE_TIER per crossed band, same as the merge-multi-tier case (S10 P4 / S13 P4). | Tier crossing loop already iterates `t = oldTier + 1; t <= newTier; t++` — handles N bands naturally. No code change. |
| Save/load (`save.ts`) | Redundancy bonds are stored as regular bonds in `world.bonds`. WorldSnapshot's bond serializer already enumerates all bonds. | No code change. Verified by reading save.ts (not opened in this PDR draft; will verify at execution time). |
| § XV LOC charter | `world.ts` is currently 587 LOC (17% over soft 500 charter). P2 adds ~40 LOC → ~627 LOC (25% over). **Increases the charter breach.** The S13 PRIME-AUDIT carry-forward already named `placePrimitive` extraction as the S14 fix. P2 makes that more urgent but doesn't BLOCK on it — the redundant-bond logic adds cohesively to the existing placePrimitive function (same code region, same concern). Recommended: ship P2 in `world.ts` first; do the `placePrimitive` → `src/state/placePrimitive.ts` extraction as a SEPARATE follow-up priority (it's a pure mechanical move; carries no behavior change). | Documented in §6; carry-forward to S15 if not done in S14. |

### 2.6 RISKS

- **R2.1 — Verlet cost growth.** Each placement now creates up to `K=3` intra-component bonds + up to `M` cross-component merge bonds. Worst case in a saturated area: 3 + 5 = 8 bonds per placement. Solver cost is O(bonds × substeps) = O(8 × 8) = 64 distance solves per substep added per placement. At 60 Hz × 8 substeps = 480 solves/sec per placement. With ~30 placements building toward win, total bond count grows from ~30 to ~90 → ~57,600 solves/sec total. Well within the 5.5ms physics budget (§ 10.6) on any modern CPU. **Mitigation:** REDUNDANT_BOND_MAX_CANDIDATES caps the O(N) sweep; K bounds the bond count growth; angular-spread filter usually selects << K-1 in non-pathological geometry. **Verification:** stats overlay (`~` key) shows physics ms; spot-check post-implementation.

- **R2.2 — Raid mechanic balance.** P2 makes structures more raid-resistant by default. If the playtest reveals raids feel *too weak* now (every cut just hits a cycle and does nothing), the right tuning is K=2 (primary + 1 redundancy = stiff triangles only) or restore K=1 (no redundancy; pre-S14 behavior). Tunable in a single constant. **Cannot become a one-way door:** save files don't store K; bonds are bonds regardless of how they were created. Reverting K=1 means future placements stop adding redundancy bonds — existing redundancy bonds remain until severed.

- **R2.3 — Angular-spread filter degenerates.** If user places in a corridor (e.g. between exactly 2 colinear endpoints), the spread filter prevents both from being picked — only the nearest gets a redundancy bond, the second is filtered. **Resolution:** that's the *correct* behavior — colinear bonds don't add raid-resistance (a single sever between them still amputates). The filter exists precisely to suppress this case. Result: K=3 placements yield triangles by default; degenerate-geometry placements yield K=2 (primary + 1 different-angle backup) silently. User can override by placing twice in different positions.

- **R2.4 — Score inflation.** Each redundancy bond adds to scoreProgress. A 3-bond placement at 1 magic + 2 functional = 5 points instead of 1 (5×). PHASE_1_WIN_SCORE=50 was tuned (S9) against the old 1-bond default. **Resolution:** raise PHASE_1_WIN_SCORE proportionally, OR don't score redundancy bonds. Decision: **score them**, raise threshold from 50 to 80 (1.6× to absorb avg ~1.5 extra bonds/place × magic-weighted). The user explicitly asked for redundant bonds because they're load-bearing; making them score-zero would undersell their cost (they ARE real bonds the player committed). Threshold is one knob; verified in test that a 20-placement game of all-functional placements with full K=3 redundancy lands near WIN. Playtest will confirm; this is one tunable.

- **R2.5 — Spec/locked-decision conflict.** LOCKED_DECISIONS.md does NOT pin "one bond per placement" — the rule lives in `controls.ts:onUp` as a code default. Spec § XIV.13 says "+1 build-action credit per [connector chain]" but neither mandates nor forbids multi-bond placements. **Verified absence:** grep for `multi.*bond|redundan|backup.*line` in LOCKED_DECISIONS.md, SPARK_Blueprint.md, reflexion_log.md returned only the Blueprint passages framing redundancy as a *player strategy axis* (Blueprint lines 262–268, 481–484). No prior decision is overridden by P2. **Conclusion:** P2 changes a code default, not a locked rule. If user later wants to revert to "spec-pure single-bond placement, redundancy via multiple placements only," K=1 is the one-line revert.

- **R2.6 — Test coverage for cycle behavior.** `severSplit` cycle handling was tested in S3 tests via simple triangle topologies. P2 makes cycles common in production world states. **Mitigation:** session14.test.ts adds an end-to-end "place into corner → sever one redundancy bond → assert structure intact" test confirming cycle-on-redundancy works in the dispatch path, not just `severSplit` in isolation.

### 2.7 TESTING

`src/game/session14.test.ts` (NEW, ~10 cases, ~150 LOC):

**P1 avatar tests** (in `src/render/avatarRenderer.test.ts`):
1. `computeAvatarAlphas(0, baseOuter, baseInner) === { outer: baseOuter, inner: baseInner }` (phase=0).
2. Quarter-period phase=+1: outer = baseOuter + depth; inner = baseInner − halfDepth.
3. Quarter-period phase=−1: outer = baseOuter − depth; inner = baseInner + halfDepth.
4. Bounded: for `t ∈ {0, 0.1, 0.5, 1.0, 100.0}`, outer and inner both in [0, 1].

**P2 multi-bond tests** (in `src/game/session14.test.ts`):
1. **K=3 with 3 valid endpoints** — place near a 5-prim chain with three nearby endpoints; assert 3 bonds created from new prim (primary + 2 redundancy); assert all in same component as primary; assert angular spread ≥ MIN_ANGLE between any two.
2. **K=3 with only 2 valid endpoints** — place near a 2-prim line; assert 2 bonds (primary + 1 redundancy), not 3.
3. **K=3 with 1 valid endpoint** — place near a single primitive; assert 1 bond (primary only).
4. **Angular spread filter** — place at center of 3 colinear-arrayed primitives; assert primary + 1 (the nearest of the off-axis pair if any; otherwise primary alone). Verify filter rejects near-colinear candidates.
5. **AUTO_BOND_RADIUS boundary** — place such that a candidate is at distance 59 (in) and another at 61 (out); assert only the in-range one is selected.
6. **Anchor place** — place with `targetPrimitiveId=null`; assert no redundancy bonds (empty `extraBondTargetIds`).
7. **Cross-component independence** — place near both primary's component (with 2 redundancy candidates) AND a separate 1-prim component within MERGE_REACH_RADIUS; assert primary bond + 2 redundancy bonds + 1 merge bond = 4 total bonds.
8. **Severability — cycle preserves structure** — create a K=3 placement (triangle); sever one of the redundancy bonds; assert structure remains a single connected component (no amputation).
9. **Severability — non-cycle bond still amputates** — create a chain with one redundant placement at the tip; sever the chain mid-spine (NOT inside the redundancy triangle); assert smaller side erases per § VIII.4.
10. **BOND_COMMIT effects per bond** — assert `world.effects.filter(e => e.kind === 'BOND_COMMIT')` count equals total bonds created (primary + redundancy + merge), and each effect has the correct `visualEffectId` per its combo.
11. **scoreProgress accounting** — assert score delta = sum of per-bond contributions (magic=3 each; functional=1 each; anchor never contributes in target≠null cases).

**Regression sweep:** all 216 existing tests must still pass. Adjust expectation in any test that asserts `world.bonds.size === 1` on a placement where redundancy could now fire — search for that pattern.

**Browser playtest:** the user playtests after commit, verifying (a) it feels right when bonds fan out; (b) raids on triangles fail satisfyingly; (c) SCORE_TIER pulses still fire at expected score levels; (d) physics ms in stats overlay stays under budget.

### 2.8 ROLLBACK
Per-priority commits enable single-priority revert:
- **Revert P2 only:** `git revert <P2 commit>` removes redundancy bonds. P1 avatar pulse stays.
- **Disable P2 without revert:** set `REDUNDANT_BOND_K = 1` in constants.ts → helper short-circuits → behavior identical to S13. One-line revert without git history rewrite.
- **Re-tune:** K, MIN_ANGLE, MAX_CANDIDATES, PHASE_1_WIN_SCORE — all in `constants.ts`, isolated knobs.

### 2.9 SUCCESS CRITERIA
- New placements near a single existing structure with multiple nearby endpoints create up to K bonds, observable as visible bond strokes in playtest and as `world.bonds.size` growth in tests.
- All existing 216 tests pass; new ~11 tests pass.
- Severing a redundancy bond no longer amputates — confirmed by test #8 and in playtest.
- Physics ms stays under 5.5ms budget under typical play.
- User confirms in playtest: "yes, this feels like building real structures, raids feel harder."

---

## 3 · Batch-level fields

### 3.1 Estimated tokens
Best estimate: **~24K** (heavy reasoning on the bonding interaction with severSplit / STRUCTURE_GROW + Council R1 cost + ~230 LOC + tests + closeout). Standard tier comfortably. Token tracking deferred to UI counter per S35 reflexion.

### 3.2 Execution order
1. P1 (avatar) first — independent, small, fast to validate; bumps confidence + cleans up the cheaper issue before tackling the design-load P2.
2. P2 (multi-bond) second — uses the validated codebase state from P1's commit as the baseline.
3. P3 closeout — standard.

### 3.3 Commit strategy
Per-priority commits (S9 per-priority-commit-vs-thematic-batching reflexion): P1 and P2 touch separate file regions (`avatarRenderer.ts` vs. `state/world.ts` + `input/controls.ts` + `constants.ts`), so they get separate atoms.

### 3.4 Deliberation
**Standard tier — Council R1 (3-way: Claude + Grok DISRUPTOR + Gemini AUDITOR) MANDATORY per CLAUDE.md DELIBERATION rule.** Battle Ledger recorded.

PRIME-AUDIT (Rule 20) runs post-synthesis, BEFORE presenting to user. Adversarial self-audit asks:
- What did Council rubber-stamp without challenging?
- Is the angular-spread filter justified by raid-resistance theory, or is it bike-shedding the math?
- Does PHASE_1_WIN_SCORE 50→80 over-correct or under-correct for the avg bond count change?
- Did I miss interaction with any S10-S13 cinematics path?
- Is K=3 a defensible default, or should it be K=2?

### 3.5 Charter posture
P2 will increase `world.ts` from 587 LOC to ~627 LOC (~25% over). S13 PRIME-AUDIT carry-forward already flagged `placePrimitive` extraction as the S14 fix. RECOMMENDATION: ship P2 as a follow-up to placePrimitive extraction OR commit to running the extraction as a same-session P3 before closeout. **DEFERRED to user decision at PDR approval gate** — does the user prefer (a) P2 in-place + extraction next session, or (b) P2 preceded by extraction (adding ~1 priority and ~20 min execution)? Cost-benefit: (a) faster, P2 ships sooner, charter further breached short-term; (b) cleaner, the new `placePrimitive.ts` would already include P2 logic, world.ts drops to ~340 LOC. Default recommendation: **(a)**, because extraction is a mechanical move with zero behavior change and is safer post-P2 once redundancy logic is stable.

### 3.6 Carry-forward log
- **From S13 PRIME-AUDIT:** `placePrimitive` extraction (deferred per §3.5).
- **From this PDR:** if R2.4 (score inflation) needs retuning post-playtest, PHASE_1_WIN_SCORE is the one knob.
- **From this PDR:** if R2.1 (verlet cost) shows up in stats overlay, REDUNDANT_BOND_K is the throttle.

---

## 4 · Anticipated Council challenges (for self-audit)

Drafted so the Council can confirm or refute pre-emptively:

| # | Challenge I expect | My pre-response |
|---|---|---|
| C1 | "Same-component multi-bond breaks the spec's player-strategy framing — players should EARN redundancy, not get it free." | Spec frames redundancy as a *strategy axis*, but doesn't mandate the bond density of a single placement. P2 raises the baseline; player skill still differentiates *where* you place. Tunable to K=1 if playtest pushes back. |
| C2 | "Angular spread of 30° is arbitrary." | Hexagonal coverage — 6 bonds at 60° spacing fully surround a point. 30° minimum is half that, ensuring 3 bonds can't fit on a single half-line. Tunable. |
| C3 | "K=3 doubles or triples bond physics work." | Worst-case 3× per placement, but average closer to 1.5–2× given angular filter and AUTO_BOND_RADIUS=60 constraints. Verlet headroom is 5.5ms / ~1000 bonds (current cost is far under). No regression expected; stats overlay confirms. |
| C4 | "Scoring redundancy bonds means a high-K player wins faster than intended." | Yes; threshold raised proportionally (50→80). The tunable is the threshold, not the per-bond weight. Alternative — don't score them — undersells the player's investment. |
| C5 | "What about a redundancy bond between two primitives that ALREADY share a direct bond?" | Defensive dedup: skip if an existing bond exists between `prim.id` and `target.id`. New prim has 0 bonds at creation, so the only collision case is `extraBondTargetIds` containing duplicates. `Set<PrimitiveId>` dedup at action-receiver covers this. |
| C6 | "Avatar pulse at 1.2 Hz could trigger PEAT (photosensitive epilepsy) for sensitive users." | PEAT triggers at >3 Hz with high-contrast luminance flicker. 1.2 Hz with 0.2 alpha modulation on a small region is well under threshold (compare: typing cursor blinks at ~1 Hz). Document tunable in case future accessibility audit lowers it. |
| C7 | "Why not also pulse the avatar's mid ring?" | Three-channel pulse (inner + mid + outer) creates unwanted shimmer at small sizes. Anti-phase two-channel pulse is the sweet spot — perceived as size-modulation without animating radius. |
| C8 | "STRUCTURE_GROW outward impulse on a now-triangulated cell will introduce cross-bond tension." | Outward impulse is along (centroid → p), a single direction per primitive. New triangulation bonds resist along (cand → new prim) directions; the strain delta is bounded by `STRUCTURE_GROW_IMPULSE=0.8` px on bonds ≥ 20 px = 4% strain. HIGH-tier break threshold is 25% (per `STRAIN_BREAK_BY_TIER`). Safe by 6× margin. |
| C9 | "What if user's playtest just wanted the SAME bond + visual indication that other endpoints were 'considered but not bonded'?" | Reread of user message: "it needs to connect to all nearest endpoints" — explicit on multi-bond, not visual-only. If R2.2 fires (raid feels weak), K=2 or K=1+visual-hint can be an S15 amendment. |
| C10 | "Single-prim ‘lone anchor' Dot primitives (current playtest pain point — they look like cruisers) — does P2 address them?" | No, P1 addresses the visual confusion. P2 doesn't change lone-anchor behavior. Lone anchors remain — they're a valid placement outcome (drop a spark far from any structure). If user wants lone anchors disallowed entirely, that's a separate PDR. |

---

## 5 · Battle Ledger (Council R1)

| Round | Source | Model | Verdict | Headline |
|---|---|---|---|---|
| R1 | Claude (proposer) | claude-opus-4-7 | SHIP | This PDR (pre-Council) |
| R1 | Grok (DISRUPTOR) | grok-4.20-0309-reasoning | **REVISE** | 8 challenges + ports alternative |
| R1 | Gemini (AUDITOR) | gemini-2.5-pro | **REVISE** | 6 invariant stresses + 8 edge cases + perf audit + design doubts |

### 5.1 Grok DISRUPTOR — challenge-by-challenge disposition

| # | Challenge | Disposition | Reasoning |
|---|---|---|---|
| G1 | User said "all nearest endpoints" — angular filter is literal misread | **REJECT** (partial revise) | User said "all NEAREST endpoints" — modifier "nearest" is in their phrasing. "All within range" sans filter would create colinear redundancy that doesn't survive a single sever (defeats the stated raid-resistance goal). Filter SERVES intent. **However**, soften filter from 30° → 25° to admit more redundancy in moderate-spread geometry. Tunable. |
| G2 | K=3 is arbitrary; use per-type maxDegree table | **REJECT** | Per-type degree adds 6-entry table + lookup + 6× test coverage. Phase-1 prototype scope; K=3 across types is a defensible default; per-type tuning is a Phase-2 amendment when combo-table strategy is more developed. Recorded as Phase-2 candidate. |
| G3 | Angular filter is geometrically naive; π/6 not defensible | **PARTIAL ADOPT** | Soften to π × 25/180 (25°); document explicitly that 25° is a playtest-tunable. Target-relative angular measure noted as Phase-2 alternative (more complex, requires per-target bond-angle bookkeeping). |
| G4 | STRUCTURE_GROW + parallel constraint strain claim is FALSE | **PARTIAL ADOPT** | Verified against `bonds.ts:58`: breaks on EXTENSION ONLY. STRUCTURE_GROW outward impulse on existing prims → bonds connecting new-prim-to-existing extend RADIALLY (4% on 20-px bond). With K=3 triangulation bonds, worst case is one bond seeing 2× transient strain via asymmetric geometry = 8%, still under HIGH-tier 25% break. Margin preserved. **Adopted concretely:** add strain-cascade test #12 (pre-strain a bond to 22% then place K=3) to verify the system either holds OR cleanly severs the pre-strained bond. |
| G5 | Score threshold 50→80 is voodoo | **ADOPT (variant)** | Keep PHASE_1_WIN_SCORE=50. **DO NOT score redundancy bonds.** Frames redundancy as defense, not score velocity. Player still gets primary-bond score + cross-component merge-bond scores per S13 logic. This is cleaner than score-multiplier knobs. |
| G6 | Avatar pulse untested; chevron is better | **REJECT** | Pulse correctly addresses static-cursor visual collision; chevron only differentiates during motion (cursor already differentiates by motion when moving). PEAT concern (1.2 Hz) is below threshold (PEAT triggers at >3 Hz high-luminance). Documented tunable in case future accessibility audit lowers. |
| G7 | LOC charter hypocrisy — extract before adding | **ADOPT** | Restructure P2 into P2.0 (mechanical placePrimitive extraction, zero behavior change, validated by 216 existing tests) + P2.1 (redundancy bond logic in the new file). world.ts shrinks first; new logic lands in cleaner seam. |
| G8 | Scoring redundancy at full value contradicts raid-fantasy | **ADOPT** | Same as G5 — no scoring for redundancy bonds. |
| GA | Alternative: per-type "ports" with consumption + regeneration | **REJECT for Phase 1** | ~150+ LOC, requires port state + regeneration timer + visual indicator. Recorded as Phase-2 candidate (aligns with § XIV.11 connector-chain credit which is `[PHASE 2]`). |

### 5.2 Gemini AUDITOR — disposition

**Invariant review** (Gemini § 2):
- `order-dependence` STRESSED but unviolated — ADOPT: §2.5 row added below to document amplification.
- `sever topology` STRESSED — ADOPT: explicit cycle-preserves-structure test (test #8) already in P2.7; expanded to include a multi-cycle structure.

**Edge cases** (Gemini § 3):
- G3.1 redundancy/merge overlap → **ADOPT** DEV assertion enforcing disjointness; the algorithm already guarantees by construction (intra-component for redundancy, inter-component for merge) but the assertion catches caller-side bugs.
- G3.2 pre-existing strain cascade → **ADOPT** test #12 (also covers Grok G4).
- G3.3 malformed action payload → **ADOPT** DEV invariant checks: duplicate ids, self-id, primary-id, non-existent id all rejected in DEV via `console.error` + skip in production.
- G3.4 zero candidates → **already covered** by test #3.
- G3.5 MAX_CANDIDATES boundary → **ADOPT** test #13 (17 candidates → only first 16 considered).
- G3.6 colinear degeneracy → **already covered** by test #4; renamed for clarity.
- G3.7 K=1 boundary → **ADOPT** test #14 (K=1 → 0 redundancy bonds; pure S13 behavior).
- G3.8 floating-point precision → **ADOPT** angular comparison uses `>= MIN_ANGLE - 1e-6`.

**Missing tests** (Gemini § 4): all adopted — test list grows from 11 to ~16 cases.

**Performance audit** (Gemini § 5):
- Worst-case bonds-per-place = K + M (3 + ~5) = 8 in pathological density. Verlet headroom intact.
- Sort cost bounded by MAX_CANDIDATES=16 → effectively constant.
- componentOf BFS on 100+-prim component is sub-ms; **NOT a concern** in Phase-1 scale (PHASE_1_WIN_PRIMITIVE_COUNT=30; PHASE_1_WIN_SCORE=50 → max ~50 prims practical).
- No memory leaks identified.

**Contract changes** (Gemini § 6):
- BOND_COMMIT event count per place: was `1+M`, now `1+[0..K-1]+M` — **DOCUMENT** in PDR; no test asserts an exact count without filtering, verified via grep `effects.length` against existing tests.
- Structure graph density up → STRUCTURE_GROW visual change ("snap" not "bloom"). Document as expected aesthetic change in playtest verification.
- scoreProgress velocity unchanged (redundancy bonds don't score, per G5/G8 adoption).

**Design doubts** (Gemini § 7):
- "Defer refactor": Gemini disagrees with original PDR; **ADOPT** (matches Grok G7).
- "Greedy not optimal": **NOTE** — Phase-1 acceptable; Phase-2 may revisit with global-spread optimization.
- "Magic constants": **NOTE** — all in constants.ts, single-line tunables.

### 5.3 Synthesis summary

**Adopted changes to PDR:**
1. P2 restructured into P2.0 (extract placePrimitive) + P2.1 (redundancy logic). Total batch now 4 work commits (P1, P2.0, P2.1) + closeout.
2. **Do not score redundancy bonds.** PHASE_1_WIN_SCORE stays at 50. Redundancy bonds emit BOND_COMMIT only.
3. Angular filter softened 30° → 25°. EPSILON 1e-6 added to comparison.
4. DEV invariant checks: malformed `extraBondTargetIds` (duplicates, self-id, primary-id, missing id), redundancy/merge disjointness.
5. Test count 11 → ~16 cases (added: pre-strain cascade, K=1 boundary, MAX_CANDIDATES boundary, malformed payload, save/load roundtrip with cycle).
6. Document order-dependence amplification + STRUCTURE_GROW "snap not bloom" aesthetic change.

**Rejected proposals:**
- Per-type maxDegree table (Grok G2) → Phase-2 candidate.
- Avatar chevron (Grok G6) → pulse is correct mechanic.
- Ports alternative (Grok GA) → Phase-2 candidate.
- Literal "all-within-radius" no-filter bonding (Grok G1) → defeats raid-resistance via colinear redundancy.

**Carry-forward to Phase 2 or later:**
- Per-type maxDegree mechanic
- Target-relative angular filter
- Ports mechanic
- Adaptive K based on local component density

---

## 6 · PRIME-AUDIT delta (Rule 20 — post-synthesis self-audit)

Adversarial post-synthesis review BEFORE presenting to user.

### 6.1 Audit questions
**Q1: Did the synthesis rubber-stamp Grok G4's "false claim" charge or did I verify?**
A: Verified against `bonds.ts:58`. Bonds break on EXTENSION only (`dist > rest * STRAIN_BREAK_BY_TIER[tier]`). STRUCTURE_GROW pushes existing prims outward from centroid → bonds connecting new prim to existing prims extend RADIALLY = 4% strain on 20-px bond. K=3 worst-case asymmetric pinch yields ~8% on one bond (HIGH-tier breaks at 25%). Margin of 3× preserved. **Not a rubber-stamp.** Test #12 added as belt-and-braces. Grok's "Σk effective stiffness" framing was force-domain thinking; Verlet is position-domain, so per-bond corrections compose differently. Per-substep clamp (`POSITION_CORRECTION_CLAMP_RATIO=0.5`) bounds aggregate motion.

**Q2: Did I adopt extraction too quickly?**
A: Cost is one extra commit (~5K tokens for the mechanical move plus test re-run validation). Benefit is (a) world.ts drops below 500-LOC charter, addressing S13 PRIME-AUDIT carry-forward; (b) P2.1 lands in clean seam with concentrated test surface. Net positive. Engineering-best-practice consensus from both Council members independently. Adopt.

**Q3: Is "no score for redundancy" the right call, or should it be 0.5×?**
A: Considered. 0.5× requires fractional-score logic (currently `world.scoreProgress: number`, integer-valued from `SCORE_*=1|3`). Adopting half-weight would force either (a) `SCORE_REDUNDANCY=1` (gives functional-bond weight regardless of combo magic-ness, breaking the magic-vs-functional schema), or (b) floating-point scoreProgress (changes the type contract, requires HUD display formatting changes). Cleanest is zero-score: redundancy bonds are DEFENSIVE, not score-velocity. User did not ask for faster wins; they asked for raid-resistance. Match the ask.

**Q4: Is 25° the right angular threshold?**
A: 30° → 25° softens to admit more redundancy formation. At 25°, two bonds at the new prim can be as close as 25° apart — still meaningfully non-colinear (a 25° wedge spans ~10° of unique "raid coverage" per bond direction). Tunable; first-iteration default; expect playtest feedback.

**Q5: Did I miss any interaction with the cinematics paths (S10–S13)?**
A: Audited:
- BOND_COMMIT (`world.ts:323` per bond) → fires per redundancy bond with its own combo's `visualEffectId`. ✓
- STRUCTURE_MERGE → unchanged path; redundancy bonds are intra-component, do not trigger merge. ✓
- STRUCTURE_GROW → emits ONCE per placement at the end, BFS over post-bond component (which now includes redundancy edges as cycle-back-edges, hop is correctly `max(curHop, otherHop)`). ✓
- SCORE_TIER → unchanged; tier-crossing detection works on the (smaller, no-redundancy-contribution) scoreProgress delta. ✓
- MERGE_IMPULSE → unchanged; cross-component only. Redundancy bonds receive NO impulse (intra-component, structure equilibrium preserved). ✓
- SEVER_ERASE → fires on bond severs; unchanged. ✓
No silent regressions found.

**Q6: Did I miss any spec-locked rule?**
A: Re-audited:
- § VIII.4 sever rule → handled by existing severSplit cycle-detection. ✓
- § XIV.13 build-action credit (+1 per placement) → unchanged (one placement = one credit regardless of bond count). ✓
- § VI.4 placerColor inheritance → unchanged. ✓
- § V.1 combo order-dependence → preserved per-bond. ✓
- § XIV.10 mega-combo multiplier → not yet implemented (Phase-2); unaffected. ✓
- § IX.5 no-build-zone → unchanged. ✓
No conflicts.

**Q7: Did I miss any test case?**
A: After Gemini adoption, test count is ~16. Audit residual:
- Save/load roundtrip with K=3 placement (cycle preservation in serializer) → add as test #16.
- Per-bond `BOND_COMMIT` `visualEffectId` correctness for redundancy bonds → covered in test #10.
- Anchor placement still emits primary STRUCTURE_GROW (one-prim component) → covered in existing S10 tests; verify no regression.

**Q8: Is the extraction safe under existing tests?**
A: P2.0 is a mechanical code-motion. All 216 existing tests should pass identically. If any fail, the extraction was incorrect — that's the test. Validation: `npx vitest run` post-extraction must be 216/216 unchanged.

### 6.2 PRIME-AUDIT delta — material changes from R1 synthesis
- Test #16 added (save/load roundtrip with cycle).
- `BOND_COMMIT visualEffectId` validation in test #10 made explicit (was implicit).
- Anchor placement regression check noted (existing S10 tests cover; verify still pass post-P2).
- Added explicit assertion in P2.1: STRUCTURE_GROW BFS hopByBondId correctly hops via cycle edges (max-of-endpoints rule already correct per `structure.ts:88`; nothing to change).

### 6.3 PRIME-AUDIT verdict
**SHIP — pending user gate.** No further revisions; synthesis is materially better than R1 (not just longer).

---

## 7 · Revised priority structure

**P1 — Avatar disambiguation** (Micro). avatarRenderer.ts only. ~10 LOC + 4 tests.

**P2.0 — Mechanical extraction `placePrimitive` → `src/state/placePrimitive.ts`** (Micro, zero-behavior-change refactor). Pure code motion. world.ts shrinks ~240 LOC; new file gains ~240 LOC. 216/216 tests must remain green.

**P2.1 — Redundancy bond logic** (Standard core). Adds new constants, `redundantBondTargetsInSameComponent` helper in controls.ts, `extraBondTargetIds` handling in `placePrimitive.ts`. ~80 LOC + ~16 tests.

**P3 — Closeout** (standard). BACKLOG + reflexion + boot-snapshot + PDR archive + HANDOFF.

Per-priority commit + push per S9 #handoff-push-not-just-commit rule.

---

## 8 · Sign-off
- [x] PDR drafted (Claude)
- [x] Council R1 completed (Grok REVISE + Gemini REVISE, parallel)
- [x] Synthesis written
- [x] PRIME-AUDIT delta written
- [x] User pre-approved batch at PDR draft trigger ("approved top priority recommended batch following full pipeline flow")
- [ ] Session-state gate fields to be written next
- [ ] Execution begins (P1 → P2.0 → P2.1 → P3)
