# SPARK — project instructions

Deterministic, host-authoritative multiplayer builder game. TypeScript / Vite / Pixi / Trystero
WebRTC. Live at **spark-online.space**. Inherits every rule in `../../CLAUDE.md` (Founder DNA) and
`~/.claude/CLAUDE.md`; this file records only what is specific to SPARK.

Created S159 — the boot pre-flight had been warning "No CLAUDE.md found in project" while the parent
doc says each project's own CLAUDE.md declares its workflow. Everything below was verified against
the code in the session that wrote it, not copied from a handoff.

## ⛔⛔ READ `SPARK_CANON.md` BEFORE ANSWERING ANYTHING ABOUT THE GAME

**It is the answer to "is X still in the game?" and "how much does Y hit for?".** Read it before
writing a table, a plan, a PDR, or a question to the owner.

Owner, S180, after being asked a third time about mechanics archived dozens of sessions ago:
*"let's resolve all of this once and for all so I don't have to go over all those things … this
should be in our canonical document somewhere that you go to to see how things are. It seems like you
fucking come back to the same things … this is fucking enervating and just annoying and just wasting
time and money and tokens."*

⛔ **THE FAILURE WAS NOT MISSING INFORMATION — IT WAS UNREAD INFORMATION.** S180 published a targeting
table listing seagulls as a live mechanic while `constants.ts` said, in as many words, that four
whole subsystems are unreachable in production. Nothing was hidden. Nobody looked.

⭐ **AND THE CANON CANNOT ROT**: `src/canon.test.ts` pins every load-bearing number in it to the
constant it describes, so drift turns a test RED instead of quietly misleading the next session. That
is the difference between it and `UNIT_STAT_TABLE.md`, which has been ~3× wrong on the bosses for
three sessions with nothing to catch it. **A number goes into the canon only with its constant, and
its assertion lands in the same commit.**

## Workflow

⭐⭐ **S182 — THE OWNER REVERSED THE SOLO/NO-WORKTREE RULE. PARALLEL WORKTREES ARE NOW THE PATTERN.**
*"I want to open multiple sessions and work trees … I'll give each session different priorities and
different branches of the same repo. And then when everything is done, you, as the main session, will
merge everything to main once it's all done."*

⛔ **DO NOT "CORRECT" THIS BACK TO THE OLD RULE.** The old rule (below, kept because the reasoning
still holds for its own case) was written against *GitButler in a solo pattern*, where parallel
branches produced "which branch has the real work?" confusion for no gain. What he asked for in S182
is different in kind: deliberate parallelism, one priority set per session, with a **named merge
owner**. Both are his; the later one governs.

- **A worktree session commits to ITS OWN branch, never to `master`.** Only the merge owner pushes
  `master`.
- **`EnterWorktree` is the tool.** It creates the worktree under `.claude/worktrees/` on a new branch
  and switches that session into it. Base ref defaults to `fresh` (branches from `origin/master`),
  not local HEAD. ⭐ Verified S182: **git auto-ignores nested worktrees** — a live worktree under
  `.claude/worktrees/` leaves the parent's `git status` clean, so no `.gitignore` entry is needed.
- ⭐ **A BRANCH CANNOT SHIP BY ACCIDENT, AND THAT IS WHAT MAKES THIS SAFE.** `deploy.yml:25` triggers
  on `push` to `master` only. `e2e.yml` additionally runs on `pull_request`, so every parallel branch
  gets the full gating lane before it merges, for free.
- ⚠ **Each worktree needs its own `npm install` (~172 MB).** Do NOT share one `node_modules` by
  junction: Vite caches into `node_modules/.vite` and parallel sessions corrupt each other's cache.
- ⚠ **The merge owner re-runs the gates after EVERY merge, not once at the end.** Two branches that
  are each green can be red together — the bundle charter is shared, and so is every four-sites
  contract (`worldTypes` + factory + hash + worker). A file touched by two branches is the hazard;
  scope the branches so their file sets are disjoint.

