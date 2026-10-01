# S192 — THE ENDGAME SPEC (waves 26–31): the last draft, the build lock, the pants monster waves

Branch `s192/endgame` (worktree agent). Source of truth for the owner's words: `.claude/plans/S192_OWNER_ENDGAME_SPEC.md`.
Every number marked **⚠ MINE** is my default, built and flagged at its constant; every other number is his.

---

## 0 · Questions for the owner (one batch; each has the default I built)

1. **Wave 29 and wave 31 counts.** You said 10 at 27, 25 at 28, 50 at 30. **Built: 29 → 35, 31 → 75** per living player.
2. **What happens after wave 31 if two or more players are still alive?** **Built: the match ends at the end of
   wave 31's fight.** The living player with the most points wins (tie: lower seat). The other option is endless
   monster waves that keep growing, which would also end it eventually but with no fixed end.
3. **Do monsters that survive a fight stay for the next one?** **Built: no.** The leftovers vanish when the fight
   ends, so every monster wave starts fresh from the centre. The other option is that they stay and pile up.
4. **What do they hit?** **Built: everything of the player they are sent at, nearest first.** That means a unit in
   reach first, then the nearest building (through its connectors, like every unit), then the castle. Their hit is
   40, the castle gun's shot. A monster walking past ANOTHER player's Helga or stink bag can hit it if it is
   within arm's reach. That is the shared engage rule, not a targeting choice.
5. **Score.** **Built: killing a monster gives no points, and a monster's kills give nobody points.** No creature
   kill scores in the game today; points come from buildings standing.
6. **Pulling a shape out of the castle (PULL_FROM_BANK) during the lock.** **Built: refused**, because a pulled
   shape can't be placed anyway, so it would only end up stuck in your hand. FIX still pays from the bank directly.
   Feeding the goblin tower stays allowed.
7. **The art.** The walk sheet has **20 frames (4 rows × 5)**, not 18. The checkerboard is baked into the
   picture, and there is a small Gemini sparkle watermark in the bottom-right corner of the single pose and the
   last frame. I cut it out as cleanly as I could; see §B for my verdict. **Recommendation:** regenerate with a
   real transparent background, or a flat pure-white or pure-green background, which the pipeline mattes
   cleanly. Also ask for no watermark.
8. **Spawn pace.** **Built: each wave pours out over its first 20 seconds**, one monster per player per pulse.
   For example, 10 each means a pulse every 2 s, and 75 each means a pulse every 16 ticks (about 0.27 s).
9. **Their stats** (§2): HP 10 / DEF 5 / ATK 5 / PEN 3, so a pool of 100 and a hit of 40. Speed is 0.75× a melee
   goblin. All of these are mine.

---

## 1 · The wave timeline (25 → 31)

`world.waveNumber` goes up by one on ENTRY INTO BUILD (`hostTick`), so "wave N" = BUILD N, then FIGHT N.

| wave | BUILD | FIGHT |
|---|---|---|
| 25 | normal | normal |
| **26** | **the LAST draft** (draft index 5, "level 25"), then normal building | **the last monster-free fight** |
| **27** | ⛔ **BUILD LOCK** begins: no new shapes, no new structures, no new connections. FIX allowed. Towers keep producing | **10 pants per living player** from the quarry centre |
| 28 | lock (FIX only) | **25 each** |
| 29 | lock | **35 each** ⚠ MINE |
| 30 | lock | **50 each** |
| 31 | lock | **75 each** ⚠ MINE |
| 32 edge | — | ⚠ MINE: if nobody has won, the match ends: most points among the living wins |

The win bar stays clamped at 50,000 past wave 25 (canon §3b, already MINE). The castle-win and the points-win
both stay live throughout. The draft does NOT open at wave 31: `isDraftWave(w)` is false for `w > LAST_DRAFT_WAVE` (26).

## 2 · The monster — ON THE LADDER

`CreatureType` literal **`'endgameMonster'`**, keyed by role rather than by art. The art name ("pants") is not in
the wire literal, so re-skinning it later costs no protocol bump, which is the same reason the bosses are keyed
by race.

