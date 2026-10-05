# S195 PROGRESS — s195/fight-wipe (the "half my build exploded at the whistle" hunt)

NEXT STEP: gates are running (`.tmp-gates/typecheck|vitest|build.{log,exit}`); read the exit files, fill the gate line below, hand back.

## FINAL REPORT (fills in as the gates land)

- **tip**: see `git log -1` (merge of `ccr-26eaab43-fa9mg3` @ 1cee3822 on top of 591e5851 / the table commit; no source conflicts, no lockfile change → no `npm install`).
- **gates**: typecheck `__` · vitest `--maxWorkers=2` `__` · build `__` entry `__ KiB` (+0.0 — this tree adds ONE test file and this document; nothing ships in the bundle).
- **bump verdict: NO.** No sim line changed. Two builds that shake hands compute byte-identical worlds (the hunt test pins `hashWorldStateFull` only to compare teams-on vs teams-off on the same build).
- **files**: `src/state/entropyFightWipe.test.ts` (new, 8 tests, ~2.3 s), this file. Nothing in `src/state/entropy.ts`, `damage.ts`, `hostTick.ts`, `potatoLifecycle.ts` — **no bug was found to fix** (see the verdict).

---

## THE VERDICT — H1 IN (the rule, not a bug). H2 IN as the VISUAL, OUT as a cause. H3 OUT. H4 OUT.

