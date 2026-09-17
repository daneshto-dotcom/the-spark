# BRANCH 4 — `s182/damage-truth`

Four items. Every number the player reads should be true, and one of them is currently Voltkin's.

---

## ITEM 1 ⛔ — THE ZOMBIE BOSS SOUNDS AND LOOKS LIKE VOLTKIN

> *"Why does my fucking zombie boss have Voltkin music and electric beams going through towers and
> connectors? How does that make sense? You made his tags or his aura or something connected with the
> Voltkin."*

He is right, and it is **one stale predicate producing three symptoms**. Found by two independent
agents that agreed completely.

### The root cause

`src/state/creatures/creatureAttack.ts:499` — `const isChewer = creature.type === 'chewer'`.
Then in the **bond-strike arm**, `:569` — `if (!isChewer) { … ARC_FLASH … }`.

*"Not a chewer"* meant *"is the Voltkin"* when it was written at S102, because **Voltkin and the
chewer were the only two creatures that could ever touch a connector.**

⛔ **S181's targeting rework (`4b66ade`) broke that assumption.** It set
`creature.targetBondId = st.bondId` for every `targetsStructures` creature — **all 21 goblin / race /
tier-3 types AND all six tier-9 bosses.** They all now reach the arm, and they all emit Voltkin's
signature.

### Three symptoms, one block

| | site | what the owner sees |
|---|---|---|
| **VISUAL** | `creatureAttack.ts:569-578` pushes `ARC_FLASH` (`start: creature.pos`, `end: bondMidpoint`) | `src/render/effects/arcFlash.ts` paints a jittered polyline — corona `0x33aacc`, halo `0x66dddd`, core `0xeaffff`, plus a 14-ray spark burst. **That is exactly the cyan/white bolt in his screenshot**, drawn from the boss's feet to the connector. `arcFlash.ts` is the ONLY file in `src/` using those three colours. |
| **AUDIO** | `creatureAttack.ts:556` emits `BOND_SEVERED` with `cause: 'creature'`; `audioManager.ts:1610` plays `/godly/voltkin/audio/lightning-crackle.ogg` on that cause and ducks music 700 ms | his "Voltkin music" |
| **SHAKE** | `src/main.ts:2966` (host) and `:3071` (client) derive a screen shake from the same emit | ⭐ **a third symptom he has not reported yet** |

⚠ Note the chewer got its **own** audio arm later (`cause === 'chewer'`, a beaver gnaw). **One cause
was split out and every other creature was left in Voltkin's bucket** — the four-sites pattern again.

### ⚠ HONEST CORRECTION TO THE OWNER'S PREMISE — TELL HIM THIS

**There is no Voltkin music track, and nothing swaps the music.** The only music assets in the repo
are `blue-steppe-orbit.ogg`, the six race covers, `nonet-theme.ogg` and `helga-theme.ogg`
(`raceMusic.ts:30/37`, `audioManager.ts:584/738`). What he is hearing is **the crackle firing
repeatedly over a music bed that ducks 700 ms on every strike** — which reads as "Voltkin music".
Fixing the cause fixes the perception; do not go hunting for a track swap.

### ⭐ THIS IS THE SEVENTH DEFECT OF THE SAME S181 REWORK

`src/render/s181Regressions.test.ts` already guards **six**, and its header names the shape exactly:
*"a rule applied at some of its sites and not the rest."* Its R1 is the suicide bomber breaking for
the **identical** reason — `structureTargets` handed a structure-attacker a bond and a downstream arm
was not ready for it. **Add your guards to that file. It is the right home.**

⭐ And note `creatureAttack.ts:216` — the creature-vs-creature ARC_FLASH arm — **was already fixed to
`creature.type === 'voltkin'` by S154 P2**, with a docblock explaining this exact bug class.
**S154 fixed one of the two arms and left the other.** You are applying the same fix to its sibling.

### TWO MORE LEAKS OF THE SAME CLAUSE — FIX THEM IN THIS COMMIT

- ⛔ **`state/creatures/suicideBlast.ts:155`** — the suicide goblin's blast dispatches
  `SEVER_BOND{cause:'creature'}`, so **an EXPLOSION plays the Voltkin lightning crackle.** Separate
  producer, same wrong sound. Found only by enumerating the clause rather than the files.
- ⚠ **`state/creatures/creatureLifecycle.ts:796`** — LATENT. `CREATURE_CHARGE` (the Voltkin
  charge-up whine) is gated on `!config.chewsConnectors`, which is **true for the boss**. It is
  masked today only by `attackChargeEngageTick: 0` (`voltkin-config.ts:919`) against a post-increment
  `ticksInState >= 1`. **It fires the day any unit is given a nonzero charge tick.** Fix or guard it
  now, with a test, or it becomes a future session's bug report.

