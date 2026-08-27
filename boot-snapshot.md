# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-27 | Session: S154 | Commit: fe4df0b | PROTOCOL 33

## Next Steps
1. ⛔ BOTS STILL DO NOT BUILD TOWERS IN A REAL MATCH — owner playtested S154 close
   Owner, verbatim, after amendment A shipped: "the imba and hard bots now upgraded their gatherer but are still not saving or building towers". So HALF of A works live — the economy investment is visible and confirmed — and the tower half does not. ⭐ DIAGNOSIS, 
2. CASTLE RACES BY COLOUR — art, cinematics and passive spawns per race (owner vision)
   Recorded in full at CASTLE_BUILD_SPACE_DESIGN.md (new addendum). white=ghosts, green=zombies, red=vampires, blue=ice giants, purple=demons, yellow=UNDECIDED (ASK — the owner has not named it). Each race: a generated castle, cinematics for ATTACK / DAMAGED / DE
3. BOTS MUST RESPECT FOG OF WAR — they currently see the whole board
   Owner: "shouldnt my towers be hidden from him in fog of war during building stage and he has to explore my zone with his cruiser/spark to see whats there? thats how it is for me at least, not fair if bots see evcerything". CONFIRMED BY DIRECT READ, not inferre
4. Bot intelligence Phase A — now UNBLOCKED (all 7 owner questions answered)
   BOT_INTELLIGENCE_DESIGN.md §10 holds the rulings. Phase A = knowledge book + combo-aware spark pick/placement + leader-targeted raid. ⛔ Q2 IS A PROHIBITION: do not change raid rate or the number of allowed raids, the owner says the current balance is good. Q6 
