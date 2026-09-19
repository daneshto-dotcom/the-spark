# BRANCH B — RETALIATION TARGETING

Branch `s183/retaliation` · base `fresh` (origin/master) · merge owner: the main S183 session.

---

## 1 · THE OWNER'S RULINGS, VERBATIM

> *"When a unit is attacked — let's say it's targeting a building, and then it is attacked, and it
> switches target to the targeted attack system. It makes sense. Most units, that is, unless it's
> like a pencil chewer, which only attacks buildings."*

**R183-A — IT DOES NOT GO BACK.** Asked whether a retaliating unit returns to what it was attacking:

> *"No. It won't go back to what it was attacking before. It goes back to the next target. So the
> closest target, you know, with its own like racial or character preferences. Remember, they all
> have slightly different preferences."*

So when the attacker dies or leaves, the unit **re-picks from scratch** through its normal targeting
rule. It does **not** restore the previous target.

**R183-B — THE PENCIL CHEWER NEVER RETALIATES.** *"Who never retaliates, pencil chewers, because
they only attack buildings."*

**R183-C — HELGA RETALIATES, INSIDE HER CONSTRAINT.**

> *"Helga, for example, if she's targeting pencil chewers or stuff like that that are attacking
> buildings around her, she will retarget whoever's targeting her. She has preferences. Helga only
> affects creatures — she doesn't attack towers, she's a defensive building — and she has
> preferences on who's attacking her."*

**R183-D — THE SUICIDE BOMBER DOES RETALIATE.** *"Suicide bomber retaliates. I mean, it's like one
or two shots. Yeah, of course he retaliates, but it'll probably blow up before you can change a
target. But whatever, yeah, he retaliates."*

⛔ **SO THE RULE IS NOT "BUILDINGS-ONLY ATTACKERS DO NOT RETALIATE."** That generalisation was put to
him and he overruled it: the bomber is buildings-first and retaliates anyway. **The pencil chewer is
a named exception, not an instance of a category.** Encode it as the exception it is.

---

## 2 · THE SEAM — AND THE TRAP IN IT

There is exactly **ONE** production call site of `damageCreature`: `src/state/damage.ts:155`, inside
`damageEntity`. That is the funnel.

⛔ **BUT THE ATTACKER'S IDENTITY IS NOT AVAILABLE THERE.** `damageEntity` takes
`source: DamageSource`, and `DamageSource` is a **category string**, not an id:

```ts
// damage.ts:105
export type DamageSource = 'creature' | 'defender' | 'player' | 'hazard' | 'aura';
// damage.ts:113
void source; // attribution only for now — see DamageSource
```

Its docblock says *"Who dealt it. Carried for attribution + future reward/threat rules; it
deliberately does NOT change the arithmetic today."* It tells you a creature hit you. It does not
tell you **which** creature. **This is the whole cost of the branch** — an earlier read of this
session wrongly concluded the attacker was already threaded through, and it is not.

