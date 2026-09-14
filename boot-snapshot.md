# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-14 | Session: S175 | Commit: 5117cc8 | LIVE + verified 4/4 | atlas-guard GREEN

## Next Steps

1. **ASK HIM WHAT HE FOUND FIRST.** P9 damage numbers, P10 the brake and the 2x direwolf all
   landed AFTER his last playtest. He said he would check the game and report what is not
   perfect. Do not pick new work before hearing it. ⚠ Expect the brake to need retuning: he
   asked for 2x and I shipped 4.9x (188 ticks -> 38). The arithmetic for 0.998 / 0.996 / 0.99
   sits at `CREATURE_BRAKE_DAMPING` in constants.ts — a one-line overrule.
2. **THE 5 WAIVED ATLASES NEED REGENERATED ART, WHICH ONLY HE CAN MAKE** — unit-demons,
   t3-mummies-scarab, t3-nagas-piranha, t9boss-nagas, t9boss-vampires. They disagree on WIDTH
   (pose, not zoom); S173 built the squash and measured it WORSE (1.42x -> 1.71x). Named and
   dated in `assets-source/atlas-size-waivers.json` — delete a line there when its art is
   redone. That is how the waiver retires and the guard gets stricter again.
3. **VOLTKIN attack + die: ~$6.20 of re-rolls, NOT ~$9.30.** voltkin/walk was measured
   RECOVERABLE at $0 (frames 36-71 clean; `sampleStart:36` + `sampleWindow:36`). ⛔ Read
   ART_VEO_PROTOCOL.md §4.1 and /veo-generate STEP 7b before spending a cent.
4. **THE TV DESTRUCTION BEAT** — tv-4-critical and tv-5-explosion are flattened on disk but not
   wired. Frame-driven and client-local, the `TOWER_CRUMBLE_FRAMES` shape.
5. **GENERAL / GOBLIN TOWER ART** — his to generate. Connector hiding then covers each with a
   SINGLE `markTowerCover` call at its sprite commit; nothing else changes.
6. R173-B · B8 powers · Pharaoh stances + Ra · Vlad life-sap · NONET stages (8 questions open)
   · 12-frames-per-state (his open dial).

## Blockers

- ⛔ Art he must generate: the 5 waived sheets, and the general/goblin tower buildings.
- ⚠ The Warlord's attack-CADENCE wiring is still uncovered by test (arithmetic only). Movement
  IS behaviourally proven. Said plainly in `warlordRage.integration.test.ts`'s header.
- NONET stages: 8 questions open (`.claude/plans/S173_NONET_STAGES.md`). An in-match ladder
  needs a wire field ⇒ PROTOCOL 46 → 47; an arcade-only ladder costs no bump.

## Pending Backlog

(no unchecked items — the forward plan is prose sections in BACKLOG.md § QUEUED)

## Recent Reflexion (last 2 sessions)

## S175 (2026-09-13/14) - ten priorities from a batch PDR that Phase A.0 rewrote before a line was typed: the Warlord finished, the direwolf finally packed from art that had been on disk for two sessions, the Voltkin TV turned into a real building he emerges from, connectors that phase out under it, damage numbers on everything that bleeds, creatures that stop skating - and atlas-guard GREEN for the first time since S171. Zero art generated. Six self-inflicted faults, every one caught by looking rather than by a gate.

- P1 #the-backlog-said-owed-and-the-tree-said-shipped: the 2x MOVE speed had been wired since S168 at creatureVerlet.ts:168 while the backlog, the handoff and the boot snapshot all listed it as outstanding. Phase A.0 is the only reason P1 was scoped as 'the tint' instead of re-implementing something that already worked.

- P1b #the-channel-was-already-spent: the obvious one-line fix (sp.tint = red) collides with the seat-colour wash that already occupies that channel, and a Pixi tint is a MULTIPLY - S151 shipped exactly this and S152 had to repair it. The seat cue survives only because S154 put a coloured ground marker under every creature, which is what made overriding safe.

- P1c #he-asked-for-the-half-i-had-not-planned: 'so he LOOKS like he attacks two times faster as well' - the cadence divide existed, the animation frame rate did not, so an enraged Warlord would have re-triggered his swing before the attack row finished drawing. Shipping only the cadence would have looked like a stutter, not like speed.

- P2 #both-sides-of-the-art-claim-were-half-right: the handoff said the direwolf HAD art, the renderer said it had NONE. The art existed and was committed; no atlas-specs.json existed, so nothing had ever been packed. The owner was right and so was the grep, and the missing word was PACKED.

- P2b #the-contact-sheet-caught-what-no-gate-could: three separate defects shipped a green typecheck, a green suite and an unchanged check:atlas - mixed canvas sizes, a still with no standing frame 0, and a corpse cut from the dark sheet that the near-white matte could not lift. Every one was found by LOOKING at the PNG. The protocol's 'audition the sheet' step is the only thing standing between those and the owner.

