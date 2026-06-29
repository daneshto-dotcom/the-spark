# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-29 | Session: S114 (G4 in-world leader crown — SHIPPED LIVE)

## Next Steps
1. OWNER PLAYTEST the leader crown live: in vs-bots (or multiplayer) the current score-leader's avatar now wears a static gold crown; confirm it reads well + the size/offset feel right (dials are module-local in `src/render/avatarRenderer.ts`: `CROWN_OFFSET_Y` 20, `CROWN_W` 16, `CROWN_H` 9, `CROWN_COLOR`, `CROWN_ALPHA`). Same playtest can still tune the S113 drone dials (`src/constants.ts`).
2. ROADMAP — remaining Tier-1 G-series is now GATED, not free: **G1b MOTION** (Wheel/Star rotation) was Council-DEFERRED pending a mechanical verb (needs a design decision, not a blind build); **G2 family traits** needs a `LOCKED_DECISIONS §6` lock-amendment + owner picks the family flavor. G3 + G4 are COMPLETE (S114 reconciled the stale roadmap). Next non-gated big item = **Tier-3 host-migration D1–D4** (HOST_MIGRATION_DESIGN.md).
3. DEPLOY stays MANUAL: `npm run deploy` (Actions dead — GitHub account billing lock). `git push` ≠ deploy.
4. Owner-gated (unchanged): anti-coast structure-loss CLAWBACK (own PDR); worker-sim `?worker=1` cutover (WORKER_SIM_FOUNDATION.md).

## Blockers
- OWNER (non-blocking): clear the GitHub account billing lock (Settings → Billing) so Actions/auto-deploy return. Until then deploy via `npm run deploy`.
- OWNER (non-blocking): top up Gemini prepayment credits at ai.studio so the Council is 3-way again (S112–S114 ran 2-way, Gemini 429).

## Pending Backlog
- (BACKLOG.md uses prose sections, not `- [ ]` checkboxes — see its ROADMAP. Tier-1 G1b/G2 gated; Tier-3 host-migration is the next non-gated item.)

## Recent Reflexion (last 2 sessions)
## 2026-06-29 — Session 114: Shipped G4 in-world leader crown (static gold crown over the score-leader's avatar; pure scoring.leaderPlayerId + avatarRenderer.shouldShowCrown; render-only, v14 held; reconciled stale BACKLOG; tsc 0, 1744 tests, live commit c2c1e80).
- S114 #scope-roadmap-next-items-against-the-code-not-the-roadmap-text: a roadmap's "next" label is a CLAIM — G3b + G4 bond-juice were both already shipped (S97 / bondCommit.ts); grep the feature's expected symbols BEFORE picking work, and reconcile the roadmap as part of it.
- S114 #walking-a-pixi8-stage-for-render-verify-must-match-the-minified-class-name-and-assert-on-getBounds: Pixi 8 minifies Graphics→_Graphics; regex-match the class name + assert on getBounds() geometry (deterministic) — the hidden preview can't paint a capturable screenshot.

## 2026-06-29 — Session 113: Shipped Batch C lightning-drone building (lightningHub recipe → 3 suicide drones → self-destruct; v13→14; tsc 0, 1734 tests, live commit 759fe80).
- S113 #a-new-spawner-emitted-type-silently-joins-any-cap-keyed-on-sourceSpawnerId: a boolean discriminant proxying "is-Voltkin" mis-bucketed the new drone type into the chewer cap; grep every reader of a proxy field when a 3rd value enters the proxied set.
- S113 #drive-a-hidden-preview-sim-via-app.ticker.update-not-rAF: a hidden Pixi preview throttles rAF but `app.ticker.update(ts)` steps it deterministically; drive the full sim in-browser via the __SPARK__ DEV accessor for a real runtime verify.
