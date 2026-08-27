## S153 (2026-08-27) — ten priorities shipped live; and three of the session's sharpest findings were about MY OWN work being confidently wrong

- S153 P5c — I VERIFIED THE DATA AND CALLED IT THE BEHAVIOUR, AND THE OWNER CAUGHT IT BY PLAYING. P1's A.0 reported that per-type goblin speeds already existed, because the config table had a differing `hopSpeedMul` per type. Nothing read that field. The engine reads `maxAccel`, and all six goblins shared one flat constant. So I "corrected" the owner's premise, shipped a three-number edit that was a guaranteed no-op, and reported it as done. I had written "a config field with no consumer is the classic trap here" into my own probe brief — then checked that values matched a spec instead of checking that anything consumed them. Grep for CONSUMERS before calling a config change a behaviour change.

- S153 A1 — I FIXED THE WRONG LAYER AND PROVED IT RIGOROUSLY. The P4 z-order work was mutation-verified, index-A/B tested and entirely correct about `SparkRenderer` — which draws building blocks, not the player. `avatarRenderer.ts` opens by calling "spark" an OVERLOADED term and naming both halves. The disambiguation was one directory away and I never opened it, because the owner said "spark" and a class named SparkRenderer matched. Rigour aimed at the wrong object produces confident, well-tested, useless work. Resolve what a NOUN refers to before measuring anything about it.

- S153 SESSION — I MADE TWO SCOPE CUTS ON A NUMBER I NEVER VALIDATED. `real-context-tokens.py` is the named source of truth, so I quoted it and twice told the owner I was stopping to protect quality — at 61% and again at 69%. The owner then said their UI read 52%. I still do not know which is right, and that is the point: an instrument that GATES decisions deserves the same empirical suspicion as a Council claim. S152 wrote down "when an audit says everything is wrong, suspect the audit first" — I applied that to my audit tooling and not to my own budget meter.

- S153 P1 — THE RANGE CHECK LIVED IN THE CALLER, AND MY CHANGE WAS THE CALLER. The FSM entered ATTACKING on a bare `targetCreatureId !== null`, safe only because the single writer range-gated to `attackRange`; I was about to add a second writer that deliberately does not. Symptom would have been a goblin that never walks and never swings, with NOTHING red — the FSM stays self-consistent and all three determinism gates are self-comparing. An invariant documented as a caller convention is an invariant waiting for its second caller.

- S153 P1 — ENUMERATING THE CHAIN TALKED ME OUT OF THE EXPENSIVE DESIGN. I was ready to add a `navCreatureId` field for the hysteresis. Counting what the nearest precedent (`targetPrimitiveId`) actually touches returned 14 files and ~45 sites plus a hashed-state decision. That number sent me looking for memory I already had — `targetCreatureId` persists across ticks by construction. Same behaviour, zero new fields, no protocol bump. Count the sites BEFORE designing, not after.

- S153 A2 — THE REPORTED BUG DID NOT EXIST AND THE REAL ONE WAS BIGGER. The owner said Back-to-Title doesn't work; a menu sweep proved it works perfectly. What was missing was any exit from a live match at all — `RETURN_TO_TITLE` had three call sites and none reachable while PLAYING. Hunting for a broken handler would have found a correct one and reported no defect. When a user says a control doesn't work, first ask whether the control they need exists at all.

- S153 A2 — THE NEGATIVES WERE THE TEST. "Escape leaves the match" is equally satisfied by an Escape that abandons a game on one accidental press — worse than the bug being fixed, since Escape is already the disarm and close-overlay key. Two of the three e2e cases assert that NOTHING happens. On any change adding a destructive shortcut, the cases proving it does not fire carry the weight.

- S153 P7 — THE AUDITION STEP THE CARRY-FORWARD DEMANDED PAID FOR ITSELF ON ITS FIRST USE. A contact sheet over magenta found two opaque black pillarbox bars surviving the matte, in exactly ONE cell of thirty-six. The tempting fix — widening the border-connected-near-black rule — is the one that deleted whole character outlines in S152, and dark ink is what it eats. Not sampling the bad frame was strictly safer, and turned out better anyway: the union bbox shrank and every cell tightened.

- S153 P7 — I CALLED AN ARTIFACT ACCEPTABLE ONLY AFTER MEASURING A SHIPPED CHARACTER. The hound keeps an opaque black drop shadow. Rather than reason about whether that matters on a black board, I measured it against the shipped shield: 9.48% of frame area versus 8.80%. House style, not a regression. A comparison against something already accepted is cheaper than an argument and much harder to be wrong about.

- S153 P5a — THE FIX FOR THIS BUG CLASS WAS ITSELF THE BUG. `requestShapesFor` read a `structuresModel` latch written only inside the panel's draw, so a player who never opened the castle silently lost their order. The latch was introduced by S149 P6 to fix this exact class — it closed "panel was open then closed" and left "panel never opened" wide open. `castleStructuresModel` is pure, so deriving removes the failure mode instead of relocating its boundary. A cache added to fix a staleness bug deserves the question: which states does it NOT cover?

- S153 P5b — A LONG-RUNNING PROBE READS A SNAPSHOT, AND ITS CONFIDENCE DOES NOT EXPIRE WITH IT. An A.0 agent root-caused the queue bug correctly; I shipped that fix while the workflow was still running; by the time the adversarial auditor ran, every symbol the report cited had been deleted, and it correctly called the whole report stale. Without the audit stage I might have "fixed" an already-fixed bug from a very convincing document. When parallel investigation runs alongside parallel implementation, re-verify before acting on findings.

- S153 P4 — I SHIPPED A DEAD FEATURE AND ONLY A PIXEL SAMPLE CAUGHT IT. `setHover` was declared on two interfaces and implemented in two renderers, and nothing called it: a multi-edit patch aborted midway on a CRLF anchor and I never re-checked which edits landed. The half that survives such a failure is the DECLARATIONS — exactly the half that compiles. tsc green, 3003 tests green, hover doing nothing.

- S153 P4 — THE RIGHT INSTRUMENT DIFFERED PER BUG. For the spark's z-order, A/B screenshots of the same pixel scored 23 vs 22 — useless, because the chip plate is 82% translucent and the spark bled through from underneath. The display-list index read 2 vs 44. When a visual property has a numeric ground truth, assert the number; save the screenshot for properties that have none.

- S153 SESSION — THE OWNER REJECTED ART AND THE RIGHT MOVE WAS TO STOP SPENDING, NOT TO GUESS. On "no i dont like this dog" I killed the clip pipeline immediately rather than iterating on a hunch, and asked for direction. The owner then repurposed the rejected asset themselves — it became a Zombie-castle unit. Two already-paid clips were preserved rather than binned, and the reassignment is recorded in the design spec so no future session re-litigates it.

- S153 SESSION — THE WRITE GATE BLOCKS ON FILE LENGTH, NOT JUST ON BRACES. `extract_priority_field` counts once per LINE CONTAINING a brace, so it drifts on a large session-state — measured final depth 9 instead of 0 — and an `in_progress` priority appended near the end is never seen at depth 2. Symptom: "Deliberation not completed" while every flag is correctly set. Fix is ordering, not content: keep the in-progress priority at index 0. Same family as the S152 braces-in-prose trap, different cause.

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
