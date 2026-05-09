---
session: 7 of 10
title: Connection-Range Gate + Per-Combo Persistent Bond Visuals
tier: Standard (~25-30K, 4-6 files)
pdr_approved: true
deliberation_completed: true
unlock_source: user
approved_at: 2026-05-09
status: IN_PROGRESS
priorities:
  - id: P1
    title: Connection-range gate (snap spark to cursor at LMB-up)
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
  - id: P2
    title: Per-combo persistent bond visuals (12 magic + default line)
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
  - id: P3
    title: BACKLOG.md hygiene + reflexion log
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
  - id: P4
    title: Process closeout (handoff + dev server)
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
---

# PDR — Session 7 (Connection-Range Gate + Per-Combo Persistent Bond Visuals)

User explicit-go (post-playtest, going to sleep): _"i approve this whole session batch you will decide to do with any additions and edits you will make. ... feel free to use all the tools at your disposal. Be pedantic, creative and technical. I approve this session! get cooking!"_

Council waived per Rule 17 user-path. Design space is bounded — S6 already produced the 12 magic-combo silhouettes as ephemeral effects; this session reframes them as persistent between-endpoint bond visuals. PRIME-AUDIT after implementation per Rule 20.

## Findings from playtest screenshot (S7 pre-flight)

1. **WIN reached** — game loop end-to-end confirmed working post-S5/S6 (30 primitives → WIN screen visible).
2. **Connection-range bug** — bonds in the screenshot span huge distances (visible long pink lines across canvas). Static trace traces this to `controls.ts:onUp` LMB-up-outside-zone path: `pickPrimitiveInRange(AUTO_BOND_RADIUS=60)` measures distance from CURSOR, but the placed primitive uses `spark.pos` which lags cursor in AttractDrag (spring-attract has inertia). Result: bond from primitive (at lagged spark.pos) to target (within 60 of cursor) can be `cursor_lag + 60` ≈ unbounded long.
3. **Bond visual sameness** — every bond renders as the same straight line in `structureRenderer.ts:101-140`. The S6 12-silhouette work made bond-COMMIT effects distinct ephemerally (~0.4s pop) but the persistent visual is identical for all 36 combos.

## Priorities

### P1 — Connection-range gate (Micro)

**Root cause** (confirmed by static read of `controls.ts:170-209` + applyPerSubstep at 91-106):
- During AttractDrag, the spark is pulled toward cursor via `prevPos` impulse — spring-with-distance-softening; `dist < 1` returns early. The spark *lags* cursor with non-zero inertia.
- At LMB-up, code flow: PICKUP_SPARK then PLACE_PRIMITIVE. Neither snaps spark.pos to cursor.
- `makePrimitiveFromSpark` uses `v2copy(spark.pos)` for the primitive position (primitive.ts:48).
- `pickPrimitiveInRange(AUTO_BOND_RADIUS=60)` (controls.ts:293-306) measures from `this.cursor` — not from spark.pos.
- ⇒ Bond length = dist(spark.pos → cursor) + dist(cursor → target.pos) which can be unbounded.

**Fix** — single-line authority: at LMB-up-outside-zone, snap `spark.pos = cursor` BEFORE PICKUP/PLACE so the placed primitive lands exactly where the player released, and auto-bond range from cursor coincides with placed-primitive position. Bond length is then ≤ AUTO_BOND_RADIUS by construction.

```typescript
// In onUp, LMB-up branch — replace the inZone check + dispatch sequence:
spark.pos.x = this.cursor.x;
spark.pos.y = this.cursor.y;
spark.prevPos.x = this.cursor.x;
spark.prevPos.y = this.cursor.y;
if (!this.isInsideSpawnerZone(spark.pos)) {
  // ... PICKUP_SPARK + PLACE_PRIMITIVE as before
}
```

UX bonus: dragging cursor back into the zone now cancels the place (spark stays free in zone). Aligns with mental model "release where you point."

**Tests**:
- new test in `controls.session5.test.ts` (or new session7 file): simulate LMB-down → cursor far → LMB-up. Assert placed primitive position equals cursor (not lagged spark position).
- Existing 104 tests must pass.

**Files touched**: `src/input/controls.ts` only.

### P2 — Per-combo persistent bond visuals (Standard, dominates the batch)

**Goal**: each of the 12 magic combos renders the bond as its named silhouette between endpoints. The 24 functional combos keep the existing line. Stress coloring + width still shift on strain (preserved from current renderer).

**New module**: `src/render/bondVisualRenderer.ts` (~250 LOC, well under 500 charter)

API:
```typescript
export interface BondVisualParams {
  ax: number; ay: number;
  bx: number; by: number;
  visualEffectId: string;
  color: number;
  alpha: number;
  width: number;
  tick: number; // for animated combos (wheel rotation, vortex phase, orbital pulse)
}
export function drawBondVisual(g: Graphics, p: BondVisualParams): void;
```

Switches on `visualEffectId`. Re-imagined silhouettes (between-endpoint, not centered-radius):

