# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-15 | Session: S88

## Next Steps
1. ⭐ **PLAYTEST S88 discovery loop** on https://spark-online.space/ — in a match, form a NAMED magic combo (e.g. Dot→Line = Filament, Line→Line = Cable, Triangle→Triangle = Diamond) and confirm: (a) the center "NEW COMBO — <name>!" toast fires on all peers, (b) the top-center "Combos N/12" counter increments, (c) it resets per-match. (The live VISUAL was NOT captured this session — Pixi-canvas input isn't drivable from the preview harness; logic is unit-proven + boot is clean.) Also still open from S87: VS Bots difficulty feel + Quick Match 2-peer.
2. **Tier-1 NEXT — G1b (the REAL "make geometry matter" gap):** Council DESIGN round first → pick 3–5 magic-combo BEHAVIORS across ECONOMY (Vortex pulls free sparks; Filament income trickle) / DEFENSE (Lattice/Diamond resist hazards) / MOTION (Wheel/Star rotation; Capsule glow-trail). Every behavior a pure fn of synced state. Then implement one archetype. (G1a was DROPPED in S88 — magic already earns +2.0/8× since S76; coding the roadmap's +0.75 would have been a −62% nerf.)
3. **G2 — placeholder families + promotions:** rule-based family traits so every pair does *something*, + promote Dot→Square and Line→Circle (the two the user named) to named magic combos.
4. **Deferred discussion (when we scale the game up):** combinatorial DEPTH — 6 primitives → user's "6^6 ≈ 46k" eventual combination space (longer recipes/chains beyond the 36 ordered pairs). See `memory/combinatorial-depth-discussion.md`. Raise before/with the G1b/G2 design work.
5. Tier-3 only after Tier-1 or explicit ask: host-migration D1 · S73 colour-shift · scoreboard knob.

## Blockers
None. S88 shipped (P1 b0751bf · P2 0709b51 · state 0754b0b). Deploy-to-Pages GREEN; **E2E lane was IN-FLIGHT at handoff close** (no e2e-contract/protocol/palette change this session — confirm GREEN next boot via `gh run list`). Advisory: the review-tracker card still shows a stale "S162" session id (cosmetic env artifact — this project's real S88 MCV passed exit 0).

## Pending Backlog
- [ ] Playtest S88 discovery toast + "Combos N/12" counter (form a magic combo on spark-online.space) — Next Steps 1
- [ ] Playtest S87 modes (VS Bots difficulty across NOOB/MID/HARD/IMBA · Quick Match 2-peer flow)
- [ ] TIER 1: G1b magic-combo BEHAVIORS (Council design round) · G2 placeholder families + Dot→Square / Line→Circle promotions · G3b Codex used/silhouette marks · G4 build-feel juice
- [ ] DISCUSS (deferred): combinatorial depth (6^6 ≈ 46k) when extending the game — memory/combinatorial-depth-discussion.md
- [ ] Optional non-blocking: 12/12 "ALL COMBOS!" flourish · MAGIC_BONUS tuning bump (playtest-gated, LOCKED §6)
- [ ] TIER 3 (after Tier-1): host-migration D1–D4 · S73 colour-shift · periodic-scoreboard knob
- [ ] Non-builder-win root mechanism (UNREPRODUCED; S84 instrumentation live)

## Knobs (S88)
- Combo toast window: `COMBO_TOAST_DURATION_TICKS` (constants.ts, 150 = 2.5s; `__TEST_COMBO_TOAST_DURATION_TICKS__` e2e seam). Toast pose: `comboToastPose()` in `src/render/comboToastRenderer.ts`. Detection: `src/state/comboDiscovery.ts` (placement-level, firstNewBondId watermark). Counter: `ui.ts` drawComboCounter (denominator = `MAGIC_12_KEYS.length`).
- Magic-bond premium (already live, NOT G1a): `SCORE_MAGIC_BOND=3` / `SCORE_FUNCTIONAL_BOND=1` → MAGIC_BONUS=+2.0 at `scoring.ts:90`. Tuning it touches `LOCKED_DECISIONS §6` + `constants.lock.test.ts`.

## Recent Reflexion (last 2 sessions)
**S88** — G3a discovery toast + per-match counter + roadmap audit-error fix; Standard Council UNANIMOUS, PRIME-AUDIT DROPPED G1a. P1 #verify-the-roadmap-against-the-code-before-building (the G1a premise was FALSE — magic already +2.0/8× since S76; +0.75 would've been a −62% nerf; ground-truth audit claims with Read+grep). P1 #hook-at-the-confluence-not-per-path (ONE placement-level detection hook + firstNewBondId watermark covers primary/redundancy/merge-sweep + the PLACE_FROM_FREE delegate; reused rainbowSwitchTick + fouledPrimitives precedents, no protocol bump). P1 #preview-cannot-always-drive-pixi-input (synthetic DOM events don't drive Pixi's federated system; force-mutating gameState wedged the loop — rely on unit tests + clean-boot for wiring, report the visual gap honestly). P2 #correct-the-source-of-truth-when-it-lies (strike the false roadmap claim same session). Plus the recurring MCV false-UNBOUND advisory fixed via a project-local verify-watch-roots.json.
**S87** — VS-BOTS + Multiplayer rename + Quick Match, 5/5, CI-GREEN. P2 #bots-are-remote-players (dispatch choke-point binds bots day-one). P4 #split-the-eager-from-the-lazy. P5 #a-version-bump-ripples-into-every-hardcoded-literal · #verify-attribution-in-vivo.
