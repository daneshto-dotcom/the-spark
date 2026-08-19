# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-19 | Session: S148 | Branch: master | Commit: **986b8b5** | PROTOCOL_VERSION: **25**

**S148 shipped THREE priorities, all live and deploy-verified 4/4. P1 THE QUADRANTS replaced the polar
keep ring with a real zone partition (protocol 24→25). P0 was an owner-demanded REBUILD-VS-ADAPT AUDIT
(verdict: do NOT rebuild, but stop adapting incrementally). P2 fixed what a real playtest found — the
opening was unfair and every weapon in the game dealt identical damage.**

⛔ READ FIRST: `.claude/plans-archive/2026-08-19_SCOPE_AMENDMENT_S148_OPENING_COHERENCE_IN-PROGRESS.md`
(PC castle HP is its unstarted half) and the audit artifact:
https://claude.ai/code/artifact/cb2ef411-646f-451b-82ee-55dda87e4ecf

## Next Steps

1. **P3 — THE CASTLE BECOMES REAL (R29/R10/R20).** Castle HP + defence + attack, elimination when it
   falls, last-one-standing with placings. **This is the piece that gives the match stakes** — today
   nothing can die and nothing can be lost. Protocol 25→26. Biggest remaining item; start fresh.
2. **P5 — OWN-ZONE BUILD LEGALITY.** ⚠ **ATTEMPTED AND REVERTED IN S148 — read this before starting.**
   The swap is six one-line edits (`canBuildAt` already exists and is tested in `state/zones.ts`) and
   typechecks clean, but it **breaks 17 tests across 8 files** (session7/14/15, world, botBrain,
   botGameplay, placeFromFree, pentagramBuildability). Not a bug — correct new behaviour: seat 1 owns
   the RIGHT half on PITCH_2P, so a 1v1 test placing P1 at x=600 is rightly refused, as is anything in
   the quarry disc. Each needs individual judgement. **Budget a full priority.**
3. **P4 — DEMOLITION (R52).** Delete hazards (~2,291 LOC), the NONET trial (~1,081) and the dev probe
   harness (~679), including ~20 World fields across FIELD_COVERAGE/save/hash/workerSim. Own protocol
   bump. Owner authorised outright deletion, not dormancy.
4. Then **P6 walls** (R5/R17/R39) → **P7 colour-is-a-race lobby picker** (R45) → towers+orders →
   projectiles → goblin tower → roster → modes → balance.
5. Carry-forwards: **CF-S148-a** (R22 violated — the quarry keeps producing during FIGHT; the spawner
   never reads `matchPhase`; one guard) · **CF-S148-b** (`creatureSpawners` acknowledged hole, proper
   fix is the goblin tower) · **CF-S148-c** (bomb.spec flake) · **CF-S148-d** (4-peer WebRTC timeout)
   · **CF-S147-b** (promote the 5-site protocol-bump checklist — drift has recurred 5×) · CF-S147-c/e
   · CF1 · CF3.

## Blockers

None blocking P3. ⚠ The owner is playtesting **2-player multiplayer with a friend** next session and
will report defects mid-build — expect an interrupt-driven session.

## Traps (still live)

- **Date.now() in sim code IS the desync** — everything is tick-derived. 90 s = 5400 ticks @ 60 Hz.
- Never Math.random() in sim code — seeded mulberry32 only.
- **A hashed World scalar is NINE sites and only ONE is tsc-forced.** FIELD_COVERAGE names the field
  at compile time; save ×3, workerSim structural signature, gameMode ×2, protocol and world-init are
  all SILENT. The build is green with the field missing from the save format entirely.
- **A protocol bump is FIVE sites**: the const, the narrative changelog, the `HelloMsg.protoVersion`
  type literal, `protocol.test.ts`'s pinned assertion AND its title, and `LOCAL_PROTO_V` in e2e.
- **The repo has MIXED line endings** — `defender.ts` is natively CRLF. Use single-line ASCII anchors
  with NO trailing newline, detect the file's own EOL, and write with `newline=''`.
- **Heredocs into `python -` mangle em-dashes.** Write the script to a file instead.
- ⛔ **Keep braces OUT of MCV verification needles.** The PDCA gate finds the in-progress priority with
  an awk brace-DEPTH counter that counts braces inside JSON strings; six needles ending in `{` skewed
  it permanently and the gate blocked every Edit with "Deliberation not completed".
- ⛔ **A `file_lacks` needle must be the STATEMENT, not the identifier** — `seedBotSpawners(world);`
  with the semicolon, `Math.sqrt(` with the paren. Broke four times; a good removal comment always
  names the thing removed.
- **grep_count ops are `eq ne gt ge lt le`** — there is no `gte`; an unknown op silently falls through
  to `==` and reports FAIL on a passing condition.
- **Pipe the MCV verifier to a file, not `| tail`** — `$?` otherwise reports tail's exit code.
- Anti-vacuity guards in `workerSim.differential.test.ts` are load-bearing: three entity families were
  only ever seeded BY ACCIDENT and went silently empty when the scaffolding was deleted.
- **A green suite is NOT evidence for render work.** The in-app Browser pane cannot verify SPARK (an
  undisplayed pane does not composite, so rAF is paused). Use Playwright.
- e2e `bomb.spec` and the 4-peer `nplayer` FFA are intermittent — do not bisect a single failure.
- **PLAYER_COLORS stays at SIX** (a race roster, R45). Never shrink it to the seat cap.
- Big Workflow fan-outs die on the spend limit. Hand-run probes were cheaper AND better.

## Pending Backlog

BACKLOG.md is superseded as the forward plan by `SPARK_TD_BLUEPRINT.md` + `SPARK_TD_SESSION_SPECS.md`
(both now stamped with what has shipped) plus the two S148 amendments in `.claude/plans-archive/`.
