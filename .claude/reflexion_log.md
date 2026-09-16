## S180 (2026-09-16/17) - he approved a character sheet, played it within the minute, and found it dead: a patch had silently not applied while every gate stayed green. Also: the keep went onto the one stat ladder, and a canonical doc now exists BECAUSE he had to repeat archived facts for the third time.

- S180 — HALF A RULE IS WORSE THAN NONE, AND S179 DID IT AGAIN. The lone-shape ruling had two halves: stop targeting connected shapes, AND target the connectors instead. Only the first half shipped, so 21 of 24 unit types lost the ability to damage a building at all and marched on the castle instead. The owner found it by playing. #half-a-rule #ship-both-halves

- S180 — A DEAD AGENT RUN IS NOT A COMPLETED LANE (S161 rule, applied). The org spend limit killed 5 targeting verifiers and the character-sheet design synthesis mid-run. Both were redone BY HAND rather than recorded as unavailable. The hand pass is what found that damageConnector already cascades overkill, which changed the recommendation. #empirical-refutes-plausible-criticals

- S180 — THE STALE DOC IS MORE DANGEROUS THAN NO DOC. UNIT_STAT_TABLE.md lists Vlad at 90 pool; constants.ts:1666 says 260. A character sheet built from the repo own stat document would have printed a wrong number for every boss. Read numbers from the code at runtime, never from a generated table. #raw-code-not-abbreviations

- S180 — FOUR BACKLOG ITEMS WERE ALREADY DONE: the atlas debt (guard green, 31 clean, CI green), the Orc Warlord, the four boss numbers, the per-connector pool. Presenting a stale backlog as live scope is how the owner time gets wasted; verify every line before it reaches him. #policy-not-instance

- S180 — AN EXTERNAL REVIEWER CONFIDENT EXECUTION CLAIM STILL NEEDS THE TREE. GROK asserted live enemy health demands per-frame polling and a protocol bump; the mirrored ehp the health bars already draw refutes it outright. GEMINI overkill-is-wasted concern was likewise refuted by damageConnector own spend-not-zero comment. #check-reviewer-fabricated-execution-claims

- S180 — THE BEST DESIGN CAME FROM THE SEAT TOLD TO DISAGREE. Gemini was prompted to stress-test Grok rather than agree, and produced a third option (aim at the building, land damage on the connectors) neither I nor Grok had. Adversarial framing beat consensus framing. #adversarial-beats-consensus

- S180 - GREEN GATES ARE NOT PROOF A FEATURE IS WIRED. A patch adding the sheet to the own-building click silently failed to apply. typecheck, 4588 tests, the build, the bundle charter and the deploy were ALL green, because nothing covers the pointer path. The owner found it in the first minute of play. The fix is a source-text tripwire asserting each call site exists - the grep I should have run by hand. #verify-the-wire-not-just-the-gates

- S180 - A PATCH THAT DOES NOT APPLY IS THE SAME BUG TWICE. The identical line-ending mismatch dropped a setter earlier in the same session, and I caught THAT one only because typecheck failed. When the dropped line sits in an untested path, nothing tells you. Every patch now ends with a grep for the line it claims to have added. #verify-the-wire-not-just-the-gates

- S180 - I SHIPPED A HALF-FEATURE AND CALLED IT DONE. The card had no stats on buildings, no castle at all and no tower stats, and I told him to go play it. Read your own code for what it OMITS before announcing completion: an empty stats array was sitting there in plain sight. #read-what-it-omits

- S180 - THE OWNER WAS RIGHT THAT SOMETHING WAS NEW AND WRONG ABOUT WHICH. He believed I had added the SOUL feed chip. git settled it in one command: structurePanel.ts last modified 2026-09-07. PROVE PROVENANCE WITH GIT, never with memory - it protects him from a wrong fix and me from a wrong denial. #prove-it-with-git

- S180 - THE THIRD AGENT RUN THIS SESSION DIED TO THE SAME SPEND LIMIT, and the S161 rule paid for the third time: the audit lanes were hand-run and all three passed. The hand pass also found what no agent had - that damageConnector already cascades overkill, which made the targeting recommendation far cheaper than either option I was about to put to him. #a-dead-agent-run-is-not-a-verdict

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
