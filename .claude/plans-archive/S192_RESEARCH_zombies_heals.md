# S192 RESEARCH: zombie boss explosion, THE RISEN, and heal numbers (owner items T2, T3, T11, T12)

**Status:** READ-ONLY research. No source was edited, nothing was committed. Read against `master` @ `7236934`
(PROTOCOL_VERSION **52**, `src/net/protocol.ts:884`), plus `s191/carry` @ `3c42d5e` (C-5 hub ladder blast, R2-A
split, R2-E overkill carry, **C-8 DONE**), `s191/tune` @ `99f688d` (the Ra 35 split) and `s191/endstats` @ `d407dbf`
(the `{kind:'seat'}` attacker).

**Measured, not inferred.** A throwaway vitest probe drove the REAL `runHostTick`. It lives in the scratchpad
(`…/scratchpad/r-zombies/probe.test.ts`, its own `vitest.probe.config.mjs`, outputs `out*.txt`) and is not in the
repo. The split tables come from `split.mjs` and `sceneA.mjs` in the same folder.

Ladder values used throughout (all printed by the probe from the real configs):

| unit | pool (fifths) | strike (fifths) |
|---|---|---|
| zombie boss `t9BossZombies` (24/10/8/8, `constants.ts:1931`) | **360** (`bossMaxPoolFifths`) | **104** = `attackFifths(8, 8)`, cadence 60, fire tick 30, range 35 |
| castle soldier `raceUnit` | 6 | 6 |
| `goblinMelee` | 7 | 12 |
| `chewer` | 5 | 7 |
| `t3Hound` · `t3Bat` | 10 · 10 | 10 · 12 |
| `t3Warband` · `t3Scarab` | 24 · 28 | 18 · 5 |
| Vlad · Warlord | 260 · 374 | 150 · 112 |
| 5-connector tower | 50 for the first connector, 130 for the whole ladder | — |

---

## T2: every kill by a zombie should raise a zombie, whether by explosion, ability or physical damage

> *"every zombie that kills another unit, doesn't matter if it's through an explosion, through an ability, or
> through … physical damage, that creates a regular zombie from the castle."*

### How THE RISEN works today

`racialDeaths.ts:24-32`. The single hook is `onCreatureDeathDecided`, which `damageCreature` calls once, at the
moment lethality is first decided (`creatureLifecycle.ts:642-645`). It hands `killerId` to `riseOnKill`
(`theRisen.ts:61-73`). `riseOnKill` refuses in any of these cases:
- `killerId === null` (`:62`);
- **the killer is no longer in `world.creatures`** (`:63-64`);
- the kill is not an enemy kill (`:65`);
- the killer is not one of the three types `isZombieRacialType` accepts: `raceUnit`, `t3Hound`, `t9BossZombies`
  (`:52-54`, `:66`);
- the seat does not hold `zombies.l0` (`:68`).

`damageEntity` passes `killerId` only when the attacker has `kind === 'creature'` (`damage.ts:222`).

### Every path by which a zombie-seat creature kills an enemy creature