| | HP | DEF | ATK | PEN | pool `unitPoolFifths` | strike `attackFifths` |
|---|---:|---:|---:|---:|---:|---:|
| **pants monster** ⚠ MINE | **10** | **5** | **5** | **3** | **100** | **40** |
| castle soldier (`raceUnit`) | 1 | 1 | 1 | 1 | 6 | 6 |
| tier-3 warband (best T3) | 4 | 1 | 3 | 1 | 24 | 18 |
| Voltkin | 8 | 3 | 3 | 6 | 64 | 33 |
| Helga | 12 | 8 | 4 | 4 | 156 | 36 |
| tier-9 boss | 20–24 | 8–16 | 6–10 | 8–10 | 260–462 | ~110–150 |
| castle | — | — | 5 | 3 | 2500 (off-ladder) | 40 |

Why these numbers:
- **The strike is 40, exactly the castle gun's shot.** It one-shots every unit below a Voltkin (all goblins,
  every tier-3, the castle soldier). It takes a Voltkin in 2 hits, Helga in 4 and a boss in 7. A 5-connector tower
  (130 in total) falls in 4 swings.
- **The pool is 100.** It survives two castle shots and dies to the third. It takes 4 laser beams (30 each),
  6 warband swings and 4 Voltkin zaps. **One tier-9 boss swing kills it.** So it is a mini-boss that dies to
  your bosses and kills your army.
- **Dangerous in numbers, by design.** 10 pants at a bare keep is 400 per second, so 2500 falls in ~6 s
  unopposed. Against a fully upgraded keep (DEF 10 → each hit floors to 13; HP +6500 → 9000), wave 27's 10
  pants need ~69 s, which is longer than a fight, so that wave is survivable. Wave 30's 50 pants need ~14 s, and
  wave 31's 75 pants need ~9 s. That is his "instant death", reached by numbers rather than by a bespoke multiplier.
