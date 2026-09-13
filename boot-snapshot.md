# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-13 | Session: S173/S174 | Commit: 4a335ab | LIVE + verified 4/4

## Next Steps

1. **THE ORC WARLORD** — his own pick. RAGE: a render-time RED tint on the existing atlas
   (no generation), 2x attack + 2x move. ⭐ `creatureLifecycle.ts:979` ALREADY divides the
   cadence by `rageMultiplier`, so half is wired. SUMMON: already live, and the direwolf now
   has art — this COMPLETES him.
2. **PACK THE 8 VEO CLIPS.** direwolf attack+walk PASS as-is; direwolf idle+die and voltkin
   idle are pillarboxed → set `sampleStart`. voltkin attack/die/walk touch the frame edge →
   RE-ROLL at a SMALLER subject (~32-36% of canvas height, not 52% — his lightning, not his
   body, is what clips). Use `/veo-generate`.
3. **THE VOLTKIN TV** — art is cut and sequenced in `assets-source/voltkin-tv/`. Wire
   intact → spawn → BURNING (the long-lived state) → critical → explosion → ruins, AND
   remove the cutscene that stops the game.
4. **CODEX (c) TIER ORDER** — still renders in module-evaluation order. Plus the (b)
   discovery-removal TESTS are OWED (marker left in `codexOverlay.test.ts`).
5. **CONNECTOR HIDING** — phase primitives out while the tower stands. Specified across
   THREE sessions now (S170 P11 / R169), still unbuilt. Renderer-only.
6. **R173-B** — each connector costs the FULL structure pool. Ruled, not built.
   ⚠ raid/chew tests and `constants.lock` WILL go red; that is the guard working.
7. **B7+B8 damage numbers** — plan ready at `.claude/plans-archive/2026-09-13_S174_DAMAGE_NUMBERS_PLAN.md`.
8. **THE 9 FRINGED ATLASES** — never tried, and the CHEAPER half: re-matte, do not re-roll.

## Blockers

- **B4 the scarab** needs a REGENERATED walk clip — proven twice, code cannot fix it.
- **Vlad life sap** blocked on a MECHANIC ruling: R140 has no victim, so a tether would
  paint a damage relationship the sim does not have.
- **NONET stages**: 8 questions open for him (`S173_NONET_STAGES.md`). An in-match ladder
  needs a wire field ⇒ PROTOCOL 46 → 47; an arcade-only ladder costs no bump.
- ⚠ **`atlas-guard` has been RED on every master run since S171** while Deploy stays green.
  A permanently-red job is where a real failure hides.

## Pending Backlog

(no unchecked items — the forward plan is prose sections)

## Recent Reflexion (last 2 sessions)

