# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-26 | Session: S152 | Commit: bf2b213 | PROTOCOL 31

## Next Steps
1. ⛔ CF-S152-b — goblinHound has NO atlas, so Circle-fed goblins render as a GREEN PROCEDURAL
   PUPPET (the owner's "gay green circle"). HARD BLOCKER: the veo/image endpoint returns 429
   'prepayment credits are depleted' — the owner must top up at https://ai.studio/projects.
   The hound's prompt is ALREADY committed in assets-source/godly-goblins/design-spec.json;
   six exact resume commands are in session-state carry_forward CF-S152-b.
2. OWNER-OPTIONAL, same blocker: regenerate the melee + archer atlases. They are S151-era,
   built BEFORE this session's two matte fixes, so they still carry those defects. 6 clips.
3. CF-S152-c — finish the A5 affordance pass. Title screen + structure popover are done
   (hover/press/sound/cursor); the footer chips, castle tiles and gatherer upgrades still
   have no hover or press state of their own — each needs it plumbed into its own renderer.
4. CF-S152-a — worker-bots.spec.ts fails on CI, passes locally. NOT a regression: its own
   dump shows tick 805 with bots still gathering, i.e. a WALL-CLOCK wait for a SIM-TIME
   assertion. Fix with a tick-based wait, NOT a longer timeout (that rope failed twice here).
5. Then the older inherited list: CF1 (?worker=1 click-to-build never ignites the DEFENDER —
   same defect CLASS as the goblin-tower gap fixed this session, so it may fall fast),
   CF-S147-e (R45 lobby colour/race picker), CF-S149-f (bots build towers).

## Blockers
- ⛔ veo/image generation is DEAD until billing is topped up: 429 RESOURCE_EXHAUSTED, "Your
  prepayment credits are depleted" (Google AI Studio). This blocks ALL remaining art work.
  ⚠ Note honestly: ~$3.50 of the ~$6 spent today was wasted by a bug in my own clip script's error
  path (it threw on the first 429 and orphaned seven already-billed operations). That is fixed.
- The owner is mid-playtest and will bring more corrections. Expect a scope amendment, not a batch.

## Pending Backlog
- [ ] goblinHound atlas (CF-S152-b) — blocked on credits
- [ ] melee/archer atlas regeneration at the new matte quality — blocked on credits, owner-optional
- [ ] A5 affordance on footer chips / castle tiles / gatherer upgrades (CF-S152-c)
- [ ] worker-bots tick-based wait (CF-S152-a)
- [ ] CF1 ?worker=1 defender ignition · CF-S147-e lobby picker · CF-S149-f bots build towers
- [ ] R77 mechanics still unbuilt: voltkin chain lightning, AoE attacks, destructible stink bags,
      the 0.2-atk/sec aura
- [ ] R78 open question RESOLVED this session (raid is its own currency); castle HP/elimination open

## Recent Reflexion (last 2 sessions)
## S152 (2026-08-26) — RAID, the FEED gesture and the goblin art; then five playtest defects, four of which were already in the tree before I touched it

- S152 P1 — A.0 CUT THE PRIORITY IN HALF BEFORE I WROTE A LINE. Right-click precedence, the connector damage pool (Bond.damageFifths) and a wire-carried-but-unhashed effect queue ALL already existed. The handoff described RAID as a new gesture needing new hashed state; it was actually a re-costing of a gesture shipped in S102. Read the tree before believing the plan — including the plan I wrote.

- S152 P1 — BOTH COUNCIL SEATS WERE CONFIDENTLY WRONG IN THE SAME DIRECTION, AND UNANIMITY ON A FALSE PREMISE IS THE REAL HAZARD. Grok specified a new hashed RaidCloud[]; Gemini specified 'you must add a state-hashed damage pool to every connector'. Both already existed. Adopting either verbatim would have bought a wire field and a hash change for nothing. Ninth occurrence of #empirical-refutes-plausible-criticals.

- S152 P1 — MY OWN TEST CAUGHT THE BUG BECAUSE OF ONE DESIGN CHOICE IN THE TEST, NOT BECAUSE I REASONED WELL. raid.test.ts builds REAL topology instead of stubbing a bond, because connector capacity is derived from the live component. A stubbed bond would have had a component of one, tested the wrong capacity, and passed — hiding that the re-dispatched SEVER_BOND was silently refused for want of disruption charges the raider never needed.

- S152 P1 — VITEST WENT GREEN WHILE TSC WAS RED, TWICE. Vitest does not typecheck, so 17/17 passing said nothing about two unwidened cause unions (the ACTION's and the EFFECT's are different unions). tsc is the gate; a green test run is not evidence the build is sound.

- S152 P1 — THE SILENT REGRESSION I ALMOST SHIPPED WAS FOUND BY ASKING WHAT THE GESTURE USED TO SOUND LIKE. Right-clicking a bond farted via cause:'player'. Renaming the cause to 'raid' would have muted the most common sever in the game, and NOTHING would have failed — no test asserts that SFX, and severBond's `never` guard only forces the ATTRIBUTION decision, not the audio one. Exhaustiveness guards cover the branches someone thought to guard.

- S152 P1 — A SCREENSHOT CAUGHT WHAT 21 LAYOUT TESTS COULD NOT, BECAUSE I HAD NOT REGISTERED THE SURFACE. My HUD diamonds drew straight through the Q=ZONE text. hudLayout.test.ts sweeps every pair of registered surfaces — it was silent only because a new surface is invisible to it until someone adds it. The durable fix was not moving the x; it was registering 'raid-pips' so the gate owns the invariant instead of my eyes.

- S152 P1 — THE MIXED LINE ENDINGS BIT AGAIN AND A BYTE-LEVEL CHECK IS THE ONLY HONEST VERIFIER. controls.ts is pure CRLF, every other file pure LF. A needle written with 
 matched ZERO times there, and a hand-rolled import rewrite injected 2 bare LFs into a CRLF file. Both were caught by asserting the match COUNT and then re-counting terminators as bytes — `grep -c` cannot see a line ending.

- S152 P2 - THE MISSING BUTTON WAS THE SMALLER HALF. The goblin tower never IGNITED: runSpawnerIgnition names its recipes by hand and only ever named two, while goblinTowerRecipe sat in a registry whose matcher has zero production callers. A REGISTERED RECIPE IS NOT A LIVE RECIPE - registration feeds a matcher nothing calls, so adding a recipe to the registry LOOKS like wiring it up. Every gate downstream was correct and unreachable.

- S152 P2 - 'IT BUILDS, IT IGNITES, IT TEARS DOWN' WAS TWO-OF-THREE, and I only found out because a test written for a DIFFERENT purpose (the FEED row) asserted six buttons and got zero. When a handoff lists three capabilities in one breath, the cheapest audit is one test that exercises all three through the real path - not reading the code for each.

- S152 P2 - WIDENING A RETURN TYPE IS A CHEAP WAY TO BUY tsc ENFORCEMENT. Making buttonAt return a discriminated action instead of a bare string kind forced controls.ts and main.ts to be updated in the same edit. The alternative (six 'FEED_DOT'-style literals) would have compiled everywhere and pushed the payload into a string every consumer re-parses.

- S152 P2 - A PANEL MUST COUNT WHAT THE REDUCER COUNTS. FEED's gate reads bankCountOf (castle bank only); the obvious availableShapeCounts also includes the porch, which would have shown a feedable shape and then been silently refused. The affordance and the authority must consult the same source or they drift.

- S152 P3 - I RETUNED THE GENERATOR THREE TIMES FOR A BUG IN THE CONSUMER. Washed-out, blotchy sprites read exactly like generative drift, so I shortened clips, narrowed sample windows and rewrote prompts. Extracting the RAW clip frames took thirty seconds and showed them pristine: the matte was deleting the ink outlines. CHECK THE INPUT BEFORE RETUNING THE THING THAT CONSUMES IT.

- S152 P3 - A CONNECTED-COMPONENT RULE IS ONLY AS GOOD AS ITS SHAPE TEST. 'Remove dark regions touching the border' sounds airtight until you notice a cartoon's ink outline is dark, connected, and touches the border the moment a wingtip does - taking the whole character with it. The fix was not a better threshold but a better QUESTION: is this shaped like a bar?

- S152 P3 - A THRESHOLD CALIBRATED ON ONE SAMPLE IS A CONSTANT WAITING TO BE WRONG. The 0.3% enclosed-white limit was measured on the swordsman and documented with its measurements, which is why it was fixable in minutes - but it silently failed the first character with different proportions. Per-subject knob, default unchanged, so the calibration that works keeps working.

- S152 P3 - THE INVISIBLE UNIT PASSED EVERY TEST I HAD. The e2e feed spec asserts the creature exists and the bank was debited; both were true while the player saw nothing at all, because alpha was ticksInState/spawnTicks and creatures do not tick during BUILD. A screenshot found in one glance what assertions on state cannot: state is not pixels.

- S152 P3 - THE COMMENT PROMISED 'FAINT' AND THE CODE MULTIPLIED AT FULL STRENGTH, for a whole session. A Pixi tint is a multiply against saturated player colours, so the shipped goblins have been near-black smudges since S151 and nobody looked. When a comment states an intent that the code cannot express in one line, verify it on screen.

- S152 P3 - AN ACCEPTED ASYNC JOB IS MONEY AND MUST BE PERSISTED BEFORE ANYTHING CAN THROW. My own generator held veo operation names in a local array and threw on the first 429, orphaning seven already-billed generations. Write the receipt to disk at the moment it exists, and treat backpressure as backpressure rather than failure.

- S152 AUDIT - MY AUDIT TOOL REPORTED NINE FALSE MISMATCHES BEFORE I CHECKED THE TOOL. A regex over the config source found no stat fields (they are named consts, not inline keys) and I nearly reported the whole R77 stat table as broken. Importing CREATURE_CONFIGS at runtime took one throwaway test and returned 0 mismatches. When an audit says everything is wrong, suspect the audit first.

- S152 AUDIT - A RED CI RUN IS NOT AUTOMATICALLY A REGRESSION, AND THE FAILURE'S OWN DIAGNOSTIC USUALLY SAYS SO. worker-bots failed on CI and passes locally; the dumped final state showed tick 805 and bots still gathering, i.e. a wall-clock wait for a sim-time assertion. Read the diagnostic before bisecting.

- S152 A1 - AN `else` IS A DEFAULT, AND A DEFAULT IS A TRAP FOR THE NEXT FEATURE. hostTick's spawner emit read `if (lightningHub) (...) else ( spawn chewer )`, so the pentagram's behaviour silently applied to every recipe that was not the hub. My ignition fix did not introduce the chewers; it made an existing default reachable. When adding a member to a family, check what the family's `else` currently promises it.

- S152 A1 - THE TEST HAD TO ASSERT BOTH HALVES OR IT WOULD PASS FOR THE WRONG REASON. 'The goblin tower emits nothing' is also satisfied by muting every spawner in the game, so the same test proves the PENTAGRAM still emits chewers. A one-sided assertion on a suppression fix is not evidence.

- S152 A4 - THE OWNER'S SYMPTOM AND THE ACTUAL BUG WERE DIFFERENT THINGS, and testing against the LIVE site is what separated them. 'Clicking bots takes me to multiplayer' sounded like broken routing; the routing was perfect. The menu was still drawn and still clickable UNDERNEATH the modal. Reproduce where the owner is, not where the harness is.

- S152 A4 - A PER-FRAME RECONCILER BEATS ANY ONE-SHOT FIX AT THE CALL SITE. Hiding the title when the overlay opened would have been undone on the next frame, because the reconciler keyed only on gameState. If a state is enforced every frame, the new condition belongs IN the predicate, not in the event handler.

- S152 A5 - THE COMPLAINT WAS AMBIGUITY, NOT SILENCE. A refused click and a missed click were both silent, so 'it didn't work' was unknowable. The fix that mattered was giving REFUSAL its own sound - which needed a hit test that deliberately INCLUDES disabled buttons, the opposite of what the click path wants.

- S152 - MY OWN PROSE BROKE THE WRITE GATE FOR HALF AN HOUR. 18 strings in session-state.json contained literal curly braces (TypeScript type literals I quoted in check_method), and the gate's field extractor is an awk BRACE COUNTER, so it returned empty for every field and blocked every Edit with 'Deliberation not completed' while the flags were all correctly set. A data file consumed by a line-oriented parser has a grammar; respect it.

- S152 - A HARD EXTERNAL BLOCKER IS NOT A FAILURE TO ENGINEER AROUND. veo/image credits ran out mid-amendment, so the hound cannot be generated at all. The useful output was a carry-forward with the EXACT six resume commands and the already-committed prompt, not a workaround that ships worse art.

- S152 A1 - AN `else` IS A DEFAULT, AND A DEFAULT IS A TRAP FOR THE NEXT FEATURE. hostTick's spawner emit read `if (lightningHub) (...) else ( spawn chewer )`, so the pentagram's behaviour silently applied to every recipe that was not the hub. My ignition fix did not introduce the chewers; it made an existing default reachable. When adding a member to a family, check what the family's `else` currently promises it.

- S152 A1 - THE TEST HAD TO ASSERT BOTH HALVES OR IT WOULD PASS FOR THE WRONG REASON. 'The goblin tower emits nothing' is also satisfied by muting every spawner in the game, so the same test proves the PENTAGRAM still emits chewers. A one-sided assertion on a suppression fix is not evidence.

- S152 A4 - THE OWNER'S SYMPTOM AND THE ACTUAL BUG WERE DIFFERENT THINGS, and testing against the LIVE site is what separated them. 'Clicking bots takes me to multiplayer' sounded like broken routing; the routing was perfect. The menu was still drawn and still clickable UNDERNEATH the modal. Reproduce where the owner is, not where the harness is.

- S152 A4 - A PER-FRAME RECONCILER BEATS ANY ONE-SHOT FIX AT THE CALL SITE. Hiding the title when the overlay opened would have been undone on the next frame, because the reconciler keyed only on gameState. If a state is enforced every frame, the new condition belongs IN the predicate, not in the event handler.

- S152 A5 - THE COMPLAINT WAS AMBIGUITY, NOT SILENCE. A refused click and a missed click were both silent, so 'it didn't work' was unknowable. The fix that mattered was giving REFUSAL its own sound - which needed a hit test that deliberately INCLUDES disabled buttons, the opposite of what the click path wants.

- S152 - MY OWN PROSE BROKE THE WRITE GATE FOR HALF AN HOUR. 18 strings in session-state.json contained literal curly braces (TypeScript type literals I quoted in check_method), and the gate's field extractor is an awk BRACE COUNTER, so it returned empty for every field and blocked every Edit with 'Deliberation not completed' while the flags were all correctly set. A data file consumed by a line-oriented parser has a grammar; respect it.

- S152 - A HARD EXTERNAL BLOCKER IS NOT A FAILURE TO ENGINEER AROUND. veo/image credits ran out mid-amendment, so the hound cannot be generated at all. The useful output was a carry-forward with the EXACT six resume commands and the already-committed prompt, not a workaround that ships worse art.

## S151 (2026-08-22) — the stat system, the goblin tower and its art; three priorities landed, and the defects that mattered had no failing test

_(6 entries. Highlights: a unit change is not tsc-forced the way a type change is; I committed a trap this repo documents in capitals; green tests prove code RUNS, not that a player can REACH it; and the owner's own arithmetic independently confirmed the model.)_

- #a-type-change-is-tsc-forced-a-unit-change-is-not - Renaming `Creature.hp` to `ehp` turned every unconverted read into a compile error, which is exactly what I wanted from a wide refactor. But the sites that PASS a number - `attackFifths(atk, pen)` versus a bare `1` - compile perfectly and silently deal one FIFTH of the intended damage, and no rename recruits the compiler for those. I had to enumerate them by hand: creatureAttack, the world raid, the defender fire site, the radial blast. The rule I want to carry is that when a quantity's MEANING changes rather than its shape, renaming it is the only move that makes the compiler an ally, and even then it only covers the read side.

- #my-own-automation-wrote-the-worst-bug-of-the-session - A patch script I wrote to add a field to 45 test literals also reached into `applySnapshotCore` - a PRODUCTION deserializer - and inserted a hardcoded `damageFifths: 0`. It compiled. It passed 2891 tests, because no fixture damages a bond. And it would have silently HEALED every damaged connector on every snapshot apply and every host migration: the same shape as the `despawnAtTick` 'detonation default' that this very file documents. I found it by reading the diff of everything the script touched rather than trusting the green suite. The blast radius of a regex is not the set of files you intended it to hit.

- #i-committed-a-trap-this-repo-documents-in-capitals - `blueprints.ts` says, at length and in capitals, do not value-import a recipe module from anything `world.ts` reaches, because every recipe calls `registerRecipe` at its tail. I read that warning while writing the goblin tower and then did precisely it, because my import looked like 'get the feed map' rather than like 'reach a recipe module'. The symptom pointed nowhere near the cause: a `?worker=1` bots match that never left TITLE with 198 polls throwing during boot. Reading a warning is not the same as recognising your own code as an instance of it, so the fix was structural - a side-effect-free leaf module - rather than remembering the rule harder.

- #i-overclaimed-causation-on-one-green-run-and-had-to-correct-it - I wrote 'CONFIRMS the cause' into a commit message after ONE passing re-run of the spec I had just fixed. In a repo where I had, that same session, measured a spec at 50% flaky and written a whole paragraph about quoting denominators. One green run after a change is a hypothesis; I re-ran it 3/3 before letting the claim stand, and amended the record in the next commit. The discipline is easy to apply to a result you distrust and easy to forget on the one you were hoping for.

- #green-tests-prove-code-runs-only-an-audit-proves-it-is-reachable - The goblin tower typechecked, had 34 passing tests, and shipped with three open pathways: it was IMMORTAL (no `recipeStillSatisfied` case, so its default arm kept it alive off one lone Circle), UNBUILDABLE (`ALL_BLUEPRINT_IDS` is a hand-written array, not exhaustiveness-checked like the `Record<GodlyId,…>` two lines above it), and its panel row had NO COPY. Nothing was red. I found all three by deliberately asking 'can a player actually reach this?', which is a different act from running the suite - and the array-versus-Record asymmetry is the kind of thing only that question surfaces.

- #the-owner-arithmetic-was-an-independent-oracle - I built the fifths model - `atk x (5+pen)` against `hp x (5+def)` - days before the owner sent their stat table. Their line for the chewer read '1 atk 2 pierce, 1hp, 0 def. so 1x1.4 offence, and 1 def', and the model produces exactly 1.4 and 1.0. That agreement is worth more than any test I could write, because it was derived from the opposite end by someone who had not seen the implementation. When a design can be checked against a source that did not come from you, that check outranks your own assertions.
