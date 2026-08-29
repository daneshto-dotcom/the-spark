STATUS: PARTIAL — six of nine owner items complete, three have a documented second half
(see CARRY-FORWARD in HANDOFF_2026-08-29_S157.md). Do not re-derive the investigation;
it was verified by three independent review agents and corrected four times.

═══════════════════════════════════════════════════════════
    PDR — S157: THE NINE PLAYTEST BUGS
    Investigation complete. Awaiting owner GO.
═══════════════════════════════════════════════════════════

Status: AWAITING APPROVAL
Tier: **Full** (9 items, 2 likely PROTOCOL_VERSION bumps, 1 art generation)
Owner report: 2026-08-29, after a real play session.

> ⚠ Nothing here is implemented. This document is the investigation the owner asked for
> (*"I need you to investigate all of those thoroughly and then think of solutions"*).

---

# B1 — GOBLIN TOWERS EAT SHAPES AND PRODUCE NOTHING LATE GAME  ⭐ ROOT-CAUSED

> *"Late game 0 Goblins not being built even if you feed their towers any shapes and the shapes are
> being consumed nevertheless - not cool! also pencil chewers and other spawn are that are not being
> spawned late game - except helga."*

**FINDING — one bug explains all three symptoms, including why Helga is the exception.**

`applyFeedTower` (`goblinTowerFeed.ts:91`) debits the bank **first** and then dispatches
`SPAWN_CREATURE`:

```
bankRemove(world.castleBanks, action.playerId, action.sparkType);   // ← shape gone
dispatch(world, { type: 'SPAWN_CREATURE', … sourceSpawnerId: action.spawnerId });
```

A fed goblin therefore arrives at `applySpawnCreature` with a **non-null `sourceSpawnerId`**, and it
is not a `lightningDrone` — so it falls through to the **chewer** branch:

```
if (!underChewerCaps(world, sourceSpawnerId, action.victimPlayerId)) return world;   // silent no-op
```

⛔ **And `underChewerCaps` counts only chewers** (`creatureLifecycle.ts`, `if (c.type !== 'chewer')
continue;`). So goblins are **gated by a cap they cannot contribute to**. Once
`CHEWER_MAX_GLOBAL = 12` chewers are alive — i.e. exactly "late game" — every goblin feed is refused
**after the shape has already been spent**, silently.

The same saturated cap is why *"pencil chewers and other spawn are not being spawned late game"*.
And **Helga is the exception because she is not a creature at all** — she is a `princess` DEFENDER
(`defender.ts:286`), so no creature cap touches her. That detail is the confirmation the diagnosis
is right.

**PROPOSED SOLUTION**
1. Give the fed-goblin path its **own** population cap (mirroring `underDroneCaps`, which already
   exists precisely so drones and chewers never block each other). A goblin must never be gated by
   the chewer ceiling.
2. Make the debit **conditional on the spawn**: check the cap, and only then `bankRemove`. Spending a
   shape for nothing is the part the owner actually felt.
3. When a feed is refused, say so — a brief UI refusal beats a silent no-op.

---

# B2 — THE LAST SHAPE OF A DEAD TOWER SURVIVES AND SOAKS FIRE  ⭐ ROOT-CAUSED

> *"when there are no connectors left in a destroyed tower, the last shape/primitive should be
> destroyed and dissapear with the last connector. instead the last shape stays and attracts enemy
> fire and it takes a million hits to kill it - WEIRD and too long!"*

**FINDING.** `severSplit` (`game/structure.ts`) deletes the **smaller** side of a cut and keeps the
larger. On the final bond of a two-primitive structure both sides are size 1, so the tie-break
(`maxTick`) picks one — and **exactly one primitive always survives, by construction.**

That survivor has **zero bonds**, and nothing in the codebase removes a bond-less primitive (grep for
an orphan sweep finds only poop-anchor cleanup). Consequences, all matching the report:
- **Chewers can never kill it** — they target *bonds*, and it has none.
- Only structure-attacking goblins can, at `GOBLIN_DAMAGE_VS_PRIMITIVE = 167` against
  `PRIMITIVE_MAX_HP = 1000` = **6 hits** — while contributing nothing but a distraction.
- It still scores as a placed primitive, so a "destroyed" tower keeps paying its owner.

**PROPOSED SOLUTION.** Raze a primitive the moment it becomes **bond-less as a result of a sever**
(not a global orphan sweep — a freshly placed loose shape must stay legal). This is a small addition
at the one sever site, reusing `razePrimitives`, and it makes "destroy the tower" actually mean it.

⚠ Check first: a lone shape a player has *just placed* and not yet bonded must not be razed. Gate on
"lost its last bond", never on "has no bonds".

---

# B3 — LIGHTNING DRONES DETONATE AT HOME DURING BUILD  ⭐ ROOT-CAUSED

> *"lightning hubs blow up own structures or nearby friendlies during build phase when the drones are
> produced - WTF!? first they shouldnt be able to hit friendlies in friendly territory and certainly
> not during build phase!"*

**FINDING — the phase edge is the culprit, and it is a genuine defect.**

At the FIGHT→BUILD edge `recallArmies` (`hostTick.ts`) teleports **every creature** to its owner's
home and clears its targets. **Drones are not exempt.** Their fuse is absolute
(`despawnAtTick = spawn + 8 s`), so it expires during the 90-second BUILD. The instant FIGHT resumes,
the drone check fires:

