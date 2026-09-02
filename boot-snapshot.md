# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-02 | Session: S159 | Commit: `c90b444` | PROTOCOL 38 (unchanged all session)

State at close: `tsc` 0 · **3399/3399** unit tests / 218 files · `e2e:gating` exit 0, 62 passed (run
THREE times — exit code read from a file, never a pipe) · bundle **764.0 / 900 KiB** ·
`verify-deploy` **PASS 4/4** with content-hash equality · MCV **110 bindings, exit 0** · real context
**768,770 / 1,000,000 (76.9 % ORANGE)**.

> **S159 ran NINE priorities.** Seven were the planned batch; then the owner played the build and sent
> back two tower faults, which were fixed the same session under a scope amendment. Both are live.

## Next Steps

1. ⛔ **OWNER ACTION — PROVISION TURN. It is the ONLY thing between you and cross-country
   multiplayer.** Sign up at **metered.ca/stun-turn** (free, 50 GB/month), then in the repo:
   **Settings → Secrets and variables → Actions → New repository secret**, three times:
   `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`. Then go **Actions → Deploy to
   GitHub Pages → Run workflow**. `TURN_SETUP.md` is the runbook and carries the owner's own
   two-workstation measurement.
   · ⛔ **S160 P1 CORRECTED A TRAP IN THIS VERY LINE.** It used to say *"then push anything"*. That is
     FALSE: `deploy.yml:26-34` gates the push trigger on a paths allowlist (`src/**`, `public/**`,
     `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`,
     `.github/workflows/deploy.yml`). **Adding repository secrets changes no file at all**, and a
     push of docs / `.claude/` / `HANDOFF_*` matches none of those paths — so the owner would add the
     secrets, push, see NO run, and reasonably conclude the wiring was broken. `workflow_dispatch` is
     the only route that works from a secret change. `TURN_SETUP.md:119-121` already worded it right;
     this file did not. Same class as S158's gitignored-`.env` defect, one document over.
   · ✅ **The code side is PROVEN, not asserted** (S160 P1). `deploy.yml:149-156` passes all three
     into the build env (URLS also accepting a repo *variable*); it is the only build/deploy path in
     the repo; `iceConfig.ts:162-186` reads them, comma-splits the URL list, refuses a half-filled
     config, and feeds `RTCConfiguration.iceServers` at both join sites (`transport.ts:376-379`,
     `quickmatch.ts:173`). Verified out of the **emitted bundle**, not from the comments.
   · **B1 is CLOSED.** Their screenshot: room `KFU2AR`, 2 players connected, `sync 3/3`, "Matchmaking:
     All 7 answered". No split between the two machines, nothing wrong with the router — S158's
     firewall/VPN hypothesis is disproved.
   · **`torrent:fail` is fixed** (two of three trackers were dead and the code asked for all of them).

2. ⛔ **PLAY THE TWO TOWER FIXES AND RULE ON THEIR NUMBERS.** Both shipped this session, and both
   created a decision that is MINE, not the owner's:
   (a) **the stink tower refills its 5 bags on every BUILD edge** — one magazine per round, the
       reading that matches *"restart him each round"*. If that is too strong: a slow reload spread
       across BUILD (visible progress, punishes a short build), or a FEED gesture like the goblin
       tower's (a real cost, but a tower can then be starved).
   (b) **the drone hub's lightning storm MOVED to the hub's death rather than being deleted** — they
       objected to the tower disappearing, not to it having a blast. One branch to strike if they want
       it gone; the FEED-row is the precedent if they want it on a player trigger.
   ⚠ **AND FEEL THE P9 UPLIFT:** the hub now delivers **9 drones in a 45 s fight** (measured) instead
   of 3, with at most `DRONE_MAX_PER_SPAWNER` = 3 in the air. That is a large buff to a structure they
   already found strong. The cap is the first dial, the 5 s cadence the second.

3. ⛔ **FOUR MORE OWNER DECISIONS from the main batch**, each flagged at its constant, none blocking:
   (a) drone cadence 5 s; (b) stink-bag HP 1; (c) **chain-lightning hop range 120 px and NO falloff** —
   33 fifths one-shots any connector in a structure of ≤ 29 connectors, so a full bolt can take SIX
   connectors off a base in one strike (R77 as written: *"max6"*, no decay mentioned; falloff is the
   obvious first dial); (d) the stink aura is a **12× nerf** since S158 A1.
   Plus **recipe OVERLAP**, measured rather than guessed: two goblin towers can chain hub-to-hub
   (8 Circles instead of 10) and a stink tower can share leaves with a lightning hub (7 instead of 10)
   — and it is PAID FOR, since eating one shared Circle drops BOTH towers in the same tick.

4. ⭐ **CASTLE GUNS — the top BUILD recommendation, and it is already owner-ruled.**
   `SPARK_TD_SESSION_SPECS.md:59` Q4: *"castle attacks any enemy units that attack it"* ⇒
   retaliation-only against anything that damaged this castle within 300 ticks; `:208-230` costs it as
   a reuse of the defender FSM. A grep for `castleGun|keepGun|castleTurret` returns NOTHING in `src/`.
   Castle HP and elimination both shipped — this is the half that makes them matter, and it is the same
   ground as the owner's elemental-keeps idea. Needs its own PDR (Rule 16).

