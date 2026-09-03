# SPARK — S161 **PAUSE STATE** (2026-09-03) — ⛔ THIS IS NOT A HANDOFF

**HEAD is pushed · deployed code `b95abcd` · `verify-deploy` PASS 4/4 · PROTOCOL 40**
Everything is committed, pushed and live. Working tree clean.

> ⛔ **THE SESSION IS STILL OPEN. DO NOT TREAT THIS AS A HANDOFF AND DO NOT START A NEW SESSION.**
>
> The owner asked to PAUSE and SAVE at the 5-hour limit — not to hand off. `/handoff` has NOT been
> run, and the owner's instruction is that it is not to be run until the work below is finished:
>
> **RESUME CHECKLIST, in the owner's order:**
> 1. **Continue the hunt** — the five lanes below, and *"make sure there are no failed passes"*:
>    every non-zero exit gets investigated or explicitly ruled benign with its reason.
> 2. **Fix all the bugs** — OPEN-1..OPEN-4 in §1, plus anything the completed hunt turns up.
> 3. **Verify they landed** — not just green tests; confirm the behaviour in a real frame/match.
> 4. **Only then** run a methodical `/handoff` (the skill, properly).
>
> Six priorities shipped this session and are live; that part is done. §1 is what is not.

---

## 1. START HERE — three open owner bugs, none fixed

Full detail (evidence, hypotheses, file:line) is in `.claude/session-state.json` →
`open_owner_bugs_s161`. Summary, in the order I would take them:

### OPEN-3 · the gatherer ignores the queue mid-walk — **cause CONFIRMED, fix is small**
> *"the gatherer is not collecting always what is in queue! … then he should switch targets and go for
> it immedietly! … it takes him time to aquire or change the target while it should be immediate"*

⭐ **The code states the cause in its own docblock.** The SEEKING branch re-picks a target ONLY when
the current one has gone invalid, and `pickGathererTarget`'s comment
(`gathererLifecycle.ts:308-310`) says so: *"pickGathererTarget is only called when the current target
has become invalid, so mid-walk thrash was already bounded."* That bounded thrash IS the complaint — a
unit already walking to a nearest-of-any-type shape never notices its QUEUED type has just spawned.

**Fix:** preempt while SEEKING when `orderForGatherer`/`preferredType` now has a harvestable candidate
and the current target is not of that type. ⚠ Reuse `pickGathererTarget`'s existing total order rather
than writing a second comparison, and preempt only on a strictly better **class** (wanted-type beats
non-wanted-type), never merely on distance — otherwise two shapes appearing alternately make a
gatherer oscillate and deliver nothing, which is what the original guard was protecting against.

### OPEN-2 · the lightning drone destroyed its own tower — **check the ruling before the code**
> *"My own lightning drone destroyed his own tower when fight started and he spawned! same issue as we
> had before and i thought you fixed? why???"*

⛔ **READ S159 P9 FIRST.** The hub is *designed* to be consumed — S113 shipped it glass-cannon, the
owner queried exactly this at S159 (*"wtf, it should not be so"*), and the ruling was to MOVE the
blast, not remove the self-destruct. S159's own reflexion records that treating it as a bug would have
deleted a mechanic the owner chose. So establish first whether this is `STRUCTURE_SELFDESTRUCT` doing
its job or the drone genuinely cutting friendly bonds.

⚠ **If it IS the drone, the lead is a split predicate.** One explosion runs *two different ownership
tests*: `applyRadialDamage` spares by PLAYER ID (`p.placedBy === sparePlayerId`, `damage.ts:462`) while
the sever loop beside it filters by COLOUR (`isEnemyBond` → `player.color`, `creatureAI.ts:89-111`).
They agree in normal play and are not the same predicate — a rainbow shuffle or an ownership steal
moves colour without moving `placedBy`, and then the colour-keyed sever can cut what the id-keyed
damage would have spared.

### OPEN-1 · bots one-shot connectors — ⭐ **ROOT-CAUSED AFTER THE HANDOFF WAS FIRST WRITTEN**