Everything below was MEASURED through the real `runHostTick` + `runGodlyMatcherCore` on the owner's own board
(`entropyFightWipe.test.ts`): a `START_GAME` roster of seat 0 **Nagas, team 0** vs seats 1 + 2 **Mummies + Zombies,
team 1** (`world.teams` = `[0,1,1]`, verified), wave 8, seat 0's quadrant filled with **30 REAL stamped towers** via
`applyBuildBlueprint` under the host's own `stampRefusalAt` legality (10 lightning hubs, 5 Voltkin TVs, 5 Piranha
towers, 5 goblin towers, 5 laser turrets — all ignited: 8 hub spawners + 5 + 5 spawners, 5 turret defenders, 5
standing TVs per board), welded into **ONE structure of 226 connectors / 189 shapes** by hand-shape chains spaced
≤ `AUTO_BOND_RADIUS` (the bond `placePrimitive`'s merge sweep mints). Creatures cleared every tick so the edge
work alone is observed. 2 s of FIGHT run after the whistle (`REVALIDATE_INTERVAL_TICKS` = 30 — the hub
recipe-break arm runs on the spawner poll, not on the edge tick).

### H1 — THE ENTROPY TAX. **IN. It is the ruled rule (R194-18/20), doing exactly what the canon says, and it is enough on its own.**

| seed (wave 8, n = 226, chance 21.6 %/connector) | planned | snapped | connectors lost AT THE WHISTLE | shapes lost | +2 s (hubs blown) connectors / shapes | towers lost of 19 | hub blasts |
|---|---|---|---|---|---|---|---|
| 1 | 39 | 39 | 50 (22.1 %) | 21 (11.1 %) | 70 (31.0 %) / 34 (18.0 %) | 10 | 3 |
| 2 | 54 | 51 | **139 (61.5 %)** | 106 (56.1 %) | **147 (65.0 %)** / 111 (58.7 %) | **16** | 1 |
| 3 | 55 | 54 | 83 (36.7 %) | 49 (25.9 %) | 94 (41.6 %) / 57 (30.2 %) | 11 | 2 |
| 4 | 45 | 42 | 90 (39.8 %) | 61 (32.3 %) | 100 (44.2 %) / 70 (37.0 %) | 11 | 2 |
| 5 | 52 | 50 | 124 (54.9 %) | 91 (48.1 %) | 137 (60.6 %) / 101 (53.4 %) | **18** | 2 |
| 6 | 55 | 51 | 108 (47.8 %) | 76 (40.2 %) | 123 (54.4 %) / 89 (47.1 %) | 13 | 2 |
| **total** | 300 | **287** | **594 of 1356 = 43.8 %** | 404 of 1134 = 35.6 % | **671 = 49.5 %** / 462 = 40.7 % | **79 of 114 = 69 %** | 12 |

- The SNAP count is the canon's number (287 ≈ 1356 × 21.6 % = 293; every planned bond went, or fell with a split
  side first). **The LOSS is ×2.07 the snaps at the whistle and ×2.34 two seconds later**, because every stamped
  tower is a STAR (a tree) and every weld is a BRIDGE: a snap on a tree edge is never on a cycle, so `severSplit`
  deletes the smaller side WHOLE — a leaf, an arm, a tower, a wing of the quadrant (*"or maybe whole parts of
  it"*, canon §2). The S194 control lattice (cycle-rich 65/145) on the same seed loses 24 for 12 snaps; a welded
  tower quadrant loses 2–6× its snaps. **The multiplier is topology, not a defect in the roll.**
- Half his build gone at ONE whistle is the EXPECTED outcome at n ≈ 200+: worst board 65 % of connectors, 59 % of
  shapes, 16–18 of 19 towers. His *"half of my shit exploded"* is this table.
- The owner-facing table (4 seeds each, wave 8, 1v2, printed by the test):

| towers welded | n | chance / connector | snapped (what the canon table and the N12 card show) | **lost at the whistle** | **lost +2 s** (hubs blown) | towers lost |
|---|---|---|---|---|---|---|
| 4 | 27 | 1.7 % | 1.9 % | 6.5 % | 6.5 % | 1 of 12 |
| 8 | 66 | 5.6 % | 4.5 % | 7.2 % | 14.4 % | 6 of 24 |
| 14 | 124 | 11.4 % | 10.3 % | 16.9 % | 27.0 % | 19 of 44 |
| 20 | 190 | 18.0 % | 16.6 % | 38.0 % | 44.6 % | 37 of 64 |
| 30 | 226 | 21.6 % | 20.6 % | 40.0 % | 45.5 % | 48 of 76 |

- Checked and NOT a bug: the roll is ONCE per whistle (inside the `flipped` guard, one call site, pinned in
  `entropy.test.ts`); each component is counted once (`planEntropy`'s `seen` set, total order by bond id); the
  chance is read off a snapshot; `severSplit` deletes the SMALLER side (tie → newer); the wave only changes WHICH
  bonds roll under (same board: wave 8 → 61.5 %, 12 → 58.4 %, 20 → 13.3 %); no endgame or team exemption exists
  (⚠ MINE defaults, canon §2).

### H2 — LIGHTNING HUB SELF-DESTRUCT. **OUT as a cause. IN as what he SAW.**

- 48 hubs ignited across the six boards; **31 fell within 2 s of the whistle, 12 of them with a visible blast**
  (`BOMB_EXPLODE`). None blew at the whistle tick: an entropy snap takes ONE arm (the leaf is the smaller side),
  `isStarAt` reads degree 4 ≠ 5 on the next spawner poll (≤ 30 ticks later), the recipe-break arm fires
  `STRUCTURE_SELFDESTRUCT` (ladder, 120 fifths, `planHubBlast`) and razes the hub's own star. A hub whose Dot
  itself went with a split side is removed WITHOUT a blast (`dying === undefined`) — hence 12 blasts for 31 hubs,
  never more blasts than hubs fallen: **no chain**.
- **Zero connectors fell to a blast (cause `'drone'`), zero of seat 0's, on every board** — `planHubBlast` runs
  `isEnemySeat` / `sameTeam` on every arm, so the owner's side is spared and the enemies' quadrants are > 240 px
  away. The blast hurt nothing. What the self-destruct DID cost him is the hub's own star (5 shapes + 4 connectors
  per hub, plus any hand-shape weld left holding nothing): that is the +5.7 points between "at the whistle" and
  "+2 s". A hub is the most entropy-fragile tower in the game: ANY one of its 5 arms snapping is the whole hub,
  so at 21.6 %/connector only (1 − 0.216)^5 ≈ 30 % of hubs survive a whistle (measured 17 of 48 = 35 %).
- Negative: the same 30 towers UNWELDED (every structure ≤ 10 connectors) → 0 planned, 0 snapped, 0 blasts, census
  identical 2 s later. No fuse, no bulk arming at the FIGHT edge: `hubDeathFuse` needs `inFight && star < 1/3` and
  is cleared on every exit; nothing at the edge touches a spawner.

### H3 — EVERY PHASE-EDGE HOOK THAT CAN REMOVE A BOND OR A SHAPE (`hostTick.ts:457–622`, the `flipped` arm). **OUT.**

| hook | edge | removes a bond/shape? | verdict |
|---|---|---|---|
| `bankCarriedSparksAtPhaseEdge` | both | a CARRIED free spark (banked), never a placed shape | OUT |
| `world.monsterWaveSpawned = 0` | both | no | OUT |
| `removeEndgameMonsters` | →BUILD only | creatures | OUT (wrong edge, not shapes) |
| `waveNumber += 1`, `recordWaveSample`, `openDraftIfDue` | →BUILD only | no | OUT |
| princess `REMOVE_DEFENDER` sweep, `reviveDormantHelgas`, `standDownDefenders`, bag refill, `releaseShelteredGatherers`, `clearScorchedEarthAtBuild`, `recallArmies`, `resummonVoltkins` (mints creatures, removes nothing) | →BUILD only | no | OUT |
| **`applyEntropyTax`** | **→FIGHT** | **yes — bonds + split sides** | **IN (H1)** |
| `reviveDormantHelgas` | →FIGHT | no | OUT |
| outside the arm, same tick: `tickGathererShelter`, `tickScoring`, the spawner poll (`recipeStillSatisfied` → hub self-destruct) | every tick | the hub's OWN star, only after a recipe broke | consequence of H1 (H2) |
| physics (`'physics'` sever), creature strikes, raids, player cuts | window | **0 severs of any other cause in 6 × 121 ticks** (`otherSevers` pinned 0) | OUT |

Voltkin TVs: `resummonVoltkins` runs on the →BUILD edge only; a TV stops "standing" only when its chain loses a
bond — to entropy. Voltkin creatures were cleared each tick so no strike could be mistaken for the edge.

### H4 — THE 1v2 LAYOUT. **OUT.**

`before`, `after`, snaps and blasts are **byte-identical** on the same seed with `teams = [0,1,1]` and with teams
OFF (3-seat FFA). `planEntropy` never reads a seat or a team; `planHubBlast` spares `sameTeam` on every arm and
the owner's own seat is on his own team by construction (`sameTeam(a, a)` is `true` before `teams` is consulted,
so a `null`/missing entry cannot turn him into his own enemy).

