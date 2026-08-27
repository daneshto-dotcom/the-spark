# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-27 | Session: S153 | Commit: ca4ec97 | PROTOCOL 31

## Next Steps
1. ⛔ STILL NOT DONE — move the palette + queue to the footer, right of tier 8 (R80)
   The owner has now asked THREE times and it is the oldest open request in the batch. S153 P5a fixed the ENQUEUE bug (ordering from the footer no longer needs the castle to have been opened) but did NOT move the UI, and the owner said so plainly. Audited plan: ~34K, files and breaking tests fully enum
2. BAT RIDER: ranged harpoons + a flying read (owner, root-caused)
   ⭐ HE IS CONFIGURED AS MELEE. GOBLIN_BAT_CONFIG.attackRange is GOBLIN_ATTACK_RANGE = 35, the SAME constant the melee swordsman and the chewer use ("true melee - closes onto its target"). The archer by contrast has its own GOBLIN_ARCHER_RANGE. So the bat rider is not failing to fire a projectile - he 
3. The context tracker may over-report, and it gates scope decisions
   CLAUDE.md names that script the SOURCE OF TRUTH for the GREEN/YELLOW/ORANGE/RED scope thresholds, and this session made TWO real scope cuts on its reading: deferring the Full-tier bots work at a measured 61 percent, and then declining to start P5b at a measured 69 percent. If the script over-reports
4. Armies must retreat before FIGHT ends and idle spawn-fresh at their tower
   APPROVED, NOT STARTED, and the owner has now raised it TWICE with a screenshot - goblins standing in enemy territory at BUILD 1:25. Owner: "during buld phase your own spawn stil lstay in enemy lands! thats inherently wrong - they would be killed" and earlier "they should run back 2 or 3 sec before e
5. THE CASTLE IS DESTRUCTIBLE - castle OR 1500 points wins (R89)
   OWNER MAIN GOAL, approved, NOT STARTED. A.0 BANKED: no castle entity exists, only castleBanks (an inventory Map); damageEntity has no castle arm; the match is won on scoreByPlayer alone. S153 P1 ALREADY makes goblins WALK to the enemy keep when no enemy shapes remain - they arrive with nothing to at
6. Bots build towers - medium and up (R86 / CF-S149-f)
   Approved, NOT STARTED. Owner re-reported it this session: "bots still not building towers.... medium bots should at least build some" - that adds a DIFFICULTY FLOOR. BUILD_BLUEPRINT is already an allowlisted client intent so no protocol bump. WARNING: the S150 structural claim (GROWTH_STEP 48 inside
7. Stink tower reported as not lobbing - REPRODUCE FIRST, it is implemented
   The mechanic exists in full (magazine, throw interval, bag damage/radius, aggro aura, death blast, bagsRemaining on the wire). First hypothesis: DEFENDER_TARGETS.stinkTower is UNITS_ONLY, so with no enemy creature in range doing nothing is CORRECT. Reproduce with an enemy unit in range before changi
8. Finish the clickable / back-menu consistency sweep
   A2 proved the four TITLE entries and the lobby back button work. NOT covered: the OVERLAY back paths (codex, arcade, bot setup), which return without changing gameState so the probe could not observe them. They need their own assertions.
9. TWO hound variants per tower - ASK FIRST, may be superseded
   The owner asked for two dog types, then reassigned the rejected dog to the Zombie castle instead. IF it still stands: variant choice must be DETERMINISTIC from the creature id (the spreadTargetPos golden-angle idiom), never a draw - all three determinism gates are self-comparing and would NOT catch 

## Blockers
- NONE external. GitHub Actions runner capacity stalled deploys mid-session ("The job was not
  acquired by Runner of type hosted"); capacity RECOVERED and the final deploy verified 4/4.
- Billing is topped up and the art lane is OPEN (live probe returned HTTP 200 with image bytes).

## Pending Backlog
- (BACKLOG.md has no open - [ ] items)

## Recent Reflexion (last session)
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

- S153 P4 — I SHIPPED A DEAD FEATURE AND ONLY A PIXEL SAMPLE CAUGHT IT. `setHover` was declared on two inter
