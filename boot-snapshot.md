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

2. ⛔ **PLAY THE TWO TOWER FIXES.** ✅ **S160 P2 RULED ON BOTH AND MEASURED WHAT THEY ACTUALLY DO** —
   so what is left for the owner is a NUMBER TO FEEL, not a question to answer.
   (a) **the stink tower refills its 5 bags on every BUILD edge — KEPT.** One magazine per round is
       the literal reading of *"restart him each round"*, and `STINK_TOWER_BAGS = 5` is the owner's
       own figure, so its consequences are downstream of their number.
       ⭐ **AND HERE IS THAT CONSEQUENCE, MEASURED:** throws land at ticks **254, 538, 822, 1106,
       1390** into a 2700-tick FIGHT — gaps of **284**, not the 240 `STINK_THROW_INTERVAL_TICKS`
       implies, because WINDUP+FIRE+RECOVER cost 44 ticks a throw. **The tower is DRY for the last
       22 of every 45 seconds.** Owner's call: more bags, a slower cadence that spreads five across
       the whole fight, or leave it as a front-loaded burst. Pinned by `stinkReload.test.ts`.
       ⚠ The alternative "slow reload with visible progress" is **NOT cheap**, and S160 corrected my
       own false reason for thinking it was: the per-bag rack is in `drawTower`, which runs ONLY in
       the atlas-null fallback, and the atlas ships. On the live path the sole magazine tell is one
       alpha step, `0.72 → 1`. Visible progress needs new draw code.
   (b) **the drone hub's lightning storm MOVED to the hub's death rather than being deleted — KEPT.**
       They objected to the tower disappearing, not to it having a blast. One branch to strike if they
       want it gone; the FEED-row is the precedent if they want it on a player trigger.
   ⚠ **FEEL THE P9 UPLIFT:** the hub delivers **9 drones in a 45 s fight** — now *asserted*
   (`lightningHubDelivers.test.ts`), where before it lived in a comment and a `console.log`.
   ⛔ **AND S160 CORRECTED THE DIAL ADVICE THIS FILE USED TO GIVE.** It said *"the cap is the first
   dial, the 5 s cadence the second."* **That is backwards, and the first move does nothing at all:**
   occupancy at every due slot is 1, so `DRONE_MAX_PER_SPAWNER` 3 → 2 changes NOTHING (peak live is
   **2**, against a ceiling of 3 — the cap is slack, now asserted as such). Only 3 → 1 bites, and
   bluntly (5/fight). **Correct order for "too strong": `DRONE_EMIT_INTERVAL_TICKS` first — the only
   linear lever, count = 2700/interval, so 450 t → 6 and 600 t → 4 — then `DRONE_MAX_CONNECTORS`
   (damage per drone, one reader), then the cap.**