---

## OWNER-FACING EXPLANATION (plain words — this is the RULE he ruled, so nothing was changed)

Nothing exploded by mistake. **The entropy tax you asked for in S194 fired at the FIGHT whistle, on ONE structure
that was your whole quadrant welded together.** At ~226 connectors every connector has a 21.6 % chance to snap
(0.1 % × (226 − 10)); ~50 snapped. But a tower is a star and a weld is a single bridge, so every snap cuts the
structure in two and the smaller half is deleted whole — a leaf, an arm, a tower, a wing. That is how 50 snaps
became ~100–150 connectors and 11–18 of 19 towers. The lightning hubs you saw blow up were hubs that had lost one
arm to a snap: a hub with 4 arms is no longer a hub, and a dead hub self-destructs (your R182 rule). Their blasts
hurt nothing of yours (they spare your side) — you saw the flash of 1–3 of them half a second in, on top of a
hundred shapes fading out at once, and it read as "the hubs exploded and took everything". The TVs did nothing.

**Why it looks worse than the card promises:** the card (and canon §2) show *snaps*, ~20 % at that size. The real
loss on a welded tower quadrant is **about double the snaps** — ~40–50 % of the structure, 60–65 % on a bad roll —
because of the split rule. Under 10 connectors (any tower standing alone) the tax is zero.

### Options (⚠ MINE — every one needs your ruling; none is built)

| | option | what changes | cost | my read |
|---|---|---|---|---|
| (a) | **roll per STRUCTURE, not per connector** — one roll decides whether the structure snaps at all, then ONE connector goes | expected loss per whistle ≈ 1 connector + its split side, however big the structure | `entropy.ts` ~15 lines; `entropy.test.ts` re-pins; canon §2 table; bump YES | gentlest; keeps "big = fragile" as a probability, not as a wipe |
| (b) | **lower cap / gentler ramp** (e.g. +0.05 %/connector, cap 25 %) | halves the snaps; the split multiplier stays ×2 so a 226-structure loses ~20–25 % instead of ~45 % | 2 constants + re-pins + canon; bump YES | cheapest; still "half the build" at 400+ connectors |
| (c) | **a snap never DELETES a split side bigger than X** (e.g. > 5 shapes stays, just disconnected) | the roll keeps its numbers; the amplifier goes — loss ≈ snaps (~20 % at 226) | `severBond.ts` / `severSplit` get a cause-aware size cap — touches EVERY sever cause unless gated to `'entropy'`; bump YES | fixes the surprise without touching his chance table, but changes what a "sever" means for one cause only |
| (d) | **BUILD-phase warning**: the structure card already shows `ENTROPY % … ~N lost/fight` (s195/info-ui b3e490cd). Make N the REALISED expectation (× the measured split multiplier) and add a one-line warning above ~25 % | no sim change; bump NO | the seam below; cheapest, honest, and he asked for exactly this readability in N12 |
| (e) | **hubs: a lost arm does not self-destruct the hub when the cause is entropy** (recipe break → dormant, repairable, no blast) | keeps the hub's shapes; removes the "explosion" he saw | `hostTick.ts` recipe-break arm needs the sever cause → not available there today; medium; bump YES | only if he wants hubs less fragile — R182-A says the hub "makes sense" to blow |

