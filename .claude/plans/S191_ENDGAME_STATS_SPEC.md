**STATUS: COMPLETE — S191 `s191/endstats` v1 END-OF-MATCH STAT BOARD shipped (deploy #22, S193; matchboard v2 S194). Original header: built on the owner's standing go (merge-owner redirect, S191).**

# S191 — END-OF-MATCH STAT BOARD, v1 SPEC

## 0 · Where this comes from (nothing below is re-researched)
- **S179 research** (3 lanes + synthesis, Dota 2 / LTD2 / AoE2 / SC2 / Civ VI / Total War, sources in the workflow journal
  `~/.claude/projects/<spark>/9a13a4d1-…/subagents/workflows/wf_8afd6d5c-769/journal.jsonl`): one row per player, a
  handful of numbers, **one headline per row**, per-WAVE graphs (LTD2 plots per wave), **no composite "MVP" score**
  (the LTD2 "Pressure applied = MVP joke" failure), and in an FFA **a survival marker in every row** or an early-out
  seat reads as lazy. S180/S181 recon: `S180_BACKLOG.md:131-137`, `S182_BACKLOG.md:59` (the WIN teardown trap).
- **His words.** S179: *"how many units were built by each character, how many buildings or connectors were built, how
  much damage was done … taken … with even graphs … a simplified version"*. S191: *"how many units were built, how many
  units were killed of each type … the graphs showing like all the players and how much they have built and like
  compared to each other."* That answers `S182_BACKLOG.md:70` B2 ("what goes on it").

## 1 · What he sees (POSTGAME only — the 2 s WIN banner lands on its own first)
```
                                   ★ PLAYER 2 WINS ★
  PLACE  PLAYER         SCORE   UNITS  KILLS  TOWERS  DEALT   TAKEN
  1st    P2 ORCS         2,510    184     97    9/2   6,880   4,210     ← row = seat colour, local row marked YOU
  2nd    P1 VAMPIRES     1,940    152     81   11/4   5,015   6,880
  3rd    P4 NAGAS  OUT W7   820     98     40    5/5   2,140   5,015
  4th    P3 DEMONS OUT W5   310     61     12    3/3     760   3,760
  ─ P2 · UNITS BUILT: CASTLE UNIT 120 · GOBLIN 40 · …   KILLED: CASTLE UNIT 60 · CHEWER 30 · …   (hover a row)
  [ SCORE per wave: 4 lines ]          [ BUILT per wave (connectors standing): 4 lines ]
  every number is in the same units that float off a unit                          [ CONTINUE ]  (or R)
```
| cell | meaning | source |
|---|---|---|
| PLACE | R10 last-one-standing, **R20 "remaining places ordered by score"** — winner 1st, other survivors by score, fallen in reverse elimination; seat-id tie-break | `matchPlacings` (**R20 half was unbuilt — fixed here**) |
| OUT Wn | the wave the castle fell (the FFA comparator) | NEW stamp in `markFallenSeats` |
| SCORE | the seat's banked score, floored — the number the HUD and the win bar read (a spendable balance, not "earned") | state: `scoreByPlayer` |
| UNITS | units minted for the seat, **per type** in the breakdown line | NEW counter, `applySpawnCreature` (3 mint sites) |
| KILLS | enemy units this seat killed, **per victim type**, credited to the KILLER's seat | NEW counter, `damageEntity` creature arm |
| TOWERS | towers built / towers that fell mid-match (defenders + spawners) | NEW counters, the two register + three removal sites |
| DEALT / TAKEN | damage in **fifths as ACTUALLY APPLIED** — after castle DEF, after every clamp, never the swing | NEW counters inside `damageEntity` + `damageConnector` |

Graphs: x = wave (one sample per wave edge + a final sample at the win), y = the seat's value, one line per seat in its
colour. **SCORE** = the floored balance. **BUILT = connectors the seat has standing** — ⚠ MINE: chosen because every
structure's pool on the ONE ladder is a function of its connector count (`pool(n) = n(5+n)`), it is linear (a blob cannot
dwarf the chart the way a pool sum would), it rises when you build and FALLS when you are chewed (the Dota net-worth
story), and bonds survive the WIN teardown. Lever: `sampleBuilt` in `matchStats.ts`.