**The superseded rule, kept for its reasoning:** *"Commit directly to `master`. No feature branches,
no worktrees (GitButler was dropped 2026-04-20 across Founder DNA). Solo, one session per project."*
It remains correct for an ORDINARY single-session day — worktrees are the exception he opens
deliberately, not the new default for one session working alone.

- **Pushing `master` IS shipping to production.** The GitHub Actions "Deploy to GitHub Pages"
  workflow builds from a clean checkout and publishes. There is no second deploy path —
  `npm run deploy` was deleted in S126 deliberately.
- `npm run verify-deploy` is the only trustworthy check that a deploy landed: it compares the LIVE
  asset's content hash. `gh api .../pages` reports stale legacy/gh-pages information — do not use it.
- Git identity is always `daneshto@gmail.com`.

## The gates, and how to read them

```bash
npm run typecheck        # tsc -b --noEmit
npx vitest run           # the unit suite — 4569 tests / 290 files, measured S179
npm run e2e:gating       # Playwright, the shared gating lane — 65 tests / 17 files, measured S178
npm run e2e:races        # S165 — the @races lane: castle emitter, backdrops, settings toggles.
                         # GATING via its own `e2e-races` CI job, inverted OUT of e2e:gating
                         # because each observation costs ~30 s of SIM time and it starved the
                         # shared lane's 720 s cap. `src/ci.e2eLanes.test.ts` pins the mapping.
npm run build            # includes the bundle-size charter check
npm run check:atlas      # S165 — the sprite-sheet pixel guard. NOT part of `build` (see below)
npm run verify-deploy    # 4/4 with content-hash equality
npm run probe-relays     # WebSocket handshake against the matchmaking relays
```

- ⛔ **Read every gate's exit code DIRECTLY, never through a pipe.** `cmd | tail -2 && next` reads
  `tail`'s status, not the gate's. S159 shipped a commit past a `hard_fail=2` verdict exactly that
  way. Redirect to a file and echo `$?`.
- ⛔ **AND `[exited with code 0]` FROM THE WRAPPER IS NOT THE GATE'S EXIT CODE.** S165 hit this
  again: `npm run e2e:gating` printed `1 failed / 61 passed` and then `[exited with code 0]`, while
  the `echo $?` line above it said `GATING_EXIT=1`. The trailing line belongs to the harness, not to
  Playwright. Only a captured `$?` is a verdict.
- The **bundle cap** is a self-imposed charter in `scripts/check-bundle-size.mjs` (**1100 KiB**;
  **948.1 KiB used, 151.9 KiB of headroom — measured S190 on the train-A tree by running `npm run build`**,
  not carried from a handoff). ⚠ This line said *"1000 KiB; 852.2 KiB used"* until S190: the charter was
  raised 1000→1100 in S188 (`CAP_KIB` at `check-bundle-size.mjs:19`) and this doc never followed — the
  SECOND time (it also lagged the S180 900→1000 raise). **Read the constant, not this sentence** —
  and when parallel branches are open, remember the headroom is SHARED between them. It is a design constraint, not a platform limit — if a real feature needs the room,
  raise the charter with a note. Do not contort code to fit it, and never let it block a live deploy.
  It also now PRINTS the static-asset payload (105.8 MiB / 171 files at S178) — reported, never gated, for the
  reason in the next bullet.
- ⛔ **AN ASSET-QUALITY OPINION MUST NEVER BLOCK A LIVE DEPLOY, and S165 proved the rule by breaking
  it.** `check:atlas` (`scripts/check-atlas-scenery.mjs`) reads shipped sprite-sheet PNGs for three
  defects the suite structurally cannot see: mid-grey scenery welded into a cut-out, cross-row size
  drift, and opaque near-white pockets the matte left behind. It was wired into `npm run build`, and
  the Pages deploy went red on `ModuleNotFoundError: No module named 'numpy'` — the Pages runner is a
  plain Node image. Nothing was caught; the site just sat STALE while the owner waited on new art.
  It now runs as its own `atlas-guard` job in `e2e.yml`, which installs the pixel toolchain first —
  so a dirty atlas still turns CI red, and still ships while it does. Locally it needs
  `pip install numpy scipy Pillow`; without them it exits **3** with that line, not a stack trace.

