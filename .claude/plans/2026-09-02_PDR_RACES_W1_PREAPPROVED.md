═══════════════════════════════════════════════════════════
    PDR — CASTLE RACES, WAVE 1
    Investigation complete. Council complete. OWNER PRE-APPROVED.
═══════════════════════════════════════════════════════════

Status: **APPROVED — EXECUTE. DO NOT RE-COUNCIL.**
**STATUS: IN-PROGRESS — P1 (S160) + P2 + P3 SHIPPED. ONLY P4 (W1-C) REMAINS, AND IT IS STILL
BLOCKED BY B1. THIS IS STILL THE NEXT SESSION'S ENTRY POINT.**

> ## ⭐ WHERE S161 LEFT THIS (read this block FIRST — it supersedes the S160 block below)
>
> **✅ P3 — W1-B, THE CASTLE BECOMES ITS RACE: SHIPPED.** Six castles × three states generated and
> wired (`public/art/castles/`), per-race gatherer silhouettes, per-race castle attack VFX. No
> protocol bump — the VFX re-derives the shot from `ticksSinceCastleShot`, exactly as the S160 block
> below predicted it could.
> ⚠ **THE ART WENT ROUND TWICE AND THE SECOND PASS IS THE ONE THAT COUNTS.** The first pass drew the
> castles GREY and tinted them at render; the owner rejected it and was right as a matter of
> arithmetic — `Sprite.tint` is a multiply, so grey art yields ONE HUE on every pixel. The castles
> are now painted in their own colour and `syncCastleSprite` does not tint. Do not "restore" the
> tint; read its docblock first.
>
> **✅ P2 — THE SELECTION UI: SHIPPED, and B3 was not the obstacle it looked like.** Click your own
> lobby seat → a six-tile race menu over generated per-race banner art; the same picker also runs in
> the vs-bots setup, per seat, including a row for the human. `CLAIM_RACE` follows the `LOBBY_READY`
> precedent as a top-level NetMessage.
> ⛔ **AND IT NEEDED NO BUMP** — the S160 note above `PROTOCOL_VERSION` predicting one was WRONG and
> has been corrected in place. `LOBBY_READY` bumped for GATING THE MATCH; a race claim gates nothing
> and its answer rides `RosterEntry.color`/`.raceId`, on the wire since v39.
>
> **✅ B2 — SEAT ELIMINATION: SHIPPED on owner ruling R127.** `state/elimination.ts`; last one
> standing; economy gate; spectator; placings. **PROTOCOL 39 → 40.** So the "B2 needs an owner
> ruling" warning in the S160 block below is DISCHARGED.
>
> **⛔ WHAT IS ACTUALLY LEFT: P4 — W1-C (the castle produces its race's unit), STILL BLOCKED BY B1.**
> B1 is unchanged and still real: `applySpawnCreature` silently returns the world UNCHANGED for a
> creature with `sourceSpawnerId === null` when one of that (owner, type) already lives, and only
> voltkin is exempt. Decide null-vs-sentinel AT THE GATE before writing the emitter. W1-D (castle
> upgrades) is untouched and unblocked.
>
> **⚠ ONE ITEM THE SESSION ADDED RATHER THAN CLOSED (CF-S161-a, owner question):** R127 says a fallen
> seat stops earning and spectates; it does NOT say whether its standing towers and creatures are
> swept. S161 left them standing, so a dead seat's defences can still decide the match between two
> living players. That needs a ruling before 4-player balance means anything.

> ## ⭐ WHERE S160 LEFT THIS (read before planning anything)
>
> **✅ P1 — THE RACE TOKEN + THE WIRE: SHIPPED. `PROTOCOL_VERSION` is 39.** `src/state/races.ts`,
> `Player.raceId`, the save round-trip, `RosterEntry.raceId` + `isValidRoster`, all six bump sites,
> the `lobbyRoster` peer-keyed race (B6), the `applyStartGame` else arm (B7), and the four-edit
> `PLAYER_COLORS` audit. Three new test files, five extended. B5 DECIDED and recorded at
> `races.ts`: `raceId` is NOT hashed because it is immutable after Begin — and that argument
> explicitly does NOT transfer to the tech perks.
>
> **✅ BONUS — THE CASTLE WEAPON THIS SPEC ASSUMED EXISTED.** §W1-B ships per-race attack VFX and
> §7.3 lists *"the castle guns"*, but §5.2/§5.3 put the weapon in NEITHER the exists nor the
> does-not-exist table — it did not exist. Built at S160 P4b: `src/state/castleGuns.ts`.
> ⛔ **THE OWNER SUPERSEDED Q4:** targeting is **NEAREST ENEMY IN RANGE**, not retaliation-only.
> ⭐ No stored fire timer — the schedule derives from `world.tick`, so **§W1-B's per-race attack
> VFX needs NO new wire field**; a renderer re-derives when each castle fires and at what.
>
> **⚠ THE LINE NUMBERS IN §15 WERE VERIFIED, AND THIS PDR'S BASELINE WAS STALE.** It was written
> against `1e5b261` (S158) claiming 3353/212; master measured 3399/218 at S160 boot and 3458/221
> at close. A 32-agent read-only pass checked every citation: most were exact, a handful were
> authoring off-by-ones that were already wrong at `1e5b261`, and §14.5's archetype fan-out moved
> ~80-110 lines (real S159 drift). The corrections are in `HANDOFF_2026-09-02_S160.md`.
>
> **⛔ P4 IS STILL BLOCKED BY B1, AND S160 PROVED B1 IS REAL** — it silently collapsed a 20-goblin
> probe to ONE goblin, twice, in my own fixtures. ⛔ **P2 IS STILL BLOCKED BY B3.** And ⛔ **B2
> (seat elimination does not exist) NEEDS AN OWNER RULING** before any 4-player reasoning holds;
> it also bit S160 as a test-repair trap, because zeroing a castle to silence its gun trips the
> first-castle-ends-it win gate and stops combat entirely.
>
> **⭐ THE OWNER'S DIRECTION FOR THE NEXT SESSION (verbatim, 2026-09-02):** *"next session iil be
> leaving you to work to generate everything and implement it all. we will follow the roadmap as
> described as there are already approved pdr so after next session boot you can get to work."*
> So: §6 W1-B is the target, the art is the long pole (57 pieces, SIX castles — `zombie-castle/`
> contains a HOUND), and the standing art rule is **spike it and show the owner before wiring**.

Tier: **Full** (4 priorities, 2 PROTOCOL_VERSION bumps, 57 art pieces across the programme)
Owner: design session 2026-09-02, live back-and-forth. 34 rulings recorded (R93–R126).
Authority: **`SPARK_RACES_SPEC.md`** (repo root) is the spec. This PDR is its execution wrapper.

> ⭐ **READ THIS BEFORE PLANNING ANYTHING.**
>
> The owner ran a full design session and **three review agents** against the live tree on
> 2026-09-02. Every ruling below came from the owner directly. Every code claim was verified with a
> `file:line`. Nine implementation blockers were found and written up **before** any code was
> written.
>
> **You are not being asked to investigate. You are being asked to build.**
>
> Do NOT re-run a Council on the design questions — they are owner-ruled, and re-litigating them
> burns the owner's context for nothing. Do NOT re-derive the site lists — §15 of the spec has them
> with line numbers. Do NOT re-audit whether the plan is coherent — that is what §14 is.
>
> **What you SHOULD still do:** verify the spec's line numbers against your local checkout before
> editing (this plan was written against commit `1e5b261` + docs; a `file:line` can drift), run
> `npm ci` first, and run the gates. Verification is welcome. Re-deliberation is not.

---

## 0. WHAT THIS IS, IN ONE PARAGRAPH

Six player colours become six races — vampires, nagas, mummies, zombies, orcs, demons — each with a
castle, a unit, a tier-3 tower, and a perk drafted every fifth wave. Every castle stays
**stat-identical** forever (R94/R117); races differ in look, movement, what their castle emits, which
unique tower they can build, and which perk branch they buy into. Wave 1 is the four priorities
below. Waves 2 and 3 (the six tier-3 towers, then the per-tier grid) are specced in
`SPARK_RACES_SPEC.md` §7–§8 and are **not** in this PDR.

---

## 1. THE PRIORITIES

| # | Priority | Tier | Protocol | Gate |
|---|---|---|---|---|
| **P1** | **The race token + the wire** (`raceId` on `Player`, `RosterEntry`, save, roster, START_GAME) | Full | **38 → 39** | spec §15, site-by-site |
| **P2** | **The selection screen** (solo, vs-bots, lobby claim/arbitration) | Standard | rides P1 | ⛔ read §14 B3 first |
| **P3** | **The castle becomes its race** (art, 3 states, gatherer silhouettes, attack VFX) | Standard | none | look at a real frame |
| **P4** | **The castle produces + army shelters** | Full | **39 → 40** | ⛔ read §14 B1 first |

**P1 is first and almost alone.** Every later surface reads `raceId`.

⭐ **The tech draft (spec §9) is NOT in this PDR and should be offered separately.** It needs only
`raceId`, four of its six perks are one-constant changes, and it delivers more race identity per unit
of effort than the towers do. If P1–P4 land early, offer it at batch close rather than starting
Wave 2.

---

## 2. ⛔ THE FIVE BLOCKERS — READ BEFORE TOUCHING THE RELEVANT PRIORITY

Full detail with citations in `SPARK_RACES_SPEC.md` §14. Compressed here so no priority starts cold.

### B1 → gates P4. The castle emitter is blocked by a shipped gate.
`applySpawnCreature` (`creatureLifecycle.ts:147-156`) returns the world **unchanged — no error, no
log** — for a creature with `sourceSpawnerId === null` when one of that `(owner, type)` already
lives. Only `voltkin` is exempt. The obvious emitter therefore mints **one unit per seat for the
entire match**, then silently no-ops. ⚠ It looks correct on an empty fixture. Decide `null` vs a
castle sentinel `SpawnerId` (which then touches `ownHomePos`, `underGoblinCaps`,
`recipeStillSatisfied`) and write the reason at the gate.

### B2 → gates P4's scenarios. Seat elimination does not exist.
`gameState.ts:76-88` — the **first** castle to reach 0 HP ends the match for everyone and awards
victory to `survivors[0]`, i.e. Map iteration order. Any 4-player reasoning that assumes surviving
seats is unreachable today. **Either add elimination as a fifth priority or accept the current
behaviour explicitly.** Owner ruling needed if you want the former.

### B3 → gates P2. `CLAIM_RACE` cannot be a client intent.
Three gates are shut before Begin: `hostSync` is null (`hostHandlers.ts:306`), `hostSeats` is empty so
intents are dropped fail-closed from unseated peers (`:336-341`, `session.ts:39`), and `world.players`
holds only seat 0. **Use the `LOBBY_READY` precedent** (`protocol.ts:906-909`, handled at
`hostHandlers.ts:389-393`) — a top-level `NetMessage` kind keyed by transport `peerId`. Site list in
spec §15.4. Also: `LOBBY_PRESENCE` is emitted only from `onPeerChange`, so the claim handler must call
the broadcast itself.

### B4 → gates P1. The rainbow shuffle fights race-derived colour.
`applyTriggerRainbow` (`rainbowLifecycle.ts:129-135`) permutes `player.color` in place.
**RULING: shuffle `color`, never `raceId`.** ⛔ Therefore **do not delete `Player.color`** and do not
make it a getter — "derived" means derived at construction. ⚠ Related and easy to miss: every recipe
resolves its owner by `p.color === anchorPrim.placerColor` (`pentagram.ts:141-149`), so the Wave-2
race towers each need an owner resolver.

### B5 → gates the tech draft, and P1 should decide it now.
Perks and `raceId` are sim inputs and must be hashed — but `FIELD_COVERAGE` is keyed on `keyof World`
and marks `players: 'acknowledged'` (`stateHashFull.ts:167`), so putting them on `Player` **compiles
clean and escapes the wide oracle with no tripwire**. Weigh both options (hash the `players` family —
breaks the oracle by its own docblock; or a new hashed `World` field — full ten-site bill) and
**record the choice**. Do not default to "follow the `raidPoints` precedent": `raidPoints` is a
currency nothing simulates from.

### Four more that silently half-land — spec §14.2
`buildMatchRoster` discards all but `peerId` (`lobbyRoster.ts:129`) · `applyStartGame`'s idempotent
arm drops the **host's own** race because seat 0 always already exists (`gameMode.ts:245-252`) · there
is no `SHELTERED` state for creatures and `recallArmies`' docblock is a standing ruling against adding
one (`hostTick.ts:169-174`) · `runSpawnerIgnition` is a hardcoded chain that already caused this exact
failure once (`godlyMatcherCore.ts:142-171`, S152 P2).

---

## 3. THE OWNER RULINGS — R93 THROUGH R126

Full text in `SPARK_RACES_SPEC.md` §1. **All are owner-stated. None are open.** Load-bearing subset:

- **R94/R117** — every castle and every race unit is stat-identical. Races differ in delivery and
  movement, never in numbers.
- **R95** — race towers are ADDITIVE; all seven global towers stay buildable by everyone.
- **R97/R104** — a race upgrade may never touch HP/DEF/ATK/range; castle upgrades move the castle,
  the tech draft moves the army. No overlap.
- **R107/R108** — the castle emits free on a ~30 s timer; the tier-3 tower is FED for more of the same.
- **R110** — one player per race per match; first to choose locks it.
- **R118** — a draft option grants **+1 point** on its axis (which on DEF/PEN is exactly the owner's
  +20%, because the ladder steps by 0.2).
- **R123/R124** — race units live until killed, no per-player cap; the cap is on the TOWER (~10).
  ⚠ A **sentinel backstop** is still required — the `CHEWER_MAX_* = 10_000` pattern, spec §9B.
- **R125** — the race unit is 1 HP / 1 DEF / 1 ATK / 1 PEN. Verified against the live roster in §9C.

---

## 4. EXIT GATES

Per priority, and all four must hold at batch close:

1. `npm ci` → `npm run typecheck` clean → `npx vitest run` green (**baseline 3353/3353 across 212
   files**, measured 2026-09-02 — not the 3244/204 the old handoff claimed) → `npm run build` under
   the 900 KiB cap → `npm run e2e:gating` exit 0.
2. Both protocol bumps edit **all six** sites (`LOCKED_DECISIONS.md` §S150); `protocolVersionSync.test.ts`
   is the gate and must be left free to fail.
3. **P3 is render work: capture a real frame and look at it.** A green suite proved nothing when the
   FIGHT banner shipped permanently oversized.
4. A race choice survives the wire, a save/load, **and a host migration** — the migration leg is the
   one `layoutWire.test.ts` exists because it had been read rather than proven.

---

## 5. WHAT IS DELIBERATELY NOT DECIDED

Exactly one item, and it is scheduled rather than open: **the 18 race perks for waves 10/15/20.**
R112 defers them with a named trigger — *ask the owner once wave 5 has been played*. Waves 10/15/20
ship as **single-option drafts** in the meantime (R126), never a two-option screen with a dead button.

⚠ One audit gap, stated honestly: a fourth agent was to check this spec against `BACKLOG.md` and the
older roadmaps for cross-document contradictions. **It died on an account spend limit and did not
report.** Nothing is known to conflict, but that specific sweep was not completed. Cheap to redo.

---

## 6. THE ART — the real long pole

**57 pieces**, and the code is cheap next to it. Use the `assets-source/<pack>/` parallel-session
workflow (`assets-source/README.md`) — an authorized exception to the one-session rule, disjoint paths,
both sessions push to master. Front-load two:

- ⛔ **The zombie hound attack clip has failed generation twice** (CF-S153-c). Retry it early.
- ⚠ **`assets-source/zombie-castle/` contains a HOUND, not a castle.** All **six** castles need
  generating, three states each.