## 2 · The counters — exact rules
- **Applied damage.** castle `hpBefore − castleHp` (after DEF + clamp); creature `before − max(0, ehp)` and 0 on a
  corpse-in-waiting; shape `min(amount, pool after the lone-shape clamp)`; bag / Helga `min(amount, ehp)`; tower 0;
  connector = the full hit (R173-B: the pool is structure-wide and overkill CARRIES), minus the overkill lost when the
  last connector of a structure breaks. TAKEN → the victim's owner (`ownerPlayerId` / `placedBy` / `seat` /
  `bond.aId → placedBy`). DEALT and KILLS → the attacker's seat; **self-hits count as taken only**.
- **Attribution.** `DamageAttacker` gains `{ kind: 'seat', seat }` — "a seat with no entity to turn on". Retaliation,
  lifesteal and THE RISEN all test `kind === 'creature'` explicitly, so the variant is inert for them (no rule changes).
  Passed by: the castle gun, the three RAID arms, and every blast that already names its owner (`sparePlayerId` →
  suicide goblin, drone, stink bag + death blast, Ra column) plus the suicide/Ra connector passes. **Still `null`
  (unattributed, counted as TAKEN only):** the Pharaoh's divine fire (spares nobody by ruling) and SCORCHED GROUND
  (`s191/owner` is rewriting that file — it can pass `{kind:'seat'}` later, one token).