## Determinism is the product

The host simulates; peers apply snapshots. A divergence between two sims is the defect class this
codebase spends most of its comments on.

- **No `Math.random`, no wall clock, no float accumulators in the sim.** Cadences are tested against
  `world.tick`. Phase-spread by entity id, never by an accumulated remainder.
- Every scan that picks a target must be a **total order**: squared distances, then an explicit id
  compare. `Map` iteration is insertion order, and letting it decide anything is how S155 N1 handed
  one seat every melee exchange for a whole match.
- `hashWorldStateFull` (`state/stateHashFull.ts`) is the WIDE oracle and is **test-only** — never
  imported by `main.ts`. It compares two SIMS (host vs worker, replay vs replay), never host vs
  client. `hashWorldState` is the narrow production hash and stays narrow.
- Adding a field to a hashed entity means **three** sub-sites: the `…Hashed` union (a compile-time
  coverage contract will fail `tsc` until you do), the hand-written string projection, and the
  per-field contribution test. The union alone only silences the compiler.

## ⛔ THE STAT LADDER IS THE CANON. EVERY POOL, EVERY HIT, ONE UNIT.

Owner, S177, after finding a tower printing 167 while a goblin printed 8: *"That is not consistent.
And we have a system for this. Like, this should be the canonical system moving forward. Like, I've
been repeating it so many times now."* He had. This section exists so no session makes him do it again.

```
pool   = HP  × (1 + 0.2 × DEF) × 5     fifths     `unitPoolFifths(hp, def)`
damage = ATK × (1 + 0.2 × PEN) × 5     fifths     `attackFifths(atk, pen)`
```

The ×5 is what makes every number a whole one — *"the stats go by one point two, the secondary
stats, and when you multiply anything like that by five, it gives you a whole number."* There is
therefore **no conversion anywhere**: the number the sim subtracts IS the number the player reads.

- **A STRUCTURE IS ON THE SAME LADDER**, and its HP and DEF are both its connector count:
  `pool(n) = n × (5 + n)` — 5→50 · 4→36 · 3→24 · 2→14 · 1→6 (`structurePoolFifths`). That full pool
  is the cost of **ONE** connector; the survivors re-form at the lower count, so levelling a
  5-connector tower costs 130. (R173-A/B, ruled S173, built S177 — it sat unimplemented for 24
  sessions while the code ran `n − 1` and banked damage per-bond.)
- **A SHAPE IS ON IT TOO** — `PRIMITIVE_MAX_HP` is **70 fifths** (14 HP / 0 DEF), not the old 1000.
  His "six goblin swings fell a shape" is what fixes 14: `attackFifths(2,1)` = 12, and 6 × 12 ≥ 70.
- **THE CASTLE IS THE ONE DELIBERATE EXCEPTION** (`CASTLE_MAX_HP` 1500). He has never raised it, 6
  into 1500 never read as absurd, and folding it in would retune every castle relationship for no
  complaint. Stated at `damageNumbers.ts`, not silently tolerated.

⛔ **BEFORE INVENTING A DAMAGE OR HP NUMBER, ASK WHAT ITS HP/DEF OR ATK/PEN IS.** A bespoke constant
on its own scale is the defect this section exists to prevent — `GOBLIN_DAMAGE_VS_PRIMITIVE` (a flat
167 every creature in the game dealt to a shape, boss and goblin alike) survived 19 sessions and
became his S177 bug report. Both it and `primitiveDamageForAtk` are retired in place, unread.

