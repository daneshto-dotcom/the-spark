---
session: 8 of 10
title: Bond-Visual Polish + PRIME-AUDIT Delta Closure
tier: Standard (~20-30K, 2 files primarily)
pdr_approved: true
deliberation_completed: true
unlock_source: user
approved_at: 2026-05-11
status: COMPLETED
completed_at: 2026-05-11
exit_gate: "151/151 tests; typecheck clean; browser-verified at 60px via pixel-hash diff"
commits:
  P1: e85342da6dfe9f8fa5706a74d24e895e92b8427c
  P2: 9b0fed861216a28feec5365a732934482a9ec348
  P3: 9550000e6d68cd67eb578bc8b580398ae55e1e77
  P4: 816f965d1af1888b5116a0b29e34fc9a4b80df3f
  P5: 0b9eaf45c06d6f004361eacfe04aeb7c30155270
priorities:
  - id: P1
    title: Whip wave drift (tick-driven sin phase)
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
  - id: P2
    title: Lattice cross-hatch contrast (scale width with bond width)
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
  - id: P3
    title: Warped 3-fold ring rotation + breathing (sister to whip)
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
  - id: P4
    title: Filament starburst shimmer (alpha modulation) + mock extension
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
  - id: P5
    title: Static-equality test consolidation for 6 static silhouettes
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
  - id: P6
    title: Closeout — BACKLOG + reflexion + handoff + boot snapshot + archive
    pdr_approved: true
    deliberation_completed: true
    unlock_source: user
---

# PDR — Session 8 (Bond-Visual Polish + PRIME-AUDIT Delta Closure)

User explicit-go: _"approved"_ after presented PDR. Council waived per S7 precedent (bounded design space + user-discretion grant). PRIME-AUDIT (Rule 20) runs after each priority's edit, before its commit.

## Theme

Pre-playtest hardening. Close the S7 PRIME-AUDIT delta (whip static, lattice cross-hatch faint) + sister defect identified by close re-read (warped also static) + one creative-coherent add (filament shimmer). Strictly polish — no physics tuning (AUTO_BOND_RADIUS / ATTRACT_STRENGTH / strain thresholds remain playtest-gated).

After P1+P3+P4 the 12 magic silhouettes split semantically: ANIMATED = {wheel, vortex, orbital, whip, warped, filament} (energetic/unstable LOW+HIGH combos); STATIC = {cable, bracket, diamond, star, lattice, capsule} (stable structural combos).

## Priorities

### P1 — Whip wave drift (Micro)
- `src/render/bondVisualRenderer.ts` `drawWhip` — add `const driftPhase = p.tick * 0.022;` and use `Math.sin((t * cycles + driftPhase) * Math.PI * 2)` for the wave term.
- One wavelength every ~2.4s at 60Hz. Direction A→B (placement direction).
- Test: add `fx.whip differs at tick=0 vs tick=120` to the existing animation-diff describe block.

### P2 — Lattice cross-hatch contrast (Micro)
- `drawLattice` — replace `width: 1, alpha: p.alpha * 0.5` (×2 calls) with locals: `const crossWidth = Math.max(1.2, p.width * 0.55); const crossAlpha = p.alpha * 0.65;` applied to both cross-hatch strokes.
- At HIGH tier (p.width=3) → cross 1.65 vs outline 2.4 (was 1.0 vs 2.4 → invisible).
- Test: add `fx.lattice produces 3 strokes (outline + 2 cross-hatch)` regression guard.

### P3 — Warped 3-fold rotation + breathing (Micro)
- `drawWarped` — add `const phase = p.tick * 0.008;` (slow rotation) and `const breathe = 0.3 + Math.sin(p.tick * 0.025) * 0.08;` (lobe amp 0.22–0.38), then use `Math.sin(a * 3 + phase) * baseR * breathe` for the radial offset.
- Test: add `fx.warped differs at tick=0 vs tick=120`.

### P4 — Filament starburst shimmer + mock extension (Micro)
- `drawFilament` — compute `const rayAlpha = p.alpha * (0.55 + Math.sin(p.tick * 0.04) * 0.15);` (0.40–0.70 range) and use for the 6 ray strokes. Main bond stroke unchanged.
- Extend `GraphicsMock.stroke()` in test file to capture `[width, color, alpha]` args, so alpha-only mutations show up in serialize.
- Test: add `fx.filament shimmer — output differs at tick=0 vs tick=40`.

### P5 — Static-equality test consolidation (Micro)
- Extend `src/render/bondVisualRenderer.test.ts` — replace the single `non-animated fx.cable is identical` test with an `it.each` over the 6 static silhouettes (cable, bracket, diamond, star, lattice, capsule). Asserts `serialize(tick=0) === serialize(tick=999)` for each.
- Guards against the OPPOSITE regression class (a future refactor wires tick into a structural silhouette).

### P6 — Closeout (Micro)
- BACKLOG.md: insert S8 row, mark session map row DONE.
- reflexion_log.md: prepend S8 block (entry per priority + session-level on "sister-defect discovery via close re-read").
- /handoff → HANDOFF_2026-05-11.md, archive S7 handoff, regen boot-snapshot, archive S8 PDR.
- Per-priority commits across P1-P5; final commit for P6 ceremony.

## Acceptance criteria

1. `npx tsc -b --noEmit` clean.
2. `npx vitest run` — 142 + 7 new ≈ 149 passing.
3. Browser-verified: refresh `localhost:15842`, mutate `__SPARK__.world` to plant whip/lattice/warped/filament bonds at 60px length, render at tick=0 and tick=120, assert visible difference.
4. 6 commits on master (5 priority commits + 1 closeout).
5. BACKLOG.md S8 entry + reflexion S8 block + handoff doc.

## Risk register

- R1: New motion overwhelms playtest signal → mitigated by gentle tuning constants (~3s cycles, low amplitudes).
- R2: Lattice contrast bump noisy at HIGH tier → bounded by `Math.max(1.2, p.width * 0.55)` cap (≤55% of outline).
- R3: Tick-driven sin in hot path expensive → bounded; <100 bonds × 2 extra sin/silhouette ≪ 7ms render budget.
- R4: Pixi tab-pause defeats browser verify → use `app.renderer.render(app.stage)` after `__SPARK__.world.tick = N` mutation (S6/S7 pattern).
- R5: Mock extension breaks existing serialize-comparison tests → verified safe: cable's loop is tick-independent, so stroke args remain identical at tick=0 vs tick=999.

## Rollback

Per-priority commits independently revertable. Each P1-P4 touches 1-3 lines in `bondVisualRenderer.ts`; P5 touches the test file only.

## Estimated tokens

~25-30K total (Standard tier).
