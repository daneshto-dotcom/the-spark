# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-02 | Session: S159 | Commit: `5e682ac` | PROTOCOL 38 (unchanged all session)

State at close: `tsc` 0 · **3393/3393** unit tests / 216 files · `e2e:gating` exit 0, 62 passed (run
twice) · bundle **763.9 / 900 KiB** · `verify-deploy` **PASS 4/4** with content-hash equality · MCV
**88 bindings, exit 0** · real context **599,683 / 1,000,000 (60.0 % YELLOW)**.

## Next Steps

1. ⛔ **OWNER ACTION — PROVISION TURN. It is now the ONLY thing between you and cross-country
   multiplayer, and this session removed the last doubt about that.** Sign up at **metered.ca/stun-turn**
   (free, 50 GB/month), then in the repo: **Settings → Secrets and variables → Actions → New repository
   secret**, three times: `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`. Then push
   anything (or Actions → Deploy to GitHub Pages → Run workflow). `TURN_SETUP.md` is the runbook and now
   carries your own two-workstation measurement.
   · **B1 is CLOSED.** Your screenshot showed room `KFU2AR`, 2 players connected, `sync 3/3`,
     "Matchmaking: All 7 answered". There is no split between your machines and nothing wrong with the
     router — S158's firewall/VPN hypothesis is disproved.
   · **`torrent:fail` is fixed and was never related.** Two of three BitTorrent trackers were dead, and
     because the code asks for *all* of them, two dead entries failed the whole backup strategy. It
     should read `torrent:✓` now.

2. ⛔ **SIX OWNER DECISIONS, all of them numbers or trades that are MINE, each flagged at its constant.**
   None blocks play — they are calibration after you have felt them:
   (a) **drone cadence 5 s** — chosen so all three drones land inside a 45 s fight;
   (b) **stink-bag HP = 1** — R77 gives the bag's on-destroy atk/pen, never its durability;
   (c) **chain-lightning hop range 120 px and NO falloff** — ⚠ expect this to feel strong: 33 fifths
       one-shots any connector in a structure of ≤ 29 connectors, so a full bolt can take SIX
       connectors off a base in one strike. That is R77 as written ("max6", no decay mentioned).
       Falloff is the obvious first dial if it is too much;
   (d) **the stink aura is a 12× nerf** (S158 A1) — the tower will feel very different;
   (e) **recipe OVERLAP** — measured this session rather than guessed. Two goblin towers can chain
       hub-to-hub (8 Circles instead of 10) and a stink tower can share leaves with a lightning hub
       (7 shapes instead of 10). It is PAID FOR: eat one shared Circle and both towers fall in the same
       tick. Say the word if leaves should belong to exactly one star;
   (f) **an accidental stink tower no longer self-heals** — see step 3. SCRAP returns the survivors.

3. ⭐ **CASTLE GUNS — the top BUILD recommendation, and it is already yours.** `SPARK_TD_SESSION_SPECS.md:59`
   Q4 carries your ruling — *"castle attacks any enemy units that attack it"* ⇒ retaliation-only against
   anything that damaged this castle within 300 ticks — and `:208-230` costs it as a reuse of the defender
   FSM. A grep for `castleGun|keepGun|castleTurret` returns NOTHING in `src/`. Castle HP and elimination
   both shipped; this is the half that makes them matter, and it is the same ground as your elemental-keeps
   idea. Needs its own PDR (Rule 16), which is why S159 carried it instead of building it.

4. **DRONE AoE — the last unbuilt R77 mechanic, and its stats are currently DEAD.** `DRONE_ATK` 5 /
   `DRONE_PEN` 1 reach the config and stop: `applyDroneExplode` severs bonds and never reads either, so
   your *"5 damage and 1 pierce in an area of effect"* describes a mechanic the game does not have.
   `pinnedDeadStats.test.ts` asserts the gap and is designed to fail when it closes.
   `state/creatures/suicideBlast.ts` (the terrorist goblin, S158 P3) is the ready-made generalisation.
   ⚠ NOT done silently because it is a balance change: 30 fifths breaks a connector up to a 26-connector
   structure and then stops, so a drone would get WEAKER against big fortresses.

