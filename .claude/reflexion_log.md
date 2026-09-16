## S179 (2026-09-16) - he stopped the session over a priority list that was not his, then three of his rulings shipped: the lone-shape rule (open three sessions), the four boss numbers, and two damage-number defects he found while playing mid-session.

- P0 #the-list-has-to-be-his: I opened by presenting the S178 handoff's numbered priority list as this session's plan. It was a previous session's reading of a previous conversation, not a mandate. He stopped the session: 'i think you are tripping about the priority list'. A handoff carries CONTEXT; the priorities come from asking what is wrong when he plays it.

- P0 #speak-in-what-he-sees: I put four options to him naming potatoLifecycle.ts and deathOnVanish. Reply: 'what are you talking about even!?!? i have no idea what are those fucking options'. He is the owner of the GAME, not of the symbol table. Re-asked in plain terms (a number pops over a shape) and he answered instantly.

- P1 #measure-dont-estimate-the-blast-radius: Before building the lone-shape rule I applied it, ran the suite, captured the exact red list (13 tests / 7 files), then restored the files BYTE-EXACTLY from copies rather than git checkout (which would have flipped line endings). The estimate and the measurement agreed, but only the measurement was evidence.

- P1 #half-a-rule-is-worse-than-none: The lone-shape rule failed twice across two sessions because each attempt shipped only HALF: cap the lone shape, but leave creatures targeting member shapes. That left two health systems for one structure, disagreeing (24 per connector vs 70 per brick). The second half was one line. Before building, ask what ELSE reads the number you are changing.

- P1 #a-fixture-with-side-effects-is-worse-than-no-fixture: Re-pinning the standoff tests I tried a bonded pair (died to one arrow), then a 25-connector chain: the structure survived but the SHOOTER vanished at t=960, because the fixture had started producing something that killed it. A durable inert anchor was the answer. A fixture that changes the world is not a fixture.

- P2 #a-test-that-cannot-reach-its-code-passes-for-the-wrong-reason: Two of my own first-draft tests for the untargetable fix were broken: one sat in SEEKING when the re-validation is gated on ATTACKING, the other passed an action with no creatureId so the reducer returned at line 2. Both would have gone green on a deleted fix. Drive the real entry point and assert a counter-case.

- P7 #prove-it-before-explaining-it-to-him: I told him his '56' was a shape's leftover pool. Partly right, and he rejected it: he saw the number on a connector that survived. Re-measured properly and found a SECOND, independent defect (the connector-breaking swing printed nothing at all). My explanation was a theory dressed as a finding.

- P7 #a-dead-verifier-is-not-a-refutation: My sweep workflow classified findings as REFUTED when every one of their verifier agents had died to the spend limit — live.length===0 fell through to survives:false. Unverified and refuted are opposite verdicts. The salvage run distinguishes UNVERIFIED explicitly.

- P8 #write-bindings-that-assert-absence-then-run-them: A verification binding asserting ZERO occurrences of 'SERIALIZED BUT NOT HASHED' in player.ts came back with two. I had fixed one stale comment and would have shipped the other two — raceId and eliminatedAtTick carried the same dead sentence. The binding found what reading did not.

- P8 #never-falsify-a-status-to-silence-a-warning: Six archived plans carried an in-progress marker, so six sessions were told to read six 'ACTIVE PLANS'. I stamped five terminal and left S173_NONET_STAGES in-progress because it genuinely is. Silencing the sixth would have traded a noisy-but-true warning for a quiet lie.

- P0 #he-is-a-source-of-truth-about-the-game: He said the potato blast is archived; the source still had spawn cadence, fuse, blast radius and bot errands for it. He was right: HAZARD_SPAWN_ENABLED is false and only a Playwright seam can flip it. When he contradicts the code about what the GAME does, check the gate before defending the code.