- **Kill = exactly once**: `died && before > 0` (a second lethal blow on a deferred corpse is not a kill; the channelling
  Pharaoh's restore-to-1 is not a death).
- **Towers.** built = `applyRegisterDefender` / `applyRegisterSpawner` minting an id. fell = `destroyDefender` and
  `awardSpawnerKillReward` (the spawner poll's one destruction event — never teardown, never a T9 ring released as
  its boss). ⚠ MINE: HELGA is not a tower (a unit her hall re-summons every BUILD); and the sim never records WHO
  broke a recipe, so "fell" includes a tower its owner scrapped or extended. Teardown (`.clear()`) never counts.
- **Host-only by construction**: every site is a host reducer; a client's copy is overwritten by each snapshot.
  Integers only; no `Math.random`, no clock; per-type records are written and hashed in sorted key order.

## 3 · Determinism, wire, migration, worker (Council item, S191)
- **State.** One `World.matchStats` = `{ seats: Map<PlayerId, SeatStats>; history: WaveSample[] }`. Factory +
  reset at `applyStartGame` / `applyReturnToTitle` / `softReset`. Hashed in the WIDE oracle only (`ms`/`mh` parts);
  the narrow production hash is untouched.
- **Sampling.** `hostTick.ts` wave edge (one line, right after `waveNumber += 1`) records wave N−1; the final sample is
  taken in the `WIN_TRIGGER` reducer **before any teardown line**, host-only (`world.isHost`), so both win paths get it.
- **Wire.** `WorldSnapshot.matchStats` is ADDITIVE-OPTIONAL: absent while every counter is zero (opening snapshots stay
  byte-identical). `seats` (running totals, ~150 B/seat) rides every snapshot — that IS "the current wave's counters".
  `history` rides **only** (a) in the `HISTORY_WINDOW_TICKS` (2 s) after each sample, (b) through WIN/POSTGAME, (c) in the
  full local `snapshot()` (disk save, worker INIT, takeover). **Measured** (`matchStats.wire.test.ts`, 4 seats × 8
  types × 30 waves, a heavy late match): running totals **1,527 B** per snapshot (~1.8 % of the S182 84 KiB table);
  with the history **6,765 B**, for ~20 snapshots per wave ≈ **0.7 KiB/s** averaged.
- **Receiver.** `seats` replace; `history`, when present, is the WHOLE history and replaces; absent ⇒ keep what you hold.
- **Why not the Council's once-per-edge MESSAGE** (deviation, stated): a one-shot message lost once is a hole forever
  and needs a new `NetMessage` kind plus a request path; riding ~20 snapshots per wave costs ≈0.3 KiB/s, needs no
  `src/net/**` change, and a successor or joiner that missed an edge **heals itself at the next edge** (and always at
  the WIN). Neither "request" nor "re-derive": re-sent. A host migration keeps the successor's received history and
  the running totals from the last snapshot; the `?worker=1` mirror receives the same windows every ≤100 ms.
- **Protocol verdict: no bump of its own.** Nothing any reducer reads comes from these counters (they are INERT — stated
  at the type); a peer without the board ignores an unknown key; the S186 test finds no computation two builds can
  disagree on. `DamageAttacker 'seat'` is a call-site type, never serialized. It rides whatever bump its deploy takes.

## 4 · UI + the POSTGAME click hazard
- `src/render/matchBoardModel.ts` (pure, tested) + `src/render/matchBoard.ts` (Pixi). Visible iff `gameState ===
  'POSTGAME'`, re-derived every frame (the arcade overlay convention — no show/hide to leak on five exits).
- ⛔ `main.ts` resets the match on ANY canvas click in POSTGAME. Now: the canvas click is swallowed while the board is up;
  the board's own **CONTINUE** button (primary button only, armed 1.2 s after the board appears) or **R** leaves.
- HUD `drawWinState` stops drawing its POSTGAME line (the board carries the winner headline instead).
- Staged by its construction line right after `characterSheet.bringToFront()` — no zIndex (canon §7b).
- Bundle ≤ 10 KiB of the shared headroom; Pixi Graphics polylines, no chart library. **Measured:** eager, the branch
  was +12.4 KiB (base 955.9 → 968.3 KiB) — over. The view + model are now a LAZY chunk (`matchBoard-*.js`, 7.9 kB /
  3.5 kB gzip) fetched when a match starts, behind an eager shim (`matchBoardHost.ts`): entry **961.2 KiB, +5.3 KiB**.

## 5 · Build plan — file by file (hours)
| file | change | h |
|---|---|---|
| `src/state/matchStats.ts` NEW | types, zero, record*, sample, serialize/apply/hash helpers | 1.5 |
| `worldTypes.ts` · `world.ts` · `gameMode.ts` · `gameState.ts` | the field; factory; 3 resets; final sample in WIN_TRIGGER | 0.5 |
| `save.ts` · `stateHashFull.ts` (+ its test row) | snapshot/netSnapshot/apply; `ms`/`mh` projection | 1 |
| `damage.ts` · `lifesteal.ts` · `castleGuns.ts` · `world.ts` · `suicideBlast.ts` · `powerOfRa.ts` + 2 census tests | attribution + the two chokepoint records | 1.5 |
| `creatureLifecycle.ts` · `defenderLifecycle.ts` · `spawnerLifecycle.ts` · `elimination.ts` · `hostTick.ts` | one-line hooks; R20 placings | 1 |
| `matchBoardModel.ts` · `matchBoard.ts` NEW · `ui.ts` · `main.ts` | model, view, banner line, construction + POSTGAME block | 3 |
| tests | recorder arithmetic, real-host-tick scripted match, REACH (board non-empty after a real WIN), host-vs-worker wide hash, save round-trip + byte identity, model, click hazard | 2.5 |
| **total** | | **≈ 11 h** |

## 6 · Deferred (v2, in his S179 order of value)
Who-hit-whom 4×4 matrix · a per-wave BUILD scrub · a DAMAGE-per-wave graph (the sample needs one more field) · career
totals (localStorage) · per-tower kill hover. ⚠ The draft path and racial-perk moments on the graph axis (brief §1) are
v2 — `draftPicks` survives the win, so it is render-only when it comes.