- Melee: range 35, cadence 60, fire tick 30 (the goblin's). Speed: `maxAccel` = `GOBLIN_MAX_ACCEL × 0.75` = 105,
  slower than a goblin, so defenders get time to meet them. Persistent (no lifetime clock); removed at the fight's end.
- Drafted buffs: none. A monster has no seat, so `draftPicks` is undefined and it is born at its type's numbers.

## 3 · Counts, spawning, assignment, retarget

**Counts** — `MONSTER_WAVE_PER_SEAT = { 27: 10, 28: 25, 29: 35, 30: 50, 31: 75 }`, times **living** seats
(`livingSeats(world)`).

**Spawn timing** (⚠ MINE). Spawning starts on the first FIGHT tick. Pulse interval =
`max(MIN, floor(MONSTER_SPAWN_WINDOW_TICKS / perSeat))`, where the window is 1200 ticks (20 s). Each pulse
releases one monster per living seat, in ascending seat order. A world scalar `monsterWaveSpawned` (how many
this fight) drives it as `due = min(total, (pulsesElapsed + 1) × living)`. A NONET freeze that skips ticks
therefore catches up instead of losing monsters. The scalar resets on the BUILD→FIGHT edge.

**Spread** — the k-th monster is born on a deterministic ring around `SPAWNER_CENTER` (the quarry, canon §3c).
The ring point is `spreadTargetPos(centre, id, 60)`, the same pure id-keyed helper the squads use. There is no
RNG.

**Assignment** — the k-th monster of the pulse is assigned `living[k % living.length]` and stored as
`Creature.monsterSeat`. Every living player therefore gets an equal share: "10 for each of those two players.
So 20 in total."

**Retarget** — DERIVED, never re-written: `monsterVictimSeat(world, c)` = `c.monsterSeat` if that seat is
still alive, else `living[mix32(id) % living.length]`. This is his "whatever leftover monsters there are, they
go to the other two players", with the leftovers fanned out across all the survivors by id. If nobody is alive,
the monster does nothing.

**Targeting ladder** (its own fan-out arm, ahead of the structure-attacker arm, every SEEKING tick):
1. the nearest **victim-owned creature** within `GOBLIN_UNIT_ACQUIRE_RADIUS`;
2. else the nearest **victim building**: a victim lone shape or a victim connector (strict: both endpoints the
   victim's colour), whichever is nearer. This is the same rule as `structureTargets`;
3. else **the victim's castle** (marching on its anchor).

The strike reuses the shipped `CREATURE_ATTACK` arms (creature / bond / primitive / castle-in-reach), so the
damage stays on the ladder through `creatureAttackFifths`. Total order: squared distance, then id.

**Ownership** — monsters are owned by `MONSTER_OWNER_ID` (= 255), a sentinel that is NOT a seat. Every
player's towers, castle gun and units therefore see a monster as an enemy for free, because the enemy
predicates are all `owner !== me`. `applySpawnCreature`'s one-live-per-(owner, type) latch exempts the type.
That is the fifth summon it would otherwise have eaten.

**End of fight** — at the FIGHT→BUILD edge every live monster is removed (⚠ MINE).

## 4 · The build lock (from BUILD of wave 27)

`isBuildLocked(world) = world.waveNumber >= BUILD_LOCK_FROM_WAVE (27)`, a pure function of a hashed, synced field.

It is enforced in two layers:
1. **`dispatch`'s choke point**, as a third gate beside the bench and elimination gates:
   `ENDGAME_LOCK_INTENT_POLICY`, an exhaustive `Record` over EVERY client intent, each `'allow' | 'deny'`. Its
   test asserts set-equality with `CLIENT_INTENT_TYPES`, so a new intent forces a decision.
   - **deny**: `PLACE_PRIMITIVE`, `PLACE_FROM_FREE`, `BUILD_BLUEPRINT`, `PULL_FROM_BANK` (⚠ MINE, Q6).
   - **allow**: `REPAIR_STRUCTURE` (FIX — his self-correction), `SCRAP_STRUCTURE`, `FEED_TOWER` ("they can build
     more goblins"), gathering, upgrades, raids, sever, everything else.
2. **`canBuildNow`** ("the one question every build gate asks") refuses while locked. The drag ghost, the
   placement reducers and the bots therefore all agree, and nothing is promised that the host refuses.

**Mechanical enumeration guard.** A test scans `src/` (non-test) for every `world.bonds.set(` and
`world.primitives.set(` site. It pins the set to {`placePrimitive.ts`, `blueprintBuild.ts`, `structureRepair.ts`,
`save.ts`}, and names which lock layer covers each: two denied intents, FIX exempt, restore exempt. A new
bond-forming site fails the test until someone decides how the lock treats it.

**What keeps running:** towers keep emitting units, castles keep producing, gatherers keep gathering, FIX
works, upgrades work.

## 5 · After wave 31

⚠ MINE (Q2): when the wave counter reaches 32 (the edge after wave 31's fight), `tickGameState` crowns the
living seat with the highest banked score (tie → lower seat). It goes through the same `WIN_TRIGGER` as every
other win. Both peers derive it from `waveNumber`.

## 6 · The wave-26 draft: the last one, and the MRES slot

Wave 26 is draft index 5 ("level 25"). Its general tile cycles back to DEF; its racial tile is COMING SOON for
every race today. **R192-D1's queued MRES card belongs in this slot, and it is the magic branch's.** This branch
only guarantees that 26 is the LAST draft (`LAST_DRAFT_WAVE`). ⚠ Merge note: `draft.ts` is touched by both
branches (`isDraftWave`). The change here is one clause.

## 7 · Music

*"different music playing eventually"*. NOTED ONLY. Nothing is built. The natural hook is
`world.waveNumber >= 27` in `raceMusic.ts`.

## 8 · HUD cue

A banner derived each frame from synced state (`waveNumber`, `matchPhase`), never from a pushed effect:
- BUILD, wave ≥ 27: **"⛔ BUILD LOCKED — FIX ONLY · MONSTER WAVE N NEXT: K PANTS EACH"**
- FIGHT, wave 27–31: **"MONSTER WAVE · K PANTS PER PLAYER"**

The sound (`public/audio/endgame/pants-attack.ogg`, his mp3 converted) plays when the first monster of a fight
appears (it emerges) and on the monster's strike, both derived from state the renderer can see.

## 9 · Wire / hash / bump

| change | serialized | wire | wide hash | notes |
|---|---|---|---|---|
| `CreatureType` `'endgameMonster'` | yes (literal) | yes | `type` already hashed | **BUMP** — `deserializeCreature` has no type whitelist |
| `Creature.monsterSeat?: PlayerId` | additive-optional | yes (not trimmed) | `:ms` | four sites: union + projection + contribution test + save round-trip |
| `World.monsterWaveSpawned: number` | yes (omitted at 0) | yes | `mw` + `FIELD_COVERAGE` | resets at the FIGHT edge |
| build lock / draft cap / wave-32 end | rules | — | derived from `waveNumber` | run on EVERY peer (optimistic dispatch, `tickGameState`) |

**Verdict: BUMP 53 → 54.** It is the S186 test: a rule both peers run, plus a new serialized discriminant.
`PROTOCOL_VERSION` is NOT edited here; the merge owner takes it.