`damageEntity` has **17 production call sites** (`grep -rn "damageEntity(" src --include=*.ts | grep -v
'\.test\.' | grep -v 'export function'`). The ones that genuinely know an attacker id:
`creatures/creatureAttack.ts` (×5, lines 189/301/378/423/483) · `creatures/voltkinChain.ts:235` ·
`castleGuns.ts:120` · `defenders/defenderLifecycle.ts:439` · `bossSkills.ts:203` · `world.ts:705`
and `:730` (the player's own raid). The remainder are internal re-dispatches inside `damage.ts`
(`:597`, `:612`, `:615`) which must forward whatever they were given.

⛔ **DO NOT MAKE THE PARAMETER OPTIONAL.** An optional `attackerId` means every existing call still
compiles and any path that forgets it silently never retaliates — a tolerant default, green tests,
dead feature. That is the exact S182 defect class: *"a new value propagated through every consumer
with an exhaustive switch, because those fail the build; the one consumer with a tolerant `default`
stayed silent."* Make it **required** so `tsc` enumerates the call sites for you, and pin the count
with a mechanical test.

## 3 · WHERE THE TARGET LIVES

`Creature` (`src/state/creatures/creature.ts:408`) carries **three parallel nullable target fields**,
each independently serialized and hashed: `targetBondId`, `targetCreatureId`, `targetPrimitiveId`.
There is **no** `lastAttackerId` / aggro field.

⭐ **PREFER WRITING THE EXISTING `targetCreatureId` OVER ADDING A FIELD.** A new field on a hashed
entity costs the FOUR SITES (factory + serialize + hash + worker) and probably a protocol bump; a
write into the existing one costs neither. ⚠ But read its contract first: it is documented as *"the
creature this one is zapping THIS attack cycle"* and is *"cleared on every SEEKING/ATTACKING/
DESPAWNING transition alongside `targetBondId`"* — so a naive write will be wiped by the next
transition. Decide deliberately and say which you chose and why.

---

## 4 · DETERMINISM — THE PART THAT WILL BITE

- ⛔ **MULTIPLE ATTACKERS IN ONE TICK MUST RESOLVE IN A TOTAL ORDER.** If two creatures strike the
  same victim on the same tick, "who it retaliates against" cannot be decided by `Map` iteration
  order. That is literally S155 N1, which *"handed one seat every melee exchange for a whole match"*.
  Squared distance alone is **not** a total order — it needs an explicit id compare.
- ⚠ `damageCreature` takes a **deferred-removal set** (`world.pendingCreatureDeaths`) precisely so a
  mutual exchange resolves simultaneously rather than by iteration order. Retaliation writes must
  not reintroduce order-dependence into that batch. Read the S155 N1 docblock at
  `creatureLifecycle.ts:494` before touching it.
- **No `Math.random`, no wall clock, no float accumulators.** Phase-spread by entity id.
- ⚠ **Ask whether this needs a `PROTOCOL_VERSION` bump.** If retaliation only *writes* existing
  synced fields from host-authoritative logic, it does not. If it adds a required serialized field,
  it does. Say which, with the reason. `PROTOCOL_VERSION` is **47** and lives in `src/net/protocol.ts`.
  ⛔ If you bump it, tell the merge owner loudly — branch A and C must not bump it independently.

## 5 · THE PREFERENCES ARE ALREADY THERE — READ, DO NOT INVENT

`src/state/creatures/creatureAI.ts` holds the targeting rules and the per-type preferences the owner
means by *"racial or character preferences"* — see the docblock at `:170` (*"Default, everything:
prefer units inside its radius. With no unit in radius, attack the…"*), `structureTargets` at `:203`,
`findNearestEnemyCreatureFrom` at `:524`, `killableDefenderInReach` at `:816`, and the
`targetsStructures` / `selfExplode` config flags. **R183-A's "re-pick by its own preferences" means
calling the existing pick, not writing a new one.**

Helga is a **defender**, not a creature: `DefenderKind = 'turret' | 'princess' | 'stinkTower'`
(`src/state/defenders/defender.ts:74`). Her targeting lives in `src/state/defenders/`. Per the canon
§5 she targets **units only, range 380** — R183-C must not let retaliation make her shoot a tower.

---

## 6 · TESTS OWED

- Each ruling as its own case: re-pick-not-return (A) · chewer never (B) · Helga within
  creatures-only (C) · bomber does (D).
- ⛔ **A determinism test with two attackers striking the same victim on the same tick**, asserting
  the same victim retaliates against the same attacker regardless of insertion order.
- A mechanical enumeration pinning the number of `damageEntity` call sites that supply an attacker,
  so a future call site cannot be added without deciding.
- If `hashWorldStateFull` is touched at all: the `…Hashed` union, the hand-written string projection,
  **and** the per-field contribution test — the union alone only silences the compiler.

## 7 · GATES

⛔ Read every exit code from a **captured `$?`**. Never a pipe, never the wrapper's
`[exited with code 0]`.

`npm run typecheck` · `npx vitest run` (5240 / 319 on master) · `npm run build` (charter 875.0 / 1000
KiB, **125.0 KiB headroom SHARED with two other branches**) · `npm run e2e:gating`.

## 8 · FILE BOUNDARY — nothing outside this list

`src/state/damage.ts` · `src/state/creatures/**` · `src/state/defenders/**` · `src/state/bossSkills.ts`
· `src/state/castleGuns.ts` · `src/state/world.ts` (the two raid call sites ONLY) · their tests.

⛔ Do NOT edit `SPARK_CANON.md`, `CLAUDE.md`, `playwright.config.ts`, `src/ci.e2eLanes.test.ts`, or
any renderer. Branch A owns `src/render/structureRamp*`, `spawnerZoneRenderer`, `towerCover`; branch C
owns `characterSheet.ts`, `arcadeLeaderboard.ts`, `server/`, `structureRepair.ts`.

⛔ **DO ONLY THIS. Do not refactor, do not tidy, do not fix unrelated things you notice** — report
them instead.
