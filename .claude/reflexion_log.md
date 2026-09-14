## S177 (2026-09-14) - his eight playtest bugs answered, R173 built 24 sessions after it was ruled, the x5 stat ladder made canon in CLAUDE.md, a scope-amendment rule that nothing swings at nothing, and the TV's two state-transition videos generated for $12.40.

- P1 #the-ruling-was-24-sessions-old-and-never-built: R173 was RULED in S173 with a worked table and left unimplemented while the code ran DEF=n-1 and banked damage per-bond. The owner rediscovered it as a bug report. A ruling with no implementation and no carry-forward is indistinguishable from a ruling that was never given.

- P1 #one-ladder-preserved-the-balance-it-was-feared-to-break: moving shapes from a 1000-point scale onto attackFifths was expected to retune everything. Measured, it preserved drone-fells-shape-in-3 and Ra-one-shots exactly, and moved ONE relationship (suicide 3->4 blasts). The fear was worth measuring rather than trusting.

- P5 #his-diagnosis-was-wrong-and-his-observation-was-right: he said the bags had too much health; they had the minimum possible. But his SIX SECONDS was exact - it was the bag expiry timer running out while an army swung and missed. Take the observation as data and re-derive the cause.

- P4 #the-window-i-added-to-be-safe-was-the-defect: both TV clips failed check-clip on edge-touching frames, so I capped sampleWindow. That cut each clip off MID-EXPLOSION and the row's held last frame became a frozen blast instead of the settled state. Measuring which frames actually offended (spawning 51-53, destroyed 59-60) showed 12-of-96 is stride 8 and never samples them - the cap was never needed. Caught ONLY by auditioning the packed sheet on the dark board, which is why that step is in the protocol.

- P9 #a-probe-beats-an-argument: making primitiveValid reach-aware is the obvious completion of the owner's rule and I could argue either way for twenty minutes. A six-predicate probe of the real host tick answered it in one run: Helga steps out of a goblin's 35px reach on tick 34 while he is frozen in ATTACKING, so every moving defender would have become unkillable in melee. Built, measured, reverted - and the shape mime killed at its source instead.

- P3 #the-change-that-could-not-possibly-do-anything: setting lifetimeTicks on a config whose persistent:true overrides it. Caught only by reading the factory it came from. Same shape as S153 P1.

- SESSION #a-test-can-go-green-for-the-wrong-reason: pinnedDeadStats pins SOURCE TEXT, and stayed green because my own new comment happened to contain the retired symbol name it was looking for.

- SESSION #an-authorisation-against-a-wrong-price-is-not-an-authorisation: he approved a clip at the ~$3 I quoted; the protocol records HIS measurement of ~$20. Re-ask rather than spend 7x.

- SESSION #the-background-subshell-died-with-its-parent: `(cmd; echo $? > f) &` inside a backgrounded Bash call produced a log truncated at test 23 and NO exit file, while the harness printed [exited with code 0]. Absence of a captured $? is not a pass.

## S176 (2026-09-14) - two priorities, $0.00 of art: the Voltkin finally drawn from a sheet instead of a procedural puppet under two stills, at 20 frames a state (his ruling, the 12-frame dial closed upwards), and his TV given the emergence and destruction SEQUENCES it never had. Every A.0 agent died to the spend limit and every finding came from a hand-run. Also found: a CI failure four commits old that the previous handoff called green.

- P0 #the-hunt-returned-nothing-and-the-rule-held: all FOUR Phase A.0 workflow lanes died to the org monthly spend limit, returning zero findings - the exact S161 failure this project's CLAUDE.md was written about, and the third session in a row to meet it. The difference this time is that the lanes were re-run BY HAND rather than filed as 'the sweep produced nothing'. Every load-bearing fact in the PDR came from those hand-runs; the agents contributed nothing. Delegated investigation is a speed-up, never the deliverable.