5. **N2 raid parity across seats** — still needs an OWNER OBSERVATION, not a fix. The reducers are
   seat-agnostic and `grantRaidProgress` fires on both build paths. If it still looks wrong in a real
   game, the next place to look is the input layer.

6. **Held debt (not a bug):** `Creature` now carries four parallel nullable committed-target fields.
   `creature.ts:237` records why a discriminated union was rejected (a new hash encoding + ~18 sites),
   and S159 P1 deliberately did NOT add a fifth. Revisit only as its own amendment.

## Blockers

- ⛔ **TURN provisioning (owner action).** Everything on the code side is complete and verified. This is
  an account plus three repository secrets.
- Nothing else external. Live and verified: `verify-deploy` PASS 4/4 with content-hash equality.
- `origin/gh-pages` still exists as a legacy remote branch, left alone deliberately for the third
  session running: deleting it could disturb Pages, and `verify-deploy` ignores it in favour of the
  deployments API. Not a blocker — recorded so nobody "cleans" it.

## Pending Backlog

- (BACKLOG.md has no open `- [ ]` items)

## Recent Reflexion (last 2 sessions)

### S159 (2026-09-02) — seven priorities: two R77 mechanics, two lying gates, and a sweep that found the owner's own bug still live in a fourth place

- **The cheapest version of a carried-forward plan can be a different plan.** Two handoffs carried bag
  aggro as needing a new hashed `Creature` field and a protocol bump, by analogy with the tower taunt.
  The analogy imported the cost without re-testing its premise; the codebase's own two tests for when a
  target must be stored and when it needs hysteresis both fail for a bag. **A handoff's SHAPE is a claim
  too, not just its numbers.**
- **A negative control is worth more than the assertion it protects.** With the wiring removed the bag
  still disappeared — it expired — so "the bag is gone" passes on a broken build. `killCount` is what
  separates a strike from rot.
- **The four-sites warning caught S158 twice, and then S158 shipped three of four.** The stink tower kept
  the defective clause for another session — the owner's own reported bug, live in the FIRST tower a
  player builds. **Counting the sites you fixed is not counting the sites.**
- **A stale ⛔ is worse than no comment, and the loudest ones go stale first.** One file opened with
  "READ THIS BEFORE ASSUMING THE FEATURE IS LIVE" for seven sessions after the feature shipped.
- **A gate that reads a hardcoded key list is a gate with an expiry date** — and a stale gate output is a
  bug report about the gate, not a note for the reader.
- **A probe must perform the operation the product performs.** The relay probe graded WebSocket endpoints
  by an HTTPS GET and accused the only living tracker.
- **I broke "never read an exit code through a pipe" in the command that was checking compliance** — and
  all three binding failures were over-strict `file_lacks` needles catching the docblock that explains
  the removed thing.
- **Before asking the owner to rule, check the case exists.** The overlap flag described a lattice that
  cannot be built.
- **Take the external seats' QUESTIONS, re-derive their ANSWERS.** Four of their criticals did not survive
  an empirical check, including both seats' top-ranked one — and they still earned their cost every round.

### S158 (2026-09-01/02) — sixteen priorities; the owner reviewed the batch and sent me back to the record twice

- **The fix for a fix was a dead end nobody would have found.** S157's TURN runbook told the owner to put
  three values in a gitignored `.env`; CI builds from a clean checkout. When the last mile of a fix is an
  OWNER ACTION, trace that action through the machinery that actually ships.
- **A handoff number is a claim, not a measurement**, and *turning a limit off by raising its constant is
  a performance change in disguise*.
- **The owner sent me back to the record and the record was right, twice.** Both rulings already existed;
  the shipped aura was 12× their number and I had propagated it into new code.
- **My fixture is not their board.** An isolated hub on an empty board proved a tower "worked" that one
  bonded shape deleted within half a second on a real board.
- **My own fix broke a gate and only that gate noticed.** A gate that cries wolf is worse than no gate.
