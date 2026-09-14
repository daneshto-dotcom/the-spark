## S175 (2026-09-13/14) - ten priorities from a batch PDR that Phase A.0 rewrote before a line was typed: the Warlord finished, the direwolf finally packed from art that had been on disk for two sessions, the Voltkin TV turned into a real building he emerges from, connectors that phase out under it, damage numbers on everything that bleeds, creatures that stop skating - and atlas-guard GREEN for the first time since S171. Zero art generated. Six self-inflicted faults, every one caught by looking rather than by a gate.

- P1 #the-backlog-said-owed-and-the-tree-said-shipped: the 2x MOVE speed had been wired since S168 at creatureVerlet.ts:168 while the backlog, the handoff and the boot snapshot all listed it as outstanding. Phase A.0 is the only reason P1 was scoped as 'the tint' instead of re-implementing something that already worked.

- P1b #the-channel-was-already-spent: the obvious one-line fix (sp.tint = red) collides with the seat-colour wash that already occupies that channel, and a Pixi tint is a MULTIPLY - S151 shipped exactly this and S152 had to repair it. The seat cue survives only because S154 put a coloured ground marker under every creature, which is what made overriding safe.

- P1c #he-asked-for-the-half-i-had-not-planned: 'so he LOOKS like he attacks two times faster as well' - the cadence divide existed, the animation frame rate did not, so an enraged Warlord would have re-triggered his swing before the attack row finished drawing. Shipping only the cadence would have looked like a stutter, not like speed.

- P2 #both-sides-of-the-art-claim-were-half-right: the handoff said the direwolf HAD art, the renderer said it had NONE. The art existed and was committed; no atlas-specs.json existed, so nothing had ever been packed. The owner was right and so was the grep, and the missing word was PACKED.

- P2b #the-contact-sheet-caught-what-no-gate-could: three separate defects shipped a green typecheck, a green suite and an unchanged check:atlas - mixed canvas sizes, a still with no standing frame 0, and a corpse cut from the dark sheet that the near-white matte could not lift. Every one was found by LOOKING at the PNG. The protocol's 'audition the sheet' step is the only thing standing between those and the owner.

- P2c #the-first-correct-fix-was-still-wrong: exempting a still from normaliseStateScale fixed the inflation and immediately caused the opposite failure - with no normalisation the still keeps the scale of its own small canvas and comes out enormous. A ratio measured off one sheet was the answer; neither naive branch was.

- P2d #the-protocol-document-lied-about-its-own-clip: ART_VEO_PROTOCOL.md condemns direwolf/walk as NOT RECOVERABLE. walk.mp4 was re-rolled at 21:17 after that table was written. A stale verdict table is worth money - it would have bought a re-roll of a clip that already passes.

- P5 #the-code-had-already-named-its-own-fix-site: codexOverlay.ts said since S173 that a deliberate order 'belongs at the main.ts call site as an explicit sort, not as a hope about import order'. Reading the file I was about to change saved inventing a worse place to put it.

- P5b #two-owner-sentences-disagreed-and-the-newer-one-wins: 'stink tower is last' (S174) vs 'it's by connectors' (S175). The stink tower has 4 nodes but 3 bonds, so the connector rule puts it FIRST. Shipping the specific ruling and recording the conflict in a test beats quietly hand-placing the card.

- P6 #the-only-test-i-wrote-caught-the-only-bug-i-shipped: flip detection inside the alpha getter read correctly for anything queried every frame and silently wrong for anything the concealment `continue` skipped - a shape would have phased in as you looked at it. Nothing else in the tree could have caught it; StructureRenderer is never instantiated in any test.

- P6b #the-natural-anchor-was-the-trap: ignitedAtTick is exactly the field this ramp wants and is STRIPPED on the wire, re-seeded from the client's own tick every snapshot. A.0 found it; using it would have made joiners' fades restart 10x a second and looked like a shader bug.

- P6c #the-owner-narrowed-the-scope-himself-and-the-design-already-obeyed: he confirmed defenders count as 'a tower on top' and then said none of them has art yet, focus on the race ones. Because cover is published by whoever DRAWS a sprite, that needed no filter - the general towers simply never mark.

