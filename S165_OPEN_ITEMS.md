# S165 — every open item, tracked to closure

**Owner, mid-session:** *"lets make sure that everything i have mentioned and everything you will
find landed in the end of the session before closing off - dont close off before my say so."*

This file is the single list. Every row is either DONE with the commit that closed it, or OPEN with
what it needs. Nothing leaves this file without one of those two.

---

## A. Owner playtest reports (this session, live on spark-online.space)

| # | Report (owner's words) | Verdict | State |
|---|---|---|---|
| A1 | *"cant seem to click on castle gatherer upgrades i think you took it off"* | REAL — the panel built rows with a hardcoded `i < 2` while the model had 3; S164's CASTLE REGEN row was never drawn. At 100 VP it was the ONLY affordable purchase. | ✅ `8d56c5b` — verified in a real browser, `rowCenters` 2→3 |
| A2 | *"the pencil chewer spawn rate"* | REAL — the pentagram arm advanced `nextSpawnTick` only inside a successful emit, so a capped spawner banked slots and drained them one per tick. Sweep flagged it independently. | ✅ `8d56c5b` |
| A3 | *"back to main covering the player two castle"* | REAL — button x 1708..1876 / y 100..134 vs seat-1 keep x 1753..1827 / y 101..159. Moved the BUTTON, not the castle (anchors drive sim). | ✅ `8d56c5b` |
| A4 | *"the center where the shapes spawn is split in half by the race background… should stay cosmos black"* | REAL — the partition and the quarry disc share the canvas centre. Black disc at `SPAWNER_RADIUS+2`, both boards. | ✅ `8d56c5b` |
| A5 | *"goblins whose producing tower got destroyed should… go back to the castle"* | ALREADY CORRECT — `ownHomePos` falls through to the castle on a spawner miss. Nothing asserted it; now pinned in `retreat.test.ts`. | ✅ `8d56c5b` |
| A6 | *"the nagas dont look like they are slithering… they kinda just twitch"* | REAL, and 20x worse than any sibling: walk-row alpha delta 1.41 vs 27–37, centroid travel 0.2 px vs 4–7. NOT the video (source luma delta 9.54 vs orcs 15.61) — `sampleWindow: 16` drew all 12 frames from half a second of a 4 s clip. Widened to 24 after a 20/24/32/48 sweep. Motion 4.03, rows 1.00/0.99/1.00/0.99, and the naga moves from +16% to −10% of the sibling mean. | ✅ `ad29ece` |
| A7 | *"tier 3 basic unit spawn… the second row of the beetle looks much smaller - not consistent"* | REAL — scarab walk 0.82x. THE GUARD WAS THE PROBLEM: it compared FRAME 0 of each row, and the scarab's frame 0 matches at 0.99x. Switched to a per-row median over every frame, which then found two more (piranha walk 1.29x, bat attack 1.50x). `normaliseStateScale` had the same frame-0 bug and now uses row medians for playable rows, frame 0 for `die` (pose-confounded — every die row is SHORTER). Three sheets rebuilt from existing clips, no veo. All 30 atlases clean. | ✅ `ad29ece` |
| A8 | *"i dont see the tier 3 tower - did we implement it yet?"* | CONFIRMED NOT BUILT — 18.4 MB of tier-3 art ships in `public/art/race-tier3-{units,towers}/` and `grep` across `src/ e2e/ index.html` returns **zero** references. Needs owner stat rulings (R134/R135 explicitly unruled) before it can be wired. | ⬜ report + carry-forward |
| A9 | *"the end of wave 5 racial/general upgrade we didnt do it yet did we?"* | CONFIRMED NOT BUILT — R101–R106/R111/R112 fully specced in `SPARK_RACES_SPEC.md` §9; zero code. R112 is an explicit named trigger: *"BUILD ONLY WAVE 5 FIRST… ask once wave 5 ships."* | ⬜ report + carry-forward |

## B. New owner scope — explicitly LAST, after the planned batch works

| # | Ask | State |
|---|---|---|
| B1 | Settings-button toggle: race background ↔ original cosmos black. | ✅ `7c39965` — new `displayPrefs.ts` store; the dead `setEnabled/isEnabled` API now has its caller. Turning it off fetches ZERO backdrops (sync early-returns before ensureTexture), asserted as an absence in `e2e/settings-toggles.spec.ts`. |
| B2 | Per-race music (a cover of the original per race) + a toggle back to the original track. | ✅ `7c39965` — pure `raceMusic.ts` resolver + URL-keyed cache **capped at 2 buffers** (decoded PCM is 384 KB/s: an uncapped cache would reach ~736 MB). New `stopMusic()` closes a pre-existing gap that would have played the previous match's race for the whole next one. Toggle bites on the click. Verified in a real browser. |