- P0 #scope-creep-inside-a-fix-is-itself-the-defect: S177 was asked to slow the leg animation on THREE named units and applied a distance-driven gait to every creature, writing its own justification into the docblock. The stride was tuned for the fast three, so every ordinary unit crawled. He noticed: 'I didn't ask you to do this'. The fix is a three-entry set with a note saying ADD to it, never re-generalise.
## S178 (2026-09-15) - his S178 playtest verdict answered end to end: the poop bag proven unkillable by probe and fixed, chain lightning given the falloff he ruled, the vortex exploit unwired, the playfield edge that never existed, the TV's frozen rows, and a verification pass that found three regressions I had shipped.

- P1 #stale-doc-is-a-live-hazard: A stale comment half-updated is worse than one wholly stale. constants.ts' boss block had a CURRENT attackFifths line beside a PRE-S172 unitPoolFifths line, so a reader saw damage exactly right and durability 3x low. Fix both halves of a table or neither.

- P2 #measure-the-artifact-not-the-manifest: I read `frames: 12` from a manifest and built a fix on it. A pixel diff showed four of six rows are 12 BYTE-IDENTICAL copies of one still. The manifest describes the packer's output shape, not the art. Measure the shipped bytes before reasoning about what a player sees.

- P3 #flavour-text-is-not-a-ruling: The Vortex's only authority was a description string in a combo table that a later session chose to 'realize' as physics. The owner had never ruled it. Before implementing to a label, grep for the owner quote; if there is none, the label is flavour and the mechanic is a proposal.

- P4 #a-probe-beats-an-argument: Three sessions reasoned about the poop bag from the code and got it wrong. A 40-line probe settled it in one run: dead in 60 ticks with no shape, ticksToDie=null with a shape 300px away. Write the probe before the theory, and keep it as the regression test.

- P5 #a-provisional-decision-needs-its-trigger-watched: No-falloff was MINE, was labelled provisional, and pre-registered its own trigger ('if it plays too strong the dial is here'). Nobody watched the trigger; the owner pulled it by playing. A recorded trigger with no watcher is a note, not a plan.

- P6 #convert-all-N-sites-or-none: S177 P1 converted six radial damage sites to the ladder and missed the seventh, which then paid shapes on a retired 1000-point scale for a whole session. The suite could not see it because it asserted the number was linear and integer, never which SCALE it landed on.

- P7 #presence-is-not-visibility: Three renderers shared one bug: the fog `continue` ran before the id was registered as live, so leaving vision was indistinguishable from dying. Nothing tested the distinction, so a mechanic could be armed or disarmed with the suite fully green.

- P8 #a-test-can-pin-the-defect: A test asserted 'a structure damaged past its pool draws nothing' with a fixture the sim cannot produce, while the reachable version of that state was a real bug. A green test pinning an unreachable fixture is worse than no test: it certifies the wrong thing.

- P9 #collapse-duplication-when-you-would-add-the-third: The ring-centroid walk existed twice and I needed a third. Moving it to the file that already owned the sizes and the anchor left one definition, so the health bar, the building and the click target cannot drift apart.

- P10 #a-clamp-on-movement-is-not-a-clamp-on-existence: Giving the sim a playfield fixed creatures walking off the board and immediately created a new exploit: build legality had no edge term, so a shape placed past the clamp was unreachable by every melee unit. When you add a rule, ask which other subsystem now disagrees with it.

- P11 #verify-the-fix-not-just-the-gates: Every gate was green on work that contained three regressions I had introduced: widened frozen stills, a size target measured against the wrong thing, and a broken death-watcher guard. Gates prove the suite still passes; only an adversarial read of the diff against the requirement proves the fix is right.

- P11 #file_lacks-is-the-wrong-binding-in-this-repo: Three verification bindings failed because this codebase QUOTES the superseded text at the correction, so the old string legitimately survives in a comment. Assert the new code positively, or anchor a grep so a comment line cannot satisfy it.

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

- P10 #the-constraint-that-forbade-the-obvious-fix: the die clip blew the 8192 texture ceiling and dropping one frame was the obvious answer - until a test showed attack.frames x ticksPerFrame must EQUAL the attack cadence, so 20 x 3 is forced and the cell is capped at 409 instead. The fix had to move to the ART (land compact), not the frame count. Two constraints crossing is where a cheap fix usually hides a real one.

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