⚠ **AND WHEN THIS LADDER MOVES, TESTS GO RED BY DESIGN — RE-PIN THEM, NEVER SILENCE THEM.** S177
moved 14 assertions across 9 files. Two rules that paid off: derive the literal from the constant so
the next retune cannot half-land, and where a count is a COVERAGE gate (the replay chewer stress),
LENGTHEN the run past the new pool rather than relaxing the assertion — relaxing it would have
deleted the gate while leaving it green.

## The four-sites warning

A wide field needs **factory + serialize + hash + worker** (or tests stay green while the feature is
broken). This has bitten three separate sessions, twice in one session. Two rules that follow:

- **Grep for the CLAUSE, not for the files you remember touching.** S158 removed a defective
  component clause from three star recipes, announced it had fixed four, and left the fourth (the
  stink tower) live for another session.
- Before deciding what will silence a warning, **read the code that fires it**. S158's TURN runbook
  told the owner to fill in a gitignored `.env` that CI never reads; S159's stale-plan WARN is
  matched on a STATUS line inside the file, not on the filename.

## ⛔ A HUNT THAT RETURNS NOTHING IS NOT A COMPLETED HUNT (S161, owner)

Written after S161 closed a session claiming an audit it had not performed.

A five-lane bug sweep was dispatched to subagents, hit the usage limit, and returned **zero** results.
The session recorded *"the sweep produced nothing"*, wrote the handoff and stopped. The owner then
found two real bugs in ten minutes, and a hand-run grep immediately surfaced a third
(`droneLifecycle.ts:153` severs connectors unconditionally). **Every one of those was findable the
whole time.** The failure was not bad verification — it was treating the AGENT RUN as the audit
instead of as an accelerator for an audit that was owed either way.

**THE RULE.** Delegated investigation is a speed-up, never the deliverable. If a hunt is dispatched
and does not return usable findings — limit, crash, timeout, empty result — the lanes fall back to
THIS session, by hand, before any handoff is written. A lane may be closed in exactly three ways:

1. an agent returned findings and they were verified against the tree;
2. the lane was run BY HAND and its verdict recorded;
3. it is explicitly listed as **NOT DONE** in the handoff's own summary line, not only in a
   carry-forward the next session may not reach.

⛔ *"The sweep produced nothing"* is not a verdict on the code. It is a verdict on the sweep.

⚠ AND SIZE THE FAN-OUT SO ONE FAILURE IS NOT TOTAL. S161 lost all five lanes to a single limit hit
because they rode one invocation. Dispatch lanes as separate smaller runs; a limit then costs one
lane, and the other four still have verdicts.

⭐ CHEAPEST HAND-RUN LANE, and it is the one that has repeatedly paid: enumerate every production
call site of the mechanic under suspicion and ask who can reach each one. Three greps
(`grep -rn "type: 'SEVER_BOND'" src --include=*.ts | grep -v test` and its siblings) found what five
agents did not, because the agents never got to run.

### ⛔ AND NO FAILED COMMAND IS PASSED OVER — owner, S161: *"this is how we have persistent bugs!"*

A non-zero exit is a FINDING until proven otherwise. Every failed command gets one of two outcomes,
recorded: **investigated and resolved**, or **explicitly ruled benign with the reason**. Never
silence, and never "it probably didn't matter".

⚠ THIS CUTS BOTH WAYS AND S161 GOT IT WRONG IN BOTH DIRECTIONS IN ONE SESSION:
· a gate that FAILED and was read as passing — `npm run e2e:gating` printed *"61 passed"* and a
  trailing `[exited with code 0]` from the wrapper while the real line, scrolled off the top, was
  `E2E_EXIT=1`;
· commands that failed and were left unexamined — five subagent shells died when their workflow was
  stopped, and the session moved on without asking what they had been about to check.

