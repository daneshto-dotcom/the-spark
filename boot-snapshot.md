# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-30 | Session: S115 (3-priority Tier-1+infra batch — SHIPPED LIVE)

## Next Steps
1. **OWNER PLAYTEST the two new magic-combo behaviors live** (vs-bots or multiplayer):
   - **ANCHOR (Dot↔Square)** "planted joint" — build an Anchor bond into a structure pushed into ENEMY territory; it should stay rigid where a normal structure goes floppy/sags. Dial: `ANCHOR_STIFFNESS_FLOOR` (0.7) in `src/constants.ts` — raise toward 1.0 for fully-immune, lower toward 0.3 for subtler.
   - **SPINDLE (Line↔Circle)** "stored motion" — free sparks near a Spindle should ORBIT/swirl around it (vs the Vortex's suck-in). Dials in `src/constants.ts`: `SPINDLE_MAX_TANGENTIAL_SPEED` (2.0, the orbit-speed/readability knob), `SPINDLE_PULL_RADIUS` (200), `SPINDLE_PULL_ACCEL` (0.05). (Also still: leader-crown CROWN_*, Helga 0.34, Voltkin 0.17, lightning-drone dials.)
2. **Next NON-gated big item = host-migration D2** (HOST_MIGRATION_DESIGN.md §9): epoch field in NETSNAPSHOT + snapshot-starvation detector + pure successor computation (instrument-only, no takeover). Builds directly on the S115 D1 dormant primitives (net/successionWarrant.ts + generateClientIdentity + the additive HELLO `clientPubkeyB64`). D2 also wires the live HELLO pubkey send + boot-time client identity that D1 deliberately left dormant.
3. **GATED Tier-1 (need an OWNER design decision — NOT force-built):** G1b MOTION (Wheel/Star rotation — Council-deferred twice as "visual noise without a mechanical verb"; needs an owner-blessed verb, rule #4) · G2 family traits (fill the 24 placeholders — needs a `LOCKED_DECISIONS §6` lock-amendment + owner picks the family flavor).
4. **DEPLOY stays MANUAL:** `npm run deploy` (gh-pages classic Pages). `git push` ≠ deploy.
5. Owner-gated (unchanged): anti-coast structure-loss CLAWBACK (own PDR); worker-sim `?worker=1` cutover (WORKER_SIM_FOUNDATION.md).

## Blockers
- OWNER (non-blocking): clear the GitHub account billing lock (Settings → Billing) so Actions/auto-deploy return. Until then deploy via `npm run deploy`.
- OWNER (non-blocking): top up Gemini prepayment credits at ai.studio so the Council is 3-way again (S112–S115 ran 2-way, Gemini 429).

## Pending Backlog
- (BACKLOG.md uses prose ROADMAP sections, not `- [ ]` checkboxes. Tier-1 G1b/G2 are owner-design-gated; the magic-combo behavior arc is now COMPLETE — Vortex/Filament/Diamond-Lattice/Anchor/Spindle all have mechanics. Next non-gated = Tier-3 host-migration D2.)

## Recent Reflexion (last 2 sessions)
## 2026-06-30 — Session 115: Shipped a 3-priority Tier-1+infra batch — P1 ANCHOR planted-joint (Dot↔Square floors its territorial stiffness to resist enemy-territory sag) + P2 SPINDLE bounded-swirl (Line↔Circle orbits free sparks; Council tangential-SPEED cap = no escape velocity) + P3 host-migration D1 (succession-warrant + client-identity + additive HELLO pubkey, DORMANT). PROTOCOL_VERSION held 14, save.replay byte-identical. tsc 0, vitest 1779/1779 (+35), build 611.0/750 KiB, deployed live.
- S115-P1 #scope-the-mechanism-against-the-engine-not-the-pdrs-mental-model: the PDR's "damp prim drift velocity" was a NO-OP (placed prims are never Verlet-integrated); A.0-during-execution reframed Anchor to FLOOR the S49 territorial stiffness sag (same verb, engine-correct mechanism). Verify the IMPLEMENTATION against the integrator before coding.
- S115-P2 #bound-the-accumulated-STATE-not-the-per-tick-DELTA: Grok's escape-velocity REJECT was real; capping the per-tick impulse doesn't fix accumulation — bound the resulting SPEED (project velocity onto the swirl axis, add only up to the cap headroom). 500-tick unit test proves it.
- S115-P3 #ship-the-PRIMITIVES-dormant-defer-the-LIVE-WIRING: D1 lands tested crypto primitives + an additive-optional fail-closed HELLO field with ZERO live-path wiring → zero behavior change before the owner playtests; D2+ activates.

## 2026-06-29 — Session 114: Shipped G4 in-world leader crown (static gold crown over the score leader's avatar; pure scoring.leaderPlayerId + avatarRenderer.shouldShowCrown; render-only, v14 held; reconciled stale BACKLOG; tsc 0, 1744 tests, live commit c2c1e80).
- S114 #scope-roadmap-next-items-against-the-code-not-the-roadmap-text: a roadmap's "next" label is a CLAIM — grep the feature's expected symbols BEFORE picking work (G3b + G4 bond-juice were already shipped); reconcile the roadmap as part of it.
- S114 #walking-a-pixi8-stage-for-render-verify-must-match-the-minified-class-name-and-assert-on-getBounds: Pixi 8 minifies Graphics→_Graphics; regex-match the class name + assert on getBounds() geometry (the hidden preview can't paint a capturable screenshot).
