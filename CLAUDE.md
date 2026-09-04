# SPARK — project instructions

Deterministic, host-authoritative multiplayer builder game. TypeScript / Vite / Pixi / Trystero
WebRTC. Live at **spark-online.space**. Inherits every rule in `../../CLAUDE.md` (Founder DNA) and
`~/.claude/CLAUDE.md`; this file records only what is specific to SPARK.

Created S159 — the boot pre-flight had been warning "No CLAUDE.md found in project" while the parent
doc says each project's own CLAUDE.md declares its workflow. Everything below was verified against
the code in the session that wrote it, not copied from a handoff.

## Workflow

- **Commit directly to `master`.** No feature branches, no worktrees (GitButler was dropped
  2026-04-20 across Founder DNA). Solo, one session per project.
- **Pushing `master` IS shipping to production.** The GitHub Actions "Deploy to GitHub Pages"
  workflow builds from a clean checkout and publishes. There is no second deploy path —
  `npm run deploy` was deleted in S126 deliberately.
- `npm run verify-deploy` is the only trustworthy check that a deploy landed: it compares the LIVE
  asset's content hash. `gh api .../pages` reports stale legacy/gh-pages information — do not use it.
- Git identity is always `daneshto@gmail.com`.

## The gates, and how to read them

```bash
npm run typecheck        # tsc -b --noEmit
npx vitest run           # the unit suite — 3646 tests / 233 files at S163
npm run e2e:gating       # Playwright, the deploy-gating subset — 62 tests
npm run build            # includes the bundle-size charter check
npm run verify-deploy    # 4/4 with content-hash equality
npm run probe-relays     # WebSocket handshake against the matchmaking relays
```

- ⛔ **Read every gate's exit code DIRECTLY, never through a pipe.** `cmd | tail -2 && next` reads
  `tail`'s status, not the gate's. S159 shipped a commit past a `hard_fail=2` verdict exactly that
  way. Redirect to a file and echo `$?`.
- The **bundle cap** is a self-imposed charter in `scripts/check-bundle-size.mjs` (900 KiB; 764 KiB
  used at S159). It is a design constraint, not a platform limit — if a real feature needs the room,
  raise the charter with a note. Do not contort code to fit it, and never let it block a live deploy.

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

## Protocol version

`PROTOCOL_VERSION` lives in `src/net/protocol.ts` (38 at S159) and a mismatched peer is REFUSED —
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
