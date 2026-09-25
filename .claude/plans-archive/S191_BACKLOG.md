# S191 BACKLOG — what S190 leaves for next session (written S190, 2026-09-25)

⛔ Before asking the owner ANYTHING, read `.claude/plans/S190_OWNER_RULINGS.md` (R190-A..M are ANSWERED) and
`SPARK_CANON.md`. The owner also has a NEW list of things to implement, written after his playtest — take his list
first; this file is what S190 knows is owed.

## ⛔ FIRST — DEPLOY #5: land `s189/weld` and `s189/net` (both audited, NOT merged in S190; deploy #4 = 7404a49 is live at PROTOCOL 51)

- **s189/weld** (C2 + R190-J): fix round 2 audited (wf_cd96cb8a-575) → round 3 sent in S190 (W-FR1 MED: rebuildAuthorityAllocators must
  raise nextBondId to ≥ max(ownBondIdLimit) after a takeover/worker repair; W-FR2 MED: also revive a DORMANT Helga at BUILD→FIFGHT for
  BUILD deaths — R190-J "every fight"; W-FR3 LOW: towerStatsIn skips DORMANT; W-FR4 documented only). ✅ ROUND 4 LANDED at S190's close (tip 18769b4: W-FR1 allocator floor, W-FR2 BUILD-death revive, W-FR3 sheet, W-FR4 documented;
  gates 0/0/0, 6062 tests) — it may already be committed on
  the branch — read `.claude/worktrees/s189-weld/.claude/plans/S189_PROGRESS_weld.md`, audit round 3 (1 lens), then merge. Weld OWES A
  BUMP (51 → 52): ownBondIdLimit on spawners + defenders, the 'DORMANT' defender state, survival on built-with connectors, Helga exact
  first build + dormant revive, the empty S107 P4 lock, raze sets incl. orphaned welds, welded-tower drawing/FEED, bot raids on own bonds.
  Integrator notes (weld section, merge chores, perf guard RE-COUNT after it): `.claude/plans/S190_INTEGRATOR_NOTES.md`.
- **s189/net** (C4/C5-transport/C6/A1): fix round (668952b..2a75496) audited (wf_c0da87a5-e17) → **NOT shippable as is**:
  NETFR-1 HIGH — FR-1's "host moved on → lobby" verdict sends a player to TITLE in a LIVE match when a rejoin lands on a host whose tab is
  HIDDEN (rAF paused, signalling alive; LOBBY_PRESENCE is broadcast on join in any state); NETFR-2 MED — the seq-regression "new match"
  test adopts a stranger's match when the new seq has passed the old watermark; NETFR-3 MED — stepMigrationClaim banks loss time during
  OUR own transport loss, so a partial reconnect (a non-host peer first) claims the host seat and stops reconnecting. Fix shape for 1+2:
  a per-match id / host phase on LOBBY_PRESENCE (additive-optional; check parseNetMessage tolerates it) and give the verdict only on a
  positive "different match / LOBBY" signal, never on silence; for 3: return lossObservedAtMs 0 while the host is lost AND no survivor is
  visible. Everything else in net (per-peer backpressure, reconnect-not-into-a-dying-room, D4 1v1 restored, Escape consumers, drop-reason
  logs, strictPort, C6 lobby-age seat rule) was audited clean. OWED e2e before its push: reconnect-hard-blip, reconnect, exit-match,
  hostmigration. Then the C4 retry tuning in §E.

## A · Owner questions — put to him in plain words, ONE batch, each with a recommendation (none block anything)