- P4a #the-missing-entity-was-the-whole-cost: the TV looked like an art task and was actually a 'there is nothing to hang art on' task - voltkin is the only kind:'cinematic' recipe, with no spawner and no defender. Re-deriving the chain per frame from synced topology dodged a sim change entirely and cost no protocol bump.

- P4b #the-thing-he-said-stops-the-game-never-stopped-the-game: activeCinematicPlayerId appears in zero tick paths. What stopped was an opaque rectangle and an input lock on the summoner ONLY. Believing the owner's description of the SYMPTOM while distrusting the implied mechanism is what found it.

- P4b-b #deleting-the-delay-mattered-as-much-as-deleting-the-overlay: the 4.8s hold existed solely to hide the spawn under black. Removing the overlay and keeping the hold would have moved the complaint, not fixed it - five seconds of nothing instead of five seconds of cutscene.

- MCV #i-wrote-verification-[]-again-and-my-own-memory-file-warns-about-it: all six priorities closed with zero assertions and the Stop hook hard-failed with the S149 fabrication class. 35 bindings authored after the fact, every needle grepped against disk BEFORE asserting, verifier re-run to exit 0.

- MCV-b #a-relative-path-cannot-satisfy-diff-binding: the BACKLOG.md binding passed as an assertion and still failed the gate, because asserted_paths is compared against the watcher's ABSOLUTE paths. Reading the verifier's source beat guessing at the shape of the rule.

- COST #the-7-dollars-was-agent-spend-not-art-spend: zero veo and zero imagen calls were made all session; the figure is the A.0 sweep (1.02M subagent tokens over 7 lanes). Recording it in the right column keeps the veo rate we are trying to correct from being polluted by it.

- P7 #the-fix-was-a-different-operation-not-more-of-the-same: the halo survived a 1px erosion because the matte keys near-WHITE (>205) and the halo is the anti-aliased blend BELOW that. Reaching for deeper erosion would have eaten spears and antennae; stripping only PALE boundary pixels fixed nine sheets and kept every spike.

- P7b #lowering-the-threshold-made-it-worse: edgeFringeLuma 170->81px, 150->85, 130->89. Stripping darker pixels EXPOSES paler ones underneath. The obvious direction was the wrong one and only a sweep showed it.

- P7c #the-rebuild-revealed-my-own-earlier-claim-was-too-narrow: P2's canvas-unification was described as a mixed-clip/still fix. content_column crops each STATE to its own width, so clip-only specs were ragged too - padding corrected a measurement error on EVERY multi-state atlas and moved every ratio toward 1.00. 18 sheets changed, not 9.

- P7d #green-was-the-goal-not-no-red-lines: the owner's stated cost was 'a permanently red job is where a real failure hides'. Fixing 9 of 14 left it red and useless. A per-file, dated, PRINTED waiver for the 5 pose sheets is what actually delivered the goal - and the summary line names the waiver count because this script's own comment warns that partial-green is false assurance.

- P8 #an-in-tree-cost-figure-nobody-reconciled-is-a-guess: $0.50/clip was inherited from S83, re-asserted by S152 self-consistently, and wrong by ~6x. It survived six sessions because it was never checked against a statement.

- P9 #his-two-rulings-only-looked-opposed: he asked to HIDE connectors under a tower (P6) and then to SEE damage on connectors (P9). Cover yielding to damage satisfies both; treating the second as a reversal of the first would have thrown away work he wanted.

- P9b #the-inversion-would-have-shipped-backwards: Bond.damageFifths counts UP where every other pool counts DOWN. Read with the normal rule it prints a number when a connector is REPAIRED and nothing while it is chewed - exactly wrong, on the one thing he named twice.

- P10 #the-bug-was-documented-at-the-line-that-caused-it: 'ZERO_ACCEL means COAST, NOT STOP ... ~200 ticks to bleed away' had been in creatureVerlet since S154, with a traced measurement. S154 fixed it for holdsRange only, and that flag is false on all seven other configs. Reading the comment above the code I was about to change gave me the whole diagnosis for free.