**It is the LIGHTNING DRONE, not the raid.** A by-hand enumeration of every production
connector-removal path (the lane the dead sweep never ran) settles it:

- The bot raid fix DID land — `grep -rn "SEVER_BOND\|damageConnector\|RAID_TARGET" src/bots` finds no
  `SEVER_BOND` anywhere in the bot tree. `botRaidAction` → `RAID_TARGET` is the bot's only
  connector-removal origin, through the same reducer, capacity gate and RAIDED cloud as the human.
- ⛔ `droneLifecycle.ts:153` severs up to `DRONE_MAX_CONNECTORS` bonds **unconditionally** — no
  damage, no capacity check, no cloud. Its own docblock calls that deliberate, on the grounds that
  the owner ruled a COUNT ("3 connectors per lightning") rather than a damage figure. So a bot with a
  lightning hub destroys connectors outright while your raid only damages them. That is the owner's
  sentence exactly, and it is the shipped design.

⇒ **This is a balance ruling, not a bug fix.** (a) leave it — the count ruling stands, the answer is
"kill the hub"; (b) stat-gate the sever like `suicideBlast.ts` — ⚠ `constants.ts` already measured
that this makes the drone *weaker* against big fortresses, the opposite of its purpose; (c) keep the
count but sever only what the damage would have severed. **Ask before picking.**

⛔ **REFUTED, recorded so nobody re-derives it:** "the race picker desynchronised colour-based
friend/foe". `isEnemyBondWithColor` does decide by colour, and S161 did stop `player.color` being a
pure function of seat — but all three `placerColor` writes use the live `player.color`, so they stay
coherent.

<details><summary>original entry (capacity arithmetic — still a real secondary contributor)</summary>

> *"Enemy bots one shoot using raid connectors instead of inflicting damage - i thought you fixed it??"*

S161 P3 did change the bot to dispatch `RAID_TARGET`, and `raidParity.test.ts` proves bot and human now
put the same `damageFifths` on the same connector.

⭐ **Check the arithmetic before the code.** `connectorCapacityFifths(n) = n + 4` and a raid is 10
fifths, so **any component with ≤ 6 connectors is severed by one raid — by anybody**. Bots build small
loose structures; a bot raiding a small player structure looks like a one-shot while the reverse does
not. If that is what the owner saw, this is a BALANCE ruling (`RAID_ATK`, or a capacity floor), not a
parity bug. ⚠ Second possibility: a bot with a **lightning hub** still removes connectors outright and
legitimately — `droneLifecycle.ts:153` severs unconditionally by the S113 count ruling — which would
look identical.

**Cheapest discriminator:** with `?debug=1`, raid one bot connector as the human and read
`bond.damageFifths` before/after; then let a bot raid yours and read the same field. Both moving by 10
means the mechanic is symmetric.
</details>

### OPEN-4 · friend-or-foe is decided by COLOUR, radial damage spares by PLAYER ID
Latent, no live symptom. One drone explosion runs both predicates (`creatureAI.ts:124` vs
`damage.ts:448-462`). They agree today — verified. ⚠ But S161 weakened the invariant they rest on:
`player.color` is no longer `PLAYER_COLORS[seat]` once a race is picked. Wants a tripwire test
asserting the two agree, not a rewrite.

---

## 2. What shipped (all live)

| P | What | Bump |
|---|---|---|
| P1 | **W1-B — the castle becomes its race.** 6 castles × 3 states, per-race gatherer marks, castle attack VFX | none |
| P2 | **B2 seat elimination** (owner R127) — last one standing, economy gate, spectator, placings | **39 → 40** |
| P3 | Four owner bugs — **three of which were one bug** (voltkin re-fire), plus bot raid parity and the stink tower | none |
| P4 | Bots build every tower type and save for the next rung | none |
| P5 | Castles **regenerated in full colour** (untinted at render) + gravity fix; **lobby race picker** | none |
| P6 | vs-bots race picker, per seat, human row included | none |

**Gates at close:** typecheck 0 · vitest **3572 / 3572** (228 files) · e2e:gating **62 passed, exit 0** ·
build **776.9 KiB / 900** (headroom 123.1) · verify-deploy **4/4** · MCV **44 bindings, hard_fail=0**.

