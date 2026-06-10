# PDR S83 — Voltkin true-alpha + real animation (Full tier) — STATUS: COMPLETED (5/5 priorities, CHECK Triumvirate run, CI green)

Approved by user 2026-06-10 ("Approved! work creatively, technically, pedantically, and thoroughly").
Council R1+R2 CONVERGED (Grok 4.20 reasoning + Gemini 2.5-pro). Battle Ledger in-chat; key rows:
P1 unanimous+Grok refinements (LAB tol, decontamination) · P2 probe KEPT but upgraded to adversarial
walk-cycle case (Grok challenge synthesized) · P3 adopted 2.75v1.0 over Grok mesh-warp (cannot produce
walk/limb articulation; duplicates existing procedural layer user already rejected) with Grok
single-atlas + global-tick-loops folded in · P4 unanimous (median validated vs explosion segment) ·
D5 VFX library deferred BY USER · audio cues rejected (already wired: audioManager FIRE-tick crackle).

## AUDIT ROOT CAUSE (verified)
All 6 sprite frames: fake transparency checkerboard BAKED in, 0% real alpha; renderer applies no key.
Intro mp4: same checkerboard; luma key .88 removes white checkers only, gray survive; belly #FFEB6B
luma .887 = threshold collision → key punches holes in character.

## USER QUALITY BAR (v2 revision, verbatim intent)
"Real moving character … MapleStory-style readability: clear weight shifts, anticipation on actions,
natural timing, follow-through, expressive movement. Reject clips that look like improved
frame-flipping or lack personality. 12–15 fps fine if motion reads well. Living summoned entity."

## PRIORITIES
P1 TRUE-ALPHA SPRITES — matte script (edge-connected flood fill, checker-grid model, LAB tol,
   2px decontamination) → 6 true-alpha PNGs; originals untouched. Probes: 0 checker survivors,
   interior whites intact, dHash char region unchanged.
P2 ADVERSARIAL VEO PROBE — walk cycle, cleaned-idle seed, solid bg. Gate: dHash drift, loop closure,
   motion variance, aliveness checklist @128px; contact sheet + GIF in-chat. Fail → P1+P4 only.
P3 REAL ANIMATION (gated) — clips walk/idle, charge, zap, hurt, victory (Transformation Arc kept) →
   12–15fps → matte → ≤2048² atlas + manifest in public/godly/voltkin/anim/ → mapping: loops on
   world.tick modulo, one-shots on ticksInState (zap = FIRE_TICK exact). Per-state static fallback.
   ≤4KiB JS delta. Per-clip accept/reject vs quality bar.
P4 INTRO VIDEO FIX — temporal-median plate → diff matte → composite black → re-encode;
   lumaKey.enabled=false. Fallback: Veo regen on solid black seed=cleaned tv-glowing.
P5 VERIFICATION SWEEP — mapping determinism vitest, fog e2e 6-children, FULL e2e lane, bundle ≤4KiB
   delta, live pixel probes, animation feel at game scale, CI green.

## CONSTRAINTS
Mechanics LOCKED §13.15 (render-only) · deterministic frame choice (tick inputs only) ·
big assets → public/ · character design LOCKED (character-locked.md) · cost cap $10 (expected $3–6).

## ROLLBACK
assets-source/ originals untouched; one commit per priority.