```
const fuseExpiring = world.tick >= droneCandidate.despawnAtTick - 1;   // ← massively true
if (inRange || fuseExpiring) dispatch({ type: 'DRONE_EXPLODE', … });
```

⇒ **the drone detonates at its owner's own base**, complete with a `BOMB_EXPLODE` burst.

⚠ **HONEST LIMIT OF THIS FINDING.** `applyDroneExplode` filters candidates through `isEnemyBond`, so
on a static read it should sever only *enemy* bonds. I have **not** reproduced own-structure
*destruction* — only proven the detonation happens at home at the wrong time. Either the visual is
being read as destruction, or `isEnemyBond` has a hole (its colour compare uses live `player.color`
against stored `placerColor`, which a rainbow shuffle could desynchronise). **A repro test comes
first**; I will not "fix" a mechanism I have not seen fail.

**PROPOSED SOLUTION** (all three are what the owner asked for, in order):
1. **Despawn in-flight drones at the FIGHT→BUILD edge.** A drone is a FIGHT weapon; parking one
   through BUILD is meaningless. This alone kills the reported symptom.
2. **Never damage your own or a friendly's structures** — an explicit owner filter in the blast, not
   an inherited colour compare. Cheap, and it closes the rainbow-shuffle hole whether or not that
   is the live cause.
3. **No detonation outside FIGHT**, as a belt-and-braces guard.

---

# B4 — ONE VOLTKIN PER GAME, GLOBALLY  ⭐ ROOT-CAUSED

> *"Currently you can only build one voltkiin per ghame - not cool, hes not reeally a godly anymore -
> there arent really godlies anymore justy more expensive towers. you should be able to build him as
> many times as you build his towers. across all players in the whole game!"*

**FINDING.** Exactly as reported, and it is deliberate — S97 P5 introduced a *"1 of each type per
match"* rule:

```
if (world.godlyFiredThisMatch.has(recipe.id)) continue;   // godlyRecipes/index.ts:94
world.godlyFiredThisMatch.add(event.godlyId);             // godlyActions.ts:44
```

`godlyFiredThisMatch` is cleared only at `START_GAME` / title-return, and it is **global, not
per-player** — so the first Voltkin anywhere on the board locks it out for everyone, all match.
SPAWNER recipes (the pentagram) are explicitly excluded from this gate; cinematic recipes are not.

**PROPOSED SOLUTION.** Drop cinematic godlies out of the per-match lockout so a Voltkin is buildable
as often as its structure is built, by anyone — the owner's ruling verbatim.

⚠ **One real cost to name:** the gate also throttles the **cinematic**. Voltkin's summon plays a
match-warping cutscene through a single cinematic slot; unbounded triggers mean it can fire
repeatedly. Recommended: keep the cinematic **single-slot** (so two never overlap) but stop it being
*once per match* — and consider showing the full cutscene only for the first, then a short
summon-flash for later ones. **Owner decision.**

---

# B5 — CHEWERS IDLE ONCE ALL STRUCTURES ARE GONE  ⭐ ROOT-CAUSED

> *"pencil chewers should also target castle (also voltkin and drones and every creature that is
> offensive to towers (not helga)), instead after all enemy structures are destroyed pencil chewers
> just stand there idle...."*

**FINDING — the strike exists; the NAVIGATION does not.** The castle-attack machinery is already
generic and wired at all four required sites (engage predicate, abort predicate, host-tick fire gate,
strike) via `enemyCastleInReach`. But `enemyCastleInReach` is a **proximity** test, and a chewer's
target selection (`findNearestBondTarget`) returns `null` when no enemy bond exists — so the chewer
never walks anywhere, is never "in reach", and idles. The castle is reachable only by a unit that
happens to already be standing next to it.

⚠ The codebase records this exact trap: *"adding a new THING TO ATTACK means touching FOUR sites…
Miss any one and the unit plays a full attack animation that does nothing, with every test green."*
The missing fifth site is **navigation**.

**PROPOSED SOLUTION.** Give every offensive creature a **castle-march fallback**: when no bond, unit
or structure target exists, set `targetPos` to the nearest enemy castle anchor and walk. Applies to
chewers, Voltkin, drones and goblins — **excluding Helga**, per the owner. The strike then fires
through the machinery that already exists.

---

# B6 — HELGA DIES WITH HER TOWER'S CONNECTORS  ⭐ ROOT-CAUSED

> *"Helga should stay alive after her tower connectors are destroyed until she is destroyed herself.
> if she is destroyed but tower is up he will not produce another helga during the same fight stage
> that she was destroyed in. only next turn."*

**FINDING.** Helga is a `princess` DEFENDER whose recipe re-validation runs every poll:

```
stillValid: (world, anchorId) => isHelgaComponent(world, anchorId)   // princessHelga.ts:110
if (!world.primitives.has(d.anchorPrimitiveId) || !defenderRecipeStillSatisfied(world, d))
    dispatch({ type: 'REMOVE_DEFENDER', defenderId });               // hostTick.ts:471
```

So breaking one connector deletes her instantly, mid-fight. She is treated as a *turret bolted to a
shape* rather than as a summoned unit.