## C. Five-lane sweep — findings not yet actioned

**Also closed since this file was written:** the `players` oracle blind spot (castleHp gated
emission and neither hash could see it diverge), the missing race-unit atlas browser check, the
`quickmatchGate` prune + try/catch coverage, eleven doc/code contradictions, and the false
mp3-fallback comment.

Closed already: the dead stink taunt, the empty worker recipe registry, potato provenance, the atlas
guard blocking the deploy, `DEFENDER_TARGETS` backwards, `nextPulledSparkId`, the missing id
tie-break, the invisible hashed scalar, the 4th drifted predicate, the one-pixel army recall, the
`@visual` lane lie, `ownDecaying`, the HUD decay cue, the stale gate numbers.

### Still open

| Lane | Finding | Note |
|---|---|---|
| 1 | Tier-3 art unreachable (same as A8) | 57% of `public/art` |
| 1 | NONET freeze deletes ~6 race-unit emissions per seat; the docblock weighs "at most one" | doc is wrong, mechanism may be intended |
| 1 | `creatureLifecycle.ts` docblock claims `SPAWN_CREATURE` is a client intent and cites a line inside an unrelated docblock. It is NOT in `CLIENT_INTENT_TYPES_RECORD` — security is fine, the reason is false | comment fix |
| 1 | No browser-level check that a race-unit atlas is ever fetched (the gap `zone-backdrop.spec.ts` just closed for backdrops) | test |
| 1 | `die` row generated in all 6 race-unit + 6 tier-3 atlases, never playable (`syncSprite` maps to attack/walk/idle only) | known, honest |
| 1 | ~~One potato deletes a standing race-unit squad~~ | ✅ recorded, and it is UNREACHABLE: hazards are dead by ruling (`HAZARD_SPAWN_ENABLED` can only be turned on by a Playwright seam), so no potato can exist in a shipped match. A real balance question for whenever hazards return, not a live defect — documented at the flag |
| 2 | `players: 'acknowledged'` in the wide hash now hides `castleHp`, which GATES emission | real oracle blind spot |
| 2 | `serializerCompletenessSweep.test.ts` is not a sweep — it pins one field | test |
| 2 | ~~`protocolVersionSync` link regex case-sensitive~~ | ✅ `73b6abb` — MEASURED: 31 links found vs 41 now. ⚠ And my first guess at WHICH ten were missing was wrong: not the ⭐ blocks (their links are duplicated by terse lines) but the earliest bumps `1→2`..`10→11`, written with the arrow glyph |
| 2 | ~~Stale docblocks~~ | ✅ `73b6abb` — the three that assert the OPPOSITE of the code: `poopyUntilTick` headed "NOT serialized" while `save.ts` emits and restores it; the spawner re-seed note justified by a self-destruct cap S159 P9 deleted (conclusion restated on the real reason — it is hashed); `effects.ts`'s CORRECTION of a false header having itself gone stale (five kinds → six, both cited line numbers wrong). Remaining two are cosmetic: castle-bank projection type, changelog block order |
| 3 | `blue-steppe-orbit.mp3` (9.77 MB) retained on a "Safari pre-17 fallback" rationale the code does not implement — `MUSIC_URL` is a single hardcoded `.ogg` | 15% of the static payload |
| 3 | `findSpawnerMatch` dead while `runSpawnerIgnition` hand-enumerates its three recipes — defect recurs on the 4th | guard test |
| 3 | ~~Hazard subsystem dead-by-ruling, undocumented~~ | ✅ every consequence now written at `HAZARD_SPAWN_ENABLED`: the five live-for-nothing client intents, the unreachable input/bot handling, a renderer ticked every frame for a mechanic that cannot fire, and the potato/race-unit interaction above. Each looked like an oversight from its own file |
| 3 | `CREATURE_HIT_DAMAGE`, `isDebugMode()`, `CREATURE_ROLES`, `DEFENDER_ROLES`, `DESPAWN_CREATURE` producer — all callerless | low |
| 3 | `public/godly/voltkin/parts/SLICE_SPEC.md` served publicly | low |
| 4 | ~~23 doc/code contradictions~~ | ✅ `6ded84b` — the eleven that would change a reader's actions: the settled NONET blocker presented as open in TWO files, superseded castle targeting/HP/interval, a `world.castles` model refused in four of five parts, elimination specced as the opposite of `cf_s161_a`, `SPARK_RACES_SPEC` contradicting itself inside its own anti-drift banner, `CASTLE_BANK_CAP` reasoned from at 3 live sites after deletion, a false `SPAWN_CREATURE` client-intent claim, MAX_PLAYERS 6/7 vs R41's four, and three wrong facts in `RELAY_HEALTH.md`. Plus `boot-snapshot.md` banner-flagged as STALE with a claim-by-claim table |
| 5 | 12 `not.toThrow()`-only tests in `audioManager.test.ts` guarding replay-safety they cannot observe — and one test's NAME states a property the code deliberately lacks | HIGH |
| 5 | `quickmatchGate` ghost-race-claim prune + the two-try/catch isolation have zero coverage; both were owner-bug fixes | HIGH |
| 5 | ~~`RAIDED_CLOUD_TICKS` referenced by no test~~ | ✅ `f2a653a` — lifetime coverage now enumerated from the union; two assertions on RAIDED (the seconds per R78, and that nothing outlives it) |
| 5 | ~~`underRaceUnitCaps` untested~~ | ✅ `71667d4` — the type filter and the per-owner seat term |
| 5 | ~~4 vacuous `chewerRenderer` tests~~ | ✅ `68cf955` — the mock records ARGUMENTS now, so the prune is observed through behaviour (re-spawn must draw a fresh frame) and the hop through frame-to-frame geometry. ⚠ Two of my own errors here: the mock only APPENDS (a 14-frame signature compared against a 1-frame one reads exactly like a leak), and a PARTIAL negative control made me briefly call a working test vacuous — `drawChewBite` has TWO creatureId terms |
| 3 | ~~`findSpawnerMatch` dead while `runSpawnerIgnition` hand-enumerates~~ | ✅ `f2a653a` — the two lists pinned against each other, both directions. ⚠ My guard was vacuous TWICE before the negative control made it real (a comment mentioning the id, then a downstream `case` arm) |
| 5 | ~~12 `not.toThrow()`-only `audioManager` tests~~ | ✅ `71667d4` — the three cursor/replay ones rewritten against `inspectAudioChain().claveCallsTotal`, and one whose NAME asserted the opposite of the shipped rule corrected. The remaining `not.toThrow` cases are the headless-context ones the module genuinely cannot observe |
| 2 | ~~`players: 'acknowledged'` hid `castleHp`~~ | ✅ `1661166` — six sim fields projected, avatar asserted ABSENT |

