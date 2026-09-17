# SPARK — THE PRIORITY LIST, S182

Written for a **parallel-worktree session split**. He asked for the whole backlog so he can assign
priorities to separate sessions, each on its own branch, with the main session merging at the end.

Every line is marked **VERIFIED S182** (an agent read the code AND an adversarial pass re-checked it,
or I ran it by hand) or **CARRIED** (from a prior session's notes, not re-checked). 14 agents,
7 lanes, recon + refute each; every recon came back wrong about something, which is why the refute
round is in the method and not an optional extra.

Gates at the time of writing: `typecheck` **0** · `vitest` **4702 / 301 files, exit 0** ·
`build` **0** (852.2 KiB used, **147.8 KiB headroom** under the 1000 KiB charter) ·
master `6713dec`, clean.

---

## 0 · ⛔⛔ THE BACKLOG WAS WRONG. READ THIS BEFORE ASSIGNING ANYTHING.

| claim in the backlog | what the tree says |
|---|---|
| **#10 CONNECTOR HIDING — "specified across three sessions, still absent. VERIFIED absent."** | ⛔ **IT SHIPPED IN S175.** `src/render/towerCover.ts`, 210 lines, commit `b10e772`, never reverted, imported at `main.ts:142`, **11 tests, exit 0 — I ran them.** The "VERIFIED absent" line was written **four days after the feature shipped**; the verification never happened. **Do not assign this. It is done.** |
| **Remainder cap: "four other pools"** | **THREE.** `syncStructures()` makes five `track()` calls; only shapes, defenders and bags pass `deathOnVanish:true`. Connectors and castles pass `false`, both correctly. The handoff's own prose lists three while its number says four. |
| **"defenders" print the remainder** | **HELGA ONLY.** Line 657 skips `d.ehp === null`, and `unitStats` is non-null for exactly one kind. Turret and stink tower are never watched. |
| **Portraits: "Helga's HUB — art exists but unwired"** | ⛔ **NO ART EXISTS for the hub building.** `helga-atlas.png` is Helga *the character*, and she is **already wired** (`main.ts:1051`). The hub is art debt, not a wiring job. |
| **Voltkin TV: "register a spawner"** | ⛔ **THAT IS A SIM, ECONOMY AND WORLD-HASH CHANGE, NOT A CLICK FIX.** `world.creatureSpawners` has **70 production references across 29 files** — passive income (`scoring.ts:170`), hash (`stateHashFull.ts:83 'hashed'`), kill rewards, the emit poll, the wire. The click fix is a **read-only hit test** and touches none of it. |
| **`DEFENDER_TARGETS.turret` — "R72 said BOTH, code disagrees"** | **He retired the turret clause in S180**, reading the targeting table: *"Yeah, laser turrets, creatures only. That's fine… maybe it doesn't do both. It does only creatures, so that's fine."* The **beam was right all along**; the table is the thing that is wrong. And it has **no production consumer** — changing it cannot alter behaviour. |
| **Stat board "researched and costed in S180"** | The research landed in **S179**. S180 re-ran it at 1.78M subagent tokens and compressed the result. No v1 design document exists. |
| **`CLAUDE.md`: bundle cap 900 KiB, 65.9 KiB headroom** | **1000 KiB since S180.** Measured S182: 852.2 used, **147.8 free**. Fixed in `6713dec`. |

⭐ **THE PATTERN, AND IT IS THE SAME ONE THAT BIT S181 FIVE TIMES:** none of these were hidden. Every
one was findable by reading the file the claim was about. The backlog is not a source of truth; it is
a list of things somebody believed once.

---

## 1 · ⛔ NEW DEFECTS THIS RECON FOUND — nobody had these on a list

| # | defect | evidence | severity |
|---|---|---|---|
| **N1** | **`?worker=1` leaks three per-frame arrays for the whole match.** `workerSim.ts:540` wipes `effects` and nothing else. `razedNotKilled`, `connectorBreakHits` and `creatureKillHits` grow unbounded inside the worker's world. | grep for all three in `workerSim.ts` returns **zero** hits | **MEDIUM** — live today behind the `?worker=1` opt-in |
| **N2** | **An expiring stink bag prints a phantom damage number.** `sweepExpiredStinkClouds` (`stinkCloud.ts:144`) deletes on lifetime with `ehp` untouched, so the vanish sweep prints "5" for a blow nobody landed. | same class as the S179 bug he reported | **MEDIUM** |
| **N3** | **A destroyed Helga prints a phantom 156.** `destroyDefender` (`damage.ts:429`) removes her when her anchor/recipe breaks — no damage, no `razedNotKilled` equivalent. | same class | **MEDIUM** |
| **N4** | **Nine mid-match `.clear()` paths have no renderer equivalent** — `godlyActions.ts:123/134`, `gameMode.ts:241/250/426/488/497`. Each wipes a watched family mid-match; every entry then prints its remainder at once. | `DamageNumbers` has **no `watchedStruct.clear()` anywhere** | **MEDIUM** |
| **N5** | **A dying Voltkin TV is on screen with no hit box.** The ghost/dying draw loop (`voltkinTowerRenderer.ts:595-617`) keeps drawing for up to `TV_DESTRUCTION_TICKS` after the chain stops resolving. | | LOW |
| **N6** | **Four source files still compute from the old castle 1500.** `castleRegen.ts:28` states "15/18/21/24/27 HP exactly" — wrong at 2500 (it is 25/30/35/40/45). ⭐ **Checked: the balance did NOT silently change** — the percentages preserve the ratio exactly. Doc rot only. | `CASTLE_MAX_HP = 2500` at `constants.ts:1911` | LOW |
| **N7** | **`UNIT_STAT_TABLE.md` is ~3× wrong on every boss.** It lists Vlad at pool 90; the code says **260**. `BOSS_STATS_TABLE.md` is correct. Two tables, one wrong, nothing catches it. | canon §8 names this exact rot | LOW |

---

## 2 · ⭐ READY TO BUILD — nothing blocked, ordered by his own stated priority

| # | priority | size | files (collision group) |
|---|---|---|---|
| **P1** | **REMAINDER CAP — the other three pools.** He has reported this class **twice**. One new host-local `structKillHits` array carrying the WATCH KEY; `damageEntity` (`damage.ts:107`) is the single host-side choke point for all three. ⛔ Ship N2+N3+N4 with it — they are the same sweep and fixing one arm leaves him seeing the bug. | **MEDIUM** | **[DMG]** `damageNumbers.ts` · `damage.ts` · `worldTypes.ts` · `world.ts` · `stateHashFull.ts` · `gameMode.ts` · `gameState.ts` · `save.ts` · `workerSim.ts` · `stinkCloud.ts` |
| **P2** | **`DEFENDER_TARGETS.turret` → `UNITS_ONLY`.** His S180 ruling; the beam already behaves this way. **No production consumer**, so zero behaviour change — it is a truth fix. Also correct the four docs that repeat the stale claim. | **TINY** | **[STATS]** `stats.ts` · `stats.test.ts` + docs |
| **P3** | **PORTRAITS — five placeholder cases, not three.** The bag (art exists, pure wiring) and the Voltkin creature are real wiring jobs. Helga's **hub** and the four procedural buildings are **art debt** — the honest answer is the codex emblem, and `characterSheet.ts:612` currently shows a literal `…` instead. | **MEDIUM** | **[SHEET]** `characterSheet.ts` · `characterSheetModel.ts` · `main.ts` · `stinkCloudRenderer.ts` |
| **P4** | **VOLTKIN TV CLICKABLE — as a read-only hit test.** New pure module mirroring what the renderer already draws; `TV_ART_PX` **moved, not copied**. ⛔ Must honour the same gates the renderer does — fog (`:474`), `manifest === null`, and the per-row foot offset — or the hit box disagrees with the art. | **SMALL** | **[TV]** new `voltkinTvFrames.ts` · `controls.ts` · `voltkinTowerRenderer.ts` |
| **P5** | **DOC TRUTH PASS.** Kill the connector-hiding false claim in 4 docs; add `towerCover` to the canon **with its constant and a `canon.test.ts` assertion in the same commit**; fix `UNIT_STAT_TABLE.md`'s bosses; fix the four stale 1500s. | **SMALL** | **[DOCS]** `BACKLOG.md` · `S180_BACKLOG.md` · `boot-snapshot.md` · `SPARK_CANON.md` · `canon.test.ts` · `UNIT_STAT_TABLE.md` |
| **P6** | **END-OF-MATCH STAT BOARD — Tier 1.** Buildable from state that survives the win, **no new sim state, no protocol bump**. ⛔⛔ **THE TRAP:** `WIN_TRIGGER` (`world.ts:566-590`) tears down defenders, gatherers, banks and spawners **before the first WIN frame**. A board authored against a PLAYING world passes every test and is **empty in the real game**. Also: there is **no synced match-end tick**, and `main.ts:2102` makes *any* canvas click in POSTGAME reset the match — so the board is click-hostile by default. | **MEDIUM** | **[UI]** new `matchBoardModel.ts` + `matchBoard.ts` · `ui.ts` · `elimination.ts` · `main.ts` |
| **P7** | **NO DAMAGE NUMBERS ON SCRAP.** Ruled, design settled. | **~20 min** | **[DMG]** — collides with P1 |
| **P8** | **THE FIVE S161 SWEEP LANES.** determinism · four-sites · creature lifecycle · wire/protocol · host-migration. Killed by a spend limit in S161, never hand-run. **This recon is the fourth time their class produced a live defect** (N1–N4 are all four-sites failures). | **MEDIUM** | read-only audit — **collides with nothing** |

---

## 3 · ⛔ BLOCKED ON YOU — one question each, and I checked the archive first

| # | priority | the question |
|---|---|---|
| **B1** | **SUICIDE BOMBER's below-50% fallback** | **No ruling exists.** `grep -i "suicide\|bomber\|sapper" LOCKED_DECISIONS.md` → **zero**. `S180_TARGETING_TABLE.md:18` says *"buildings only; with no buildings, people"* — **no 50% clause anywhere in the file.** So: (a) below 50% of **its own** health, it takes whatever is closest — units too, or buildings only? (b) Is the fallback even wanted, or was the 50% a passing thought? ⭐ Reachability is **fine** — halves exist (a race unit hits for 6, a sapper has 10), so an earlier claim that the rule "can almost never fire" was wrong. |
| **B2** | **STAT BOARD — what goes on it** | Genuinely open after grepping every doc. Place + survived + score are free. Damage done/taken needs a counter pass. Which do you want in v1? |
| **B3** | **STEAM — now or later?** | Answered in S181, not decided. My read stands: **not Steam yet** (a permanent score against a game where four systems were visibly lying), **yes** to public at spark-online.space with no score attached. Signal to wait for: an evening of play that yields only balance complaints. |
| **B4** | **R145 — castle units one point weaker than tier-3** | Two answers only you can give (the vampire/zombie tie, and six distinct castle units = a large free-power increase + a version bump). Costed in `UNIT_STAT_TABLE.md §4`. |
| **B5** | **CONTINUOUS CITY** | One ruling first: **can one shape belong to two recipes?** |
| **B6** | **NONET STAGES** | Eight questions still open. Arcade-only ladder is free; in-match needs a wire field. |

---

## 4 · ART SPEND — your call, your hands

- **PER-RACE BORDER WALL ART** — six treatments (your S180 ask).
- **BOSS ABILITY VFX** — all six bosses are mechanically live and **visually silent**. No ability
  atlas has ever been packed. The Warlord's red rage tint is the only exception.
- **VOLTKIN TV — two transition videos** (~EUR 20 each, your measured cost). You already have the
  climbing-out still — wire it rather than generate it. ⚠ You said Voltkin needs reworking broadly.
- **KRAKEN TENTACLES** — the one genuinely unbuilt boss skill; you want the whole Kraken reworked.
- **General / goblin tower art** · **12 frames per state is not enough** (you have said it twice).

---

## 5 · ⛔ DECLINED / PARKED — do not raise unprompted

Boss-ring orphan · castle gun firing at a corpse · `nextPulledSparkId` · a protocol bump for stale
tabs · the potato blast · the untargetable freeze (*"we'll bring that up later"*) · Vlad's life sap
looking wrong (*"kinda looks like shit for now, but whatever"*).

---

## 6 · ⭐ THE PARALLEL SPLIT — which of these can safely run at once

**The rule: two branches must not share a collision group.** A file touched by two branches is where
this goes wrong, and the four-sites contracts (`worldTypes` + `world` + `stateHashFull` + `workerSim`)
are shared by more priorities than they look.

| lane | priorities | group | conflicts with |
|---|---|---|---|
| **A** | **P1** remainder cap (+N2 N3 N4) | `[DMG]` | **P7** — same sweep. Take P7 into lane A, not its own. |
| **B** | **P3** portraits | `[SHEET]` | **P4** — both edit `main.ts`. Sequence them, or give both to one lane. |
| **C** | **P6** stat board Tier 1 | `[UI]` | touches `main.ts` too — **third claimant.** |
| **D** | **P2** turret + **P5** doc truth pass | `[STATS]` `[DOCS]` | **P5 edits `SPARK_CANON.md`** — anything else adding to the canon collides. |
| **E** | **P8** the five S161 lanes | read-only | **nothing** — safest possible parallel lane |

⛔ **`main.ts` IS THE BOTTLENECK — three lanes want it (B, C, and P4).** Either give B+C+P4 to one
session, or have them touch `main.ts` in one agreed commit first and branch after.

⭐ **SAFEST FOUR-WAY SPLIT:** **A** (P1+P7) · **B** (P3+P4, one session, they share files) ·
**D** (P2+P5) · **E** (P8). That is four branches with genuinely disjoint file sets. **C** (stat
board) joins after B lands, because of `main.ts`.

⚠ **MERGE ORDER MATTERS:** **D first** (docs + a one-line table, near-zero conflict), then **A**,
then **B**, then **C**. **E** merges any time — it produces findings, not edits.
Re-run `typecheck` + `vitest` + `build` **after every merge**, not once at the end: two green
branches can be red together, and the bundle headroom is shared.
