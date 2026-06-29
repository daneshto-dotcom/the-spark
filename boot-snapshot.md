# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-29 | Session: S113 (Batch C — lightning-drone building, SHIPPED LIVE)

## Next Steps
1. OWNER PLAYTEST the lightning-drone building LIVE: build **1 Dot + 5 Circles** (each Circle bonded to the Dot) to summon the `lightningHub` → it fires 3 suicide drones (procedural Voltkin rig @0.5) at enemy connectors, then self-destructs. Best seen in vs-bots (each bot is host-seeded a hub + a pentagram). Confirm feel + sizes.
2. TUNE after playtest (each a one-constant dial in `src/constants.ts`): `LIGHTNING_DRONE_SPRITE_SCALE`=0.5 (drone size) · `DRONE_EXPLODE_RADIUS`=110 · `DRONE_MAX_CONNECTORS`=3 · `DRONE_EMIT_INTERVAL_TICKS`=900 (15s) · `STRUCTURE_SELFDESTRUCT_RADIUS`=240 · `DRONE_LIFETIME_TICKS`=480 (8s fuse). Council "too-swingy" alt logged: 20s / 2 drones / 180px.
3. DEPLOY stays MANUAL: `npm run deploy` (Actions dead — GitHub account billing lock). A plain `git push` does NOT deploy.
4. Resume ROADMAP: Tier-1 G-series (G1b motion / G2 family traits / G3b silhouettes / G4 crown+BOND_COMMIT) → Tier-3 host-migration D1-D4.
5. Owner-gated (unchanged): anti-coast structure-loss CLAWBACK (own PDR); worker-sim ?worker=1 cutover.

## Blockers
- OWNER (non-blocking): clear the GitHub account billing lock (Settings → Billing) so Actions/auto-deploy return. Until then deploy via `npm run deploy`.
- OWNER (non-blocking): top up Gemini prepayment credits at ai.studio so the Council is 3-way again (it ran 2-way Grok+Opus this session, Gemini 429).

## Pending Backlog
- (BACKLOG.md uses prose sections, not `- [ ]` checkboxes — see BACKLOG.md "NEXT" / roadmap + the Next Steps above.)

## Recent Reflexion (last 2 sessions)
## 2026-06-29 — Session 113: Shipped Batch C lightning-drone building (lightningHub recipe → 3 suicide drones → self-destruct; v13→14; tsc 0, 1734 tests, live).
- S113 #a-new-spawner-emitted-type-silently-joins-any-cap-keyed-on-sourceSpawnerId: a boolean discriminant (`sourceSpawnerId===null`) that proxied "is-Voltkin" mis-bucketed the new drone type into the chewer cap; RALPH:PATROL caught it; FIX = discriminate on `creature.type`. Grep every reader of a proxy field when a 3rd value enters the proxied set.
- S113 #drive-a-hidden-preview-sim-via-app.ticker.update-not-rAF: a hidden Pixi preview throttles rAF (tick stays 0) but `app.ticker.update(ts)` steps it deterministically — drove the full hub→3-drone→self-destruct flow in-browser via the __SPARK__ DEV accessor. Real runtime verify when rAF is asleep.

## 2026-06-28 — Session 112: Shipped HELGA as a real veo-animated character (idle/walk/slap tick-synced atlas) + state-driven audio; render+asset+audio only, v13 held; live.
- S112 #veo-img2vid-is-strong-on-ambient-motion-weak-on-fast-specific-actions: veo holds a character on-model for walk/idle but not a crisp slap; sell the HIT with SFX+VFX+lunge; reframe violent prompts to dodge the filter.
- S112 #matte-a-veo-clip-needs-component-keep-plus-shared-foot-canvas: extend the still-matte with largest-component speck-removal + a shared foot-anchored canvas; diagnose alpha empirically before assuming it's broken.