⭐ THE BENIGN CASES ARE REAL AND MUST STILL BE NAMED, because "benign" is a verdict, not a shrug.
The recurring ones here: `grep -c` returning 1 on zero matches and short-circuiting a trailing `&&`
(this is why the project rule says never chain a gate behind `&&`); a deliberate wrapper timeout
(exit 143) on a polling loop; `pgrep` not existing in git-bash. Each is a one-line verdict, and
writing the line is what proves the check happened.

## ⭐⭐ THE PARALLEL SPLIT — WHAT S182 LEARNED, AND IT WORKED

S182 ran **six worktree sessions in parallel** against one repo, each with a self-contained brief,
and merged them here. It shipped more than any prior session. **Do it again — but do it with the
parts below, because most of them are what stopped it going wrong.**

### ⛔ 1. NOTHING IS TRUSTED. THE VERIFICATION LAYER IS THE WHOLE REASON IT WORKED.

**Every single fix round fixed what was asked AND introduced two to four new defects.** Not one
session was exempt. A branch that reported "done, gates green" was, every time, a branch with
undiscovered defects in it.

Found only because each branch was audited against its brief *before* merging:
the suicide goblin severing silently · every goblin and boss toast losing its verb · a healthy
lightning hub exploding from a fuse that leaked across matches · a leaderboard where one bad run
permanently poisons a player's board · a worker typecheck that could block the whole game's deploy ·
an exhaustiveness contract that always compiled and had replaced a working fallback.

**All of those were green.** Typecheck, unit suite, build — green. The parallel split does not work
because the sessions are good. It works because **a branch is audited by something that did not write
it**, and the auditor runs the gates itself rather than reading a claim about them.

### ⛔ 2. A SOURCE-TEXT TRIPWIRE CAN BE GREEN OVER A LIVE BUG.

This project leans hard on source-text guards, and S182 found their hole. The placement branch wrote
a tripwire asserting the cost plate was wired into a predicate. It was. **The failing path never
consulted that predicate for its verdict**, so the guard was green while the bug shipped — twice.

> **A source-text guard proves a line EXISTS. It cannot prove the line is REACHED.**

⭐ The fix that branch found is the pattern to copy: make the enumeration **mechanical**. It now counts
the footer's opaque `.fill({` calls and pins the total at five, naming the hit-test that pairs with
each. A sixth fill fails the test until someone hit-tests it. That is "enumerate the sites" with
teeth instead of prose.

### ⛔ 3. A DEFECT BETWEEN TWO BRANCHES HAS NO OWNER — SO MERGE ONE AT A TIME.

`netWireSize.test.ts` built its board at x=200. Another branch added a castle keep-out that refuses
placement there. Each branch was **correct against master**; only their merge was wrong, and the
symptom (five wire-budget failures) named neither cause.

**Merge one branch at a time and run the suite between every step.** Merging six and running the
gates once tells you something is broken, not which pair did it. And the merge owner fixes these —
sending it to either branch is asking a session to fix a bug it cannot reproduce.

### ⛔ 4. SHARED INFRASTRUCTURE GETS INDEPENDENTLY REINVENTED. HAND IT OUT FIRST.

`playwright.config.ts` was rewritten by **five of six branches**, in five incompatible ways, and
`src/ci.e2eLanes.test.ts` by four. All were fixing the same real bug: a hardcoded port 5173 with
`reuseExistingServer`, so a second worktree **adopted the first one's dev server and reported green
against another branch's bundle.**

Two rules:
- **Fix shared infrastructure BEFORE the split and hand it to every brief**, or pay for it N times
  and resolve N conflicts.
- ⛔ **The merge owner re-runs e2e on the merged tree and trusts no branch's e2e number**, because
  any of them may have measured a sibling's code.

### ⛔ 5. SCOPE OF CHANGE DRIVES THE DEFECT RATE. SAY "FIX ONLY THIS".

The defect-per-round count tracked how much each session changed, not how hard the task was. Fix
prompts that said *"do ONLY these, do not refactor, do not tidy"* came back materially cleaner.