**PROPOSED SOLUTION.** Two rules, exactly as ruled:
1. **Decouple her survival from the recipe.** Once summoned, she persists until killed on her own
   HP. (She is the one defender kind that is a *character*, so this is a per-kind trait, not a
   change to the defender contract — turrets and stink towers keep dying with their structure.)
2. **One Helga per FIGHT phase.** If she dies while the tower stands, the tower does not re-summon
   until the next BUILD→FIGHT turn. Needs a small per-defender-anchor "summoned this phase" marker,
   reset at the phase edge.

---

# B7 — LASER TOWER IS TOO SLOW  ✅ TRIVIAL

> *"Laser tower should charge up and be able to shoot x2 quicker!"*

**FINDING.** `TURRET_FIRE_INTERVAL_TICKS = 1800` (30 s) — and a FIGHT phase is only **45 s**, so a
turret fires roughly **once per fight**. The charge-up tell already exists
(`TURRET_WINDUP_TICKS = 18`) and the renderer already draws a charge ramp.

**PROPOSED SOLUTION.** `1800 → 900` (15 s), giving ~3 shots per fight. One constant; the existing
charge visual scales with it automatically.

---

# B8 — WAVES: A COUNTER, AND AN ESCALATING SPAWN RATE  🆕 NEW FEATURE

> *"each build-fight turn should be considered as WAVE and there should be a place on the top near
> the timer counting how many waves has it been. Also every wave the spawned primitives/shapes should
> spawn faster and faster (0.2 each wave). so wave 1 is normal. wave 2 is 1.2. wave 3 is 1.4x faster.
> wave 4 is 1.6 times faster etc..."*

**FINDING.** There is **no wave/round concept in the codebase at all** — grep finds nothing in
`worldTypes`, `hostTick` or the HUD. The phase clock flips BUILD↔FIGHT and counts nothing. Spawn rate
is a fixed `ratePerSecond` on `DEFAULT_SPAWNER_CONFIG` (`spawner.ts:74`).

**PROPOSED SOLUTION.**
1. Add `world.waveNumber`, incremented on each BUILD→FIGHT→BUILD turn, serialized (⚠ this is a wire
   field ⇒ **PROTOCOL_VERSION bump**).
2. HUD: a wave readout beside the match clock, reusing the existing clock/banner surface.
3. Spawn multiplier `1 + 0.2 × (wave − 1)`, applied to the spawner's rate.

⚠ **One thing to decide:** the multiplier is unbounded, so wave 20 is 4.8× and wave 50 is 10.8×.
That is a lot of live sparks — a perf and wire-size question, not just balance. Recommend a **cap**
(e.g. 4×, reached at wave 16) unless you want it genuinely runaway. **Owner decision.**

---

# B8b — PENTAGRAM CHEWERS SHOULD BE A HORDE  ⚠ NEEDS AN OWNER NUMBER

> *"pencil chewer pentagram tower should continuously generate pencil chewers on a timer and not have
> a limit (i think now its like limit 3 per tower... weak for a somewhat expensive tower!). keep
> poppiong them out - they are supposed to be a horde!"*

**FINDING — the owner's memory is close: it is 4, and two *other* caps bite first.**

```
CHEWER_MAX_GLOBAL      = 12   // hard ceiling on live chewers
CHEWER_MAX_PER_SPAWNER = 4    // ← the "3" the owner remembers
CHEWER_MAX_PER_VICTIM  = 3    // one swarm can't fully strip a single player
```

The tower already emits on a timer; the caps are what make it feel weak. `CHEWER_MAX_PER_VICTIM = 3`
is often the real governor — it caps how many chewers can gnaw *any one player* regardless of how
many towers you own.

**PROPOSED SOLUTION.** Raise all three substantially and let the timer run.

⛔ **BUT "no limit" IS NOT SAFE, AND I HAVE TO SAY SO.** `CHEWER_MAX_GLOBAL` is not a balance knob —
its docblock ties it to the **snapshot wire size**: every live creature is serialized into the
multiplayer snapshot every 6 ticks. An unbounded horde is a bandwidth and desync risk in exactly the
netcode that has already cost two evenings. Recommend: **per-spawner 4 → 12, per-victim 3 → 8,
global 12 → 40**, then *measure* the snapshot size and raise again if it holds. A horde with a
measured ceiling, rather than an unbounded one that breaks multiplayer. **Owner decision on the
numbers.**

---

# B9 — THE STINK TOWER DOESN'T READ AS ANYTHING  🆕 BIGGEST ITEM

> *"Stink tower should visibly shoot out all 5 stink bags (that then damage over time an area of
> effect for a certain amount of time i have defined before). its not very clear what the stink tower
> does right now. he should not target any enemies but shoot our at random areas in a radius. the
> bags (and tower) should be visibly stinking up a radius until destroyed. We also did not generate a
> cool graphic and loop video of the bags themselves when they land on the ground and start stinking
> up the are - we should do that too!"*

**FINDING — the owner is right that it is unclear, because the bag does not exist as a thing.**

`stinkThrowBag` (`defenders/stinkTower.ts:157`) is an **instantaneous** radial hit at the target:
push one `BOMB_EXPLODE` effect, apply `radialDamage` once, decrement the magazine. There is **no
landed-bag entity, no duration, no lingering area.** The only persistent smell is a separate aura
around the *tower* (`STINK_AURA_RADIUS = 120`). And it **targets an enemy** today, which is the
opposite of what the owner wants.