### RULED OUT — do not re-investigate these

`render/bossAuras.ts:105-110` (keyed on exact boss type, no index or Map-order dependency;
`drawRotAura` draws green bubbles and no arcs) · `state/creatures/voltkinChain.ts` (both call sites
gated on `type === 'voltkin'`) · `render/creatureRenderer.ts:475-477,604` (filtered to voltkin +
lightningDrone) · the Voltkin cinematic (only `kind:'cinematic'` recipes play it; tier-9 boss towers
are SPAWNER recipes) · `state/droneLifecycle.ts:222` (ARC_FLASH on drone detonation is correct — the
drone *is* electric).

⛔ **DO NOT REVERT `hostTick.ts:1461`** (`creature.targetBondId = st.bondId`, commit `4b66ade`). That
is the owner's S181 ruling and reverting it re-breaks *"everything marches past every building"*.

### The fix

**(1) VISUAL — ship this alone, first, as its own commit.** It is ~90% of the complaint and the owner
should see it immediately.

`creatureAttack.ts:569`: `if (!isChewer) {` → `if (creature.type === 'voltkin') {`

Keyed on **identity, not on a negation** — the exact shape S154 P2 already used on the sibling
creature arm, whose docblock says it in as many words: *"KEYED ON THE TYPE, DELIBERATELY … The arc IS
Voltkin's signature; naming it says so."* Read that docblock and match it.

This alone kills the bolt **and** the screen shake for all 21 unit types and all 6 bosses.
No wire change, no bump — `world.effects` is `'acknowledged'` in `stateHashFull.ts:185`, deliberately
not hashed. `creatureAttack.test.ts:135` stays green because its fixture uses `makeVoltkinCreature`.

**(2) AUDIO.** The crackle is keyed on `cause`, and `cause` is **serialized**, so this half is not
free. The cheapest correct shape: give a non-Voltkin, non-chewer attacker a cause that is not
`'creature'`, and route `audioManager.ts:1610` on identity rather than on the catch-all.

⚠ **A new `cause` discriminant value on an existing action earns a `PROTOCOL_VERSION` bump**
(`SPARK_CANON §6`, `protocol.ts`). Check whether the union already carries a value you can reuse
before adding one. If a bump is needed, say so loudly in your report — it is a real cost and the
owner should know it was earned rather than assumed.

⛔ **ENUMERATE THE SIBLING SITES.** `!isChewer` and `cause: 'creature'` may not be the only stale
negations in that file. grep both clauses across `src/` before you claim it is fixed.

**Tests owed:** a source-text tripwire that the guard names `'voltkin'` (not a negation); a test that
a goblin/boss bond-strike emits **no** `ARC_FLASH`; a test that Voltkin still does; and the same pair
for the audio cause. **Behaviour tests alone will not catch a regression here — the failure mode is
unreached code.**

---

## ITEM 2 — THE REMAINDER CAP ON THE OTHER POOLS

The owner has reported this class **twice**. When a hit kills something, the damage number shows what
the victim had **left**, not the swing that killed it.

Creatures were fixed in S181. **Three pools still lie** — not four; the handoff's count is wrong and
its own prose enumerates three.

`src/render/damageNumbers.ts` `syncStructures()` makes five `track()` calls; only three pass
`deathOnVanish: true`:

| pool | site | prints |
|---|---|---|
| shapes | `:637` | 70 in a structure, 5 lone |
| defenders | `:658` | **Helga only** — `:657` skips `d.ehp === null`, and `unitStats` is non-null for exactly one kind (156 fifths) |
| landed bags | `:663` | 5 |

Connectors (`:648`) and castles (`:675`) pass `false`, both correctly.

### The fix

**One** new host-local per-frame array is enough for all three, because `damageEntity`
(`src/state/damage.ts:107`) is the single host-side choke point — every downward write to `prim.hp`
(`:166`), `cloud.ehp` (`:201`) and `defender.ehp` (`:230`) lives inside it.

Follow the two existing precedents exactly — this is the same device a **third** time:
- `world.connectorBreakHits` (S179): declared `worldTypes.ts:187`, pushed `damage.ts:365`, consumed
  `damageNumbers.ts:613-621`, `'acknowledged'` at `stateHashFull.ts:193`.
