# PDR — S145 (BATCH, Full tier)

**STATUS: COMPLETED** — all 4 priorities shipped, deploy verified 4/4 at `63c00e61` / live `index-Blrtx25J.js`.

**Owner approval:** explicit, twice, in-session — *"I approve full session priority batch!"* and
*"remember i approve full session batch"*. `unlock_source=user`.

**Trigger:** owner playtest report — *"playtest didnt work i tried it in spark-online.space in single
player mode"*.

---

## A.0 STATE-DISCOVERY (Rule 21) — EMPIRICAL, RUN BEFORE THIS PDR WAS LOCKED

Three probes, all against a REAL browser running REAL physics (Playwright, dev build, solo mode,
no bank seeding, no cheats). Scratchpad specs, not committed.

### Claim-vs-state deltas

| # | Claim | Actual | Verdict |
|---|---|---|---|
| 1 | "shipped but maybe not pushed / not deployed" | `origin/master..master` = **0 unpushed**; `spark-online.space` serves `index-nR6yeWrW.js`, byte-identical to a local `npm run build`; verify-deploy **4/4** | **REFUTED** — deploy is real |
| 2 | "the feature is broken / errors" | Panel opens on keep click (`open: true`); **0 console errors**, 0 page errors across 3 runs | **REFUTED** — no runtime fault |
| 3 | CF1: "a full bank *can* build nothing" (S144, stated as a risk) | **Understated.** It is not a risk, it is the *terminal state of every solo game*, reached in ~46 s | **CONFIRMED + ESCALATED** |

### The measurement (2 independent runs, 4 min each)

| run | bank full at | final composition | any tile ever buildable |
|---|---|---|---|
| 1 | tick 2753 (~46 s) | `[0,0,2,3,4,4,5]` frozen for 11,449 further ticks | **NO — NEVER** |
| 2 | tick 2756 (~46 s) | `[0,0,1,3,3,4,5]` frozen for 11,453 further ticks | **NO — NEVER** |

Final tile state, run 1: `stinkTower NEED 1 MORE` · `pentagram NEED 4` · `lightningHub NEED 3` ·
`laserTurret NEED 5` · `helga NEED 3` · `voltkin NEED 6`. Order queue: **empty**. Defenders: **none**.

### Probe 2 — are the two shipped escape hatches real? **Both fail.**

- **H1 — order the missing type while the bank is full.** Clicked the palette button twice through the
  real UI. Queue accepted `[4,4]`. After **60 s the bank composition never changed** and both orders
  were still queued. The order queue is **inert against a full bank**.
- **H2 — free a slot (PULL_FROM_BANK).** A `WAITING` gatherer instantly dumped **stale** cargo (a `5`)
  into the freed slot — *not* the ordered `4` — and the bank re-locked at 7/7. Composition performs a
  random walk of ±1 per manual pull and never converges. Still no buildable tile.

### The closed loop, read off `gathererLifecycle.ts`

1. `pickGathererTarget` (:372) is called **only in SEEKING**, and only when the current target is invalid.
2. Arriving at a full bank sets `g.state = 'WAITING'` (:466) holding cargo chosen *before* any order existed.
3. `WAITING` (:472) **never re-picks a target and never releases cargo** — its only exit is a successful
   `depositIntoCastle`.
4. That needs a free slot. A slot frees only by player pull or by building. Building needs a satisfied
   bill → needs composition change → needs a delivery → needs a free slot.
5. The instant one frees, the `WAITING` unit fills it with the stale shape.

⇒ **`orderForGatherer` can never reach a gatherer that is already `WAITING`.** With 1 gatherer in solo
this is a hard deadlock. The two features that would solve each other's problem — the S141 order queue
and the S144 build grid — **have no reference to one another anywhere in the codebase.**

---

## OBJECTIVE

Make the castle build grid reachable through ordinary solo play: a player who wants a Stink Tower can
get one, without seeding, cheats, or knowing an undocumented trick.

## SCOPE

**P1 — break the deadlock (`bank swap on ordered delivery`).** When the bank is full and a gatherer
arrives holding a type the player has ORDERED, evict the most-redundant *un-ordered* shape from the
bank to make room. Converts a frozen random bank into a directed one and makes the order queue
load-bearing for the first time.

**P2 — wire the build grid to the order queue.** Clicking a tile that is short enqueues exactly the
missing types. The tile caption names the action. This is the discoverability fix and the coherence
fix in one: it connects S141 to S144.

**P3 — full coherence audit** of the resulting game state (owner's explicit ask): inconsistencies,
unfinished pathways, dead ends, bugs. Fix what is cheap and in-scope; log the rest as carry-forward.

**P4 — ship:** build, test, e2e gating, commit, push, verify the live site, `/handoff`.

## EXPLICITLY OUT OF SCOPE

- **`CASTLE_BANK_CAP` is NOT changed.** It is owner-gated with two contradicting rulings and the owner
  is unavailable. P1 fixes the *mechanism*; raising the cap only delays the same terminal state and
  would spend a ruling the owner has not made. Flagged for the wake-up review.
- Stink Tower recipe *shapes* (a pending owner ruling — untouched).
- The drag interpretation (ghost-on-cursor stays as shipped).
- The sim-worker flip / `defenders` differential seeding.

## TESTING

Unit (vitest) for the swap predicate and the missing-bill computation; e2e gating spec that plays solo
**with no seeding** and asserts a tower becomes buildable — the assertion that would have caught this
in S144 and did not exist. Re-run the A.0 probe as the acceptance check.

## RISK

The swap touches the host-authoritative haul FSM, which is serialized and hashed → desync surface.
Mitigation: eviction must be deterministic (no RNG, stable id tie-break) and must run only on the host
deposit path, exactly like the existing `consumeGathererOrder`.

## ROLLBACK

Each priority is its own commit; P1 and P2 are independent.
