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
| 1 | One potato deletes a standing race-unit squad outright, ehp-irrespective | owner balance call |
| 2 | `players: 'acknowledged'` in the wide hash now hides `castleHp`, which GATES emission | real oracle blind spot |
| 2 | `serializerCompletenessSweep.test.ts` is not a sweep — it pins one field | test |
| 2 | `protocolVersionSync` link regex is case-sensitive, so the ⭐ narrative blocks never match; chain passes on the terse one-liners only | weaker than it reads |
| 2 | Six stale/incorrect docblocks: `effects.ts` effect count + dead line numbers, `spawnedCount` "live cap", `poopyUntilTick` "not serialized", castle-bank projection type, `nextPulledSparkId` (now true), narrative changelog order | comment fixes |
| 3 | `blue-steppe-orbit.mp3` (9.77 MB) retained on a "Safari pre-17 fallback" rationale the code does not implement — `MUSIC_URL` is a single hardcoded `.ogg` | 15% of the static payload |
| 3 | `findSpawnerMatch` dead while `runSpawnerIgnition` hand-enumerates its three recipes — defect recurs on the 4th | guard test |
| 3 | Hazard subsystem (bomb/potato/rainbow/seagull) unreachable in production; 5 client-intent wire types live for entities that cannot exist | dead by ruling, undocumented at the sites |
| 3 | `CREATURE_HIT_DAMAGE`, `isDebugMode()`, `CREATURE_ROLES`, `DEFENDER_ROLES`, `DESPAWN_CREATURE` producer — all callerless | low |
| 3 | `public/godly/voltkin/parts/SLICE_SPEC.md` served publicly | low |
| 4 | 23 doc/code contradictions — the big ones: `RACE_ZONES_AND_BOSS_TOWERS.md` + `BACKLOG.md` say the NONET collision is still open (R132 settled it), `SPARK_TD_SESSION_SPECS.md` still specs retaliation-only castle guns (superseded) and a `world.castles` model that does not exist, `SPARK_RACES_SPEC.md` says W1-C is unbuilt in its own anti-drift banner, `boot-snapshot.md` contradicted point-by-point, `CASTLE_BANK_CAP` reasoned from in 3 live sites after deletion, `VOLTKIN_HP`'s whole justification is pre-R72 arithmetic, `RELAY_HEALTH.md` says `probe-relays` is unimplemented | doc-truth pass |
| 5 | 12 `not.toThrow()`-only tests in `audioManager.test.ts` guarding replay-safety they cannot observe — and one test's NAME states a property the code deliberately lacks | HIGH |
| 5 | `quickmatchGate` ghost-race-claim prune + the two-try/catch isolation have zero coverage; both were owner-bug fixes | HIGH |
| 5 | ~~`RAIDED_CLOUD_TICKS` referenced by no test~~ | ✅ `f2a653a` — lifetime coverage now enumerated from the union; two assertions on RAIDED (the seconds per R78, and that nothing outlives it) |
| 5 | ~~`underRaceUnitCaps` untested~~ | ✅ `71667d4` — the type filter and the per-owner seat term |
| 5 | 4 vacuous `chewerRenderer` tests (hop-state prune, per-emitter jitter, hop advance) | MED — still open |
| 3 | ~~`findSpawnerMatch` dead while `runSpawnerIgnition` hand-enumerates~~ | ✅ `f2a653a` — the two lists pinned against each other, both directions. ⚠ My guard was vacuous TWICE before the negative control made it real (a comment mentioning the id, then a downstream `case` arm) |
| 5 | ~~12 `not.toThrow()`-only `audioManager` tests~~ | ✅ `71667d4` — the three cursor/replay ones rewritten against `inspectAudioChain().claveCallsTotal`, and one whose NAME asserted the opposite of the shipped rule corrected. The remaining `not.toThrow` cases are the headless-context ones the module genuinely cannot observe |
| 2 | ~~`players: 'acknowledged'` hid `castleHp`~~ | ✅ `1661166` — six sim fields projected, avatar asserted ABSENT |

---

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