Cadence makes it worse: `STINK_THROW_INTERVAL_TICKS = 480` (8 s) × 5 bags = **40 s to empty the
magazine**, against a 45-second FIGHT. You essentially never see the tower do its thing.

**PROPOSED SOLUTION** — this is the one genuinely large item:
1. **A real landed-bag entity** with a position, a lifetime and a DoT aura — a new serialized entity
   family (⚠ **PROTOCOL_VERSION bump**, and it must be added to the state hash and the differential's
   `SEEDING_COVERAGE`, or it ships with the same blind-guard hole S156 just closed for defenders).
2. **Untargeted lobbing** — pick random points within a radius via the existing `mix32`/`pseudoRand`
   stateless-hash idiom (never a seeded stream draw, which would desync).
3. **Faster magazine** so all five land inside one fight.
4. **Visible stink radius** on both the tower and each landed bag, until destroyed.
5. **Art**: an original bag graphic + a looping "landed and stinking" video, generated with veo —
   original only, no franchise references, with a clean transparent matte.

⚠ **Scope honesty:** items 1–4 are a Full-tier priority on their own. The art (5) is a separate,
slower loop (generation + curation + atlas). Recommend shipping the *mechanic* first and the art as a
follow-up, so the tower becomes legible this session rather than waiting on video.

---

# RECOMMENDED ORDER

**Tier 1 — cheap, high-impact, low-risk (ship together):**
`B1` goblin cap · `B7` laser cadence · `B2` last-shape raze · `B3` drone at home

**Tier 2 — behaviour, moderate risk:**
`B5` castle march · `B6` Helga persistence · `B8b` horde caps · `B4` Voltkin unlock

**Tier 3 — new systems, protocol bumps:**
`B8` waves · `B9` stink bags (mechanic, then art)

# OWNER DECISIONS NEEDED BEFORE CODE

1. **B4** — keep the Voltkin *cinematic* single-slot (no overlap) while removing the once-per-match
   lock? Full cutscene every time, or only the first?
2. **B8b** — the horde numbers. I recommend per-spawner 12 / per-victim 8 / global 40 and measure,
   rather than literally unlimited, because that ceiling protects the multiplayer snapshot.
3. **B8** — cap the wave spawn multiplier (suggest 4×), or let it run away?
4. **B9** — ship the mechanic now and the art as a follow-up, or hold the whole thing for the art?

═══════════════════════════════════════════════════════════
    GATE: awaiting owner GO. Nothing implemented.
═══════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════
    OWNER RULINGS — 2026-08-29 (verbatim)
═══════════════════════════════════════════════════════════

**B4 — VOLTKIN.** *"voltkin cinematic SHOULD be once per game for the first person to have built him.
but the voltkin spawn himself should be generated every time someone builds his tower."*

⇒ **The two things are SPLIT, and that is the whole ruling.** Today one latch
(`godlyFiredThisMatch`) governs both the cutscene and the summon, which is why killing the lock
would have spammed the cutscene and keeping it starves the unit. So:
- the **CINEMATIC** keeps a once-per-match latch — and it belongs to the FIRST builder only;
- the **CREATURE** is summoned every single time anybody completes the recipe, all match, all seats.
Later builders get the Voltkin with no cutscene. This is strictly better than either option I
offered, because it keeps the spectacle rare and the unit ordinary.

**B8 — WAVE MULTIPLIER: NO CAP.** *"dont cap because people build more and more gatherers so it
should scale in the way i have described."*
⇒ Ship `1 + 0.2 × (wave − 1)` unbounded. The owner's reasoning is an ECONOMY one and it answers my
objection directly: hauling capacity grows with the wave count too, so the extra shapes are consumed
rather than accumulating on the board. ⚠ I will still MEASURE live spark count and snapshot size at
high wave numbers and report the number — the ruling is on balance, not on the wire budget, and if
the snapshot degrades that is a fact the owner should get to see rather than a cap I impose.

**B9 — SHIP BOTH.** *"ship the mechanic AND cinematic, just send an agent to go do that. make sure
the bag thats generated looks like the bags that are hanging on the branches."*
⇒ Art agent dispatched with the exact palette and geometry of the hanging bags from
`stinkTowerRenderer.drawTower` (round sack, `STINK 0x7fbf3f` fill, `STINK_DEEP 0x4e7d22` outline, on
a `GRAPHITE_SOFT` string, pencil-on-paper). Output targets `public/godly/stink-bag/anim/` in the same
atlas format as the existing stink tower.

**REVIEW PASS ORDERED.** *"run another 3 agents across the 9 bugs ive described and see if there
could be something you've missed and actually another solution or reason for those bugs! Only then i
already pre approve the FULL bug list fix!"*
⇒ Three independent agents dispatched: (1) BLIND re-diagnosis from the symptoms alone, forbidden to
read this document, so it cannot anchor on my answers; (2) ADVERSARIAL refutation of every root
cause AND every proposed fix, including what each fix would break; (3) ADJACENT-BUG hunt across the
five defect CLASSES these nine belong to (debit-before-guard, silent cap, the-four-sites,
phase-edge survivors, once-per-match latches).

⇒ **FULL BUG LIST IS PRE-APPROVED, conditional on that review landing first.** Execution begins once
the three reports are in and reconciled.

