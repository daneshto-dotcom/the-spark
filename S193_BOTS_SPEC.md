# S193 — BOT PERSONALITIES: the spec (R193-AI)

Owner, S193: *"so not just smarter, but um, make them different … you can choose to play against an aggressive bot,
a defensive bot … five personalities, and then per level, so the imba bot or the hard bot on offensive will be
different."* Research: `S193_BOTS_RESEARCH.md`. Owner-facing version: `S193_BOTS_SPEC.html`
(copied to `Desktop\SPARK_Bot_Personalities.html`).

## 0 · The two rules that shape everything

1. **Difficulty = how WELL. Personality = WHAT and WHEN.** (C&C 3, AoM, SC2 all split it this way.) A
   personality **never grants a capability its tier lacks** and never touches a tier's skill knobs (speed, think
   cadence, aim, scouting, gatherer investment, first-tower rush). It only re-orders and re-weights inside what the
   tier can already do. So an IMBA Warmonger and a HARD Warmonger play the same STYLE with a different repertoire —
   exactly the owner's "imba offensive will be different from hard offensive".
2. **Everything already ruled stays ruled** (`BOT_INTELLIGENCE_DESIGN.md` §10):
   - **Q2 — raids DO NOT TOUCH.** `severChance`, the raid-point currency and the concurrency are identical for all
     five. A personality may only choose WHO is raided, and only between the two targets the owner named in S156
     (*"the leader OR the nearest enemy whose score sits closest above"*).
   - **Q3/Q7 — bond-sever only; sacrifice DEFERRED.** No personality severs its own bonds. Ever.
   - **Q1 — gatherer upgrades HARD+IMBA, second gatherer IMBA.** Tier-owned; no personality moves them.
   - **Q4 — IMBA: goblin tower FIRST, then buy goblins with leftover shapes, Voltkin last.** Built now, as IMBA's
     default (BALANCED) order, and as WARMONGER's at every tier.
   - **Q6 — starvation: HARD waits, IMBA adapts before BUILD ends.** Built now as a TIER rule for all five.

## 1 · The five personalities (names are ours — ⚠ MINE)

| id | name | one line |
|---|---|---|
| `BALANCED` | **Balanced** | Today's bot, exactly — plus the two IMBA rulings (Q4, Q6) that were never built. The default. |
| `WARMONGER` | **Warmonger** (rusher) | Army first: goblin/race towers, feeds every spare shape into units, and at IMBA goes for the leader's throat. |
| `FORTRESS` | **Fortress** (turtle) | Defence first: stink tower, laser turret, Helga — and more of them. Saves long; Ra guards the home. |
| `TYCOON` | **Tycoon** (economist) | Builds fast and wide: cheapest towers, many of them, loose shapes for score; buys its army late. |
| `SABOTEUR` | **Saboteur** (harasser) | Connector-eaters first (chewer pentagram, drone hub); always raids the LEADER; Ra lands on the enemy's front. |
| `RANDOM` | Random | A seeded draw per match from the five (pure hash of match seed × seat). |

## 2 · The knobs (`src/bots/botPersonality.ts`) — data, one table, one brain

| knob | values | what it changes | ruled? |
|---|---|---|---|
| `towerOrder` | list of tower ROLES | the order the tier's reachable rungs are climbed (`chooseTargetBlueprint`) | Q4 for IMBA/WARMONGER; rest ⚠ MINE |
| `repeatTower` | `last` / `first` | with every rung raised, build another of the most expensive (today) or of the favourite | ⚠ MINE |
| `feed` | `never` / `leftovers` / `eager` | FEED_TOWER: none; only shapes the next bill does not need; or (FIGHT) every banked shape | Q4 (leftovers at IMBA); eager ⚠ MINE |
| `saveHoldTicks` | 900 / 1800 / 2700 of 3600 | how long of each 60 s BUILD cycle shapes are held for a tower | ⚠ MINE (1800 = today) |
| `buildCooldownScale` | 0.8 / 1.0 | loose-build tempo (rounded to whole ticks) | ⚠ MINE |
| `raidTarget` | `ladder` / `leader` | WHO is raided — both options are the owner's own words (S156) | S156 |
| `raAim` | `home` / `front` | POWER OF RA candidate order + tie-break: near my castle (today) or near my raid target's castle | ⚠ MINE |