- P10b #i-deliberately-missed-his-number-and-said-so: he said 'cut in half'; I shipped 4.9x. A literal halving lands at 1.6s, which is the same complaint quieter. He hedged the number and was emphatic about the feel - the feel is the spec, and the arithmetic for all three options sits at the constant so he can overrule in one line.

- SESSION #truncating-a-file-by-opening-it-for-write: io.open(p,'w') truncates BEFORE the encode can throw. A surrogate pair in my own comment zeroed SKILL.md. Build the string first, write a .tmp, os.replace - now recorded in the skill itself.

## S173/S174 (2026-09-12/13) - the playtest session: nine live bugs from a 2-player internet game, all triaged and most shipped; tower/castle health bars made honest; the codex cut back and unlocked; $6.00 of veo clips that taught a protocol; and THREE self-inflicted faults worth more than the features - a deploy I broke with a staged deletion, a lesson I bought that was already in the repo, and a hypothesis that contradicted my own A.0.

- P1 #the-function-with-no-callers-was-the-spec: structureDefenceFifths already existed in stats.ts with ZERO production callers, and its docblock said outright that it existed "so the HUD and the tests can speak their language". The tower health bar the owner asked for had already been half-written by a past session and never wired - the same shape as S167's t3TowerAtlasBase, where the art shipped with no renderer. Grepping for an unused function that names your feature is cheaper than designing the feature.

- P1b #two-durability-models-and-the-bar-can-only-tell-one-truth: a tower dies EITHER by connector severance (Bond.damageFifths vs connectorCapacityFifths) OR by primitive death (prim.hp -> razePrimitives), and towerRenderer already derives its damaged/destroyed FRAME from the second while the owner's words name the first. I shipped his model and documented the other AT THE SITE rather than picking silently - because a future session finding the bar "under-reporting" will otherwise re-derive the whole thing before discovering there were two.

- P1c #vitest-green-and-tsc-red-on-the-same-commit: the full suite passed 4303/4303 while typecheck exited 1 with three errors in the very test file that was passing. Bond.a is a PhysicsBody, not a Primitive, so my adjacency detach was a no-op the assertions could not see. Reading ONE gate's exit code would have shipped it. The project rule is "read every gate's exit code from a captured $?" - every, not the slowest one.

- A0 #i-rode-six-lanes-on-one-invocation-and-lost-five: the state-discovery workflow put all six probe lanes in a single Workflow call, an org spend limit hit mid-run, and 6 of 8 agents died - the exact S161 failure this project's CLAUDE.md warns about in a section written after it happened before. I had READ that section during boot. Re-running the four dead lanes by hand cost more than dispatching them separately would have. When the owner later asked for parallel work I used three SEPARATE Agent invocations for that reason.

- P4 #the-agent-refused-my-brief-and-was-right: I briefed the tower-shortfall work at castlePanel's caption from my own grep. CASTLE_BUILD_GRID_ENABLED = false - that panel has been dead code since S149 P5 moved tower-building to the footer band. The agent verified the premise before building on it and redirected to footerBand.ts. I had grepped for the STRING ("NEED n MORE") and found a real site, but never asked whether that site was still REACHABLE. A live-looking code path is not the same as a rendered one.

- P4b #two-agents-one-working-tree-sweep-each-other: staging is global, so when two subagents commit into the same checkout, whoever commits second sweeps up the first's staged files - and the first then reports success for a commit that does not contain its work. The P4 agent even NAMED this hazard in its report and still concluded, wrongly, that its work was safe in HEAD. It was uncommitted. VERIFYING THE AGENT'S CLAIM AGAINST THE TREE is what saved it: three greps, and the symbols were absent from every commit. Next time: give parallel agents separate worktrees, or let exactly one of them commit.