**STILL OPEN — B8b HORDE NUMBERS.** The owner asked *"what horde numbers you are asking about?"* —
my question was badly put. There are THREE separate limits, and the one that makes the tower feel
weak is probably not the one anyone would guess. Re-asked in plain terms; see the terminal reply.

═══════════════════════════════════════════════════════════
    REVIEW PASS 1 — BLIND RE-DIAGNOSIS (independent agent)
    Verdict: ONE OF MY ROOT CAUSES WAS WRONG. Three were incomplete.
═══════════════════════════════════════════════════════════

An agent was given ONLY the owner's nine symptoms and forbidden to read this document. Every claim
below was then re-verified by me directly against the files before being written here — the S120
rule (reviewers do fabricate execution claims) applies to agents that agree with me as much as to
ones that do not.

## ⛔ B3 — MY DIAGNOSIS WAS WRONG, AND THE REAL ONE IS BETTER

I blamed `recallArmies` parking drones through BUILD until their fuse expired. **That is not it, and
I had the disproof in my own notes**: I observed that the creature fan-out is FIGHT-gated
(`hostTick.ts:553`) and then built a causal story that required drones to act during BUILD anyway.
A drone cannot move, tick or detonate in BUILD. My story was unreachable.

**THE ACTUAL CAUSE — the hub's own self-destruct, unphased and owner-blind.** VERIFIED:

1. The SPAWNER poll has **no phase gate at all** — `hostTick.ts:361` is
   `if (world.gameState === 'PLAYING' && world.creatureSpawners.size > 0) {` with no `matchPhase`
   term. Its sibling defender poll 120 lines down HAS one (`hostTick.ts:482`). So a lightning hub
   runs its entire production arc **during BUILD**.
2. The arc's 4th slot is not a drone — it is a **detonation**. `hostTick.ts:392`:
   `if (sp.spawnedCount >= STRUCTURE_SELFDESTRUCT_DRONE_COUNT)` → `dispatch({ type:
   'STRUCTURE_SELFDESTRUCT', radius: STRUCTURE_SELFDESTRUCT_RADIUS })` (240 px).
3. `applyStructureSelfDestruct` (`potatoLifecycle.ts:264`) ends with
   `applyRadialClear(world, cx, cy, r², () => true)` — **no owner predicate whatsoever.** Every
   primitive and every creature inside 240 px is razed, friend and foe alike. `damage.ts:302` even
   documents it: *"the lightningHub self-destruct passes `() => true` and razes friendly shapes by
   design."*

The agent proved it live: hub ignited, phase pinned to BUILD, a friendly Square 100 px away →
`phase=BUILD hubsLeft=0 friendlyBystanderAlive=false`.

⭐ **And this fits the owner's words better than my version ever did.** They said the hubs blow
things up *"when the drones are produced"* — the self-destruct IS the last beat of the drone
production arc. I read that as "while drones are around"; it was literal.

**REVISED SOLUTION.** (a) Phase-gate the spawner poll, mirroring the defender poll one screen away.
(b) Give the self-destruct an OWNER FILTER so it never razes its owner's or a friendly's shapes —
the `() => true` is load-bearing for creatures but wrong for structures. (c) Drones need no change;
they were never guilty. My "despawn drones at the phase edge" fix would have shipped and the bug
would have survived it.

## ⚠ B5 — INCOMPLETE. There are TWO holes, and I found only one.

I said the castle STRIKE was already generic and only NAVIGATION was missing. Wrong: the strike is
type-gated too. `creatureAI.ts:535`, the very first line of `enemyCastleInReach`:

```
if (!getCreatureConfig(creature.type).targetsStructures) return null;
```

and `targetsStructures` is **false** for chewer (`voltkin-config.ts:457`), Voltkin (`:389`) and
lightningDrone (`:499`). That one function is the sole authority behind all three castle sites —
engage predicate, abort predicate and strike — so a chewer standing ON the enemy keep still cannot
engage it. Proven: `castleInReach — chewer=null voltkin=null drone=null goblin=1`.

⇒ B5 needs BOTH a march fallback for the non-structure branch AND a widening of the castle
predicate. Shipping only my half would have produced a chewer that walks to the castle and stands
there — the exact "full attack animation that does nothing" failure the codebase warns about.

## ⚠ B6 — I found half of it. The respawn half has its own cause.

The owner asked for two things and I only traced the first. The second — *"she should not produce
another helga during the same fight stage"* — is because `runDefenderIgnition`
(`godlyMatcherCore.ts:178`) re-registers on **any** topology change anywhere on the board, and its
only dedupe is "is a defender already live at this anchor?". Kill her, let anyone form any bond, and
she is back the same FIGHT. Defender recipes are deliberately excluded from `godlyFiredThisMatch`,
so there is no existing latch to reuse — a per-phase spent-set is new work.

## ⚠ B9 — a FOURTH gap, and it is the one that explains "unclear"

`stinkAuraTick` (`stinkTower.ts:188`) and `stinkAggroTargets` (`:224`) both open with
`if (!stinkIsDepleted(d)) return false;` — and the renderer gates its aura ring on `depleted` too.
**So a fully-loaded stink tower stinks up nothing at all.** The smell only appears once the magazine
is empty. That is the precise inverse of the owner's *"the bags (and tower) should be visibly
stinking up a radius until destroyed"*, and it is probably the single biggest reason the tower
*"is not very clear"* — for the first 40 seconds of its life it is inert scenery.

