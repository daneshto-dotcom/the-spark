# S192 — TEAMS (T8) — SPEC v1

Branch `s192/teams`, base master `663c4c9`. Owner rulings R192-T1..T4 (`S192_OWNER_RULINGS_teams_magic.md`) are the
spec; everything marked **⚠ MINE** is a default I chose and the owner can overturn in one line.

| ruling | his words |
|---|---|
| R192-T1 | *"you also don't get damage … your enemies obviously can't attack each other … Your towers don't attack each other, even though you're different colors, different races."* — and a demon teammate's zone does not burn you (supersedes T7's "he still gets hit") |
| R192-T2 | *"there's no wall between you and your … teammate zone … it kind of like looks like one continuous zone"* |
| R192-T3 | v1: *"no, you cannot build in a team's members … zone"* · v2 leaning: one buildable half per team, adaptive combined backdrop |
| R192-T4 | team pick in the multiplayer AND bot lobby, teams 1–4, Red Alert / C&C style |

---

## (a) EVERY "IS THIS AN ENEMY?" DECISION IN THE TREE — enumerated mechanically

Method: grep of every non-test `src/**/*.ts` for an equality/inequality against `ownerPlayerId`, `placerColor`,
`placedBy`, `ownerColor`, `.color`, `.seat`, `playerId`, `owner`, `seat`, `mine`, `caster`, `spare*`, `victimOwner`,
`zoneOf(`, `zoneOwner(` — 260 raw hits in 75 files — then every hit read and classified. Line numbers are master
`663c4c9`.

**The substrate** (new `src/state/teams.ts`): `sameTeam(world, a, b)`, `isEnemySeat(world, a, b)`,
`sameTeamColor(world, colourA, colourB)`. In a free-for-all (`world.teams === undefined`) `sameTeam(a, b)` is exactly
`a === b` and `sameTeamColor` is exactly `ca === cb`, so FFA is byte-identical by construction.

### A · SIM — CONVERTED to the team predicate (49 sites)