| # | path | file:line | attacker passed | does THE RISEN fire? | why |
|---|---|---|---|---|---|
| 1 | Melee strike by soldier, hound or boss (ordinary FSM `CREATURE_ATTACK`) | `creatureAttack.ts:199-205` | `{creature, id}` | ✅ YES | — |
| 2 | ROT AURA tick (boss alive, 1 fifth on the victim's cadence) | `bossSkills.ts:215` | `{creature, bossId}` | ✅ YES. **Measured:** a 1-fifth enemy soldier at 140 px died to the aura after 400 ticks and raised **1** | the aura names the boss |
| 3 | CORPSE EATER bite | `corpseEater.ts:254` → `CREATURE_ATTACK` | `{creature, bossId}` | ✅ YES, when the bite lands (see T12: about half of them do not) | — |
| 4 | **DEATH EXPLOSION** (R138) | `hostTick.ts:2389-2447` → `STRUCTURE_SELFDESTRUCT` (no owner; on carry, `blast:'raze'`) → `applyStructureSelfDestruct` (`potatoLifecycle.ts:374`) → `applyRadialClear` → `removeCreature` (`:339`) | none | ❌ **NO. Measured: 15 enemy creatures deleted, 0 raised, perk held** | (a) it is a RAZE: `removeCreature` deletes and never decides lethality, so `onCreatureDeathDecided` is never called; (b) even with damage, the killer is the dead boss, so `world.creatures.get(killerId)` would be `undefined` at `theRisen.ts:63` |
| 5 | Zombie seat's goblins / chewers / Voltkin chain (single target, named) | `creatureAttack.ts`, `voltkinChain.ts:241` | `{creature}` | ❌ by design | `isZombieRacialType` (S187 *"so not like Voltkin or Helga or Pencil Chewers"*) |
| 6 | Zombie seat's suicide goblin, drone, stink bag, hub blast | `suicideBlast.ts:106`, `droneLifecycle.ts:201`, `damage.ts:304`, carry `potatoLifecycle.ts` | `null` (master); endstats makes some `{kind:'seat'}` | ❌ | null attacker, and not zombie units anyway |
| 7 | Zombie seat's castle gun | `castleGuns.ts:137` | `null` | ❌ | not a unit |
| 8 | Zombie seat's raid (`RAID_CREATURE`) | `world.ts:749` | `null` | ❌ | a player action, not a unit |
| 9 | A kill on Helga (a DEFENDER, not a creature) | `damage.ts:327` | `{creature}` | ❌ | the hook only exists for creature victims, so THE RISEN never sees a Helga kill |

**Measured scene A (master, real `runHostTick`).** The boss was at (960, 540). Around him: 15 enemy creatures
(6 soldiers and 6 goblins on rings from 60 to 360 px, 2 warbands, the enemy Warlord), 3 of his own units
(2 soldiers, 1 hound), an enemy 5-connector star, his own 5-connector star, and 2 lone enemy shapes. He was killed
by a creature-less blow. Two ticks later: creatures **20 → 1**, shapes **14 → 0**, connectors **10 → 0**. All 15
enemy creatures died, all 3 of his own units died, and **both** buildings were destroyed. Risen: **0** with
`zombies.l0`, and 0 without it. This is exactly his report: *"he killed like 10 … it didn't produce the 10 zombies"*.

### Which part of S188's own call (MINE) this ruling overrides

S188 wrote: *"a kill with no creature attacker (castle gun, raid, area) or a raze raises nobody"* (`theRisen.ts:29-35`,
canon §3e). His T2 overrides the **"area"** and **"raze"** halves for a **zombie's** explosion or ability: the death
blast must raise. The castle-gun and raid halves stand, because neither is a zombie. The aura and the bite already
raise today.

### "Every zombie": two readings

- **Reading A (recommended): a zombie is one of the seat's three RACIAL types** (soldier, hound, boss). This is
  consistent with his S187 *"any racial characters kill. So not like Voltkin or Helga or Pencil Chewers"*, and T2
  only adds the HOW (explosion, ability, physical). In practice the one new path is #4, the boss's death blast (and
  any future zombie ability that passes `null`).
- **Reading B: any unit the zombie seat owns** (its goblins, chewers, drones, suicide goblins, bags, hub). This
  reverses the S187 exclusion of chewers and Voltkin. It needs every seat-owned area source attributed, which is
  endstats' `{kind:'seat'}` seam, plus a type gate removed. It is much stronger, since every zombie hub, drone and
  bag would start raising soldiers. **Do not build B without asking him;** it contradicts his S187 words.

### Fix shape (Reading A)

1. **An attributed-kill seam that survives the killer's death.** Replace `killerId: CreatureId | null`, threaded
   `damageEntity` → `damageCreature` → `onCreatureDeathDecided` → `riseOnKill`, with a resolved
   **`KillCredit = { seat: PlayerId; type: CreatureType } | null`**:
   - it is computed at the blow from the LIVE attacker (`world.creatures.get(id)` → owner and type) for creature
     attackers;
   - a blast passes it explicitly: the death blast passes `{ seat: boss.owner, type: 't9BossZombies' }`, captured
     in the roster (`state.bossRoster` already stores `type`, x and y; **add the owner**, `hostTick.ts:2389-2436`).
   - `riseOnKill` then tests `credit.seat !== victim.owner && isZombieRacialType(credit.type) && seatHoldsPerk(seat)`.
     It no longer needs the killer to be alive. That also fixes a latent gap: a killer that was deleted earlier the
     same tick (only on the non-deferred path) is credited correctly.
   - ⚠ Retaliation and lifesteal must keep reading the live `DamageAttacker`, not the credit, so a dead boss heals
     nobody and is turned on by nobody. If endstats lands first, its `{kind:'seat', seat}` attacker is the natural
     carrier: widen it to `{kind:'seat', seat, as?: CreatureType}` and derive the credit from it. **Pick one; do not
     build both.**