## ✅ CONFIRMED, with additions worth having

- **B1** — confirmed, and: `CHEWER_MAX_PER_SPAWNER` also counts only chewers, so a goblin tower's
  per-spawner term is permanently 0. The GLOBAL cap is therefore the sole gate on goblins — and it
  is a **shared resource across all players**, so one player's chewer swarm can starve another
  player's goblin towers. Proven: bank 1→0, goblinsBorn=0, with the 12 chewers owned by the *other*
  seat from an unrelated spawner.
- **B2** — confirmed, with a number that makes the complaint concrete: the last connector holding
  the shape has a capacity of 5 fifths = **one goblin swing**, while the orphan it leaves behind
  takes **six**. The survivor is six times tougher than the bond that was holding it up, and immune
  to three of the four attacker families.
- **B4** — confirmed. Second, milder cause noted: one live Voltkin per (owner, type) in
  `creatureLifecycle.ts:127`. That one is probably intended and the owner's ruling does not touch it.
- **B7, B8, B9a** — confirmed exactly as written.

═══════════════════════════════════════════════════════════
    RECONCILIATION — all three review agents in
    My PDR was WRONG in four places and INCOMPLETE in four more.
═══════════════════════════════════════════════════════════

Three agents worked independently: a BLIND re-diagnosis (forbidden this document), an ADVERSARIAL
refutation, and an ADJACENT-BUG hunt. Where two or three converged on the same finding by different
routes, I treat it as established. I re-verified every load-bearing citation myself.

## ⭐ THE HEADLINE: ONE MISSING LINE CAUSES THREE OF THE NINE REPORTS

