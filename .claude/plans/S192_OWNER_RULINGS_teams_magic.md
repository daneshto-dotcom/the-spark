# S192 — OWNER RULINGS: TEAMS (T8) and MAGIC DAMAGE (2026-10-01) — SCOPE AMENDMENT A2 of the S192 PDR

Approval: *"Record them, treat them accordingly, um, and have their work trees already start designing and uh, building and
the specs and implementing them accordingly. Within the correct work trees."*

## TEAMS (T8)

| id | ruling | his words (verbatim) |
|---|---|---|
| R192-T1 | Teammates never damage each other — units, towers, and zone effects (a demon teammate's zone does not burn you) | *"you also don't get damage. Like, let's say they are demons or whatever … your enemies obviously can't attack each other … Your towers don't attack each other, even though you're different colors, different races."* |
| R192-T2 | No wall between teammates' zones | *"there's no wall between you and your … teammate zone … it kind of like looks like one continuous zone other than … having the art a little different."* |
| R192-T3 | Building in a teammate's zone: **v1 NOT buildable**; he is leaning to a v2 where the team's half is one buildable zone with an adaptive combined backdrop | *"no, you cannot build in a team's members … zone"* → then *"You know what? Maybe we will make it buildable … we would have to generate the art for any combination of … players … the background that's adaptable towards your combination … modular and dynamic and sick … the screen would be divided basically in the middle … team one on the left, team two on the right … That could be cool, actually."* |
| R192-T4 | Team pick in the multiplayer AND bot lobby, teams 1–4, Red Alert / C&C style | (T8, A1) |

⚠ **SUPERSEDES T7's "if you have a friend with you, he still gets hit"** (same day, earlier message). The later ruling governs:
a teammate does NOT take your Scorched Earth / SCORCHED GROUND. `isScorchImmune(owner, spared)` (s191/owner) is the one
site that changes — to "same team". Flagged to him in one line, not re-asked.

**His backdrop count question** (*"36 possible combinations … do 36 backgrounds. Is that correct?"*): for two-player teams
of 6 races — **21** if a pair looks the same either way round (zombies+demons = demons+zombies; 15 mixed + 6 same-race),
**15** if same-race teams reuse the race's own backdrop, **36** only if which teammate is top vs bottom changes the art.
→ answered in chat; the teams spec carries it.

## MAGIC DAMAGE (answers to the five questions in `SPARK_Magic_Damage_Design.html`)

| id | ruling | his words (verbatim) |
|---|---|---|
| R192-M1 | **Option 3 — MAGIC RESISTANCE (MRES)**, a stat on the SAME ladder as DEF: 1 MRES = ×1.2, 2 = ×1.4, 3 = ×1.6 … It defends against magic attacks exactly as DEF defends against physical | *"I'm going towards option three with the resistance stats, magic resistance, which is basically on the same ladder as defense levels. One magic resistant level is 1.2, two … 1.4, these 1.6, etc."* · *"the defense against a magic attack will look rather than the enemies or the tower's defense, it would look at the tower's magic resistance … it will look the same, but it'll be calculated differently."* |
| R192-M2 | **Magic attacks:** POWER OF RA column, WRATH OF RA, the zombie boss ROT aura, SCORCHED EARTH (and SCORCHED GROUND), the STINK TOWER aura, the VOLTKIN chain lightning. Not all skills | *"the rock column definitely magic, wrath of Ra zombie boss rot, scorched earth, stink tower aura. Yes, uh, also we said Voltkin's uh, lightning, chain because it's like kind of looks like a magical thing."* · *"not all skills though"* |
| R192-M3 | **Physical:** everything else — every swing, shot, and blast | *"Physical, anything else? Yes, a tower, a key player, swings. Yes, shoots or blows up. A hundred percent."* |
| R192-M4 | **Magic is not stronger, only different**; the damage number looks the same (same red/white font) | *"nothing makes magic stronger, it's just different. Again, because it's defended against by magic resistance"* · *"it doesn't change the color"* |
| R192-M5 | **Every unit and every tower has MRES.** A tower's MRES = its connector count, the same as its DEF (3 connectors → DEF 3 and MRES 3, ×1.6) | *"every unit has to have magic resistance … every unit and every tower … towers will inherently have the same magic resistance as their regular defense. So, like, per connector"* |
| R192-M6 | **Unit MRES by race, highest → lowest: demons ≈ mummies > vampires > nagas > orcs > zombies**, and by class within a race | *"the highest magic resistance will be by probably demons and mummies and then vampires and then nagas and then Orcs and then zombies … according to that scale, you will … develop all their … character magic resistance stats."* |
| R192-M7 | The Ra perk column is **35 TOTAL split** (s191/tune) — so "one column one-shots a boss" in the doc is moot. Future, NOT ruled: WRATH OF RA *"maybe we'll bring that up to 75 damage per column"* | *"everything you mentioned about the rock column is redundant … The columns are way too strong, dude. It's just an ability."* |

**His question:** *"Did you … research actual online games … MMORPGs or MOBAs … How do they have their magic different than
physical damage?"* → answered in chat (yes, this is the standard pattern — LoL armor vs magic resist, Dota armor vs magic
resistance, WoW armor vs resistances; his ladder version is the same idea).