3. ✅ **THE FOUR NUMBERS — S160 P3 RULED AND RE-DERIVED ALL OF THEM.** Every ruling is KEEP; what
   changed is that four of the five *statements* about them were wrong, and this list was carrying
   three of the errors.
   (a) **drone cadence 5 s — KEPT**, and it is now the documented FIRST dial in both directions
       (see §2 for why the cap is not). 9 emits/fight is asserted, not commented.
   (b) **stink-bag HP 1 — KEPT.** ⚠ Its constant said *"most of the roster pops it in one hit"*.
       Measured: **ALL of it does**, and the floor has **ZERO margin** — a cloud dies to any amount
       ≥ 5 fifths and the weakest unit on the board, the goblin shield at 1 ATK / 0 PEN, deals
       exactly 5. Any shield nerf or any `+1` to `STINK_BAG_DEF` makes a stink carpet impassable to
       it. Documented **and now pinned** (`stinkCloud.test.ts`).
   (c) **chain-lightning hop 120 px and NO falloff — KEPT.** R77 gives atk/pen and the target count
       and says nothing about decay; adding a decay curve would be balance the owner never asked for
       on a mechanic they have not yet played. Falloff is still the obvious first dial.
       ⭐ **"≤ 29 connectors" is EXACT** — 33 fifths vs capacity `n+4`, inclusive `>=`, boundary
       checked both sides (n=29 severs, n=30 holds). **Now asserted** (`voltkinChain.test.ts`).
       ⚠ **But "SIX connectors" is a CEILING, not a typical case** — creatures and bonds compete for
       the same six link slots in one nearest-first contest and a creature WINS an exact tie, so any
       defender nearer than the next connector eats a link. Say **"up to six"**. Also pinned.
       ⛔ Two errors in my own docblock, both fixed: the R77 citation pointed at
       `SPARK_TD_SESSION_SPECS.md`, where `grep max6` returns **zero** hits (the ruling is in
       `.claude/session-state.json`); and four sites quoted the owner as *"maybe we do max6"* when
       they typed *"maywe"* — a silent typo-fix inside quotation marks. Also, the docblock's second
       justification for 120 **contradicted its own evidence** (it cited "~90 px apart" to argue
       120 does not reach the next structure over; 120 > 90, so it does). Withdrawn — 120 now has
       one reason, not two, and no containment guarantee.
   (d) **the stink aura — the "12× nerf" is HALF RIGHT and this line overstated it.** 12× is exact
       for the **unit** half (2.4 → 0.2 atk/sec); the **shape** half went 40 → 20 per second, which
       is **2×**. Repeating "12×" unqualified mis-models structure attrition by 6×. The constant
       itself always said both correctly; only the handoff flattened it. **Correct one-liner: units
       12× weaker, shapes 2× weaker.**
   **Recipe OVERLAP — the design stands, two of its sentences did not.**
   Two goblin towers chaining hub-to-hub (8 Circles instead of 10) is right.
   ⚠ The stink+lightning **"7 instead of 10"** described one lattice and priced another: sharing
   **one** Circle — what the sentence actually says — costs **9** (a 10 % discount); **7** requires
   sharing **all three** stink leaves (30 %). The honest single figure is the 20–30 % range.
   ⚠ And **"drops BOTH towers in the same tick"** is true of the *predicates* and false of the
   *teardown*: the spawner poll and the defender poll run on two unaligned schedules, so both towers
   fall within **≤ 30 ticks (0.5 s)** on slots that coincide only by accident. The "it is paid for"
   argument survives untouched; the timing sentence was the half a balance discussion would lean on.

4. ✅ **CASTLE GUNS — SHIPPED S160 P4b, AND THE OWNER RULED ITS TARGETING.**
   ⛔ **THE RULING: NEAREST ENEMY IN RANGE, which SUPERSEDES Q4.** `SPARK_TD_SESSION_SPECS.md:59` Q4
   said *"castle attacks any enemy units that attack it"* ⇒ retaliation-only, 300-tick window; the
   races spec's §3.2 instead described wave-1 targeting as *"nearest enemy creature in range"*. Shown
   both, the owner chose nearest-in-range. Recorded as a REVERSAL at the constant. ⇒ There is no
   retaliation bookkeeping anywhere: no `lastDamagedByTick`, nothing serialized.
   · **No stored fire timer, by design.** The schedule is `world.tick % interval === seat % interval`
     — nothing to serialize, nothing to hash, no bump. A `nextFireTick` on `Player` would have put a
     MUTABLE sim input outside the wide oracle with no tsc tripwire (the races spec's B5 hazard;
     `Defender.nextFireTick` IS hashed, so copying it onto `Player` would have been wrong).
     ⭐ It also pays for W1-B: per-race attack VFX needs **no new wire field**, because a renderer can
     re-derive when each castle fires and at what.
   · ⚠ **THE NUMBER THE OWNER MUST RULE ON — Q3's 45-tick cadence was MEASURED AND REJECTED.** A shot
     is 8 fifths and a melee goblin's pool is 7, so the castle one-shots every melee unit in the game;
     at 45 ticks it killed one every 0.75 s and **silently deleted the castle-kill win condition**
     (ten goblins wiped in 450 ticks having dealt ~250 of 1500). Ten existing tests went red, which is
     how it was found. Shipped at **240 ticks (4 s)** — MY number — and here is what it costs,
     measured through the real host tick and now pinned in `castleGuns.test.ts`:
     **1 goblin → ZERO damage** (shot before its first swing) · 5 → castle holds at 1284 ·
     **10 → castle HOLDS at 474**, so the shipped tuning's figure is no longer enough ·
     **15 → castle FALLS at tick 1342.**
     ⇒ **A sustained push now needs ~15 goblins where `GOBLIN_DAMAGE_VS_CASTLE` assumed 10.** Which
     constant should move — the cadence or the goblin damage — is the OWNER'S call. ⚠ 60 ticks is a
     hard floor: below it an attacker dies before it swings once.
   · ⭐ **And the design intent is now literally true rather than merely slow.**
     `GOBLIN_DAMAGE_VS_CASTLE` always said a lone leaker is *"far too slow to matter alone… the
     castle falls to a SUSTAINED ARMY"*. Before the gun that was arithmetic; now a lone attacker is
     actively killed.

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
