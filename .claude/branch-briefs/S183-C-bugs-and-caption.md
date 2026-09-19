# BRANCH C — THE OWNER'S CAPTION, AND THE AUDIT'S CONFIRMED DEFECTS

Branch `s183/bugs-and-caption` · base `fresh` (origin/master) · merge owner: the main S183 session.

Every item below **survived a three-stage audit**: an auditor found it, a second verified the cited
code exists and that production can reach it, and a third tried to prove it was not a bug and failed.
Do not re-litigate whether they are real. Do verify each against the tree before you change it.

---

## 1 · 🔴 THE OWNER'S OWN BUG — THE FEED CAPTION

He found this playing: the caption under a tier-3 tower's card *"is not in a good place. It needs to
be to the left of the circle. Instead now it's like in the middle of the frame, so that's not good."*

**Two defects in one line**, `src/render/characterSheet.ts:506`:

```ts
this.textCentred(hint, x + w / 2, top - 12, 9, DIM);
```

1. **It rises 12 px into an 8 px gap.** `layoutSheetActions` puts only `ACT_ROW_GAP` (8) between the
   wide FIX/SCRAP row and the FEED strip, so a 12 px rise lands the caption **4 px inside the
   FIX/SCRAP button** during BUILD phase. That is the overlap in his screenshot.
2. **It is x-anchored to the card centre** (`x + w / 2`) rather than to the chip — his actual complaint.

**MEASURED CONSTRAINT — a pure nudge does not work.** The caption only ever appears beside **exactly
one** chip (`feedHintFor` returns null for the goblin tower deliberately: its six shapes each make a
different goblin, so one line would be false for five of them — `characterSheetModel.ts:667`). A race
tower shows exactly one chip (`structurePanel.ts:306`, ruled in S166). But at 9 px with
`MONO_EM_RATIO` 0.6 in a 236 px card (`SHEET_W`, `PAD` 12 → 212 px inner) with a 32 px chip:

| race | caption | text + gap + chip | fits? |
|---|---|---:|---|
| vampires | `…MORE BATS` (31 ch) | 205 px | ✓ |
| zombies | `…MORE HOUNDS` (33) | 216 px | ✗ by 4 |
| mummies | `…MORE SCARABS` (34) | 222 px | ✗ |
| nagas / orcs | `…MORE PIRANHAS` / `WARBANDS` (35) | 227 px | ✗ |
| demons | `…MORE SOULEATERS` (37) | 238 px | ✗ by 26 |

**Five of six overflow, including his hound.** So the wording must shrink with the move. Dropping the
two words `A SHAPE` → `FEED TO BUILD MORE SOULEATERS` fits the worst case at ~195 px.

**FIX SHAPE:** right-align the caption so it always butts up against the chip whatever its length,
vertically centre it on the chip, shorten the string, and **derive the fit from the constants** —
`SHEET_W`, `PAD`, `FEED_BTN`, `MONO_EM_RATIO` — so a longer unit name can never silently re-break it.
⚠ Owe a test that asserts the caption fits for **all six races**, computed from the constants, not a
literal. (S181: *"derive the literal from the constant or the re-pin happens a third time."*)

---

## 2 · 🔴 HIGH — THE LEADERBOARD CAN PERMANENTLY DOUBLE-COUNT A RUN

`server/leaderboard/worker.js:78`. The server's idempotency key expires after **24 h**
(`SEEN_RUN_TTL_MS`, pruned unscoped at `:429` on every POST from any client). The client's offline
queue is bounded by **count, not time** — `PendingRun` is `{name, ms, id}` (`arcadeScores.ts:97`),
capped at `PENDING_CAP = 200` (`:345`), with **no timestamp field at all**.

**Failure:** a run commits server-side but the reply is lost (`REQUEST_TIMEOUT_MS = 4000` at
`arcadeLeaderboard.ts:188`, against sequential D1 round trips). It queues. The player does not play
for two days; another player's POST prunes the key. On their next run the flush re-sends it, the
dedupe SELECT misses, and `runs = runs + 1, total_ms = total_ms + ?3` fires a second time for one
game. **Sum-and-count is cumulative, so no later play repairs it** — the worker's own comment says so
(`:379`), and `SPARK_CANON.md:342` calls the average LOSSLESS.

**FIX SHAPE:** stamp each `PendingRun` at mint time (`arcadeLeaderboard.ts:235`) and stop retrying
anything older than the TTL — **or** prune `seen_runs` by row count rather than by time. Correct the
false *"a retry follows its original within seconds"* premise at `worker.js:77` **and**
`schema.sql:70` in the same change.

## 3 · 🟠 MEDIUM — A VETERAN IS TOLD IT IS THEIR FIRST RUN

`src/render/arcadeLeaderboard.ts:249`. On every successful submit the client overwrites its local
ranking with the server's **top 25** only. A player ranked outside the top 25 keeps no local row, so
the next failed submit reports `runs: 1, averageMs: lastMs` and the recap prints
`YOU HAVE PLAYED 1 GAME — THIS IS YOUR 1ST` with an average equal to that single run
(`arcadeRunOverlay.ts:286`), and `recapAverageMs` short-circuits so the owner's cinematic is skipped.

⭐ This is the *same* defect `serverMine` was added to fix on the ONLINE branch, still live on the
OFFLINE branch — where the server cannot correct it. The code's own comment at `:156` claims it
cannot happen. Stored data is fine; the payoff screen lies. **Preserve the player's own row across
the cache overwrite.**

## 4 · 🟠 MEDIUM — EVERY STANDING TOWER EXPLODES ON THE WIN SCREEN