**Open for the magic spec (MINE until he rules, each flagged at its constant):** the per-unit MRES table under R192-M6; whether
a drafted DEF pick also raises MRES; the castle's MRES (it buys DEF); whether neutral/global units (goblins, chewers, Voltkin,
Helga, bosses) follow their seat's race or their own class; how MRES enters the pool arithmetic (DEF is folded into the POOL
on this ladder, so a magic hit must be rescaled by (5+DEF)/(5+MRES) or the pool split — the spec must show the arithmetic).

## MAGIC — answers to the spec questions (S192, later; verbatim)
- R192-M8 BUILDINGS: DEF and MRES rise together — *"when you build buildings, they're inherently … it raises them at the same time."*
- R192-M9 CASTLE: *"when you're doing castle upgrades, you should be able to do either defense or resistance … All the stats the castle starts with are gonna be as is and whatever amount of defense it currently has just give it the same amount of magic resistance but moving forward there should be … its own upgrades for … magic resistance or defense."* → starting MRES = starting DEF; a NEW separate MRES castle upgrade.
- R192-M10 GLOBAL UNITS: MRES = their own DEF — *"Sounds good."*
- R192-M11 STINK CLOUD is magic — *"Sure."*
- R192-M12 ZERO TICKS accepted, with a visible cue — *"can be totally resistant to very low level magic, I accept that, but we need to predefine … how it would look like."* → default built: grey "RESIST" floater (MINE, to show him).
- Q1 (drafted DEF pick raises MRES?) NOT ruled — default kept.

## S192 later answers (verbatim)
- R192-D1 MRES DRAFT CARD (queued, NOT built): *"we'll add another one then at level what we have. We'll do another one at level 26, right? That's going to be the, the magic damage one … And we'll need to make his own art as well. So you should queue that up."* → a general MRES card at the NEXT draft slot after the current table (drafts are waves 1/6/11/16/21 = levels 0/5/10/15/20; the next is wave 26 / level 25 — confirm the slot when built) + its own card art. A drafted DEF pick keeps today's behaviour (grows the pool, so it helps vs magic too).
- R192-U1 a fallen tower's leftover shapes STAY targetable until destroyed — *"Just as it is today, dude."*
- R192-U2 no "fading out of old age" concept — *"Units are either destroyed or respawned."* → remove the fading-untargetable extra.
- R192-U3 HELGA engages passing drones — *"she should go at … passing by drones … protect against them. That's the whole point of Helga."*
- R192-U4 T6 is SMART, not ignore: engage a fast drone/chewer when it is in reach, in your own zone, or interceptable before it reaches its target; never chase it across the map — *"I didn't say ignore drones or pencil chewers all the time. It just has to be smart."*
- R192-W1 FIX ALL on the CASTLE: *"there should be a button on your castle saying fix all. And then it just gives a mass command to all the gatherers to first go and fix all the existing towers before … continuing to gather."* → part of weld round 6 (R191-B FIX-by-gatherer), the button on the castle panel.