| Combo | Description | Geometry |
|---|---|---|
| fx.filament | Dot→Line, HIGH | Bright bond line + 6-ray starburst at midpoint |
| fx.cable | Line→Line, MID | Twin parallel lines at fixed perpendicular offset |
| fx.bracket | Line→Triangle, HIGH | Triangle with bond as base, apex at perpendicular height |
| fx.diamond | Triangle→Triangle, HIGH | Diamond with A,B as long-diagonal endpoints |
| fx.wheel | Triangle→Circle, MID | Bond as one diameter + perpendicular spoke + circle (slow rotation tied to tick) |
| fx.star | Circle→Triangle, MID | 5-point star at midpoint, oriented along bond axis, sized by length |
| fx.orbital | Circle→Circle, LOW | Two concentric rings at midpoint, gentle radius pulse on tick |
| fx.lattice | Square→Square, HIGH | Rotated square (A,B as opposite corners) + cross-hatch |
| fx.capsule | Square→Circle, MID | Pill: two parallel lines + end-cap semicircles |
| fx.vortex | Dot→Spiral, HIGH | Archimedean spiral from A outward to B (winds with tick phase) |
| fx.whip | Spiral→Line, LOW | Sine wave from A to B |
| fx.warped | Triangle→Spiral, LOW | Wobbly 3-fold ring at midpoint, sized by half bond length |
| fx.bond.default | 24 functional | Plain straight line (current rendering) |

**Wire into structureRenderer**: replace the `g.moveTo + g.lineTo` block in `drawBonds` with `drawBondVisual(g, params)`. Stress-tint and width adjustments stay at the structureRenderer layer (the silhouette inherits the adjusted color). Stress-pulse (>0.7 threshold) overlay stays as-is on top.

**Tests**:
- `bondVisualRenderer.test.ts` — pixel-bound assertions: for each of the 13 visualEffectIds, draw between two known endpoints and assert pixels were drawn (Graphics geometry size > 0). Negative test: zero-length bond falls through to default-line (no NaN).
- Snapshot test: a 5-bond structure draws without throwing; bond Graphics has expected number of stroke calls.

**Files touched**:
- new: `src/render/bondVisualRenderer.ts`
- edit: `src/render/structureRenderer.ts` (drawBonds function, ~10 lines changed + 1 import)

**Browser verify**: Mutate `__SPARK__.world` to plant 12 primitive pairs, one per magic combo, and screenshot. (S6 reflexion taught us: Pixi pauses ticking when tab is hidden, so animation state needs to be set via `world.tick = N` not waited for.)

### P3 — BACKLOG.md hygiene + reflexion (Micro)

**Hygiene gap from S6**: BACKLOG.md latest entry is "Session 5 — Playability Pass" at top. S6 close added no entry. Per CLAUDE.md "Each session ends with: typecheck clean, tests green, git commit, session-state.json updated" — backlog updates are also part of session close.

**Edits**:
- Insert "Session 6 — Polish Pass + Git + Carry-Forwards (COMPLETED 2026-05-09)" entry retroactively
- Insert "Session 7 — Connection-Range Gate + Per-Combo Persistent Bond Visuals (IN PROGRESS / COMPLETED 2026-05-09)" entry
- Update Session map table (S6 → "Polish Pass", S7 → "Combo visuals + range gate", S8+ → playtest + audio + Phase 2)

**Reflexion** (writing to `reflexion_log.md` if exists, else create):
- S7 #cursor-vs-pos-as-source-of-truth: snap-to-cursor at LMB-up is a small change but unifies the placement source-of-truth. Lesson: when a placement gesture has visual representation (cursor) AND simulated representation (spark.pos), commit only one as authoritative.
- S7 #ephemeral-to-persistent-silhouette: the 12 S6 silhouettes were designed for centered-radius rendering. Repurposing them as between-endpoint bonds required full re-imagining of geometry — not parameter changes. Cable/whip already line-based survive cleanly; centered shapes (star/wheel/orbital) use bond length as size signal.
- S7 #pdca-deliberation-skip: user-path batch approval + bounded design space let us skip Council. Saved ~10K tokens; PRIME-AUDIT ran instead.

### P4 — Process closeout (Micro)

- Per-priority commits (3: P1, P2, P3)
- session-state.json with checkpoint_commit + check_completed + check_method per priority
- /handoff (skill) → HANDOFF_2026-05-09.md updated, boot-snapshot.md regenerated, PDR archived
- Dev server start in background on $SESSION_PORT=10197 so user can refresh + playtest at wakeup
- No remote configured → `git push` skipped; documented in handoff

## Acceptance criteria

1. `npm run typecheck` clean
2. All tests pass (104 + new P1 + new P2 = ~110+)
3. Browser-verified: 12 magic-combo bonds visually distinct in a planted structure; default line unchanged
4. P1 fix: place near zone exit with fast cursor move, bond length ≤ AUTO_BOND_RADIUS+ε
5. BACKLOG.md has Session 6 + Session 7 entries
6. Per-priority commits + final commit + /handoff doc + dev server alive on port 10197

## Risk register

- R1: Combo silhouettes look bad at extreme bond lengths — **mitigated by P1 reach gate** (max ~60px bond)
- R2: Performance regression with 12-shape switch in render loop — bounded: each silhouette ≤ 32 path ops; <100 bonds Phase 1 = ~3K ops/frame, well under budget. Verify via stats overlay if user reports.
- R3: visualEffectId not on bond data — **resolved**: combo lookup at render time via `bond.a.type`, `bond.b.type` (both Primitive). Direction = a→b matches PLACE_PRIMITIVE dispatch order.
- R4: Pixi tab-pause prevents seeing animations during browser verify — use mutate-then-screenshot pattern from S6 reflexion (`world.tick = N` for static frame at desired animation phase).
- R5: User wakes to a non-running dev server — start in background as last step.

## Rollback

Per-priority commits = independently revertable. P2 (the biggest) can be reverted without touching P1.

## Estimated tokens

~25-30K. Standard tier. User-path approval; same-turn flag-write + execution.