2. **The blast must decide lethality.** Either:
   - **(preferred, it is T3)** the death blast becomes ladder damage through `damageEntity` (the carry `blast:'ladder'`
     pattern), so every victim reaches `onCreatureDeathDecided` with the credit; or
   - if he keeps the raze, `applyRadialClear` gains an optional `onKilled(victim)` that calls
     `onCreatureDeathDecided(world, c, credit)` for each creature it removes. The potato and the hub would pass
     nothing.
3. **The queue.** No change needed. `riseOnKill` already uses `queueAfterStrike`. The blast is dispatched inside
   `runHostTick` after the deferred sweep (`hostTick.ts:2195`; the blast runs at `:2441`), and
   `endHostTickSpawnWindow` (`:2460`) drains the queue FIFO before the tick ends, so the soldiers are born that tick
   and nothing is inserted while a victim list is being walked. ⚠ `pendingCreatureDeaths` is `null` at that point,
   so the blast's victims are deleted immediately. That is correct for a collect-then-mutate blast.
4. **Per-tick performance bound.** At most one raise per corpse, so k raises when the blast kills k enemies (k ≤ the
   creatures inside 380 px). Each raise is one `SPAWN_CREATURE` plus `underRaceUnitCaps`, and `countRaceUnits` is
   **O(creatures)**, so the cost is O(k·N). The caps are `RACE_UNIT_MAX_GLOBAL` / `_PER_SEAT` = **10 000**
   (`constants.ts:1995-1996`), so nothing gameplay-relevant limits it. If wanted, add a **performance sentinel**
   (the `DYNASTY_LIVE_PHARAOH_SENTINEL` shape, not a gameplay cap), e.g. 40 raises per tick.
5. **Determinism.** Victims are planned in a total order (squared distance, kind, id) before any mutation; raises
   are queued FIFO in that order; spawn ids are sequential; positions come from `spreadTargetPos(castleAnchor, id)`.
   No RNG and no `Map` order.
6. **Never raise from his own units' deaths, or from the boss himself.** The enemy test already covers this.

**Files:** `theRisen.ts`, `racialDeaths.ts`, `creatureLifecycle.ts` (`damageCreature` signature), `damage.ts`
(creature arm, plus the census tests `damage.callSites.test.ts`), `hostTick.ts` (roster gains the owner; blast
dispatch), `potatoLifecycle.ts` (the blast arm, shared with T3). Canon §3e row and MINE column for THE RISEN.

**Tests owed:**
- REACH through `runHostTick`: a `zombies.l0` seat's boss dies with N enemy creatures in the blast. Assert exactly
  (enemy creatures killed) new `raceUnit`s at P0's keep after that tick. His own units killed raise 0. A non-perk
  seat raises 0. A non-zombie seat's identical boss type is not applicable.
