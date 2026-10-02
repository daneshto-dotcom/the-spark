# S194 · T9 COHERENCE — progress (`s194/coherence`)

**STATUS: IN-PROGRESS — PAUSED by owner order (session limit). Wait for RESUME.**

## ⏸ PAUSE NOTE (read first on resume)
- **Exact next step:** run the FULL gates (`npm run typecheck`, `npx vitest run --maxWorkers=3`, `npm run build` → entry KiB), then the perf bench `__SPARK__.fx.bench(120)` on this worktree's own port (before = master, after = this branch, ≤ +0.3 ms) and before/after screenshots into `.tmp-gates/`; then write the full parity matrix + routed-gap list (draft notes below) and the final report.
- **Half-done:** nothing mid-edit. C3 (hit pop) is committed and its targeted tests are green; the parity matrix write-up is NOT written yet (findings are in the Log + "Matrix notes" below).
- **Gates last run:** `tsc -b --noEmit` exit 0; targeted vitest (src/render/fx, damage*, killSwing, coherence, castleHitHealSplit, repairHeal*, resistFloater, s189Heal) exit 0 — 292/292. Full suite and build NOT yet run on this branch.
- No background processes running (no dev server / vitest / playwright started in the background except the finished `npm install`).


Owner, S194 (verbatim): *"when I placed the Soul Eater Tower level three. It did have those little sparks … But … when I
built a laser turret, it didn't … make it consistent across all built … towers … And in general, you … should have
everything more … consistent and … cohesive and mindful of each other and coherent."*

## Log
- Setup: worktree from master `0a37175e`, `git merge master` → fast-forward to `18560cd8` (amendment A2), no conflicts. `npm install` exit 0.

- C1 `b46d3e3d` — shared unit-departure rule (`src/render/coherence/unitDeparture.ts`); damageNumbers no longer prints a kill for an expiry / mass clear / fogged spot; creatureRenderer zap uses the same rule.
- C2 `6f5ea1f7` — shared unit death beat for all 28 creature types (`fx/unitDeathFx.ts` + `coherence/unitDeathRenderer.ts`, wired in main.ts), census + reach + negatives.

- C3 — hit pop: every red damage number also lands a pop on its victim (`fx/hitPopFx.ts`, drawn from `DamageNumbers`), keyed by target (unit × sprite scale / structure / keep); melee hits were the only attack with no impact beat. Re-pinned 2 `floaterFxReach` asserts to count the heal sparkle alone (intent unchanged); new `fx/hitPopReach.test.ts` incl. the pairing census (damage floaters == pops).

## Matrix notes (draft — becomes the full matrix)
- Units death: goblins ×6, endgame monster, mega pants, locust, drone had NO kill beat (no `die` row) → fixed C2 (shared beat for all 28).
- damageNumbers: expiry / mass clear / fog printed numbers → fixed C1.
- Melee hits: no impact beat (all other attack kinds had one) → fixed C3.
- Helga: vanishes on death with no beat; kill-vs-turn-sweep is not derivable on a peer without a host-local record → NOT DONE, reported.
- Sounds (owner taste, .ogg auditions — NOT changed): fire SFX laser ✓ / slap ✓ / Voltkin crackle ✓, stink tower lob ✗, castle gun ✗; death SFX chewer splat ✓, Voltkin zap ✓, pants ✓, every other unit ✗; unit connector sever deliberately silent (S182).
- ROUTE: controls.ts illegal blueprint stamp click (`!canStampAt` → return) and drag-release refusal are SILENT while every other refused control plays `playUiRefusedSFX` (T5/merge owner).
- ROUTE (T2): chewerRenderer + goblinRenderer corpse should call `classifyCreatureDeparture` (census allow-lists chewer by name); chewer stun stars pass alpha 1 (ignores fade) and no scaleMul.
- ROUTE (T4): tower build/destroy sparkle parity (spawnerZoneRenderer, spawners only) — already T4's.