| # | file:line | what decides | team-aware replacement |
|---|---|---|---|
| 1 | `creatures/creatureAI.ts:135` | `isEnemyBondWithColor` — a bond is enemy if EITHER end is not mine (Voltkin, drone, chewer, every structure attacker via the bucket) | either end `!sameTeamColor` |
| 2 | `creatures/creatureAI.ts:243` | nearest enemy SHAPE (goblins, lone-shape rule) | skip `sameTeamColor(prim.placerColor, owner)` |
| 3 | `creatures/creatureAI.ts:568` | colour bucket: a not-enemy bond is filed as OWN (Voltkin's own-bond fallback) | own = both ends exactly MY colour; a teammate's bond is filed nowhere — Voltkin never falls back onto a friend's tower |
| 4 | `creatures/creatureAI.ts:595` | the strict (both-ends-enemy) set, S162 | both ends `!sameTeamColor` |
| 5 | `creatures/creatureAI.ts:749` | `findNearestEnemyCreatureFrom` — units, **the castle gun**, turrets, Helga | skip `sameTeam` |
| 6 | `creatures/creatureAI.ts:835` | goblin lock retention | `isEnemySeat` |
| 7 | `creatures/creatureAI.ts:946` | S190 per-seat enemy index | skip `sameTeam` |
| 8 | `creatures/creatureAI.ts:1142` | `enemyCastleInReach` — who may hit a keep | skip `sameTeam` |
| 9 | `creatures/creatureAI.ts:1176` | defender (Helga) as a melee target | skip `sameTeam` |
| 10 | `creatures/creatureAI.ts:1211` | stink BAG as a target (inside the smell) | skip `sameTeam` |
| 11 | `creatures/creatureAI.ts:1292` | nearest stink bag | skip `sameTeam` |
| 12 | `creatures/creatureAI.ts:1407` | `enemyCastleMarchPos` — which keep an army marches on | skip `sameTeam` |
| 13 | `creatures/creatureLifecycle.ts:1066` | committed creature target still valid | `isEnemySeat` |
| 14 | `creatures/retaliation.ts:173` | who a hit unit may turn on | `sameTeam` → false |
| 15 | `creatures/suicideBlast.ts:141` | the bomber's connector arm spares its own | spare either end on the bomber's team |
| 16 | `creatures/voltkinChain.ts:111` | chain-lightning hop | skip `sameTeam` |
| 17–19 | `damage.ts:694 / 701 / 708` | `applyRadialDamage` owner filter — creatures, defenders, shapes. **Every area blast**: stink aura, stink bag, stink death blast, drone, suicide bomber, Power/Wrath of Ra, stink cloud | spare the WHOLE team of `sparePlayerId` |
| 20 | `damage.ts` (new arm) | the two "hurts everything" blasts (Pharaoh ritual, zombie-boss death blast) pass `null` | new optional `alliesOf`: spares the caster's TEAMMATES, still hits the caster's own seat as ruled — **⚠ MINE, Q5** |
| 21 | `defenders/defenderLifecycle.ts:147` | turret/Helga target still valid | `sameTeam` → false |
| 22 | `defenders/defenderLifecycle.ts:384` | Helga's leash re-validation | `isEnemySeat` |
| 23 | `defenders/stinkTower.ts:352` | depleted-tower aggro set | skip `sameTeam` |
| 24 | `bossSkills.ts:195` | zombie boss ROT aura | skip `sameTeam` |
| 25 | `bossSkillsArchdemon.ts:70` | Archdemon execute ("any ENEMY around") | skip `sameTeam` |
| 26 | `bossSkillsArchdemon.ts:128` | Archdemon teleport victim | skip `sameTeam` |
| 27 | `bossSkillsArchdemon.ts:137` | the victim's "OWN teammates" count | count `sameTeam(other, victim)` |
| 28 | `bossSkillsKraken.ts:151` | `nearestEnemyFor` (Kraken + Pharaoh acquisition) | skip `sameTeam` |
| 29 | `bossSkillsKraken.ts:239` | sonar shove/stun victims | skip `sameTeam` |
| 30 | `droneLifecycle.ts:119-120` | drone sever spares its own (strict) | both ends `!sameTeamColor` |
| 31 | `disruptionManager.ts:138` | a PLAYER sever's hostility/charge | hostile = touches a non-mine shape; **a teammate's bond is REFUSED** (`canSeverBond`), never a free "self-sever" |
| 32 | `gameMode.ts:801` | spawner-kill bounty split among "enemies" | exclude the owner's team |
| 33 | `world.ts:689` | SHRINK_TERRITORY debuffs everyone else (bots send it) | enemies only |
| 34 | `world.ts:727` | RAID a creature | refuse a teammate's |
| 35 | `world.ts:770` | RAID a defender | refuse a teammate's |
| 36 | `world.ts:787` | RAID a connector | refuse if either end is a teammate's |
| 37 | `racial/powerOfRa.ts:163` | Ra column's connector arm spares the caster | spare the caster's team (its shape/unit arm is #17–19) |
| 38 | `racial/scorchedGround.ts:70` | SCORCHED GROUND burns "enemies" in the demon's zone | skip `sameTeam` (T1: a demon teammate's zone does not burn you) |
| 39 | `racial/scorchedEarthRules.ts:98` (**s191/owner, not yet on master**) | `isScorchImmune(owner, spared)` — every Scorched Earth arm (5 calls) | `sameTeam(world, owner, spared)`; done when s191/owner lands (merge order) |
| 40 | `racial/theRisen.ts:65` | "an ENEMY kill only" | `sameTeam` → return |
| 41 | `racial/corpseEater.ts:111` | "enemies first, then his own units" | enemy = other team; own = his own SEAT only; a teammate's units are never eaten — **⚠ MINE** |
| 42 | `territory.ts:400` | territorial engulf: degrade enemy bonds inside my radius | skip a bond with either end on my team |
| 43–44 | `territory.ts:290 / 296` | `isInsideEnemyTerritory` (no production caller since S148; kept consistent) | skip teammates |
| 45–46 | `potatoLifecycle.ts:396 / 397` | `applyStructureSelfDestruct` (the LIGHTNING HUB blast) spares its owner | spare the owner's team |
| 47 | `hostTick.ts:2441` | zombie-boss death blast (owner-agnostic, R138) | passes `alliesOf` = the boss's seat (#20) |
| 48 | `bossSkillsPharaohRitual.ts:152` | Pharaoh ultimate (`null` — "kills everything") | passes `alliesOf` (#20) |
| 49 | `gameState.ts:156` | **WIN** — last ONE standing (`contenders.length === 1`) | last TEAM standing: every contender on one team; the winner is that team's lowest living seat |

### B · BOTS — CONVERTED (9 sites)

| # | file:line | decision | replacement |
|---|---|---|---|
| 50 | `bots/botBrain.ts:933` | raid-ladder rung: the seat just above/below me | enemies only |
| 51 | `bots/botBrain.ts:977` | `scoutPoint` — who to scout | enemies only |
| 52 | `bots/botBrain.ts:1004` | `nearestEnemyBond` (raid target) | skip teammates |
| 53 | `bots/botBrain.ts:1048` | spawner raid | skip teammates |
| 54 | `bots/botBrain.ts:1114` | `nearestEnemyPrim` | skip teammates |
| 55 | `bots/botController.ts:626` | `nearestEnemyPrimPos` (potato path — archived, kept consistent) | skip teammates |
| 56–57 | `bots/botRa.ts:73 / 77` | where a bot aims Power/Wrath of Ra | enemies only |
| 58 | `bots/botBrain.ts:1050 / 1007` | `targetSeat` narrowing | unchanged (it is only ever an enemy picked by #50) |

### C · INPUT — the client's raid picker (the host refuses anyway; this stops it OFFERING a friend) (3 sites)

| 59 | `input/controls.ts:2044` | raid connector picker | skip teammates |
| 60 | `input/controls.ts:2083` | raid creature picker | skip teammates |
| 61 | `input/controls.ts:2114` | raid defender picker | skip teammates |

### D · RENDER — presentation only (9 sites)

| 62 | `render/wallRenderer.ts:163` | which border walls are drawn (walls are RENDER-ONLY — `walls.ts` says the clamp has no sim consumer) | `visibleWallSegments(world)`: drop a segment whose two zone owners are teammates (T2) |
| 63 | `render/creatureProjectile.ts:109` | where a ranged unit's shot is drawn going | skip teammates |
| 64–67 | `render/damageNumbers.ts:251 / 263 / 279 / 377` | which attacker a floating number is attributed to | skip teammates |
| 68 | `render/characterSheetModel.ts:1228 / 1270 / 1303 / 1402 / 1523` | "ENEMY" / "YOUR UNIT" labels | a teammate's reads **ALLY** |
| 69 | `render/ui.ts:1016` | win banner | **TEAM N WINS** when teams are on |
| 70 | lobby + bot overlay (new) | the team pick (T4) | §(b) |

### E · DELIBERATELY UNCHANGED — ownership, not hostility (listed so nobody "fixes" them)

These ask *"is this MINE?"*, not *"is this an enemy?"*, and stay seat equality: gatherers (`gathererLifecycle.ts:115/142/257/322/376`,
`castlePanel.ts:688`, `controls.ts:481`, `gameMode.ts:398`, `botBrain.ts:567/573`); carry (`controls.ts:1335/1599`,
`controlsCore.ts:108`); own-shape pickers (`controls.ts:1960/1986`, `placePrimitive.ts:166/621/655`, `placeFromFree.ts:200`,
`botBrain.ts:284/359/447/817`); tower-owner resolvers (`godlyRecipes/*.ts`, `godlyMatcherCore.ts:126/218`); own counts
(`raceUnitEmit.ts:172`, `endlessDynasty.ts:69`, `bossSkillsPharaoh.ts:99`, `bossSkillsWarlord.ts:105`, `creatureLifecycle.ts:243`,
`goblinKinds.ts:147/176`, `goblinTowerFeed.ts:140`, `bloodFrenzy.ts`, `lifesteal.ts`); **build legality** (`zones.ts:308`
`canBuildAt` — `zone === owner` already refuses a teammate's zone, which IS T3 v1; `structureRepair.ts:141`); vision/fog
(`vision.ts:92/98`, `concealment.ts:108`, `fogRenderer.ts:351` — Q8); the hunter (neutral — chases the leader); scoring and
the points-race gate (Q1); archived subsystems with own-seat filters (`bombLifecycle.ts:110/117`, `seagullLifecycle.ts:377`).

**Count: 61 converted decision sites in A–D (+ the lobby work).** A mechanical guard (`teams.sites.test.ts`) pins, per
file, how many inline seat/colour comparisons remain, and requires every converted file to call the predicate — a new
inline comparison turns it red until someone classifies it.

---

## (b) THE RULES (v1)

1. **Teams 1–4**, picked per seat in the **multiplayer lobby** (click your team chip; joiners send `CLAIM_TEAM`, the host
   arbitrates like a race claim) and the **bot lobby** (one chip per seat, the human's and every bot's). Default: every
   seat on its own team = today's free-for-all.
2. **No friendly damage of any kind** — units, towers, the castle gun, raids, area blasts, auras, racial zone perks,
   Scorched Earth. Teammates are never a target and are never in a blast's victim list.
3. **No wall between teammates.** The border wall is drawn only between zones of different teams.
4. **v1: you cannot build in a teammate's zone** (it is already true: build legality is your-own-zone only).
5. **⚠ MINE — teammates sit side by side.** At Begin the host orders the seats so teammates share a border (never the
   diagonal of the quadrant board): with a 2v2 the host's team takes the LEFT half (TL + BL), the other the RIGHT (TR + BR)
   — his v2 picture, *"team one on the left, team two on the right"*. The host stays seat 0.
6. **⚠ MINE — a game needs at least two teams.** If every seat picks the same team, Begin/Start is disabled with a note;
   the sim also falls back to free-for-all if it is ever handed one team.

## (c) OPEN QUESTIONS — each with my recommendation (built as recommended unless noted)

| Q | question | recommendation |
|---|---|---|
| Q1 | **Win condition.** Castle race: does a team win when every enemy team's castles have fallen? Points race: shared total or per-seat? | **Castle:** yes — last TEAM standing (built). **Points:** per-seat, unchanged — the first seat to the bar wins *for its team* (built; banner says TEAM N). A shared total would let a 2-seat team reach the bar twice as fast in a 2v1. |
| Q2 | Does a match need ≥ 2 teams? | **Yes** (built: lobby blocks it, sim falls back to FFA). |
| Q3 | Can bots be on your team? | **Yes** — in the bot lobby every bot has a team chip (built). |
| Q4 | Per-seat perks whose rule says "enemy" | **"Enemy" means another TEAM, everywhere** (built): THE RISEN raises only from enemy-TEAM kills; SCORCHED GROUND and SCORCHED EARTH never burn a teammate (supersedes T7); POWER/WRATH OF RA spare the caster's team; CORPSE EATER eats enemies first, then his own seat's units, **never a teammate's** (⚠ MINE). |
| Q5 | The two "hurts everything" blasts — the Pharaoh's ultimate and the zombie boss's death blast (R138) | **Spare teammates, still hit their own seat** (built, ⚠ MINE): T1 says teammates never take damage; R138 says the blast hurts its own side. Both literal. One argument flips it. |
| Q6 | A teammate's fallen castle | **Today's elimination, unchanged**: that seat spectates; its zone stays unbuildable for the survivors in v1 (v2's merged half fixes it); the team plays on until all its castles have fallen. |
| Q7 | **v2 — one buildable half per team with an adaptive combined backdrop. How many backdrops?** | see below |
| Q8 | Shared vision between teammates? (not ruled) | **Recommend yes** (allies see what allies see, as in Red Alert) — **NOT built in v1**; one line in `vision.ts` when he says so. |

**Q7 — his count question, in plain words.** Six races. A two-player team is a PAIR of races.
- If the pair is just "who is on the team" — zombies + demons is the same picture as demons + zombies — there are
  **15 mixed pairs** (6 × 5 ÷ 2) plus **6 same-race pairs** (zombies + zombies …) = **21 backdrops**.
- If a same-race team simply uses that race's existing backdrop, only the mixed ones are new: **15**.
- **36** (6 × 6) is only right if WHO IS ON TOP matters — if "zombies on top, demons below" must look different from
  "demons on top, zombies below". With an adaptive backdrop built from two halves, it does not have to.
- Cheapest of all: a backdrop made of two race halves blended at the seam needs **0 new pairs** — the 6 race halves
  already exist; only the seam blend is new art.

## (d) WIRE / HASH / BUMP PLAN

| what | where | cost |
|---|---|---|
| `RosterEntry.team?: number` (0..3) | `START_GAME_SIGNAL.roster`, `LOBBY_PRESENCE.roster` | additive-optional, validated (integer 0..3, else the entry is rejected) |
| `CLAIM_TEAM { team }` | client → host, LOBBY only | new kind, the CLAIM_RACE precedent (gates nothing; the answer rides `LOBBY_PRESENCE`) |
| `StartGameAction.roster[].team?` | host + joiner dispatch, bot start | host-authoritative: the host's roster is the only source |
| `World.teams?: readonly number[]` (seat → team) | factory (absent), `applyStartGame` (stamped, normalised), RETURN_TO_TITLE (cleared) | **absent = FFA** |
| `WorldSnapshot.teams?` | `save.ts` serialize/apply — so NETSNAPSHOT, the worker INIT and host migration all carry it | emitted only when set |
| hash | `stateHashFull.ts` — `FIELD_COVERAGE.teams: 'hashed'`, projection part `tm…` only when set | FFA hash byte-identical |

**BUMP VERDICT: YES (52 → 53), owed by the merge.** `sameTeam` is a rule BOTH peers compute: the client runs
`tickGameState` (last-TEAM-standing), the `?worker=1` mirror runs every targeting site, and a v52 successor promoted by host
migration would drop `teams` and switch friendly fire back on. Two builds advertising 52 would shake hands and disagree —
the S186 test. `PROTOCOL_VERSION` is NOT edited on this branch.