`hostTick.ts:361` — the SPAWNER poll:

    if (world.gameState === 'PLAYING' && world.creatureSpawners.size > 0) {

There is **no `matchPhase` conjunct.** Its two sibling polls both have one: the defender poll
(`:482 if (world.matchPhase !== 'FIGHT') continue;`) and the creature fan-out (`:553`). All three
agents found this independently. It drives:
- **B3** — hubs run their whole arc during BUILD, ending in a self-destruct (below);
- **B1** — pentagrams keep minting chewers through the 90 s BUILD, and creatures **do not age out**
  during BUILD (the despawn lives inside `applyCreatureTick`, which only the FIGHT-gated fan-out
  dispatches), so the global cap fills with frozen chewers exactly when the player is feeding;
- **B9a** — the same accumulation is why a tower "feels" capped at 3.

⇒ **Ship the phase gate FIRST.** Several of the other fixes are unmeasurable until it lands.

## ⛔ FOUR THINGS I GOT WRONG

**1. B3 — wrong mechanism.** I blamed a drone fuse surviving `recallArmies`. The real cause is the
hub's own detonation: after its 3rd drone the arc dispatches `STRUCTURE_SELFDESTRUCT`
(`hostTick.ts:392`) which reaches `applyStructureSelfDestruct` (`potatoLifecycle.ts:264`) and ends in
`applyRadialClear(..., () => true)` — a **240 px owner-agnostic raze of every primitive and
creature**, fired from the un-gated poll during BUILD. `damage.ts:302` documents the owner-blindness
as intentional. Both agents proved it live (friendly bystander at 100 px destroyed, `phase=BUILD`).
Timing is deterministic: detonation at +3600 ticks = 60 s after ignition, inside a 90 s BUILD — so a
hub built early in BUILD **always** blows up its own base. My proposed drone fix would have shipped
and the bug would have survived it.

**2. B5 — I had it exactly backwards.** I said the strike was generic and navigation was missing.
`enemyCastleMarchPos` **already exists and is already wired** (`creatureAI.ts:628`, called at
`hostTick.ts:662`) — for goblins. What is missing is the STRIKE: `enemyCastleInReach`
(`creatureAI.ts:535`) opens with a `targetsStructures` gate, and chewer/Voltkin/drone are all
`false`. Adding navigation alone ships the precise "full attack animation that does nothing" failure
this codebase warns about.

**3. B8b — I repeated a stale comment and gave the owner bad advice.**
- `CHEWER_MAX_PER_VICTIM` is **dead code**. The only production caller passes two arguments
  (`hostTick.ts:436`) and the dispatch carries no `victimPlayerId`, so the term never executes.
  My "it is often the real governor" was false, inherited from a stale `constants.ts` docblock
  rather than checked.
- **Raising `CHEWER_MAX_PER_SPAWNER` alone changes nothing.** The binding limiter is the lifetime:
  `lifetimeTicks 3000 / SPAWN_INTERVAL_TICKS 900` = 3.3 concurrent. The caps are an overlap buffer.
  A real horde needs `SPAWN_INTERVAL_TICKS` and/or `CHEWER_CONFIG.lifetimeTicks` changed.
- ⛔ **AND MY WIRE-SIZE CAUTION TO THE OWNER WAS WRONG.** I told them "no limit isn't safe" on
  bandwidth grounds. `constants.ts:1260` measured it: ~41 B per creature, 12 chewers = +558 B per
  snapshot, and it says **"Trivial on WebRTC (Trystero auto-chunks)"**; the save.replay size
  assertion is explicitly flagged "FIXTURE-scoped and not a runtime budget". I argued from a
  half-remembered constraint against the owner's instinct, and the owner's instinct was right.
  **Correction owed and given.**

**4. B7 — my baseline was off.** Defenders are dormant outside FIGHT but `world.tick` keeps running,
and `standDownDefenders` does not re-phase `nextFireTick` — so it is already in the past at every
FIGHT edge. The turret fires **twice** per fight today (t=0 and t=1800), not "roughly once", and
1800 to 900 yields **four**, not three.

## ⚠ FOUR THINGS I MISSED

**5. B6 — MY FIX WOULD MAKE HELGA IMMORTAL, AND IT CONTRADICTS AN OWNER RULING.** There is **no
defender damage path in the game**: the `'defender'` arm of `DamageTarget` and `Defender.hp` were
both deliberately DELETED in S151 P2 under the owner's own **R75** (*"a tower has no hit points of
its own"*), part of PROTOCOL_VERSION 28 to 29. `PRINCESS_HP = 6` survives as declarative `unitStats`
with **zero production readers**. So "she stays alive until she is destroyed herself" requires
re-adding a damage substrate + a wire field + a protocol bump + a targeting path — a Full-tier
priority, not a per-kind trait. Decoupling her from the recipe without it means **nothing in the
game can kill her.** ⇒ **OWNER DECISION REQUIRED** (below).

**6. B4 — a second gate survives my fix.** `applySpawnCreature`'s null-spawner branch
(`creatureLifecycle.ts:129`) refuses a second LIVE creature of the same `(owner, type)`, and the
Voltkin spawn passes no `sourceSpawnerId`. Removing the match latch still leaves **one live Voltkin
per seat**. The owner's ruling ("every time someone builds his tower") needs both gates addressed.

**7. B2 — the fix is insufficient.** `razePrimitives` also orphans neighbours with no sever involved
(a goblin killing one half of a two-shape structure, or any `applyRadialClear`). The "lost its last
bond" predicate must sit at **both** teardown paths, not just `severBond`.

**8. B1 — goblins are `persistent: true`,** so `GOBLIN_LIFETIME_TICKS` never fires and they never
despawn. Giving the fed-goblin path its own cap is therefore **load-bearing, not optional** —
lifting the accidental chewer gate without one yields unbounded never-ageing creatures.

## 🆕 FIVE NEW BUGS THE OWNER HAS NOT REPORTED YET

- **F1 ⭐ THE CASTLE STRIKE PREEMPTS EVERYTHING ELSE.** In `creatureAttack.ts:236` the castle branch
  sits FIRST, before the structure (`:256`) and bond (`:286`) branches — while its own docblock says
  *"Ordered LAST ... so every shipped strike path short-circuits before this is evaluated."* It is
  ordered first. Proven: a goblin committed to an enemy shape 10 px from the keep leaves the shape at
  **full HP** while the castle drains. With `goblinArcher` at attackRange 220, there is a 220 px dead
  zone around every keep where structure damage cannot land. **Would lose an evening.**
- **F3 `recallArmies` never resets `chewProgress`.** Re-selection is gated on `chewProgress === 0`
  (`hostTick.ts:717`) and the only writer that zeroes it is inside the ATTACKING branch. A chewer
  recalled mid-bite can never re-select, never re-enter ATTACKING, never reset — **bricked for the
  match** while still occupying both caps. Proven.
- **F4 chewers born during BUILD are born dead.** `CHEWER_CONFIG` has `lifetimeTicks: 3000` and no
  `lifetimeClock`, so it defaults to `'absolute'` — the exact trap S155 P3 fixed for Voltkin and did
  not apply here. They fill the caps through BUILD and evaporate on the first FIGHT tick.
- **F6 an ABORTED cinematic burns that godly for the whole match, for everyone.** `applyGodlyTrigger`
  takes the latch at cinematic START; `applyGodlyAbort` tears down everything downstream and never
  clears it. A peer drop mid-cutscene costs everyone the Voltkin.
- **F7 `goblinSuicide` is wired to the drone path.** It declares both `selfExplode: true` and
  `targetsStructures: true`; `hostTick.ts:570` tests `selfExplode` first, so it takes the drone
  branch — navigates to bonds not shapes, deals **no unit damage at all** (so its ATK/PEN apply to
  nothing), and uses the drone's 110 px radius instead of its own 70 px.
- **F9 `sudokuFiredThisMatch`** is the same global-latch shape as B4.

## ⚠ TWO HAZARDS TO RESPECT WHEN BUILDING

- **B8's spawn multiplier is a DETERMINISM question, not a balance dial.** `ratePerSecond` feeds
  `-Math.log(u) / rate` off a **seeded stream**; changing it changes how many draws happen per
  second. `physicsLoop.ts:97` and `spawnerRngInvariance.test.ts` exist for exactly this class.
- **Two stale docblocks will mislead the implementer:** `goblinTowerFeed.ts:33` still claims nothing
  dispatches `FEED_TOWER` (wired since S152 P2), and `goblinRenderer.ts:303` still claims FEED is
  BUILD-only. Fix the comments with the code.

## REVISED ORDER

**P0** — the phase gate (`hostTick.ts:361`) + the self-destruct owner filter. Closes B3, unblocks the
measurement of B1/B9a.
**P1** — F1 strike order · B1 goblin cap + debit-after-guard · F3/F4 phase-edge chewer fixes.
**P2** — B2 both teardown paths · B7 · B5 (march + strike gate) · B4 (both gates) · F6/F9 latches · F7.
**P3** — B8 waves · B8b real horde constants · B9 stink rework + art.

## ⛔ NEW OWNER DECISION — B6 HELGA

*"stay alive after her tower connectors are destroyed until she is destroyed herself"* collides with
the owner's own **R75** (*"a tower has no hit points of its own"*), under which defender HP and the
defender damage path were deleted. Three options:

**(a)** Re-add a defender damage substrate — Helga gets real HP anything can attack. Truest to the
request; a Full-tier priority of its own plus a protocol bump.

**(b)** Untie her from the recipe but give her a FIGHT-duration lifetime — she survives her tower
breaking and disappears at the end of the fight. No new substrate, no protocol bump, ships now, and
still delivers "she does not die the instant a connector breaks".

**(c)** Leave as-is.

Recommend **(b)** now and **(a)** later if she should be killable. Owner picks.

═══════════════════════════════════════════════════════════
    SCOPE AMENDMENT — owner rulings, 2026-08-29 (round 2)
═══════════════════════════════════════════════════════════

## B8b — CHEWERS: TURN THE CAP OFF, LEAVE THE SPEED ALONE

> *"spawner interval for chewer is fine, just turn off their cap and have their tower continuously
> produce pencil chewers in the same speed as now."*

⇒ `SPAWN_INTERVAL_TICKS` (900) and `CHEWER_CONFIG.lifetimeTicks` (3000) are **UNTOUCHED**. The caps
come off so a tower NEVER STOPS emitting. My earlier suggestion to speed up the interval is withdrawn
— the owner is right that the cap, not the cadence, is the thing that made it feel dead: today a
tower hard-stops at 4 and the GLOBAL 12 is shared across every player, which is also what was
starving goblins (B1).

⚠ **ARITHMETIC TO REPORT AFTER THE FIX, NOT TO ARGUE NOW.** With the cadence unchanged, one tower's
steady state is `lifetime 3000 / interval 900` ≈ 3.3 alive. So removing the cap changes *never stops
producing* and *no shared ceiling*, and a single tower will still hover around 3-4 live chewers. If
that does not read as a horde in play, the remaining dial is the chewer's 50 s lifetime — the owner's
call, once they have seen it. **Measure it and report the number; do not pre-emptively retune.**

## ⛔ R75 IS DISPUTED BY THE OWNER, AND THE RECORD IS CORRECTED HERE

> *"i never saiid a tower has no hit points of its own!!! ofc it does and its based on the numbers of
> connectors it has! helga has her own hit points and stats regardless of her towers stats"*

`damage.ts:64` and `defender.ts:114` both attribute to the owner, as **R75**, the sentence *"A tower
has no hit points of its own"* — and that attribution is what justified DELETING the `'defender'`
arm of `DamageTarget`, `Defender.hp`, `SerializedDefender.hp` and the `DefenderHashed` entry, at the
cost of a PROTOCOL_VERSION 28→29 bump. The owner says they never said it. **Their word governs; the
docblocks are wrong and must be corrected in place rather than left to mislead a fourth session.**

⭐ **AND THE IMPLEMENTED BEHAVIOUR ACTUALLY AGREES WITH THE OWNER.** What shipped is "a tower's
durability is its connectors'" — which is precisely the owner's *"its based on the numbers of
connectors it has"*. The paraphrase overreached ("no hit points of its own"); the mechanic did not.
So **towers need no change**. What went wrong is that HELGA was swept into a tower-shaped ruling.

## B6 — HELGA IS A CHARACTER, NOT A TOWER  (owner picks option (a))

> *"helga has her own hit points and stats regardless of her towers stats"*

⇒ Helga gets **her own HP and stats, independent of her tower**. This is the option I priced as the
expensive one, and the owner has ruled for it. Note the substrate is already half-built and inert:
`PRINCESS_DEFENDER_CONFIG.unitStats` carries `PRINCESS_HP = 6` today with **zero production
readers** — the numbers were authored and then orphaned by the R75 deletion.

**SCOPE (expands the batch — recorded per Rule 16):**
1. Re-add a damage path for UNIT-LIKE defenders. Scoped to the `princess` kind, not all defenders:
   turrets and stink towers keep dying by recipe-break, which is the behaviour the owner just
   endorsed for towers.
2. `Defender.hp` returns as a mutable field ⇒ `SerializedDefender.hp`, `DefenderHashed`,
   `FIELD_COVERAGE`, the differential's `SEEDING_COVERAGE`, and a **PROTOCOL_VERSION bump**.
3. She must be TARGETABLE — creatures need a path to attack a defender, which today does not exist.
4. Decouple her survival from `recipeStillSatisfied` (the B6 first half).
5. One Helga per FIGHT phase: if she dies while the tower stands, no re-summon until the next turn
   (the B6 second half — needs a per-phase spent-set, since defender recipes are deliberately
   excluded from `godlyFiredThisMatch`).

⚠ This is a Full-tier priority on its own. It lands in P3 alongside the other protocol-bumping work
(B8 waves, B9 stink bags) so ONE bump pays for all three, rather than three separate bumps.