5. The owner saw bots "build towers from the beginning" while my run measured ZERO — reconcile
   Worth one probe. My instrumented run measured zero towers in 3 sim-minutes pre-fix, yet the owner watching live VS-BOTS said all three difficulties "build towers from the beginning". Either they mean freeform primitive placement (which does start immediately a
6. Host lag in multiplayer — finish worker-sim (D4 + default-on)
   Owner reported the HOST workstation lagging while the joiner was smooth. Diagnosed, not guessed: the host simulates everything (hostTick is host-only; the client mirrors), and main.ts names the profiled dominant cost — "the host 10Hz full-world snapshot serial

## Blockers
- NONE external. All 8 priorities shipped, deployed and verified live (verify-deploy 4/4,
  content-hash equality). Protocol 32 -> 33 landed with all six checklist sites.
- ⛔ ONE OPEN DEFECT, owner-confirmed by playtest: bots STILL do not build towers in a real
  match. The economy half of amendment A works live (gatherer upgrades visible); the tower half
  does not. Diagnosed as a FIXTURE artefact — see CF-S154-towers, priority 0.

## Pending Backlog
- (BACKLOG.md has no open - [ ] items)

## Recent Reflexion (last session)
## S154 (2026-08-27) — five approved priorities plus three owner amendments; and the owner playing the build found what my green tests had certified

**S154 P1 (R80, palette to the footer)**


- **THE BANKED PLAN HAD THE RIGHT FILES AND THE WRONG SHAPE.** Three sessions of carry-forward said to REPARENT the panel's palette Containers into the footer, because they already carry their own `pointertap`. Reading both files instead of trusting the note found an idiom fork: `castlePanel` lets Pixi hit-test one Container per control, `footerBand` draws one shared Graphics and hand-rolls its hit-tests because `controls.ts` must ask the SAME predicates on pointermove. Reparenting would have produced controls Pixi hit-tests but `isOverShapeStrip` cannot see — cursor, highlight and click guard each with a different opinion, and nothing red. An inherited plan's file list survives re-reading; its IMPLEMENTATION SHAPE has to be re-earned.

- **I FOLDED THE NEW GUARD INTO THE OLD PREDICATE INSTEAD OF ADDING A SIBLING.** `isOverChip` is consulted at four independent sites in `controls.ts`, and the one that matters is the `PLACE_FROM_FREE` commit gate: miss it and pressing a palette button ALSO plants the carried spark underneath. A precisely-named `isOverShapeStrip` threaded through four call sites is four chances to miss one; folding it into the predicate every site already calls is zero. A slightly wrong method name beat a slightly wrong guard.

- **MY CHANGE BROKE A TEST THAT HAD BEEN PASSING FOR THE WRONG REASON SINCE S149.** `panelHeight(2) > structuresStripHeight()` compared the panel's REAL height (which reserves `structuresStripHeight(liveTileCount())`, and `liveTileCount()` is 0 while the build grid is disabled) against the HYPOTHETICAL full-grid 298 px. It held only because the palette padded panelHeight by 78. The tempting fix was to move the number; the honest one was to assert what the file's own docblock warns about — `panelHeight` and `rowsTop` are two callers of one layout and must agree by construction. A failing test after a correct change is sometimes the test reporting an older defect, not a regression in the change.

- **THE CONSTRAINT THAT DECIDED THE LAYOUT WAS IN NEITHER THE CARRY-FORWARD NOR THE PROBE'S TOP FINDINGS: THE SEAT-2 PORCH.** `footerBand.ts`'s own docblock says the chips are centred because the QUADRANTS_4P porches sit at (1790,1024) and (130,1024) INSIDE the band — and the existing porch sweep iterated `chips` only, so a strip placed over a porch would have shipped green. Reading the file I was editing found the invariant the plan for editing it had lost.

- **TWO OF THE BANKED A.0's SHARPEST WARNINGS WERE SIMPLY FALSE, AND CHEAP TO DISPROVE.** "The legend will collide and must move" — `legendAnchor` returns `leftmost - LEGEND_GAP - LEGEND_WIDTH`, i.e. the LEFT end of the row, so a strip on the right cannot touch it. "Register the surface in hudLayout" — there is no `hudLayout.ts`; the registry is `hudSurfaces()` in `ui.ts`, whose docblock deliberately puts footer geometry out of scope. Both took one grep. Banked warnings earn a grep before they earn a design decision.

- **THE COUNCIL'S ONE CONVERGED RISK WAS WORTH MORE THAN ITS FIVE DIVERGENT ONES, AND A MEASUREMENT SETTLED IT WHERE A SECOND ROUND WOULD NOT HAVE.** Both external seats independently predicted a ranged creature creeps inward one cadence at a time. Rather than run Round 2 I reproduced the FSM plus the 8-substep physics in a throwaway probe: the SHIPPED archer's standoff decays 220 -> 155 px over 40 s, and goblins live 60 minutes. The prediction was right and it is a live defect in already-shipped code, not a hazard in the new work. Meanwhile GROK's top-ranked risk (a P4 host/client desync) was refuted by one line of `hostTick.ts` — the client never simulates creatures at all.

- **THE INSTRUMENT THAT GATED LAST SESSION'S SCOPE CUTS WAS BROKEN, AND ONE `cd` EXPOSED IT.** `real-context-tokens.py` falls back to `max(*.jsonl, key=mtime)` in a cwd-derived project dir because `$CLAUDE_SESSION_ID` is unset. Run from the parent project it cheerfully reported 42.58% from a SIX-WEEK-OLD transcript of a different session on a different model. S153 cut scope twice on that number against an owner UI reading of 52%. `--session-id` fixes it, and the reading is only trustworthy when the JSON echoes `discovery_source: cli_session_id`. A number that gates decisions deserves the same empirical suspicion as a Council claim.

- **THE PANE WAS DARK, SO rAF WAS PAUSED, AND MY FIRST LIVE READING SAID THE STRIP DID NOT EXIST.** `chips.length` came back 0 and for a moment that looked like a real defect in the derivation. The cause was that a non-compositing browser pane never fires `requestAnimationFrame`, so the Pixi ticker had never run `sync()`. Pumping `app.ticker.update()` by hand — the handle the e2e suite already uses — produced the correct geometry immediately. Before believing a live probe's negative result, check that the thing under test was ever given a chance to run.

**S154 P2 (R92, the bat rider's harpoon + the ranged-standoff creep)**


- **THE COUNCIL PREDICTED A DEFECT I THEN FOUND IN SHIPPED CODE, AND A MEASUREMENT BEAT A SECOND ROUND OF DELIBERATION.** Both external seats independently said a ranged creature would creep into melee one cadence at a time. Full tier calls for two Council rounds; instead I reproduced the FSM and the 8-substep physics in a throwaway probe and got a number: the SHIPPED archer loses 65 px of a 220 px standoff in forty seconds. A converged prediction is a hypothesis worth testing, and testing it cost less than arguing about it.

- **I GOT THE FIX WRONG TWICE, AND ONLY THE TEST KNEW.** Attempt 1 (hold the creature in ATTACKING so it never gets the per-cadence impulse) measured WORSE than doing nothing — 53 px versus 70 — because `ZERO_ACCEL` means COAST, not stop, and freezing the state removed the only force that could push the unit back out. Attempt 2 (aim at a standoff ring) help
