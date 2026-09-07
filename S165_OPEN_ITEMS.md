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
| A6 | *"the nagas dont look like they are slithering… they kinda just twitch"* | OPEN — needs per-frame motion measurement of the naga walk row vs the other five. | ⬜ |
| A7 | *"tier 3 basic unit spawn… the second row of the beetle looks much smaller - not consistent"* | OPEN — scarab walk row. The atlas guard scored it `walk=0.99x` and passed, so either the guard's frame-0-only sampling is too narrow or it measured the wrong thing. Also a white sliver visible in that row. | ⬜ |
| A8 | *"i dont see the tier 3 tower - did we implement it yet?"* | CONFIRMED NOT BUILT — 18.4 MB of tier-3 art ships in `public/art/race-tier3-{units,towers}/` and `grep` across `src/ e2e/ index.html` returns **zero** references. Needs owner stat rulings (R134/R135 explicitly unruled) before it can be wired. | ⬜ report + carry-forward |
| A9 | *"the end of wave 5 racial/general upgrade we didnt do it yet did we?"* | CONFIRMED NOT BUILT — R101–R106/R111/R112 fully specced in `SPARK_RACES_SPEC.md` §9; zero code. R112 is an explicit named trigger: *"BUILD ONLY WAVE 5 FIRST… ask once wave 5 ships."* | ⬜ report + carry-forward |

## B. New owner scope — explicitly LAST, after the planned batch works

| # | Ask | State |
|---|---|---|
| B1 | Settings-button toggle: race background ↔ original cosmos black. | ⬜ — `ZoneBackgroundRenderer.setEnabled/isEnabled` already exist and Lane 1 flagged them as dead API. This is their purpose. |
| B2 | Per-race music (a cover of the original per race) + a toggle back to the original track. | ⬜ wiring. Files DONE: six tracks transcoded to `public/audio/races/{demons,mummies,nagas,orcs,vampires,zombies}.ogg`, 14.5 MB total at 78–82 kbps to match the shipped `blue-steppe-orbit.ogg` (73 kbps). mp3 sources deleted — no repeat of the false-fallback mp3 that Lane 3 found. |

## C. Five-lane sweep — findings not yet actioned

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
| 5 | `RAIDED_CLOUD_TICKS` referenced by no test — set it to 0 and the raid cloud silently never draws, against R78 | MED |
| 5 | 4 more vacuous `chewerRenderer` tests; `underRaceUnitCaps` untested | MED |

---

## Worker-bots flake — recorded, not silenced

`worker-bots.spec.ts:78` failed ONCE in a full-suite local run (world back at TITLE/solo mid-test),
then passed standalone, passed a second full-suite run, and passed on CI. Unreproduced. The project
CLAUDE.md already records this spec as historically red. **Not** ruled benign — ruled unreproduced.
