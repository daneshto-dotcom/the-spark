# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-02 | Session: S158 | Commit: b009360 | PROTOCOL 38

## Next Steps

1. ⛔ **OWNER ACTION — PROVISION TURN. This is still the only thing blocking multiplayer, and it is now
   genuinely five minutes because S158 P1 fixed the runbook that could not have worked.** Sign up at
   **metered.ca/stun-turn** (free, 50 GB/month), then in the repo: **Settings → Secrets and variables →
   Actions → New repository secret**, three times: `VITE_TURN_URLS`, `VITE_TURN_USERNAME`,
   `VITE_TURN_CREDENTIAL`. Then push anything (or Actions → Deploy to GitHub Pages → Run workflow).
   The deploy log's **"TURN wiring report"** step prints in booleans whether they arrived, and the
   lobby's **TEST CONNECTION** button confirms it in plain language. `TURN_SETUP.md` is the runbook.

2. ⛔ **OWNER ACTION — B1, THE TWO-WORKSTATION SPLIT.** Press **TEST CONNECTION** on BOTH machines and
   compare. This machine's live baseline (measured in a real browser at S158 close): **relays 7/7
   reachable**, ICE **host:1 srflx:1 relay:0**. If the other workstation reports **0/7 relays**, that is
   the answer — a firewall, VPN, or browser extension on that machine, not the router and not TURN
   (two machines behind one router share every property ICE cares about, so TURN cannot be the
   difference).

3. **AGGRO for landed stink bags — the one property of R77 not yet built.** Destructible ✓ and
   on-destroy damage ✓ shipped in A2; a unit standing AT a bag now attacks it. What is missing is
   NAVIGATION aggro — units walking ACROSS the map to a bag. The existing taunt (`stinkAggroTargets`)
   works only because a tower has an ANCHOR PRIMITIVE to point `targetPrimitiveId` at; a bag is not a
   primitive, so this needs a new committed-target field on `Creature` (wire + hash + protocol bump).
   Deferred deliberately, with the reason written at the code.

4. **Owner rulings wanted on four numbers that are MINE, not theirs** (each flagged at the constant):
   (a) drone cadence 5 s — chosen so all three drones land inside a 45 s fight, but it is my dial;
   (b) stink-bag HP = 1 — R77 gives its on-destroy atk/pen but never its durability;
   (c) after the star fix, recipes may now **OVERLAP** (a Circle leaf of a lightning hub can also be a
   goblin-tower hub) — say if leaves should belong to exactly one star;
   (d) the aura correction is a **12× nerf** to the stink tower — expect it to feel very different.

5. **R77 mechanics still deferred, not started:** Voltkin chain lightning (~6 targets;
   `VOLTKIN_CHAIN_MAX_TARGETS` already holds the owner's number) and drone AoE sizing.

6. **N2 raid parity across seats** — no asymmetry found in the sim (reducers are seat-agnostic;
   `grantRaidProgress` fires on both build paths). If it still looks wrong in a real game, the next
   place to look is the input layer, not the reducers.

## Blockers

- ⛔ **TURN provisioning (owner action).** Multiplayer cannot cross strict NATs until it is done. Code
  side is complete and verified; this is an account plus three repository secrets.
- Nothing else external. Live and verified: `verify-deploy` **PASS 4/4** with content-hash equality.

## Pending Backlog

- (BACKLOG.md has no open `- [ ]` items)

## Recent Reflexion (last 2 sessions)

### S158 (2026-09-01/02) — sixteen priorities; the owner reviewed the batch and sent me back to the record twice

- **The fix for a fix was a dead end nobody would have found.** S157's TURN runbook told the owner to
  put three values in `.env`; `.env` is gitignored and CI builds from a clean checkout, so the deploy
  would have been green and the game still broken. When the last mile of a fix is an OWNER ACTION,
  trace that action through the machinery that actually ships.
- **A handoff number is a claim, not a measurement** — the handoff said 3220/3220, the boot measured
  3219/3220. And *turning a limit off by raising its constant is a performance change in disguise*.
- **The owner sent me back to the record and the record was right, twice.** I asked for rulings that
  already existed (R77's "0.2 atk/sec"; the R78 kill table). The shipped aura was **12×** their number
  and I had propagated it into new code *arguing it was already owner-ruled*.
- **My fixture is not their board.** I measured the drone tower producing; the owner said flatly it was
  not. Both probes used an isolated hub on an empty board — on a real board, one shape bonded to one
  leaf silently deleted the tower within half a second.
- **The file's own four-sites warning caught me twice in one session** (P7 and A2 each did three of
  four), and **P7's tests stayed green exactly as that warning predicts**.
- **My own fix broke a gate and only that gate noticed** — P1's CI env block made CI and local builds
  emit different bytes, reddening `verify-deploy` on a good deploy. A gate that cries wolf is worse
  than no gate.

### S157 (2026-08-29) — the owner's nine playtest bugs and the multiplayer root cause

- **The multiplayer bug was not in the multiplayer code.** ~100 sessions searched the handshake; one
  browser probe answered it: `relay: 0`. When a network bug survives many careful sessions, stop
  reading the protocol and MEASURE THE TRANSPORT.
- **I built a causal story my own notes already disproved.** When a diagnosis needs a mechanism you
  have documented as impossible, the diagnosis is wrong.
- **The review agents earned their cost by DISAGREEING** — they overturned one bug entirely and proved
  another backwards; all four would have shipped.
