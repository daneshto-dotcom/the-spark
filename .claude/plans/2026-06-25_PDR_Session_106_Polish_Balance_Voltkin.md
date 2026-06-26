# PDR — Session 106 (BATCH, FULL tier)
**Chewer teeth · +25% match length · HELGA screen-wide · NONET point-loss visible+harsher · Voltkin procedural rig**

Date: 2026-06-25 · Branch: master · Base commit: 1b6b136
Owner approval: **EXPLICIT** — "full session batch approved! make the whole game better ... HIGHEST QUALITY and BEST output." (`unlock_source: user`)
Scoped via wf_3c8db072 (5 investigators + adversarial verify; both verdicts HOLD high-confidence).

---

## P1 — +25% match length  (Micro; balance)
**OBJECTIVE** A match lasts ~25% longer so players can build + compete.
**SCOPE** `constants.ts`: `PHASE_1_WIN_SCORE` 630→**786**, `SCORE_TIER_STEP` 210→**262** (lockstep, exact thirds: 786=3×262, pulses at 262/524, WIN 786 — scoring.test exact-thirds invariant stays green; +24.8%). HUNTER_TRIGGER_SCORE auto-scales (=floor(786×0.75)=589). Refresh the comment-only "630" mentions.
**OWNER-AUTHORIZED**: PHASE_1_WIN_SCORE is a "protected anchor" — owner explicitly directed +25%.
**TESTING** No test pins the literals (all symbolic); tier-pulse loops stay under their 120k-tick caps. tsc 0; full vitest green.

## P2 — Chewer teeth = funny fangs (rainbow style, original)  (Micro; render-only)
**OBJECTIVE** The chewer's two front teeth look funny like the rainbow's tooth.
**ROOT** Chewer teeth are `g.rect` boxes (stiff); the rainbow's funny tooth is a downward-pointing `g.poly` triangle.
**SCOPE** `chewerRenderer.ts` drawChewer tooth-loop: replace the 2 rectangles with 2 downward-pointing triangular fangs (`g.poly`), keep the comedic gap + a slight asymmetry, KEEP the chewer's ivory `TOOTH_COLOR` + graphite outline (NOT the rainbow's flat white — stays ORIGINAL per the no-franchise memory). Drop the rect-specific chewed-arc; keep a short pencil seam.
**TESTING** Render-only, no determinism/test surface. tsc 0; visual (owner playtest).

## P3 — HELGA whole-screen range + reach VFX  (Micro sim + small render)
**OBJECTIVE** HELGA slaps any enemy chewer anywhere on screen, and a far slap reads visually.
**SCOPE** (a) `constants.ts` `PRINCESS_SLAP_RANGE` 160 → `Math.ceil(Math.hypot(CANVAS_WIDTH, CANVAS_HEIGHT))` (=2203, integer, self-documenting "screen diagonal"). Targeting already picks nearest enemy creature in range — no targeting change. (b) `princessRenderer.ts`: during FIRE draw an original graphite "slap-shockwave" streak from HELGA's slap-hand → `lastStrikePos` (mirror turretRenderer.drawBeam structure, render-only wall-clock jitter OK) so a cross-map slap connects visually. NOT lightning (Voltkin owns that).
**TESTING** `defenderLifecycle.test.ts` "NO enemy in range stays IDLE" — the (900,900) chewer is now IN range → move it beyond the diagonal (>2300px) or repurpose. Update the "(160)" comment. `save.replay.test.ts` princess test: byte-identical gate compares two fresh runs (still stable) — update the inline "160" comment. Determinism: range is sim config (pure fn of tick) → integer value, replay-safe. tsc 0; full vitest green.

