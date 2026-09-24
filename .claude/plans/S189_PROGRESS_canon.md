# S189 P10 — `s188/canon` progress (worktree agent; the main session is the MERGE OWNER)

Branch `s188/canon`, forked at `2703365`, S188 canon TEXT at `615856e`. Lands LAST (train E): this
branch pins what is already true on master now, so train E is only the deltas.

## Messages received

- The dispatch brief (two phases).
- ✅ **"TRIAGE LANDED"** (CANON-1…10) — it DID reach this agent, before the spend-limit kill.
- ✅ "RESUME" after the spend-limit kill. Branch was unchanged at `615856e`; nothing was lost.

## PHASE 1 — the claim table (every number / "the code does X" claim in `git diff 2703365 615856e -- SPARK_CANON.md`, checked against MASTER `2d4391a`)

| # | claim (section) | constant / code on master | verdict |
|---|---|---|---|
| 1 | §3 bought stats HP/ATK/DEF/PEN, 100 VP, 10 per axis | `CASTLE_STATS`, `CASTLE_UPGRADE_PRICE` 100 (`castleUpgrades.ts:53`), `CASTLE_UPGRADE_MAX_LEVEL` 10 (`:59`) | MATCH |
| 2 | §3d level 0 = draft index 0, level 5 = index 1 | `draftIndexForWave` (`draft.ts:87`) | MATCH |
| 3 | §3d general track HP→DEF→ATK→PEN, cycling (wrap MINE) | `GENERAL_TRACK` (`draft.ts:102`), `generalPickForWave` | MATCH |
| 4 | §3d "+10 % of the ladder number" on every general axis | `DRAFT_BUFF_PCT` 10 (`draft.ts:68`); ONLY `draftedPoolFifths` has a production caller (`creature.ts:915`). `draftedAttackFifths` has NONE | **MISMATCH (CANON-3)** — ATK/PEN picks are recorded but reach no strike. s188/draft-atk fixes it (train D) |
| 5 | §3d panel 559 × 270, tiles 251 × 242 | `PANEL_H`/`PANEL_W` (`draftOverlay.ts:91/93`), `generalTileRect()` | MATCH |
| 6 | §3d racial tile choosable iff `draftOptionsFor(...).racial` names a perk (`RACIAL_PERK_BUILT`) | `draftOptionsFor` (`draftEvent.ts:219`), `racialPerkFor` | MATCH |
| 7 | §3d a pick not offered is refused | `pickIsOffered` (`draftEvent.ts:124`), `applyDraftChoice` (`:168`) | MATCH |
| 8 | §3d a racial pick buffs no ladder stat | `isPoolPick`/`isDamagePick` (`draft.ts:121/126`) | MATCH (⚠ the "R104" label is a session reading — R104 is the no-overlap rule, `SPARK_RACES_SPEC.md:608`) |
| 9 | §3d `autoPickFor` returns `'racial'` whenever a perk is on offer; bots via the same deadline | `autoPickFor` (`draftEvent.ts:109`), `tickDraft` | MATCH |
| 10 | §3d `DraftPick = GeneralPick \| 'racial'`; `seatHoldsPerk` checks race | `draft.ts:52`, `racialPerks.ts` `seatHoldsPerk` | MATCH |
| 11 | §3d 16 cards, lazily fetched; `drawAxisGlyph` deleted; `l10-vampires` not shipped | `public/art/upgrade-cards/` = 16 files; `upgradeCardUrl`; `draftOverlay.test.ts:363` | MATCH (train E: swarm → 18) |
| 12 | §3d four castle rows under REGEN in order HP, ATK, DEF, PEN | `CASTLE_ROW_KEYS` (`castlePanel.ts:640`) | MATCH |
| 13 | §3d disabled reasons NEED 100 · MAX · LOCKED · CASTLE LOST · NOT YOURS | `castlePanel.ts:753-764` | MATCH |
| 14 | §3d one ATK point: 40 → 48 | `castleShotFifthsFor` (`castleUpgrades.ts:166`) | MATCH |
| 15 | §3d an HP buy heals by the baked gain, capped, never a fallen keep | `applyUpgradeCastleStat` (`castleUpgrades.ts:232`) | MATCH |
| 16 | §3d absent `castleHp` = the seat's upgraded ceiling | `save.ts:1940` `castleMaxHpFor` | MATCH |
| 17 | §3d rematch resets every bought stat | `gameMode.ts:210-211` | MATCH |
| 18 | §3d regen = % of the flat base pool (MINE) | `castleRegenPerSecond` (`castleRegen.ts:82`) | MATCH on master (train E: s189/units → upgraded max; CANON-5 owner question) |
| 19 | §3d `RACIAL_PERKS_BY_RACE` holds exactly two perks per race; levels 10+ COMING SOON | `racialPerks.ts` | MATCH (train E: wrath + swarm) |
| 20 | §3d `racialPerkFor(race, draftIndex)` cannot express the mummies L10 fork | signature in `racialPerks.ts` | MATCH (train E: wrath) |
| 21 | §3e BLOOD DEBT 20 % | `BLOOD_DEBT_LIFESTEAL_PCT` (`lifesteal.ts:69`) | MATCH — ⚠ the coverage ("every creature the seat owns", which hits count) is S188 PDR §2's "my calls" column, not flagged MINE |
| 22 | §3e CRIMSON TIDE 50 %, replaces 20 | `CRIMSON_TIDE_LIFESTEAL_PCT` (`:72`), `lifestealPctFor` | MATCH |
| 23 | §3e THE RISEN pool 6 = `unitPoolFifths(RACE_UNIT_HP, RACE_UNIT_DEF)` | `constants.ts:1733-1734`; `isZombieRacialType` | MATCH (before draft buffs — it spawns through the castle emitter) |
| 24 | §3e CORPSE EATER 20 / 480 / 100 / 60 px | `corpseEater.ts:74/77/80/87` | MATCH — **missing**: the knock-back re-anchor (deploy #2 F1) and the whistle cut (F5) |
| 25 | §3e POWER OF RA 5 columns / 120 ticks / 300 fifths / 70 px | `constants.ts:3091/3094/3117`, `RA_STRIKE_FIFTHS` (`powerOfRa.ts:64`) = `attackFifths(15, 15)` | MATCH |
| 26 | §3e "the host rounds the aim to integers and clamps it to the canvas" | `raAimPoint` (`powerOfRaRules.ts:140`) returns `null` off-canvas / non-finite / non-number | **MISMATCH (CANON-6)** — REFUSED off-canvas; rounded on it |
| 27 | §3e ENDLESS DYNASTY 1000 / sentinel 40 | `endlessDynasty.ts:45/51` | MATCH |
| 28 | §3e BLOOD FRENZY ×2; source below `WARLORD_RAGE_TRIGGER_PCT` | `constants.ts:3158-3159`, `isFrenzySource`, `isOrcRacialCreatureType` | MATCH |
| 29 | §3e HORDE 20 goblins / ×2 → every 15 s | `hordeGrows.ts:35/38`, `RACE_UNIT_EMIT_INTERVAL_TICKS` 30 s | MATCH — **dropped**: the LOAD-BEARING ceiling warning (CANON-4) |
| 30 | §3e SCORCHED GROUND 20 ‰ vs aura 25 ‰ | `scorchedGround.ts:48`, `constants.ts:2860` | MATCH — **missing**: a fallen seat's land stops burning (F4); ⚠ "50 s exact for any undrafted unit" is imprecise (the interval rounds) |
| 31 | §3e HELLSPAWN 2 / 100·50·25 / gen 2; pool 5→2→1, bite 7→3→1; ≤ 6 descendants | `hellspawn.ts:60/63/66`, chewer 1/0/1/2 | MATCH |
| 32 | §3e DEEP CURRENT one-tick-late snap | `deepCurrentSnap` (`deepCurrent.ts`) | MATCH |
| 33 | §3e APEX ×3 → 9/0/6/3; sprite ×2; pool 15→45, bite 12→48 | `voltkin-config.ts:874`, `T3_STATS.piranha` 3/0/2/1, `towerFrames.ts:191` | MATCH |
| 34 | §3e rage: cadence 60→30, fire 30→15 via `ragedFireTick` | `GOBLIN_ATTACK_*` (`constants.ts:3426-3427`), `creature.ts:137` | MATCH — **missing**: the per-cycle latch `attackCycleRaged` (F3) |
| 35 | §3e lifesteal at the two funnels, `max(1, floor(hit×pct/100))`, capped, 20 → 4 | `damage.ts:203…433`, `lifestealFifths` | MATCH — **missing**: the strike-batch sum (F1) |
| 36 | §6 "WHAT RIDES 50" | `protocol.ts:762-791` | MATCH against the docblock — but master also carries `Creature.attackCycleRaged` (serialized `save.ts`, hashed `stateHashFull.ts`) which the DOCBLOCK omits too (CANON-2) |

### MINE / contradiction flags (session readings not marked MINE)
- BLOOD DEBT coverage; THE RISEN's killer set; HELLSPAWN "every chewer the seat owns" — all S188 PDR §2 "my calls".
- CORPSE EATER "overkill included" — `corpseEater.ts:237` calls it *"the brief's reading"*; the canon presented it as his quote. The clock running through a stun is MINE too.
- ENDLESS DYNASTY: a fallen keep raises nobody — MINE.
- POWER OF RA: columns already called still land after the caster's castle falls; a cut connector plays the player-sever SFX once per connector (`cause: 'raid'`) — both MINE, the second *"the owner's to judge"*.
- The "R104" label on "a racial pick buffs no stat" is a session's extension of R104 (the no-overlap rule).

## PENDING — train-E deltas (NOT written here; they land when their branch merges)

- **wrath** (`s188/wrath`): `Player.raStrike` → `raStrikes`, 3 casts per FIGHT at L10, the L10 tile live for a seat that took POWER OF RA; `racialPerkFor` widened; the §3d NOT-BUILT row moves; §6's field list.
- **swarm** (`s188/swarm`): `t3BatSwarm` at ×6 (its constant + assertion); the `l10-vampires` card; the card registry 16 → **18**; THE SWARM row leaves the NOT-BUILT table; "exactly two perks per race" changes (the registry test below turns RED on purpose).
- **draft-atk** (`s188/draft-atk`, train D): drafted ATK/PEN reach strikes → §3d's PENDING line becomes live; HELLSPAWN/elite bite numbers on the cards.
- **units** (`s189/units`): Kraken knockback/stun; castle regen reads the upgraded max (§3 + §3d regen row); `nextCreatureId` re-derived on restore.
- **weld** (`s189/weld`): welding onto a tower (§7b).
- **net** (`s189/net`): the quickmatch seat.
- **ra-vfx**, **input-layer**: re-read at train E for any canon-visible claim.
- **PROTOCOL 50 → 51/52**: §6's version sentence and `canon.test.ts`'s `PROTOCOL_VERSION` pin — the MERGE OWNER re-pins those on master; this branch does not touch either.

## Owner questions (reported, not decided)
- CANON-5: castle regen as a % of the BASE pool vs the upgraded ceiling (s189/units is moving it to the ceiling).
- CANON-10: §6 codifies "the twelve racial rules" as a reason for 50, while deploy #2 changed three of those rules (lifesteal batch, rage latch, fallen-demon burn) and added `attackCycleRaged` without leaving 50.

## PHASE 2 — step log

(each step = one commit; this file is updated in every commit)
- **Step 1 — merge `master` (`2d4391a`) into `s188/canon`.** Clean (exit 0): master had not touched
  `SPARK_CANON.md` or `src/canon.test.ts` since `2703365`, so the branch's canon text now sits on the
  deploy-#2 code. Gates are run on this merged tree in step 2, before any canon edit.
- **Step 2 — baseline gates on the merged tree, then pin §3d's S188 text.** Baseline: typecheck
  exit 0; `npx vitest run --maxWorkers=6` exit 0 (5996 tests / 367 files; the
  `[net] LOBBY_PRESENCE broadcast failed` line in its log is a test's own logged path, benign — exit
  0, zero failures); `src/canon.test.ts` alone exit 0 (39). Then four new cases, no canon text
  change needed (every needle already matched master): level 0/5 + the general track + the offer
  (`pickIsOffered`, `autoPickFor`, `isPoolPick`/`isDamagePick` on `'racial'`) · the panel geometry
  (`PANEL_W × PANEL_H`, the two equal tiles) · the four castle buttons (order off `CASTLE_ROW_KEYS`,
  price, cap, every disabled reason off `castlePanel.ts`, 40 → 48 off `castleShotFifthsFor`) · the
  HP purchase through the real `applyUpgradeCastleStat`, the fallen-keep refusal, the wire default
  and the rematch reset order. Canon test exit 0 (43), typecheck exit 0.
- **Step 3 — §3e: every table number pinned; CANON-4, CANON-6, and the 50-s imprecision.** Six new
  cases, one per race pair, each reading its numbers off the constants (`BLOOD_DEBT_…`, `CORPSE_EATER_…`,
  `RA_…`, `DYNASTY_…`, `WARLORD_…`, `HORDE_…`, `SCORCHED_…`, `HELLSPAWN_…`, `APEX_…`) and the rule
  functions (`lifestealPctFor`, `isZombieRacialType`, `isOrcRacialCreatureType` over every goblin type,
  `raAimPoint`, `pharaohsOwed`, `dotIntervalTicks`, `hellspawnChildPool`/`hellspawnStrikeFifths`,
  `T3_PIRANHA_ELITE_STATS`). Canon text corrected: **CANON-6** Ra's aim is REFUSED off the canvas, not
  clamped (`raAimPoint` returns null; test asserts the old wording is gone) · MINE added where a session
  read his words — BLOOD DEBT's coverage, THE RISEN's killer set, CORPSE EATER's overkill heal (the
  brief's reading, per `corpseEater.ts`) and its stun-proof clock, Ra's called-columns-land and the
  `'raid'` sever sound (his to judge), DYNASTY's fallen keep, HELLSPAWN's "every chewer", the "R104"
  label · **CANON-4** the goblin ceiling is LOAD-BEARING restored (every `goblin*` config asserted
  `persistent`) · SCORCHED GROUND: "50 s exact for an undrafted unit" was imprecise — the interval
  rounds (a 260-fifth boss burns in 52 s; asserted). Canon test exit 0 (49), typecheck exit 0; markers
  byte-checked (⛔ 65→66, ⚠ 61→65, ⭐ 68, no mojibake).