5. **DRONE AoE — the last unbuilt R77 mechanic, and P9 raised its stakes.** `DRONE_ATK` 5 /
   `DRONE_PEN` 1 reach the config and stop: `applyDroneExplode` severs bonds and never reads either,
   so *"5 damage and 1 pierce in an area of effect"* describes a mechanic the game does not have.
   `pinnedDeadStats.test.ts` asserts the gap and is designed to fail when it closes;
   `state/creatures/suicideBlast.ts` is the ready-made generalisation. ⚠ Now that a hub produces
   FOREVER rather than three times, the drone's damage model matters far more than it did.
   ⚠ Still a balance change: 30 fifths breaks a connector up to a 26-connector structure and then
   stops, so a drone gets WEAKER against big fortresses.

6. **N2 raid parity across seats** — needs an OWNER OBSERVATION, not a fix. The reducers are
   seat-agnostic and `grantRaidProgress` fires on both build paths. If it still looks wrong in a real
   game, the next place to look is the input layer.

7. **Held debt (not a bug):** `Creature` carries four parallel nullable committed-target fields.
   `creature.ts:237` records why a discriminated union was rejected (a new hash encoding + ~18 sites),
   and S159 P1 deliberately did NOT add a fifth. Revisit only as its own amendment.

## Blockers

- ⛔ **TURN provisioning (owner action).** Code side complete and verified. An account plus three
  repository secrets.
- Nothing else external. Live and verified: `verify-deploy` PASS 4/4 with content-hash equality.
- `origin/gh-pages` still exists as a legacy remote branch, left alone deliberately for the third
  session running: deleting it could disturb Pages, and `verify-deploy` ignores it in favour of the
  deployments API. Recorded so nobody "cleans" it.
- **OS-level, diagnosed not fixed:** `~/.claude/hooks/tests/s96-p2-state-inject.test.sh` fails 1 of 12,
  identically before and after this session's `json_helpers` fix (verified by swapping the helper
  back). Closing it needs a RULE decision — does user approval waive deliberation for a Micro
  priority? — so it is left for a session with that authority.

## Pending Backlog

- **T1/T2 are DONE.** BACKLOG.md's "NEXT SESSION'S TOP TWO" block now records them as shipped
  (P8/P9, `c90b444`) rather than pending. No other open `- [ ]` items in BACKLOG.md.

## Recent Reflexion (last 2 sessions)

### S159 (2026-09-02) — nine priorities: two R77 mechanics, two lying gates, a sweep that found the owner's own bug in a fourth place, and then two more from the owner's playtest

- **P8 — a field with one writer and one decrementer is a COUNTDOWN, not a resource, and no
  single-fight test can see it.** The stink magazine was filled at construction and never again. Every
  stink test lived inside one fight, where that is indistinguishable from working. The owner found it
  by playing two rounds. **When a feature has a per-round rhythm, a test has to cross the boundary.**
- **P9 — "wtf, it should not be so" can mean "I changed my mind".** The hub vanishing after three
  drones was the owner's own S113 glass-cannon design. Treating it as a bug would have deleted the
  lightning storm they never complained about; checking the archive turned it into a reversal with one
  narrow question, and the answer was to MOVE the blast, not remove it.
- **The four-sites warning caught S158 twice, and then S158 shipped three of four.** The stink tower
  kept the defective component clause for another session — the owner's own reported bug, live in the
  FIRST tower a player builds.
- **A stale ⛔ is worse than no comment, and the loudest ones go stale first.** One file opened with
  "READ THIS BEFORE ASSUMING THE FEATURE IS LIVE" for seven sessions after the feature shipped.
- **A gate that reads a hardcoded key list has an expiry date**, and a stale gate output is a bug
  report about the gate, not a note for the reader. Four gates lied this session; all four are fixed.
- **A probe must perform the operation the product performs.** The relay probe graded WebSocket
  endpoints with an HTTPS GET and accused the only living tracker.
- **A negative control is worth more than the assertion it protects** — the bag vanished either way,
  and only `killCount` told the truth.
- **I broke "never read an exit code through a pipe" in the command that was checking compliance**, and
  four figures in my own paperwork were written before being measured. All caught, all corrected.
- **Take the external seats' QUESTIONS, re-derive their ANSWERS.** Four of their criticals did not
  survive an empirical check, including both seats' top-ranked one — and they earned their cost anyway.

### S158 (2026-09-01/02) — sixteen priorities; the owner reviewed the batch and sent me back to the record twice

- **The fix for a fix was a dead end nobody would have found.** S157's TURN runbook told the owner to
  put three values in a gitignored `.env`; CI builds from a clean checkout. When the last mile of a fix
  is an OWNER ACTION, trace that action through the machinery that actually ships.
- **A handoff number is a claim, not a measurement**, and *turning a limit off by raising its constant
  is a performance change in disguise*.
- **The owner sent me back to the record and the record was right, twice.**
- **My fixture is not their board.** An isolated hub on an empty board proved a tower "worked" that one
  bonded shape deleted within half a second on a real board.
- **My own fix broke a gate and only that gate noticed.** A gate that cries wolf is worse than no gate.