**Recommendation:** (d) now (readability, no ruling needed beyond N12 which he already gave) + ask him to pick
between (a) and (b). (c) and (e) change what severing means and I would not touch them without his word.

### The visual question (item 4) — RULED: yes, it LOOKS like the hubs/TVs exploded, and here is why

- A snap renders as `SEVER_ERASE` per deleted shape: a soft-light ghost that shrinks + fades with an **outward
  shockwave** (`render/effects/severErase.ts` → `severEraseFx`). On seed 2 that is **106 shockwaves in one frame**
  across the quadrant — an explosion by any reading — and it is **deliberately silent** (`audioManager.ts:1956`).
- 0.5–2 s later 1–3 real `BOMB_EXPLODE` blasts flash on the hubs that lost an arm. The eye attributes the
  hundred fades to the three flashes.
- The owner-only toast reads **"ENTROPY: N CONNECTORS SNAPPED"** with N = the SNAPS (39–55), not the connectors
  LOST (50–147): the split sides fall through `razePrimitives` without a `BOND_SEVERED`, so the toast understates
  the loss ~2× — the same seam as the card. The `lostToEntropy` stat (`matchStats`, T22) DOES count the delta
  (`sampleBuilt` before/after) and is the right number for both.
- Proposal (render tree, not mine to build): a distinct cue — the entropy erase fades WITHOUT the shockwave (or in
  the owner's colour desaturated), the toast says "ENTROPY: N SNAPPED, M CONNECTORS LOST" using the T22 delta, and
  the N12 sound he asked for (*"a little boing … a spring"*), once per whistle, not per snap.

---

## SEAMS for the merge owner
- `src/render/characterSheetModel.ts` `entropyRowsFor` (s195/info-ui b3e490cd): `~N lost/fight` = `n × chance / SCALE`
  = SNAPS. Measured realised loss on a welded tower quadrant is **×2.07 at the whistle, ×2.34 with the hub
  self-destructs** (n = 226, 6 seeds); ×1.6–2.3 at n = 66–190. Suggest the row says "~N snap · ~2N lost" or
  carries a `⚠` above 25 %. Not built here (render is off my boundary; the owner has not ruled the wording).
- `severToastRenderer.ts:139` — N is snaps, not loss (above).
- Canon §2 table: a row "connectors LOST on a welded tower quadrant (measured): ≈ 2 × snapped" would be true; I
  did not edit the canon because no constant backs it (CLAUDE.md: a canon number lands with its constant + pin).

## ⚠ MINE
- The fixture's weld = hand-shape chains spaced ≤ 60 px between nearest tower members (Kruskal + every pair within
  one hand shape). A player's real welds may be denser (more cycles → smaller multiplier) or sparser (pure tree →
  bigger). The control lattice bounds the dense end (×2 for 12 snaps); the tree end is ×6 (first fixture, 88 c).
- `FIGHT_SETTLE_TICKS` = 120 (4 spawner polls) is my window for "immediately".

## NOT DONE
- No sim fix (none owed — the rule is working as ruled). No canon edit (no constant to pin).
- e2e: none owed — no production file changed. (Playwright on this box is Chromium 1194 in the 1223 slot; not run.)

---

## Reading done (verified in tree, f7cc2100)
- `entropy.ts`: per-connector roll `min(50%, 0.1%×(n−10))`, ONCE at the BUILD→FIGHT edge (`hostTick.ts` FIGHT arm, the only `applyEntropyTax` call site), severs via `applySeverBond` cause `'entropy'`.
- `severBond.ts` → `severSplit` (`game/structure.ts:107`): a non-cycle cut deletes the SMALLER side (tie → newer side). `applySeverTopology` → `razePrimitives(del, [bond, ...delBonds], razeOrphans=true)`.
- Hub self-destruct: `hostTick.ts:~925` fires when the hub's RECIPE breaks (spawner revalidation every `REVALIDATE_INTERVAL_TICKS` = 30, BUILD included) → `STRUCTURE_SELFDESTRUCT` ladder 120 fifths split by distance over ENEMY targets only (`planHubBlast`: `isEnemySeat`/`sameTeam` on every arm), plus `razePrimitives(ownStar)`.
- Ignition is NOT inside `runHostTick`: `runGodlyMatcherCore` (main.ts / workerSim) runs `runSpawnerIgnition` + `runDefenderIgnition` off `BOND_FORMED` effects — the test runs it beside the tick as the real loop does.
- info-ui (b3e490cd) already ships `ENTROPY %` + `~N lost/fight` (snaps only) → seam, not a build.