⭐ And **triage instead of sending everything back**: behavioural regressions go to the branch that
made them; stale comments, doc corrections and one-line contract fixes are faster and safer done once
by the merge owner. Four round-trips to fix four comments is four more chances to break something.

### ⚠ 6. TWO BRANCHES CAN EARN THE SAME PROTOCOL BUMP FOR DIFFERENT REASONS.

S182 went 46→47 twice: a new `BOND_SEVERED` cause discriminant, and `prevPos` leaving the wire. Both
bumps were correct. **The merged 47 carries both, and the merge must keep BOTH docblocks** — dropping
either leaves a live wire change undocumented, which is the exact rot the canon rule exists to stop.

### ⚠ 7. ADDING A VALUE TO A UNION MEANS VISITING EVERY CONSUMER — NOT ONLY THE ONES `tsc` FORCES.

A new `cause` value was propagated through every consumer with an exhaustive switch, because those
fail the build. The one consumer with a **tolerant `default`** stayed silent and lost its wording for
every goblin and boss. **A tolerant default is where the next one will hide too.**

### ⭐ 8. WHAT TO KEEP DOING

- **One self-contained brief per branch** — verified findings, `file:line`, the fix shape, the
  determinism hazards, tests owed, gates, branch name, file boundary. A session that needs the
  handoff and the backlog to start is a session that will re-derive what you already know.
- **Open gates written INTO the brief.** "If the owner has not answered X, do everything else and
  report" produced exactly the right behaviour: the bandwidth branch built the lever, shipped it
  OFF, and wrote a test that turns red when someone flips it without deciding.
- **Ask for the number the owner actually needs.** "What does tower two cost, file by file" got
  *~17 lines plus a data file — an afternoon, not a month*. "Is it reusable?" would have got a yes.

## Protocol version

`PROTOCOL_VERSION` lives in `src/net/protocol.ts` (**50** at S190's start; ⚠ this line said 46 from S173
until S190 while the constant moved four times — **READ THE CONSTANT, not this sentence**; the canon's §6
pins the live value in `canon.test.ts`) and a mismatched peer is REFUSED —
`detectProtocolMismatch` drops its HELLO before parsing and latches the peer, so there is no
degraded-play path. Consequences:

- A **new discriminant value** on an existing action, or a **required** new serialized field, earns a
  bump. A stale peer that passes the allowlist and then falls through a switch is a silent
  divergence, which is the more dangerous half.
- An **additive-optional** field, or a field **stripped from the wire** (`trimMirrorCreature`), costs
  no bump. Prefer deriving over sending: per-strike visuals in this codebase are re-derived every
  frame from synced state, because a one-shot `world.effects` push is lost ~5/6 of the time (effects
  are sampled at 10 Hz, the renderer wipes them at 60).
- A new `GameEffect` kind costs four exhaustive switches AND a bump — `deserializeEffect` has no
  default arm.

## Owner rulings

The owner's rulings are the specification, and they are quoted verbatim at the constant or the
function they govern. Two rules learned the hard way:

- **Before asking for a ruling, grep the archive for it.** S158 asked for two that already existed
  and had shipped 12× wrong in the meantime.
- **Before asking, construct the case.** S158 flagged a recipe-overlap consequence for a ruling and
  S159 measured that the lattice it described cannot be built.
- A number that is MINE, not the owner's, says so at the constant, with the measurement behind it.

## Where things live

| | |
|---|---|
| owner-facing runbook for multiplayer | `TURN_SETUP.md` (TURN is an owner account action) |
| the tower-defence spec + owner Q&A | `SPARK_TD_SESSION_SPECS.md` |
| session plans + PDRs | `.claude/plans/`, archived to `.claude/plans-archive/` |
| the live next-steps list | `boot-snapshot.md`, then the newest `HANDOFF_*.md` |
| relay / matchmaking health | `RELAY_HEALTH.md`, `scripts/probe-relays.mjs` |