1. **C3 Voltkin "attacks his own buildings"** — the targeting code is correct (verified twice). Most likely: the
   Voltkin zaps any enemy UNIT within 180 px before walking to buildings (S103 #8), so under a stream of raiders it
   never leaves home and its bolts land among the owner's buildings. Should a Voltkin IGNORE raiders and march on the
   enemy's buildings? (Reverses S103 #8 for the Voltkin; interacts with R183 retaliation.)
2. **Drafted ATK on boss-skill SUMMONS** — locust clouds (Pharaoh), direwolves (Warlord), the Voltkin's lightning and
   the suicide/drone blasts ARE buffed today (they are creatures' own hits). R190-E said "physical hits only". Keep, or
   exclude summons? Lever: `draftPicks` undefined for boss-summon types in applySpawnCreature's null-spawner branch.
   Belongs with the **magic-attack class** design (Ra column = magic; auras may be).
3. **R190-I on the CASTLE** — castle regen/repair still nets against a hit in the same window ("-19" instead of "-6
   +25"). Extend the separate hit/heal numbers to the castle? (Same pattern: a per-player castle heal counter.)
4. **Ra strike above BUILDINGS too?** It is now above unit sprites but under Helga, the turret rig and tower art.
   And the art's ground rune ring (the telegraph) also moved above units — keep?
5. **The RECONNECTING / CONNECTION LOST overlay now covers an open draft panel** (after C1) — fine?
6. **Welding next to a spawner** — the narrowed S107 P4 lock means any drop beside a live spawner becomes a weld, so
   bots weld their frontier into their own towers. Keep?
7. **Deploy #1/#2 both at protocol 50** — closed (R190-B) by the 51 bump; mention only if he asks.

## B · Next-session add-ons HE raised (R190 — recorded, not built)

- **Orc rage lasts 25 seconds** ("let's do it like 25 seconds") — today it lasts while the Warlord is below 50 %.
  Settle: may it re-trigger if he is still below 50 % when the 25 s end? Needs a rage-start field → a protocol bump.
  LOOK first: BLOOD FRENZY already writes `enraged` on the seat's orc racial units and the tint follows it.
- **Alt toggles the footer while a tower is armed** (drop it to place where the footer was, Alt again to raise).
- **A magic-attack damage class** (Ra column magic; auras too?) — design with him.
- **A1 — the CI e2e lane** (R190-L, "later"): `pullFromBank` waits 30 s of wall clock → use
  `waitForWorldWithinTicks`; split `worker-bots` into its own gating job; `timeout-minutes: 3` on checkout. CI has
  been red on every master push since S187 (CI timing, not a code bug — verdict in S190_DISPATCH_LOG.md).

## C · Carry-forwards found by S190's audits (real, small, not yet fixed)

- `workerSim.ts:213` startup restore never repairs `nextPulledSparkId` → a worker adopted mid-match could re-mint id
  −1 over a live pulled shape (latent: WORKER_DEFAULT_ON = false).
- WRATH-F5: the W-4 pending-cast record goes inert when a joiner snapshot moves world.tick backwards.
- SWM-6: no test drives the swarm draw loop through the bat-sheet fallback.
- `drawRaRitual` has no FIGHT gate: columns 0-3 of a Pharaoh ritual that crosses into BUILD draw though nothing lands
  (pre-existing; more visible with the new art).
- perf's next hotspot (measured): physics 40 % of the wave-5 tick — `computeTerritorialInfluence` 18 %,
  `solveBonds` 8.8 %; `pickNavUnit` 9.3 % (O(n²) enemy search); `tickScoring` 7.7 %.
- Wire: a real wave-5 snapshot is ~113 KiB / 9.3 Mbit/s per peer (canon §6's 84 KiB was a light fixture); delta
  encoding remains the structural fix.
- The chewer/drone SPREAD step (`spreadEnemyTarget`) picks from a looser enemy set than the S162 rule → can hand a
  creature a bond with one of its OWN seat's shapes on it. Not seen in bots matches (0 mixed-colour bonds in 1,493
  samples); human welding creates mixed-colour bonds. A bug against an existing rule — fix with a test.
- Weld: if the dormant-Helga revive did not land in deploy #4, finish it (R190-J "every fight"); spawner aura drift.
- Litter in OTHER projects' `.claude/`: 869 tmp + 309 zombie lockdirs counted, not deleted (owner's word needed
  for the tmp files; the zombies self-sweep on the next stale-lock reclaim there).
- `glue_pdr_unlock` only rewrites keys AFTER `"status"`, so SPARK's `unlock_source` (earlier in the file) is never
  set by the unlock hook; `claude-rollback.py`'s backward-restore check now reads a frozen counter.
- Temp scratch clone `%TEMP%/s190_swarm_probe1` (the guard refused to delete it) — delete by hand.

## D · Verify on the LIVE site after deploy #4 (the owner tests in the morning)

C1 cruiser above the draft panel · C2 weld onto a laser turret / two bat towers · C3 (see A1) · C4 a drop mid-match
now reconnects (and logs `[net] PEER DROPPED … cause=…`) · C5 wave-5 smoothness · C6 the first in the quickmatch
lobby stays P1 (needs two machines) · C7 no teleport beam · C8 Helga stays on the board · C10 Kraken shoves ~70 px
and stuns · the separate red/green hit/heal numbers · WRATH OF RA (3 casts, square icon) · THE SWARM at wave 11.

## E · C4 — measured after S190's reconnect fix (carry-forward, HIGH value)
`e2e/reconnect-hard-blip.spec.ts` × 7 on s189/net: recovered 6/7 — 2 inside the 15 s grace (7.2 s, 10.0 s), 4 AFTER
it (21-31 s: the terminal screen shows, then clears itself), 1 not within 45 s. The joiner always stayed a client and
kept retrying. Suspected: Trystero `answeringTtlMs` 23 333 ms (`@trystero-p2p/core/dist/signal-handler.mjs`) — the
host timed out the first attempt at offer+23.3 s and the next got through 3 s later; the 8 s retry once cut a join off
in its final millisecond. Fix shapes (both change C4 timing → test with the spec, 20+ runs): do not tear down an
attempt whose handshake is in progress; space retries around the 23 s TTL. The spec is tagged quarantine-flaky.