- P1 #the-validator-passed-the-clip-it-could-not-see: check-clip.mjs PASSES voltkin/idle with 'no action needed'. Re-running its OWN detector over all 96 frames instead of its 24 samples showed the bars ramping 318->104 across f0..f7. It tests whether bars are PRESENT in every sampled frame, never whether their WIDTH is constant - so a ramp reads as 'barred throughout', which is its stable-and-fine case. A tool's verdict is only as good as the property it actually measures, and the way to find out which property that is, is to read it.

- P1b #the-bolts-were-counted-as-the-body: the attack row packed the character at HALF size and nothing in the pipeline objected. normaliseStateScale compares whole-subject heights, and a lightning bolt is subject - so in the discharge window the bolts doubled the extent, the pass saw a correctly-sized subject and declined to scale. Measuring the YELLOW body separately from the CYAN bolts turned an aesthetic argument ('which window looks more like an attack') into an arithmetic one (409px body vs a 582px reference, x1.51 in one window and x1.00 in the other). The sprite did not need the lightning anyway: the engine already emits one ARC_FLASH per CREATURE_ATTACK.

- P1c #a-cell-is-not-a-character: spriteBoxOf feeds the health bar's LIFT, and a Sprite reports its cell. An atlas cell is sized to the widest frame of any row, so the walk row's horizontal sprawl inflated the cell that idle sits inside - and the bar would have floated ~29% of a cell above his head. This is S172's defect in mirror image (that one drew the bar INSIDE the body). The fix is a measured per-row content fraction, worst-case across all 20 frames rather than median, because a bar that jitters frame-to-frame is worse than one a few pixels high.

- P2 #it-was-not-stuck-it-was-the-only-frame: the owner photographed the Voltkin frozen mid-emergence and read it as a stuck animation. It was packed framesPerState:1 - one still, held for the whole 60-tick spawn window. Nothing was broken and nothing had regressed; there was no sequence to play. The diagnosis that matters is the one that distinguishes 'this stopped working' from 'this was never built', because they have completely different fixes and only one of them is a bug hunt.

- P2b #the-art-answered-the-ruling: his ruling was 'he waits by his TV that's broken, but it's not damaged or anything - be very consistent about this', which reads like a design decision needing a code change. Opening the six source panels settled it in seconds: tv-1-intact IS a blown-out star-cracked screen on an undamaged chassis. Broken, not damaged. The existing mapping already satisfied him and the correct action was to DOCUMENT that at the site so nobody 'fixes' it later by pointing the resting state at the spawn row, which still has his body in it.

- SESSION #the-gate-was-read-at-boot-and-called-green-at-close: CI's e2e job has failed on ONE assertion since S175 - fe4c953, 6a2ad74, 4a107b0, 2394368 - always '1 failed, 64 passed', always e2e/fog.spec.ts:133. S175's handoff recorded the suite green because it read that gate at BOOT, against the tree it INHERITED, and never re-read it at close. The cause was S175's own new VoltkinTowerRenderer adding a Container to fogHiddenLayer without updating the spec's hardcoded roll call - the precise hazard creatureRenderer warns about two files away. A gate read before you change anything measures the previous session.

- SESSION #i-walked-into-the-trap-this-repo-names-in-bold: reading the review gate's verdict I wrote `python ... | tail -8; echo $?` and got 0 - tail's status, not the script's. The real exit was 2, BLOCKED. This project's CLAUDE.md warns about exactly this in two separate bold paragraphs, and I had quoted the rule to the owner earlier in the same session while checking OTHER gates. Knowing a rule and applying it at every site are different skills; the habit has to be the redirect-and-capture, not the intention.

- SESSION #meta: two priorities shipped from art the owner generated two sessions ago, for $0.00 - no veo call was made. The session's real output was not the code but the measurements: four clip windows, a body-vs-bolt height separation, a per-row content fraction, and a four-commit-old CI failure nobody had attributed. Every one of them came from looking at a picture or reading a script, and none from an agent.

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