- A test where the killer dies in the same tick and its kill still raises.
- The host vs `?worker=1` and snapshot→restore differential (the `racialB.differential.test.ts` pattern), plus a
  reversed-`Map`-order copy (BLAST-8's lesson: the hash assertion must be able to fail).
- A mutation run: drop the credit at the blast, and the REACH test must go RED.

**Protocol (S186 test):** **BUMP.** A host-migration successor or worker on the old build raises nobody from the
blast while the new build raises k. That is a rule both compute, and two builds that shake hands would disagree.
It rides the same bump as T3.

**Owner questions:** (1) confirm Reading A (the three racial types); (2) should a Helga kill count as "a unit"?
Today it can never raise.

---

## T3: the zombie boss explosion is far too strong; make it an exact damage pool, split with distance falloff

### What the explosion is today (every number, with its constant)

| | value | where |
|---|---|---|
| Trigger | his **DEATH**, detected one tick later by comparing the boss roster (absent this tick, present last tick, only while `PLAYING`) | `hostTick.ts:2389-2447` |
| Action | `STRUCTURE_SELFDESTRUCT` with **no `ownerPlayerId`** (owner-agnostic, R138 *"hurting everything"*); on carry, `blast: 'raze'` | `hostTick.ts:2441-2446`; carry `:2444` |
| Radius | **380 px**, `T9_ZOMBIE_DEATH_BLAST_RADIUS`. ⚠ **MINE (S168)**: he said "huge" and gave no number | `constants.ts:2802` |
| Effect | **RAZE, not damage.** `applyRadialClear` deletes EVERY creature in radius (any owner, bosses included; only a channelling Pharaoh survives) and every shape (any owner, buildings included) through `razePrimitives`. **No damage number, no HP, no kill event.** Stink bags and the castle are untouched | `potatoLifecycle.ts:309-363, 374-401` |
| Visual | `BOMB_EXPLODE` at radius 380 | `potatoLifecycle.ts:377` |
| Cadence | once, at death. His other skills are the rot aura (`ZOMBIE_AURA_PER_MILLE` **25** per-mille/s of the VICTIM's pool, `ZOMBIE_AURA_RADIUS` **170** px, `constants.ts:2861/2868`) and CORPSE EATER | — |

**Measured** (scene A above, through the real host tick): **100 % of everything** within 380 px was deleted,
including his own units and his own building. That is his *"destroys everything around him"*.

### Proposal: one total pool, split with distance falloff

**(a) The pool on the ladder.** `pool = k × attackFifths(atk, pen)` for the boss's own type,
`attackFifths(8, 8)` = **104**, so every option is "k of his own bites". Read the type's base strike, not the
drafted one. That follows the carry hub precedent (*"priced off a drone"*) and keeps the number stable. Lever: k.

**(b) The falloff (MINE, for him to judge).** For each target in the radius:
- `d = Math.sqrt(d²)` (correctly rounded per IEEE, so deterministic; **never `Math.hypot`**);
- `w = max(1, floor(R − d))`, which is linear: 380 at his feet, 1 at the edge.
- Shares, all in integers:
  - if n ≥ P, the first P targets in the total order get 1 each;
  - otherwise everyone gets the **floor of 1** (his floor-at-one), then the remaining P − n is shared as
    `floor((P − n) × w / Σw)`;
  - the leftover fifths go one each in the total order.
- The shares **always sum to exactly P**.
- The total order is squared distance (nearest first), then kind rank, then id. It is the same order carry and tune
  already use.
- Alternative if he wants the edge harsher or softer: `w = (R − d)²` (steeper), or `w = 2R − d` (the edge takes half
  of the centre).

**(c) Who is a target.**
- Creatures (any owner, per R138 and his *"anyone who's in the vicinity"*), Helga, lone built shapes, landed stink
  bags, and **a structure counts as ONE target**. Its distance is to its nearest connector midpoint, and its share
  lands on that connector and carries (`severWithCarry`, carry R2-E). The castle is not a target (both
  conventions).
- ⚠ **CONVENTION CONFLICT TO RESOLVE AT MERGE:** carry's hub blast (`planHubBlast`) makes **each connector** one
  target; tune's Ra (`raColumnTargets`) makes **a structure** one target, following his *"if it hits a tower and an
  enemy at the same time then it split amongst those two"*. **I recommend tune's (structure = one)** for this
  blast. Per-connector targeting lets a building soak most of a split meant for units. Whichever is chosen, all
  three blasts should share one helper (tune's docblock already invites folding `raSplitShares` and the hub's split
  together).
- Whether HIS OWN units take a share: R138 says *"hurting everything"*; T3 says *"anyone who's in the vicinity"*.
  The default keeps both (owner-agnostic). His own deaths never raise (T2).

**(d) Worked tables.** Distances: near 50 px, mid 190 px, far 330 px. Each cell is the fifths each victim takes.
The equal split (carry hub style, no falloff) is shown for comparison.

| pool | victims | near | mid | far | equal split each |
|---|---|---|---|---|---|
| **k=2 → 208** | 3 (1/1/1) | 120 | 70 | 18 | 69 |
| | 10 (3/4/3) | 36 | 20–21 | 6 | 20 |
| | 20 (6/8/6) | 18 | 10–11 | 3 | 10 |
| **k=3 → 312** | 3 (1/1/1) | 180 | 104 | 28 | 104 |
| | 10 (3/4/3) | 54 | 31–32 | 8 | 31 |
| | 20 (6/8/6) | 27 | 15–16 | 4 | 15 |
| **k=4 → 416** | 3 (1/1/1) | 241 | 138 | 37 | 138 |
| | 10 (3/4/3) | 72 | 41–42 | 11 | 41 |
| | 20 (6/8/6) | 36 | 20–21 | 6 | 20 |

A lone victim takes the whole pool (208 / 312 / 416).

**The measured scene-A cluster under each option** (22 targets, structures as one each, owner-agnostic;
`sceneA.mjs`). Today's raze kills **15/15 enemies, 3/3 of his own, and both buildings**.

| option | enemy creatures killed | own killed | survives |
|---|---|---|---|
| k=2 (208) | 8/15 | 3/3 | Warlord (takes 14), both warbands, everything past ~280 px, both towers (8 and 6 fifths banked) |
| **k=3 (312)** | **9/15** (11/15 if enemies only) | 3/3 | Warlord (21), warbands, the outer ring, both towers (13 / 10 banked) |
| k=4 (416) | 11/15 | 3/3 | Warlord (28), one warband, the 360 px ring, both towers (17 / 13) |

What each option means:
- **k=2:** "two bites". It clears chaff near him and barely scratches anything at mid range in a crowd. Probably
  reads as weak.
- **k=3 (recommended):** "three bites", **312**. That is below his own pool (360), so the explosion is never worth
  more than killing him. Alone and adjacent it still kills Vlad or the Archdemon (260). In a wave-sized crowd it
  kills the cheap units near him and wounds everything else, and no tower falls (a 5-connector tower needs 50 for
  its first connector). That matches *"closer more damage, further less"* without *"destroys everything"*.
- **k=4:** the hub's *"four times"* convention, **416**. That exceeds his own pool, so the death blast is stronger
  than the boss. Alone it kills every boss (pools 260–462) except the Pharaoh (462).

**Recommendation:** k = 3, linear falloff, floor of 1, structure = one target, owner-agnostic, radius 380 kept
(still MINE; with falloff the edge matters little).

**Files:** `potatoLifecycle.ts` (a third `blast` variant such as `'zombieSplit'`, or reuse a shared split helper),
`hostTick.ts:2441` (dispatch; pass the credit for T2), `constants.ts` (`T9_ZOMBIE_DEATH_BLAST_BITES = 3`; the
radius), canon §3e/§9d plus `canon.test.ts` pins (the BLAST-8/GATES pin lesson: radius 380 has no pin today),
census tests (`damage.callSites`, `damageConnector.callSites`).

**Tests owed:**
- Pure arithmetic: shares sum to P, every share ≥ 1 when n ≤ P, monotone in distance, and the remainder goes in
  the total order.
- REACH through `runHostTick`: the boss dies and each victim's pool drops by exactly its planned share. A
  Warlord adjacent survives at k=3. His own building banks rather than vanishes.
- Determinism: a real three-way differential (original, snapshot→restore, reversed `Map` order), compared on an
  id-insensitive projection.
- Killing-swing numbers: `creatureKillHits` must print the share.
- The T2 REACH test on top.

**Protocol (S186 test):** **BUMP.** It is the C-5 / BLAST-5 case exactly: an old successor razes everything in
380 px, the new one deals 312 split, and both report the same version. Write one docblock line for it, and keep the
other branches' docblocks (S182 lesson 6).

**Owner numbers needed (plain words):**
1. **How big is the explosion in total?** Recommended: **3 of his bites = 312** (below his own 360 HP). Alternatives
   are 208 (2 bites) or 416 (4 bites, stronger than he is).
2. **How fast does it fade?** Recommended: straight-line fade from full at his feet to almost nothing at the edge.
   Alternative: the edge takes half of what the centre takes.
3. **Does it still hurt his own side?** He said *"hurting everything"* in S168 and *"anyone in the vicinity"* now.
   Recommended: yes, but his own units never raise zombies.
4. **Does a building count as one target, or does each connector count?** Recommended: one.
5. **Is the 380 px radius fine?** It was my number, never his.

---

## T11: every heal should show, just as every hit does

### Every heal source in the sim

| # | source | file:line | counted (`noteCreatureHeal` / a counter)? | drawn by `damageNumbers`? | joiner sees it? |
|---|---|---|---|---|---|
| 1 | BLOOD DEBT / CRIMSON TIDE, **outside** the strike batch | `racial/lifesteal.ts:127-128` | ✅ `noteCreatureHeal` | ✅ green, split from the hit (`creaturePoolChange`, `damageNumbers.ts:534-541`) | ✅ `healedFifths` serialized (`save.ts:2367/2766`), hashed `:hf` |
| 2 | BLOOD DEBT / CRIMSON TIDE, **inside** the batch (summed, landed before the sweep) | `lifesteal.ts:150-151` (landed at `hostTick.ts:2191`) | ✅ | ✅ | ✅ (two heals in one 10 Hz snapshot merge into one number; a stated limit) |
| 3 | Vlad's LIFE SAP | `bossSkills.ts:122-123` | ✅ | ✅ | ✅ |
| 4 | CORPSE EATER bite | `corpseEater.ts:264-265` | ✅ | ✅ **when a bite lands**, see T12 | ✅ measured: host +104 at t30 / t181, joiner +104 at t30 / t186 |
| 5 | Castle regen | `castleRegen.ts:151` | ❌ on master; ✅ on **s191/carry C-8** (`Player.castleHealedHp`, commit `3c42d5e`) | master: ✅ green **net** only (`track('c:…')`, `damageNumbers.ts:784`), so a hit plus regen in one frame prints one red net number (carry measured hit 40 + regen 25 → one red "15"). Carry: split into two | ✅ `castleHp` is on the wire; carry adds `castleHealedHp` |
| 6 | Castle HP purchase (the baked delta) | `castleUpgrades.ts:264` | same as #5 (carry C-8 covers both writers) | same as #5 | ✅ |
| 7 | **Structure REPAIR: connectors** (`b.damageFifths = 0`) | `structureRepair.ts:509` | ❌ | ❌ **NOTHING IS PRINTED.** Connectors are tracked as a RISING pool (`damageNumbers.ts` bond `track(…, rising=true)`), and `poolDelta` (`:307-314`) returns `null` for a fall in a rising pool | the value is on the wire (`Bond.damageFifths`), but no number is drawn |
| 8 | Structure REPAIR: shapes (`p.hp = PRIMITIVE_MAX_HP`) | `structureRepair.ts:500` | ❌ (diff only) | ✅ green, through `track('p:…', rising=false)` (`:727`). Rare in practice: a shape inside a building only loses HP to area damage | ✅ `Primitive.hp` is on the wire |
| — | Helga revive at the phase edge | `defenderLifecycle.ts:600` | n/a | deliberately **not** a heal (S191 weld census: a new life, swept as the kill) | — |
| — | Pharaoh ritual `ehp = 1` | `creatureLifecycle.ts:630` | n/a | not a heal (it is the lethal blow's floor) | — |
| — | HELLSPAWN child `ehp = pool` | `hellspawn.ts:146` | n/a | a birth (first sighting) | — |

I grepped every `ehp =`, `ehp +=`, `hp = Math.min`, `castleHp =` and `damageFifths =` writer in `src/state` and
`src/game`. Nothing else raises a pool. **No tower or defender heals anything** today. When he says *"when a tower
heals"*, the real candidates are the castle (#5–6, carry) and REPAIR (#7–8).

### Gaps against *"every healing should show"*

1. **A repaired connector prints nothing (#7).** This is the main remaining gap; a tower repair is almost entirely
   connector banks.
2. **Castle hit + heal merge** (#5–6). This is **DONE on s191/carry C-8** and only needs merging.
3. **A heal on a unit already at full pool prints nothing.** No HP is gained, by the no-overheal cap
   (`lifesteal.ts:126`, `:148`). This is correct, but ask whether he wants a "+0" or no number. Recommended: no
   number.
4. **Same-tick (host) or same-snapshot (joiner, 10 Hz) heals merge** into one green number. This limit is stated at
   `creaturePoolChange`.
5. **Placement:** heals use `damageAnchor`, which is pushed **toward the nearest enemy** (`:389`), not straight
   above the unit. That is his T12 *"above him"*.
6. **`MAX_LIVE = 64` floaters** (`:121`). In a big melee the oldest are retired first. That rarely hides a fresh
   heal, but it is a ceiling.

### Fix shape

- (#7) Print the repair. The simplest exact version: `applyRepairStructure` sums what it restored (connector banks
  cleared plus shape HP restored) and pushes one presentational record, the `structureKillHits` contract
  (per-frame, host-local, wiped by the consumer). The renderer prints one green number at the structure. For a
  joiner, fall back to diffing: treat a fall in `b:` damage as a heal **only if the bond still exists and its
  component's connector count did not change that frame**. ⚠ Verify against carry's R2-E carry and the sever
  re-form, which can lower or reset banks without a repair. Do not just flip `poolDelta` for rising pools; a sever
  would then print phantom heals.
- (#2) Merge carry C-8 as is.
- (#5) Covered by T12's anchor change (draw heals above the healed unit).

**Files:** `render/damageNumbers.ts`, `state/structureRepair.ts` (record push), `worldTypes.ts` plus the three phase
resets and the consumer wipe for any new per-frame record (the four sites of the `structureKillHits` sibling).

**Tests owed:** a REACH test that dispatches a real `REPAIR_STRUCTURE` on a chewed tower and checks that the real
`DamageNumbers` prints one green number equal to the banks cleared, on the host and on a joiner through
HostSync → ClientSync. A negative: a sever or re-form prints no green.

**Protocol:** no bump. These are render-only and host-local presentational records. C-8 is additive-optional per
its own audit.

**Owner question:** for a tower repair, one total green number at the tower, or one per connector? Recommended:
one total.

---

## T12: CORPSE EATER heals do not show above the boss

> *"he's not healing. It should show that he's healing over time … every tick of healing should show above him."*

### The trace

`corpseEater.ts` `runCorpseEater` (`:360`) → `maybeTrigger` (≤ 20 %) → `feedStep` → at `ticksInState === fire`
(`:322`) → `bite` (`:248-266`) → `dispatch CREATURE_ATTACK` (`:254`) → if the victim lost pool,
`boss.ehp += lost × 100 %` and `noteCreatureHeal` (`:264-265`) → `healedFifths` → `creaturePoolChange` →
green floater.

⚠ **The feed heal does NOT go through `applyLifesteal` or the pending-lifesteal batch.** It is applied directly,
and `noteCreatureHeal` is called correctly. The renderer neither de-dupes nor caps per creature (only the global
`MAX_LIVE` 64). **The counter, the wire and the renderer all work: when a bite lands, host and joiner both print
+104.**

### Root cause: measured through the real host tick

Setup: boss at 20 % (`ehp` 79 of 396, drafted HP), holding `['hp','racial']`, with 4 enemy goblins 25 px away
that are free to fight.
- **Only 2 heals in the 8-second window** (host +104 at t30 and t181; joiner the same at t30 and t186).
- 9 bite opportunities. Every bite on a victim that was **targeting him** was refused: **6 of 6**, at
  t61, t121, t241, t301, t361 and t421. In each case `winsInitiative(boss, victim, tick)` was false.
- The two that landed were on victims not targeting him.

1. **CAUSE 1: THE INITIATIVE ROLL EATS HIS BITES (S156 P4).** `applyCreatureAttack` refuses a strike when the
   victim is targeting the attacker and the attacker loses a fair coin (`creatureAttack.ts:181-183`,
   `winsInitiative` `:89-98`). Under retaliation (R183) **everyone who attacks him targets him**, so every bite is
   a "mutual collision" and fails about half the time. A refused bite heals nothing (`bite`: `lost <= 0`) and is
   not retried until the next 60-tick cycle. In this run he lost all six coins, healed twice, and ended at 107/396
   while being chewed. That is his *"he's not healing"*.
2. **CAUSE 2: NO CREATURE IN REACH → NO HEAL.** With only an enemy tower in reach (scene C2), the feed armed,
   bit nothing, and healed **0** (79 → 79). He eats creatures only; reach is leash 60 + range 35 from his anchor.
   That is the ruling as built (*"eating everyone around him"*), but a boss at 20 % chewing a tower sits down and
   does nothing for 8 s.
3. **CAUSE 3 (presentation): one big chunk per landed bite, pushed toward the attacker.** 104 at once, about once
   per second at best. There is no "over time", and the number sits off-centre (`damageAnchor` `:389`), not above
   him.

### Fix shape

- **(1) The feed bite skips the initiative roll.** Add a `feed: true` flag on `CREATURE_ATTACK` from `bite`, or
  test `isCorpseEaterFeeding(creature, tick)` before the roll at `creatureAttack.ts:181`. He is *"eating"*, not
  dueling. ⚠ The roll is his S156 P4 ruling, so state the exception at the constant and ask. Lesser alternative:
  retry a refused bite on the next tick instead of waiting a full cycle.
- **(2) Heal over time (his words).** Bank each landed bite's heal and pay it out in pulses across the next cycle.
  Example: 104 over 6 pulses every 10 ticks (17, 17, 17, 17, 18, 18), integer, remainder in a fixed order, capped
  at max, each pulse through `noteCreatureHeal`, so each prints a green number. The pending bank must survive a
  save, snapshot or successor, so it is a new `Creature` field: **factory, serialize, hash, worker (four sites)**,
  plus `FIELD_COVERAGE`. Pulses stop if he dies. Reject: a purely render-side split. The bar would still jump at
  once, which is not *"healing over time"*.
- **(3) Above him.** For `kind === 'heal'`, place the floater straight above the healed creature (lift only, no
  `TOWARD_ATTACKER` offset). Stacking (`ROW_STACK_PX`) already keeps pulses readable. This is render-only.
  ⚠ R185-D governs damage placement; heals were never separately ruled.
- **(4) Optional, his call:** let the feed also eat a connector in reach when no creature is there (cause 2).

**Files:** `racial/corpseEater.ts`, `creatures/creatureAttack.ts` (roll exemption), `creatures/creature.ts` plus
`save.ts`, `stateHashFull.ts` and `workerSim` (if HoT), `render/damageNumbers.ts` (heal anchor).

**Tests owed:**
- REACH through `runHostTick` (scene C, as in the probe): with 4 enemy goblins that target him, **every** cycle
  with food in reach lands a bite and a heal (8 in the window). With HoT, one green floater per pulse on the host,
  and on a joiner through HostSync → ClientSync (pulses ≥ 6 ticks apart do not merge at 10 Hz).
- A mutation run: restore the roll, and the test must go RED.
- The C2 negative pins whichever cause-2 ruling he gives.
- The HoT bank: snapshot→restore mid-payout, and a host vs worker differential.

**Protocol (S186 test):** (1) is a rule both peers compute (a successor on the old build refuses the bite) → **BUMP**.
(2) adds a required serialized sim field → **BUMP**. (3) is render-only → none.

**Owner questions (plain words):**
1. **While he is eating, should he always land his bite,** instead of losing a coin flip to whoever is fighting
   him? Recommended: **yes**.
2. **Should each bite's heal trickle in** (6 green numbers over a second) **or land at once** (one +104)?
   Recommended: **trickle**; it is what he described.
3. **If no unit is in reach,** should he eat buildings, or just sit? Recommended: sit (as ruled), but say so.
4. **Heal numbers straight above the unit** (not leaning toward the attacker)? Recommended: **yes, for every heal**
   (this answers T11 too).

---

## Summary

- **T2:** the death blast raises nobody, for two reasons. It is a raze that never decides a death, and the killer
  is dead by the time the hook asks. **Measured: 15 killed, 0 raised.** Aura and melee kills already raise.
  Fix: a `KillCredit {seat, type}` seam, plus a blast that decides lethality (T3). Bump.
- **T3:** the explosion is **not damage**. It deletes **everything** (any owner, buildings included) within
  **380 px** (MINE), one tick after his death. Proposal: a pool of **k × 104**, recommended **k=3 → 312**, with a
  linear distance falloff, floor 1, structure = one target, owner-agnostic. In the measured cluster: 9/15 enemies
  killed instead of 15/15, and no building falls. Bump.
- **T11:** creature heals are complete (counter, wire, renderer). Castle hit+heal is fixed on **carry C-8**
  (merge it). **A connector repair prints nothing** (rising pool, `poolDelta` → null). Fix with a repair record;
  no bump.
- **T12:** the counter, wire and renderer all work. **The initiative roll refuses about half his bites**
  (measured: 6/6 mutual bites lost, 2 heals in 8 s). With no creature in reach he heals 0, and heals come as one
  chunk pushed off-centre. Fix: exempt feed bites from the roll, add a heal-over-time bank, and place heals above
  the unit. Bump for the sim parts.