`src/render/structureRampRenderer.ts:263`. **Verified by hand by the merge owner:**
`main.ts:3993` calls `structureRampRenderer.sync(world)` with **no game-state guard**. On a win,
`teardownSpawners` empties `world.creatureSpawners`; the renderer's `present` set loses every
spawner, and the ghost sweep reads each one as newly dead and plays its full 24-frame destruction.
The WIN screen is a centred `Text`, not an opaque overlay, so the board is fully visible behind it.
Also fires on `GODLY_ABORT`. Six independent kill-shots were attempted in refutation; all six failed.

⚠ **This one touches `structureRampRenderer.ts`, which BRANCH A also owns.** Coordinate with the
merge owner before editing it — if branch A is mid-flight, hand this item to the merge owner instead.
A file touched by two branches is the S182 hazard.

## 5 · 🟠 MEDIUM(↑ from LOW) — THE CASTLE KEEP-OUT SILENTLY GATES FIX/SCRAP

`src/state/structureRepair.ts:126`. **Verified by hand by the merge owner.** S182's placement branch
made the keep-out the FIRST arm of `canBuildAt` (`zones.ts:307`). `canBuildNow` wraps it
(`buildLegality.ts:46`). And `structureRepair` borrows `canBuildNow` as its FIX/SCRAP eligibility
gate — with a comment that names exactly **two** borrowed clauses:

```ts
if (!canBuildNow(world, seed.pos, seat)) return null; // R19 (WHEN) + own ground (WHERE)
```

The keep-out is a silent **third** clause the author never intended. A structure member displaced
inside the disc (the `makeBond` 20 px rest-length floor pushes shapes apart, and nothing pushes them
back out) loses its FIX/SCRAP row — and its FEED row too, because the early return precedes the feed
branch. Sever that member's bond and the lone shape **can never be scrapped or reclaimed for the rest
of the match**, with nothing saying why.

⭐ This is the S182 lesson recurring exactly: two branches each correct alone, wrong together. Their
tripwire proves `canBuildAt` *contains* the keep-out and cannot see who else *reads* it.
**FIX SHAPE:** give reclamation its own predicate rather than borrowing the placement one. ⚠ Owe a
test that FIX/SCRAP still works for a member inside the keep-out disc.

## 6 · 🟡 LOW — COMMENTS THAT WILL MISLEAD THE NEXT SESSION

⭐ **`transport.ts:634` was flagged by THREE independent audit lanes and verified by hand.** It says
the shipped default is broadcast *"(SNAPSHOT_SINGLE_STRATEGY is false pending the owner's decision)"*.
`iceConfig.ts:148` reads `export const SNAPSHOT_SINGLE_STRATEGY = true;`, and the owner RULED it in
S182 (*"if it halves our bandwidth, then of course we need to do it"*, `SPARK_CANON.md` §6). The
comment both states a false value **and** tells the next session a settled question is open.

Also: `netStats.ts:34`'s `dup` interpretation key is inverted in both directions by that same default
(plus a third falsified statement at the counter itself) · `save.ts:1897` claims `prevPos` left the
wire when the strip touches **primitives only** and every free spark still ships it
(`SerializedSpark.prevPos` is a bare field at `save.ts:342`) · `damage.ts:144`, the castle arm, never
records the killing swing, so a fatal keep hit prints the remainder while the other three downward
arms (`:171` shapes, `:208` bags, `:239` Helga) record it · the mass-clear epoch covers the structure
watch but not the creature watch.

⛔ **`SPARK_CANON.md`'s seven stale `§9` cross-references are the MERGE OWNER'S, not this branch's.**
Report them; do not edit the canon.

---

## 7 · GATES

⛔ Read every exit code from a **captured `$?`**. Never through a pipe, and never the wrapper's
trailing `[exited with code 0]` — that line is the harness's, not the gate's.

`npm run typecheck` · `npm run typecheck:server` (the worker is typechecked, off the deploy's
critical path) · `npx vitest run` (5240 / 319 on master) · `npm run build` (charter **875.0 / 1000
KiB, 125.0 KiB headroom — SHARED with two other open branches**) · `npm run e2e:gating`.

## 8 · FILE BOUNDARY — nothing outside this list

`src/render/characterSheet.ts` · `src/render/characterSheetModel.ts` · `src/render/arcadeLeaderboard.ts`
· `src/render/arcadeRun.ts` · `src/render/arcadeRunOverlay.ts` · `src/render/arcadeScores.ts` ·
`server/leaderboard/**` · `src/state/structureRepair.ts` · `src/state/damage.ts` **(the castle-arm
killing-swing line ONLY — branch B owns the rest of this file, coordinate)** · `src/net/transport.ts`,
`src/net/netStats.ts`, `src/state/save.ts` **(comment corrections ONLY)** · their tests.

⛔ Do NOT edit `SPARK_CANON.md`, `CLAUDE.md`, `playwright.config.ts` or `src/ci.e2eLanes.test.ts`.
⛔ Branch A owns `structureRamp*`, `spawnerZoneRenderer`, `towerCover`, `public/art`, `scripts`.
Branch B owns `src/state/creatures/**`, `src/state/defenders/**` and most of `damage.ts`.
⚠ **Two overlaps are flagged above (`structureRampRenderer.ts`, `damage.ts`). Raise them with the
merge owner rather than resolving them yourself** — a defect between two branches has no owner.

⛔ **DO ONLY THESE. Do not refactor, do not tidy, do not fix unrelated things you notice** — report
them instead. S182 measured that the defect rate tracked how much a branch changed, not how hard the
task was, and the branches told *"do ONLY these"* came back materially cleaner.