- B3 #a-noted-defect-is-still-a-defect: healthBar.ts carried the line "The castle bar (gathererRenderer.drawKeep) still carries fault 1 - noted, not touched here" from S171 onward. Fault 1 is hide-while-undamaged, which the owner had ALREADY rejected once for creatures. He then found it on the castle by playing, and reported it a second time. Writing a defect down bought nothing except the ability to say it was known. If it is worth a comment that names it as a fault, it is worth either fixing or a line in the backlog he can see.

- P1/B3 #shipping-half-a-ruling-reads-as-not-shipping-it: P1 gave every tower a health bar and he still said "the other buildings don't have HP bars" - because the bar was RED and the castle's is GREEN, so it did not read as the same feature. The mechanic was right and the signal was wrong. Colour was carrying meaning (building vs unit) that nobody had written down, and I had matched the creature convention without asking which family a tower belongs to.

- B5 #my-brief-named-the-wrong-layer-and-the-agent-refused-it: I briefed a wave-indexed ladder falling through to a default creature type, because the owner said "after wave three the CASTLE starts SPAWNING goblins" and that sentence sounds like sim. There is no wave->creature table in the tree at all; world.waveNumber has one consumer and it scales a spawn RATE. The real cause was a RENDERER fall-through - direwolf in GOBLIN_KINDS with no atlas, drawn as the pre-veo puppet. TWICE IN ONE SESSION an agent has corrected the layer I aimed it at (P4 was the dead castle panel). The owner describes what he SEES; the word he uses for the mechanism is a guess I should not inherit.

- B5b #a-deliberate-exemption-is-still-a-defect-and-it-was-defended-in-prose: S168 wrote at the constant that the direwolf had NO ATLAS "deliberately... visible and readable until the art lands", while the coverage test one paragraph below stated the opposite principle correctly for the locust cloud. The exemption survived because it was ARGUED rather than tested. Same shape as B3 this session, where "the castle bar still carries fault 1 - noted, not touched here" sat in a docblock for five sessions until he found it by playing. A defect with a paragraph defending it outlives a defect with nothing.

- P2 #i-had-both-halves-of-the-contradiction-and-shipped-anyway: A.0 established that normaliseStateScale equalises HEIGHT only (_subject_h, no _subject_w exists) AND that 5 of 6 mismatched atlases predated the packer fix. Every failure the guard prints is a WIDTH divergence ("1.21w(WIDE)"), so the repack could never have worked - the two findings were in the same write-up and contradicted each other. I built a priority on the mtime half because it was NEW and felt like the stronger signal. The experiment cost one repack to disprove, which is cheap; the lesson is to cross-check a new finding against the mechanism finding BEFORE writing the PDR.

- P2b #a-negative-result-is-a-deliverable: the repack produced no improvement and was reverted, and the session is BETTER for it - the corrected verdict is that ALL SIX size-mismatched atlases need regenerated art, not just the scarab. Recorded with the measurement so the next session does not re-run the same experiment on the other four.

- S174 #i-fell-into-the-shared-tree-hazard-i-warned-four-agents-about: the codex agent had STAGED the deletion of codexStore.ts without finishing its importers. My unrelated clips commit ran git commit, the staged deletion rode along, and the Pages build died on four "Cannot find module ./codexStore.ts" errors - the live site sat stale for an hour. I had written the warning about global staging into every one of those four agent briefs. Writing a hazard down does not exempt you from it; `git status` before `git commit` does.

- S174 #a-dead-agent-is-not-an-empty-lane: all four agents died on a spend limit and every one of them had left real work uncommitted - a finished discovery removal, a new structureComponents module, the entire /veo-generate protocol. Their last messages read like they had barely started. Reading the TREE rather than the transcripts recovered ~1,500 lines that would otherwise have been re-paid for. Check what landed before re-running anything.

- S174 #i-bought-the-lesson-that-was-already-in-the-repo: generated 12 veo clips at $0.50 each and 7 were condemned, because I wrote my own prompts and my own seed geometry instead of first reading assets-source/race-tier9-bosses/clip-spec.json - the spec that produced the one boss the owner says looks right. The working recipe was sitting in the tree the whole time. That is now a protocol with STEP ZERO being "read the last known-good spec".