### Three findings from this session worth carrying forward as knowledge

1. **The "lazy art" complaint was a render-path bug, not a prompt problem.** `Sprite.tint` is a
   multiply; grey art gives one hue on every pixel. No re-prompting could have fixed it. When a
   visual complaint covers a whole *class* of asset, price the render operation before the generator.
2. **Three of the owner's six bugs were one root cause** — `voltkinPredicate` discarded `bondPos` and
   re-matched a standing chain on every placement, which both cloned Voltkins and re-armed the
   cinematic lock that blanks every build card. Two independent investigators converged on it; one
   lens would have "fixed" a per-kind tower cap that does not exist anywhere in the codebase.
3. **A green suite through a rewrite is a coverage report, not a safety report.** 3488 tests stayed
   green while the win condition was replaced, because no fixture had ever built a 3-seat board.

---

## 3. What did NOT get done

- ⛔ **The 5-lane close-out sweep produced nothing** (`wf_36b4cb21-e4e` — journal has 5 `started`, 0
  `result`). Script is on disk and re-runnable. ⚠ Next time run the lanes as separate smaller
  invocations so a limit hit costs one lane, not five.
- ⛔ **No Rule 22 runtime audit.** Done by hand instead: tree clean, pushed, deploy verified 4/4, zero
  open issues, zero cancelled CI runs, secret scan clean over the whole delta. **Not** done: the delta
  defect hunt, dead-export sweep, cross-mode coherence table, doc-drift pass.
- ⚠ **The one with teeth: asset case-sensitivity.** The dev box is Windows (case-insensitive), GitHub
  Pages is Linux (case-**sensitive**), and S161 added 18 new asset paths. They load in the local dev
  server; nobody has proven they load from the deployed site. **Check this first thing** — open
  spark-online.space and confirm a castle and a lobby banner actually render.

---

## 4. Roadmap state

`.claude/plans/2026-09-02_PDR_RACES_W1_PREAPPROVED.md` is **restamped** with what S161 landed.
P1 (S160) + P2 + P3 are shipped; **only P4 (W1-C, the castle produces its unit) remains, still blocked
by B1** — `applySpawnCreature` silently returns the world unchanged for a `sourceSpawnerId === null`
creature when one of that (owner, type) already lives. Decide null-vs-sentinel *at the gate* before
writing the emitter. W1-D (castle upgrades) is untouched and unblocked.

### Owner questions outstanding
- **CF-S161-a** — R127 says a fallen seat stops earning and spectates; it does not say whether its
  standing towers are swept. S161 left them standing, so **a dead seat's defences can still decide the
  match between two living players**. Needs a ruling before 4-player balance means anything.
- **CF-S161-b** — enemy-side castles render dimmer than your own (measured 30 vs 50 mean lit value).
  Pre-existing fog behaviour, not new, but the new art has more detail to lose than a box did.

### Stale markers found (pre-existing, not S161's)
Four plan files in `.claude/plans/` still read IN-PROGRESS: S126 (*"AWAITING APPROVAL"*, long shipped),
S155 BATCH + S155 amendment (archive copies say **PARTIALLY COMPLETED** — P5 and A1/A2/A3 genuinely
never landed), and S156 amendment. Left alone deliberately: S155's residue is real unfinished work and
closing it silently would erase it. Confirm with the owner whether those items are still wanted.

---

## 5. Session rules that earned their keep today

- **Read every gate's exit code DIRECTLY.** `npm run e2e:gating` printed *"61 passed"* and a trailing
  `[exited with code 0]` from the wrapper while the real line, scrolled off the top, was `E2E_EXIT=1`.
  Grep for the token you printed; never trust position in a log.
- **Assert code shapes, not words.** Three verification bindings matched my own docblocks — the better
  the explanation of what was removed, the more likely it contains the exact string that "proves" its
  own claim.
- **Fix the fixture or the design, never the assertion.** Six bot fixtures moved to `raidPoints`; one
  had its assertion *reshaped* because "the bond is gone after one raid" **was** the bug.