## S173/S174 (2026-09-12/13) - the playtest session: nine live bugs from a 2-player internet game, all triaged and most shipped; tower/castle health bars made honest; the codex cut back and unlocked; $6.00 of veo clips that taught a protocol; and THREE self-inflicted faults worth more than the features - a deploy I broke with a staged deletion, a lesson I bought that was already in the repo, and a hypothesis that contradicted my own A.0.
- P1 #the-function-with-no-callers-was-the-spec: structureDefenceFifths already existed in stats.ts with ZERO production callers, and its docblock said outright that it existed "so the HUD and the tests can speak…
- P1b #two-durability-models-and-the-bar-can-only-tell-one-truth: a tower dies EITHER by connector severance (Bond.damageFifths vs connectorCapacityFifths) OR by primitive death (prim.hp -> razePrimitives), and t…
- P1c #vitest-green-and-tsc-red-on-the-same-commit: the full suite passed 4303/4303 while typecheck exited 1 with three errors in the very test file that was passing. Bond.a is a PhysicsBody, not a Primitive, so …
- A0 #i-rode-six-lanes-on-one-invocation-and-lost-five: the state-discovery workflow put all six probe lanes in a single Workflow call, an org spend limit hit mid-run, and 6 of 8 agents died - the exact S161 fail…
- P4 #the-agent-refused-my-brief-and-was-right: I briefed the tower-shortfall work at castlePanel's caption from my own grep. CASTLE_BUILD_GRID_ENABLED = false - that panel has been dead code since S149 P5 moved …
- P4b #two-agents-one-working-tree-sweep-each-other: staging is global, so when two subagents commit into the same checkout, whoever commits second sweeps up the first's staged files - and the first then reports …
- B3 #a-noted-defect-is-still-a-defect: healthBar.ts carried the line "The castle bar (gathererRenderer.drawKeep) still carries fault 1 - noted, not touched here" from S171 onward. Fault 1 is hide-while-undamaged…
- P1/B3 #shipping-half-a-ruling-reads-as-not-shipping-it: P1 gave every tower a health bar and he still said "the other buildings don't have HP bars" - because the bar was RED and the castle's is GREEN, so it did…
- B5 #my-brief-named-the-wrong-layer-and-the-agent-refused-it: I briefed a wave-indexed ladder falling through to a default creature type, because the owner said "after wave three the CASTLE starts SPAWNING gobli…
- B5b #a-deliberate-exemption-is-still-a-defect-and-it-was-defended-in-prose: S168 wrote at the constant that the direwolf had NO ATLAS "deliberately... visible and readable until the art lands", while the covera…
- P2 #i-had-both-halves-of-the-contradiction-and-shipped-anyway: A.0 established that normaliseStateScale equalises HEIGHT only (_subject_h, no _subject_w exists) AND that 5 of 6 mismatched atlases predated the p…
- P2b #a-negative-result-is-a-deliverable: the repack produced no improvement and was reverted, and the session is BETTER for it - the corrected verdict is that ALL SIX size-mismatched atlases need regenerated ar…
- S174 #i-fell-into-the-shared-tree-hazard-i-warned-four-agents-about: the codex agent had STAGED the deletion of codexStore.ts without finishing its importers. My unrelated clips commit ran git commit, the stage…
- S174 #a-dead-agent-is-not-an-empty-lane: all four agents died on a spend limit and every one of them had left real work uncommitted - a finished discovery removal, a new structureComponents module, the entire /…
- S174 #i-bought-the-lesson-that-was-already-in-the-repo: generated 12 veo clips at $0.50 each and 7 were condemned, because I wrote my own prompts and my own seed geometry instead of first reading assets-source/…
## S172 (2026-09-10) — made the fight readable: the health bar actually moves (two separate causes), floating damage + healing numbers in Kanit 900 Italic, bosses doubled, and two GUARDS found broken while using them.
- P1 #the-fix-was-right-and-the-bug-was-somewhere-else: healthBar's fill was frozen at 100% on six unit types because span()'s 9px floor was applied to the FILL as well as the TRACK (the floor binds below 7.01 fi…
- P1b #a-missing-wire-cannot-be-caught-by-a-unit-test: drawHealthBars is called from GoblinRenderer and was handed a sprite map populated behind `if (!GOBLIN_KINDS.has(c.type)) continue`, so every boss, tier-3 un…
- P1c #believe-the-owner-over-your-own-model: I explained the missing bar as one-shot combat. He said flatly 'he doesnt die in one hit, it took him a good thirty seconds' - and that one sentence relocated the bug…
- P2 #arithmetically-right-and-design-wrong: the first stat derivation took HP from each unit's OWN hit. It wanted to cut the locust from ATK 10 to 1 (straight through R142) and flatten the drone and the suicide …
- P2b #ship-what-he-ruled-then-measure-it-out-loud: he ruled 'double the boss HP' expecting it to fix boss-v-boss. It moved 1.0 to 1.2-3.7 hits, not the 4 he wanted, because the glass-cannon bosses hit for 150. I…
- P3 #no-library-is-a-finding-not-a-shrug: he assumed a floating-damage-number package existed. Eight npm searches, the awesome-pixijs list and all 40 PixiJS org repos returned zero, for any engine. But the RECIP…
- P3b #the-census-earned-its-keep-twice: the S171 acquisition census failed the build the moment damageNumbers.ts scanned enemy creatures - correctly, and the answer was a recorded VERDICT, not an exemption. Then…
- P5 #the-last-hit-is-a-disappearance-not-a-delta: a creature leaves world.creatures the same tick its pool reaches zero, so the killing blow can never be observed as an ehp drop - only as an absence. And to plac…
- MCV #author-the-bindings-before-announcing-done: the Stop hook hard-failed with UNCOVERED - both completed priorities carried verification: []. I created the entries with an empty array at PDR time and never fi…
- MCV-b #grep-the-needle-before-you-assert-it: checking every verification needle against disk before writing it caught my first file_lacks candidate immediately - `span(ehp)` was STILL PRESENT at healthBar.ts:20…
- SESSION #comments-that-lie-are-a-defect-class-not-untidiness: three in one session. stats.ts claimed 'every SHIPPED unit sits inside the range' after six bosses left it; damageNumbers.ts still said the killing …
- SESSION #newline-detection-can-corrupt-what-it-protects: my own patch helper chose CRLF whenever a file contained ANY CRLF, so it wrote CRLF blocks into otherwise-LF files and left goblinRenderer.ts and main.ts…

## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-13\the-spark.jsonl`
- Last decisions:
  - A function with **no callers can BE the spec** — `structureDefenceFifths` was written for
    the HUD and never wired.
  - **Read the TREE, not the transcripts**, when an agent dies: all four had uncommitted work
    despite last messages implying otherwise (~1,500 lines recovered).
  - **Staging is global** — an agent's staged deletion rode along in my commit and broke the
    Pages deploy. `git status` before `git commit`.
  - **Read the known-good spec BEFORE spending** — $6.00 of clips, 7 condemned, for a lesson
    already in the repo. Now enforced by `/veo-generate` STEP ZERO.
  - **He describes what he SEES**; the mechanism word is a guess not to inherit — two agents
    corrected the layer I aimed them at.
  - A **negative result is a deliverable**: the atlas repack was refuted and reverted, which
    is what proves the six need regenerated art.
- CLAUDE_LOOP: **closed** (no agentic loop; four delegated agents died on the org spend limit)
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] latest HANDOFF: `HANDOFF_S174_2026-09-13.md`
  - [x] LOCKED_DECISIONS.md (repo root)
  - [x] traces jsonl path above

