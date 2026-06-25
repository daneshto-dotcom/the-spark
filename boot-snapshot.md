# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-25 | Session: S104

## Next Steps
1. **PLAYTEST the S104 fixes LIVE** on https://spark-online.space:
   - **vs-bots**: the bot now host-builds a pentagram → ENEMY chewers spawn. Build a **1 Line + 7 Spirals**
     turret near your structure → watch it charge + beam + **kill** the bot's chewers (the #1 fix).
   - The chewer **structure keeps producing** ~1 chewer / 15s (no longer stops at 2) and each chewing
     chewer **audibly gnaws** ("tchhht·tchhht"). They age out + fade after ~50s (churn).
   - Press **G + C** in-game → the unified **CODEX** opens (3 tabs: Godly Combos / Combos / Towers &
     Structures), each entry shows **how to build it**, locked until you've built/discovered it once.
     The startup screen now has ONE **CODEX** button (the separate COMBOS button is gone).
   - Retune by feel: chewer caps/lifetime (constants.ts CHEWER_MAX_*, voltkin-config lifetimeTicks),
     gnaw volume/cadence (chewerRenderer), and the codex layout.
2. **P5 (carry-forward)** Tier-1 G4 build-feel juice — RE-SCOPE: enhance the EXISTING BOND_COMMIT flair
   (don't add a parallel burst — it's redundant) + add the in-world leader crown. Deferred under YELLOW.
3. **Ghost build-hint (Council M13)**: a live next-primitive scaffold / "you're 1 triangle away" nudge for
   the spacing-sensitive TD recipes — the codex now gives the TEXT; the ghost is the in-world teacher.
4. **Resume Tier-1 roadmap**: G1b MOTION · G2 family traits (needs LOCKED_DECISIONS §6 amendment) · G3b.
5. Conditional/optional: death-VFX recentDeaths fallback (only if playtest shows missed goo/clouds); TD
   connector visible-damage (S102 de-scope); imagen original face/texture on HELGA's head (replay-safe).

## Blockers
None. P1-P4 are LIVE + verified (Deploy to GitHub Pages SUCCESS for commit 97051cf; vitest 1650/1650;
boot-smoke clean — G+C opens the codex with zero console errors). The push-triggered E2E (2-browser) run
was in-flight at close — it does NOT gate deploys and S104 doesn't touch the fog contract; confirm green
next boot via `gh run list --workflow="E2E (2-browser harness)"`.

## Pending Backlog
- [ ] P5 Tier-1 G4 build-feel juice — re-scope to ENHANCE BOND_COMMIT + add leader crown (deferred YELLOW).
- [ ] Ghost build-hint (Council M13) — live next-triangle scaffold for spacing-sensitive TD recipes.
- [ ] Known polish (logged): the bot can eventually grow INTO its own seeded pentagram (auto-bond raises a
  ring node's degree → self-breaks its spawner). Same outcome as a raid; monitor — if it self-breaks too
  fast in playtest, place the ring farther from the bot's build cone or mark its nodes no-auto-bond.
- [ ] death-VFX recentDeaths[] fallback (conditional) · TD connector visible-damage (Bond.hp render).
- [ ] Tier-1: G1b MOTION · G2 traits (LOCKED §6) · G3b Codex silhouettes.

## Recent Reflexion (last 2 sessions)
## 2026-06-25 — Session 104: TD Playability + Unified In-Game Codex — shipped P1-P4 LIVE (Deploy SUCCESS): chewer continuous-production + audible chewing, vs-bots host-seeded enemy spawner (the turret now WORKS vs bots), unified 3-tab CODEX (G+C chord) + unlock-on-build + pentagram registration. vitest 1650/1650, entry 597.4/750 KiB. FULL-tier 3-lens Opus Council ADOPT-WITH-FIXES (M1-M13) + boot-smoke clean. P5 + ghost-hint deferred (YELLOW).
- P1 #finite-lifetime-is-an-FSM-change-not-a-config-tweak: chewer despawn gate is `!config.persistent` → lowering lifetimeTicks alone is a NO-OP; flip persistent:false to reuse the Voltkin DESPAWNING FSM. Render SFX must key off WIRED fields (state+ticksInState) — chewProgress is stripped from the client mirror.
- P2 #host-seed-beats-a-scripted-bot-builder: give the bot a structure by HOST-placing it at START_GAME (pure seat-angle math, zero RNG) reusing the real recipe path — never perturb the bot's shared RNG stream.
- P3 #merge-overlays-but-prove-it-via-the-build: verify a lazy-overlay merge by the build (one chunk, old chunk gone, entry lazy). unlock-on-build = render-loop localStorage mirror, write-only from the sim's view. G+C chord lives in main.ts (pure UI), not controls.ts.
- P4 #verify-the-registry-consumer-before-registering: registering PENTAGRAM_RECIPE was safe only because findSpawnerMatch is dead code + ignition uses findAllPentagramAnchors. META: the Council caught the persistent-gate no-op + the wire-strip SFX bug — run the determinism lens even when confident.

## 2026-06-25 — Session 103: TD Defenders Bundle — shipped #8 Voltkin-vs-chewer + a generic Defender substrate + #9 laser turret + #10 HELGA articulated princess LIVE. vitest 1645/1645, entry 594.3/750 KiB. FULL-tier batch PDR + 3-way Council ADOPT-WITH-FIXES (8 must-fixes). P5 (Tier-1 G4) deferred under YELLOW.
- P1: gate new behavior on a condition absent from the test corpus → old replays byte-identical BY CONSTRUCTION.
- P2: mirror the spawner substrate; a one-shot strike VFX on a persisting entity = hold the FIRE state ~12 ticks + SYNC it (the state is the event bus).
- P3: a consumer on a good substrate is just a recipe + a renderer; recipes MUST registerRecipe.
- P4: a puppet rig IS the real character (per-state authored poses, real windup→impact→recover) — beats veo for an action character; add a per-entity offset so N instances don't animate in unison.