---

## Lane split — the shared gating lane was starved by my own tests

`7c39965` and `f2a653a` went red as `Timed out waiting 720s for the test suite to run` — the LANE,
not a test. My two new specs pushed the shared lane from 4.1 to 5.3 min locally, i.e. past its cap on
a 3–5× slower runner. Trimming the tick budgets was the wrong fix: a probe showed race-unit count
still ZERO at tick 1408, because `raceUnitEmitTick` needs `gameState === 'PLAYING'` and the
transition lands a few ticks in, so all four seats miss their opening slot and the first emit is at
tick 1800. The mechanic is inherently ~30 s of sim per observation.

Split into an `@races` tag + its own GATING `e2e-races` job (`7f6fcb2`), the `e2e-protocol` /
`e2e-lobby` precedent. Shared lane back to 62 tests / 3.7 min; races lane 5 / 1.2 min. Then one more
of mine: I restored the tick budget and left the trimmed 90 s ceiling behind, so the races job failed
on its own first run — fixed at `407ad98` by waiting on the OBSERVATION (the fetch) rather than the
clock, which also exits early.

⭐ `src/ci.e2eLanes.test.ts`, written hours earlier against `@visual`, CAUGHT the undeclared tag and
printed the instruction. It needed a third state (`OWN_JOB`) because "excluded from the shared lane"
and "not gating" are different things.

## Bookkeeping owed at close

- `CLAUDE.md` gate numbers say **3715 tests / 239 files**; the suite is now **3726 / 240** and still
  moving as this session adds tests. Refresh at close, together with the P9 verification binding
  that pins the string, so the two cannot drift apart.
- MCV reconciled once already: a P9 binding pinned `    LEADER_DECAY_ENABLED &&`, which my own later
  (better) fix replaced with an injectable parameter. Binding REPLACED by two that pin the new form,
  with the supersession recorded in `check_method` — not deleted. `verify-session-claims.py` exit 0.

## Worker-bots flake — recorded, not silenced

`worker-bots.spec.ts:78` failed ONCE in a full-suite local run (world back at TITLE/solo mid-test),
then passed standalone, passed a second full-suite run, and passed on CI. Unreproduced. The project
CLAUDE.md already records this spec as historically red. **Not** ruled benign — ruled unreproduced.