- P2c #the-first-correct-fix-was-still-wrong: exempting a still from normaliseStateScale fixed the inflation and immediately caused the opposite failure - with no normalisation the still keeps the scale of its own small canvas and comes out enormous. A ratio measured off one sheet was the answer; neither naive branch was.


## S173/S174 (2026-09-12/13) - the playtest session: nine live bugs from a 2-player internet game, all triaged and most shipped; tower/castle health bars made honest; the codex cut back and unlocked; $6.00 of veo clips that taught a protocol; and THREE self-inflicted faults worth more than the features - a deploy I broke with a staged deletion, a lesson I bought that was already in the repo, and a hypothesis that contradicted my own A.0.

- P1 #the-function-with-no-callers-was-the-spec: structureDefenceFifths already existed in stats.ts with ZERO production callers, and its docblock said outright that it existed "so the HUD and the tests can speak their language". The tower health bar the owner asked for had already been half-written by a past session and never wired - the same shape as S167's t3TowerAtlasBase, where the art shipped with no renderer. Grepping for an unused function that names your feature is cheaper than designing the feature.

- P1b #two-durability-models-and-the-bar-can-only-tell-one-truth: a tower dies EITHER by connector severance (Bond.damageFifths vs connectorCapacityFifths) OR by primitive death (prim.hp -> razePrimitives), and towerRenderer already derives its damaged/destroyed FRAME from the second while the owner's words name the first. I shipped his model and documented the other AT THE SITE rather than picking silently - because a future session finding the bar "under-reporting" will otherwise re-derive the whole thing before discovering there were two.

- P1c #vitest-green-and-tsc-red-on-the-same-commit: the full suite passed 4303/4303 while typecheck exited 1 with three errors in the very test file that was passing. Bond.a is a PhysicsBody, not a Primitive, so my adjacency detach was a no-op the assertions could not see. Reading ONE gate's exit code would have shipped it. The project rule is "read every gate's exit code from a captured $?" - every, not the slowest one.

- A0 #i-rode-six-lanes-on-one-invocation-and-lost-five: the state-discovery workflow put all six probe lanes in a single Workflow call, an org spend limit hit mid-run, and 6 of 8 agents died - the exact S161 failure this project's CLAUDE.md warns about in a section written after it happened before. I had READ that section during boot. Re-running the four dead lanes by hand cost more than dispatching them separately would have. When the owner later asked for parallel work I used three SEPARATE Agent invocations for that reason.

- P4 #the-agent-refused-my-brief-and-was-right: I briefed the tower-shortfall work at castlePanel's caption from my own grep. CASTLE_BUILD_GRID_ENABLED = false - that panel has been dead code since S149 P5 moved tower-building to the footer band. The agent verified the premise before building on it and redirected to footerBand.ts. I had grepped for the STRING ("NEED n MORE") and found a real site, but never asked whether that site was still REACHABLE. A live-looking code path is not the same as a rendered one.

- P4b #two-agents-one-working-tree-sweep-each-other: staging is global, so when two subagents commit into the same checkout, whoever commits second sweeps up the first's staged files - and the first then reports success for a commit that does not contain its work. The P4 agent even NAMED this hazard in its report and still concluded, wrongly, that its work was safe in HEAD. It was uncommitted. VERIFYING THE AGENT'S CLAIM AGAINST THE TREE is what saved it: three greps, and the symbols were absent from every commit. Next time: give parallel agents separate worktrees, or let exactly one of them commit.


## Muscle memory (auto) [Vigil]

- Traces: `C:\Users\onesh\.claude\traces\2026-09-14\The-Spark.jsonl`
- Last decisions:
  - **Phase A.0 before scoping.** 16 claim-vs-tree deltas; two restructured the whole batch.
    The backlog said the Warlord's 2x move speed was owed — it had shipped in S168.
  - **Read the comment above the code you are about to change.** It gave three diagnoses free,
    including P10's entire root cause, already written at the line that caused it.
  - **No gate in this project can see a bad PNG.** Three packer defects passed tsc, 4,455 tests
    AND check:atlas. Audition on the DARK board colour — a white preview hides a white halo.
  - **Publish, never re-derive.** Cover is declared by whoever DREW a sprite, so the fog,
    atlas-load and ring gates agree by construction instead of by luck.
  - **Watch synced pools instead of pushing events** — damage on five systems, zero wire cost.
  - **An in-tree number nobody reconciled against an invoice is a guess.** $0.50/clip was wrong
    by ~6x for six sessions.
- CLAUDE_LOOP: **closed** (no agentic loop; one A.0 fan-out returned 6/7 and the dead lane was
  re-run BY HAND per the S161 rule)
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] latest HANDOFF: `HANDOFF_S175_2026-09-14.md`
  - [x] LOCKED_DECISIONS.md (repo root)
  - [x] traces jsonl path above