## P4 — NONET point-loss VISIBLE + harsher  (Micro render + Micro balance)
**OBJECTIVE** Losing a NONET visibly cuts YOUR points (the owner saw "almost full" because the bar shows the leader, not them) and hurts more.
**ROOT** `ui.ts drawProgress` renders `world.scoreProgress` = max(scoreByPlayer) = the LEADER. After the friend's NONET win (friend ×2), the bar shows the friend's near-win; the owner's own ÷2 is invisible on it (the leaderboard + audio do surface it — verdict correction).
**SCOPE** (a) `ui.ts drawProgress`: bind the primary bar to `world.scoreByPlayer.get(world.localPlayerId) ?? world.scoreProgress` (solo fallback) + add a thin leader ghost-tick at `scoreProgress/WIN` + flash the bar on a decrease. WIN gate + HUNTER stay on scoreProgress (max) — unchanged. (b) `sudokuEvent.ts`/constants: `NONET_LOSER_MULT` 0.5 → **0.4** (loser keeps 40%, a real gut-punch). Update the pinned `sudokuEvent.test.ts` loser expectations.
**TESTING** Display fix render-only; add a regression test that the own-bar target halves after a snapshot whose own scoreByPlayer entry dropped. Lever-1 updates sudokuEvent.test. tsc 0; full vitest green.
**DEFERRED (own PDR, flagged to owner)**: leader score-decay (anti-coast) + structure-loss CLAWBACK (overturns the S76 "banked score is safe" invariant — needs owner sign-off + floor-at-0).

## P5 — Voltkin procedural rig (kill the looping-gif/square)  (FULL; render-only, largest)
**OBJECTIVE** Voltkin is fully integrated, drawn with vector Graphics — no bitmap, no visible square.
**ROOT (verified)** `creatureRenderer.ts:421` `new Sprite(...)` then per-tick `sprite.texture = ...` swaps (atlas/legacy PNG) = the "looping gif"; the box is the bitmap frame/matte. arcFlash is already pure Graphics (keep). Cinematic mp4 is a separate intro (not in-game).
**SCOPE** (1) NEW `render/voltkinPose.ts` (pure `voltkinPose(state, ticksInState, worldTick, offset)` → VoltkinPose; keyframes off the LOCKED FSM ticks CHARGE_ENGAGE=15/FIRE=30/IDLE_RELEASE=45/SPAWN=60/DESPAWN+FADE) + `voltkinPose.test.ts`. (2) REWRITE `creatureRenderer.ts` draw path: replace the per-creature Sprite + atlas/PNG loaders with ONE shared Graphics + `drawVoltkin(...)` (original electric being: jagged cyan/graphite core, crackling limb-bolts scaling with boltCharge, eye glints); **PORT VERBATIM** the velocity estimator, facing, and the S103#8 lightningCloud death-watcher + zap-burst SFX. (3) Keep render contract (parent=aboveFogLayer, sync reads-not-mutates, clear/destroy). (4) **DO NOT delete** voltkin-zap.png (it's the Codex `characterSprite` placeholder for laserTurret/pentagram/princessHelga/voltkin) NOR currentFrameKey (sync.test imports it) without verifying — keep them this session; trim dead atlas/PNG/scripts only after an import-graph grep, else defer deletion.
**TESTING** Rewrite `creatureRenderer.test.ts` sprite-texture assertions → Graphics lifecycle; add `voltkinPose.test.ts` (boltCharge peaks at FIRE=30; DESPAWNING victory-vs-hurt on killCount). arcFlash emit on FIRE unchanged → `save.replay.test.ts` byte-equivalence unaffected (render-only). Pure pose = f(synced state) → host+client identical. tsc 0; full vitest green; boot-smoke.

---
## ORDER: P1 → P2 → P3 → P4 → P5 (bank trivial/micro first; Voltkin last + careful).
## COMPLETION (per priority): commit+push · session-state (checkpoint_commit + check_completed + check_method + verification[]) · reflexion entry · announce.
## VERIFY: tsc 0 · full vitest green (esp. replay determinism) · build < 750 KiB · boot-smoke · owner playtest.