Tower roles (canon §5): **ARMY** = race tower, goblin tower, pentagram (chewers), lightning hub (drones), voltkin;
**DEFENCE** = stink tower, laser turret, Helga. Tier reach (cheapest-first, unchanged): MID = race + stink; HARD
= + goblin + pentagram; IMBA = + hub + Helga + laser (Voltkin is the 8th rung, still outside IMBA's 7 — Q4 "later").

## 3 · The matrix (personality × tier) — v2, after the Council

| | NOOB | MID | HARD | IMBA |
|---|---|---|---|---|
| **BALANCED** | = today | = today | = today | goblin FIRST (Q4) · feeds leftovers (Q4) · else today |
| **WARMONGER** | = BALANCED (locked) | race→stink · feeds leftovers · hold 1200 | goblin→race→pentagram→stink · feeds EAGER · repeat goblin · Ra front | goblin→race→pentagram→hub→… · feeds EAGER · raids LEADER · Ra front |
| **FORTRESS** | = BALANCED (locked) | stink FIRST · repeat stink · hold 2700 · never feeds | stink→race→goblin→pentagram · repeat stink · hold 2700 · never feeds | goblin (Q4) → stink→laser→Helga→… · repeat laser · hold 2700 · feeds leftovers (Q4) |
| **TYCOON** | = BALANCED (locked) | cost order · repeat cheapest · hold 900 · tempo 0.8 | same | goblin (Q4) → cost order · repeat cheapest · hold 900 · tempo 0.8 · feeds leftovers (Q4) |
| **SABOTEUR** | = BALANCED (locked) | raids LEADER · Ra front | pentagram→race→goblin→stink · raids LEADER · feeds leftovers · Ra front | goblin (Q4) → pentagram→hub→… · raids LEADER · leftovers · Ra front |

**THE IMBA FLOOR (Council, Gemini C1 — adopted):** the owner's Q4 is an IMBA rule, so EVERY IMBA personality opens
with the goblin tower and feeds at least its leftovers. The personality governs tower #2 onward and how hard it
feeds. ⚠ Owner question: should an IMBA Fortress/Saboteur open in its OWN style instead? Built: the ruling.

**NOOB IS LOCKED TO BALANCED (Council, Gemini C3 — adopted):** a NOOB builds no towers and cannot raid, so a
personality there would be a fake choice. The lobby greys the chip on a NOOB row and the brain resolves every NOOB
to BALANCED. The stored pick is kept, so cycling the difficulty back up restores it.

**IMBA adapts (Q6), a TIER rule above every personality:** in the last `IMBA_ADAPT_WINDOW_TICKS` (900 = 15 s ⚠ MINE)
of a BUILD phase, an IMBA bot whose target is unaffordable builds any affordable rung instead of saving through the
bell. The target is NOT changed — next BUILD it is still the cheapest unowned in the personality's order, so the
goblin tower is still pursued first (resolves Grok C1). HARD keeps waiting (`chooseTowerPlan` saves).

### The tower-choice algorithm, exactly (Grok C4)
1. `rungs = seatTowerRungs(world, seat).slice(0, cfg.towerTiers)` — the tier's reach, cheapest-first, unchanged.
2. Stable-sort `rungs` by the personality's role rank (roles not listed keep cost order after the listed ones).
3. Target = the first rung in that order the seat has never raised.
4. All raised → `repeatTower: 'last'` takes the last in the ordered list (today's rule when the order is cost order);
   `'first'` takes the first (the favourite).
5. Affordability/legality, the save-vs-substitute escapes and the HARD/IMBA starvation split are unchanged
   (`chooseTowerPlan`), except Q6's IMBA window.
One module (`botBrain.ts`) serves the host's BotManager and the worker's, so there is one implementation, not two.

## 4 · Determinism and cost

- **Zero new rng draws.** Every knob is a pure function of synced state and the table; the bot's mulberry32 draw
  ORDER is untouched, so BALANCED NOOB/MID/HARD replay byte-identically to pre-S193 (a test asserts it).
- RANDOM resolves by `resolvePersonality(choice, matchSeed, seat)` — an integer hash, never the bot's stream — so the
  host's BotManager and the worker's (rebuilt from `workerBotInit`) resolve the same five.
- Total orders: spawners fed by id ascending, shapes in `ALL_SPARK_TYPES` order, leader by score then players-Map
  order (the `ladderTargetSeat` / HUD crown convention).
- Cost: all of it rides existing think ticks — O(rungs) sort, O(spawners) feed scan.

## 5 · Lobby UI

Each bot row in VS BOTS gains a PERSONALITY chip beside the difficulty chip: click to cycle BALANCED → WARMONGER →
FORTRESS → TYCOON → SABOTEUR → RANDOM, colour-coded, with the one-line identity printed under the bot's name. Default
BALANCED, so a player who never touches it gets today's bot.

## 6 · Wire / bump verdict

**NO BUMP.** Bots run on the host (and the host's own worker, a local `postMessage`, not the network); vs-bots has
no remote peers. The only new dispatched intent is `FEED_TOWER`, already an allowlisted client intent, dispatched
LOCALLY through `dispatch()` exactly like a human's panel click. No new serialized field, no hashed field, no new
discriminant. S186 test: two builds that shake hands cannot disagree about a personality, because none of them ever
computes one — only the host's bot code does, and its effects arrive as ordinary snapshot state.

## 7 · Battle ledger — Council R1 (Grok `grok-4.20-0309-reasoning`, Gemini `gemini-3.1-pro-preview`)

Gemini scorecard: Vision-Fidelity 3/5 · Feasibility 5/5 · Fun-Impact 5/5 · Completeness 2/5 (v1). Grok: ADOPT-WITH-CHANGES.

| # | Challenge | Seat | Verdict | Landing |
|---|---|---|---|---|
| G1 | Q6 "adapt" could build something else and the goblin tower never comes | Grok | **REFUTED (clarified)** | adapt substitutes for ONE phase and never moves the target; the goblin stays the cheapest-unowned target next BUILD. Q6 itself rules adapt-over-wait at IMBA. (His costs "47 / 38" are not SPARK numbers — rungs cost 3–7 shapes.) |
| G2 | the new FEED block breaks BALANCED's byte-identity | Grok | **CONFIRMED as a requirement; met by design** | BALANCED below IMBA has `feed: never`: the branch reads nothing and returns before any state access. Proven by a hash pinned from master a638565b BEFORE the code changed (`botPersonality.test.ts`). |
| G3 / M4 | "leader" raids exceed a host raid-concurrency limit | Both | **REFUTED (mechanics) / CONFIRMED (feel)** | there is no per-target concurrency gate in the sim — a raid costs the raider's own `raidPoints` (`MAX_RAID_POINTS` 3) and the existing fallback chain (target seat → any enemy) already handles an unraidable leader. The real risk is a DOGPILE on the leader with several Saboteurs: kept (it is the personality, and "the leader" is the owner's own word), raised as an owner question. |
| G4 | tower order / repeat underspecified → host and worker could disagree | Grok | **CONFIRMED (spec) / REFUTED (divergence)** | exact algorithm written above; host and worker run the same module. |
| G5 / M5 | saveHold vs the starvation rulings undefined | Both | **REFUTED (clarified)** | orthogonal: `saveHoldTicks` paces LOOSE building; Q6 governs the TOWER target. A HARD Tycoon still waits for its tower. |
| M1 | IMBA personalities that open with pentagram/stink contradict Q4 | Gemini | **CONFIRMED — ADOPTED** | the IMBA floor above. |
| M2 | Saboteur cannot be itself at MID | Gemini | **ALREADY HANDLED** | MID Saboteur = leader raids + Ra front (spec v1 row). |
| M3 | NOOB personality is a fake choice | Gemini | **CONFIRMED — ADOPTED** | NOOB locked to BALANCED, chip greyed. |

PRIME-AUDIT: (a) the Council did not challenge the claim that personality differences will be VISIBLE — only a
measurement can, so the signature test is the gate, not the table; (b) consensus on "raids untouchable" masks that
the two aggressive personalities have NO raid-rate lever at all — their aggression is units and target choice only,
recorded as owner question Q-B; (c) feeding drains the bank that loose building used to draw on, so a feeding bot
places fewer loose shapes and SCORES less — a real balance cost, measured in the test output, not assumed.

## 8 · Owner questions (⚠ MINE until he rules — each built as the recommendation)
- **Q-A** IMBA Fortress/Saboteur/Tycoon open with the goblin tower (your S154 IMBA rule) — or in their own style? *Built: the ruling.*
- **Q-B** Warmonger/Saboteur raid at the SAME rate as everyone (your Q2). Do you want an aggressive personality to raid more? *Recommendation: no — keep Q2; aggression = units + target.*
- **Q-C** Several Saboteurs all raid the leader (dogpile). OK, or should only one at a time? *Built: all may.*
- **Q-D** the names (Balanced / Warmonger / Fortress / Tycoon / Saboteur) and the numbers (hold 900/1200/2700, tempo 0.8, IMBA adapt window 15 s). *Built as listed.*