- `world.creatureKillHits` (S181): declared `worldTypes.ts:210`, pushed
  `creatureLifecycle.ts:578`, consumed via `takeKillHitNear` (`damageNumbers.ts:221`), with
  `fatalBlowFifths` (`:239`) as the peer fallback.

Carry the **watch key** (`p:<id>` / `d:<id>` / `s:<id>`), not a position.

### ⛔ THE FOUR-SITES CHECKLIST — A NEW ARRAY NEEDS EVERY ONE

| what | where |
|---|---|
| type declaration | `worldTypes.ts:211` |
| factory init | `world.ts:402` |
| hash `'acknowledged'` | `stateHashFull.ts:195` |
| hash allowlist literal | `stateHashFull.test.ts:441` — an unlisted World key fails the exhaustiveness test |
| wipe 1 | `gameMode.ts:433` |
| wipe 2 | `gameState.ts:236` |
| wipe 3 | `save.ts:1563` |
| wipe 4 (consumer) | `damageNumbers.ts:564` |
| ⛔ **wipe 5** | **`workerSim.ts:540` wipes ONLY `world.effects`** — grep confirms `razedNotKilled`, `connectorBreakHits` and `creatureKillHits` are **all unwiped there**. In `?worker=1` they grow for the whole match. **This is a live leak today and your array must not join it.** |

### Ship these with it — same sweep, same class

- **Expiring bags print a phantom number.** `sweepExpiredStinkClouds` (`stinkCloud.ts:144`) deletes on
  lifetime with `ehp` untouched → the sweep prints "5" for a blow nobody landed. Needs the
  `razedNotKilled` treatment.
- **A destroyed Helga prints a phantom 156.** `damage.ts:429` `destroyDefender` removes her on
  recipe/anchor break — no damage, no equivalent guard.
- **Nine mid-match `.clear()` paths have no renderer equivalent** — `godlyActions.ts:123/134`,
  `gameMode.ts:241/250/426/488/497`. `DamageNumbers` has **no `watchedStruct.clear()` anywhere**.

---

## ITEM 3 — NO DAMAGE NUMBERS ON SCRAP

Ruled, design settled, ~20 minutes. Scrapping your own building currently pops damage numbers as
though it were attacked. Same sweep as Item 2 — do them together.

---

## ITEM 4 — `DEFENDER_TARGETS.turret` → `UNITS_ONLY`

`src/state/stats.ts:451` says `turret: BOTH`. The beam has only ever damaged creatures.

**The owner retired R72's turret clause in S180**, reading the targeting table:
> *"Yeah, laser turrets, creatures only. That's fine… maybe it doesn't do both. It does only
> creatures, so that's fine."*

⭐ **It has NO production consumer.** Repo-wide, `defenderCanTarget` / `DEFENDER_TARGETS` appear in
exactly two files: `stats.ts` and `stats.test.ts`. **Changing it cannot alter behaviour** — it is a
truth fix, so no future session "implements" a ruling he retired.

Replace the JSDoc at `:450` with the S180 verbatim and its date, and rewrite the `⚠` paragraph at
`:441-446` — keep the history, invert the conclusion.

⚠ **Also correct the four docs that repeat the stale claim:** `boot-snapshot.md:39`,
`HANDOFF_S181_2026-09-17.md:99` and `:113`, `S165_OPEN_ITEMS.md:40`. ⛔ And note `SPARK_CANON.md §5`
already says "Laser turret: creatures only" — so **canon and code agree and only the table is wrong.**

---

## GATES

`typecheck` · `vitest` · `build` · **`e2e:gating` — required, this touches the sim.**

## FILE BOUNDARY

**Yours:** `render/damageNumbers.ts` · `state/damage.ts` · `state/worldTypes.ts` · `state/world.ts` ·
`state/stateHashFull.ts` · `state/gameMode.ts` · `state/gameState.ts` · `state/workerSim.ts` ·
`state/defenders/stinkCloud.ts` · `state/godlyActions.ts` · `state/stats.ts` ·
`state/creatures/creatureAttack.ts` · `render/audioManager.ts` · `render/effects/arcFlash.ts`

⚠ `src/state/save.ts` is shared with branch 1 — **you own the `applySnapshot` wipe sites only**, they
own `netSnapshot()`. ⚠ `src/main.ts:2966` / `:3071` (shake) is shared with 2 and 5 — append only.

## REPORT BACK

Whether the audio half needed a `PROTOCOL_VERSION` bump and why; the full site list you enumerated for
`!isChewer` and `cause: 'creature'`; and whether the `workerSim.ts:540` leak was fixed for the three
existing arrays or only avoided for yours.
