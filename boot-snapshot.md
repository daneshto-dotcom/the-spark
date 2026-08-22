# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-22 | Session: S150 | Branch: master | Commit: **10827c2** | PROTOCOL_VERSION: **28**

**S150 shipped SIX priorities, all deploy-verified 4/4. Then the owner asked for a landing audit,
which found 11 defects — including a regression P3 had shipped — and 10 were fixed before close.
FIFTEEN owner rulings (R57–R72) were recorded at the end; four implemented, the rest queued —
R72 defines a whole stat system and supersedes two earlier ones.**

⛔ READ FIRST: the ordered 13-entry `carry_forward_next_session[]` in `.claude/session-state.json`,
and `owner_rulings_s150_late` in the same file — R57–R72 are the owner's own words plus what each
means operationally. **The live carry-forward list is `carry_forward_next_session`**; the legacy
`carry_forward` key is now a synced mirror (it used to be a frozen S147/S148 list that the review
gate read, which is why the gate was showing closed items as open).

## Next Steps

1. **THE STAT SYSTEM (R72), THEN THE GOBLIN TOWER (CF-S150-d, priority 0).**
   ⭐ **DESIGN THE STAT SYSTEM FIRST.** HP / STR / DEF / PENETRATION on ONE shared scale, with
   defence+HP as the exact inverse of ATK+PEN. LADDERS (owner-confirmed): HP and ATK are INTEGER
   points **1..12**; DEF and PEN are multiplier ladders **x1.2, x1.4, x1.6, x1.8, x2.0 … =
   (1 + 0.2n)**, LINEAR — not 1.2^n. A 2 HP / 2 DEF defender rates 2 x 1.4 = 2.8, so a 3-ATK laser
   one-shots it.
   ⛔ **THE FIRST ACT IS A DELETION:** `PRINCESS_SLAP_DAMAGE_VS_CREATURE = round(GOBLIN_MELEE_HP / 2)`
   must GO. Owner: *"a goblins power should not be the backbone for the whole stat system."* The S150
   write-up called that derivation a constraint to work around — that was WRONG; it is the defect.
   **TARGETING MATRIX**, as an explicit table rather than per-unit special cases: Helga = enemy UNITS
   only · chewers = TOWERS only · all goblins, laserTurret, lightningDrones, voltkin = BOTH.
   ⚠ **ONE QUESTION TO ASK BEFORE WRITING CODE:** is ATK a THRESHOLD or a DAMAGE POOL? *"destroyed
   with one laser hit"* implies a threshold; *"attack = -1 hp point"* implies a pool. Under a threshold
   a 2-ATK attacker could never kill a 3-HP target at all, and `damageCreature` is a pool today.
   (The PEN-placement question is already dissolved: comparing ATK x (1+0.2 PEN) against
   HP x (1+0.2 DEF) is algebraically identical to dividing the defender's rating by (1+0.2 PEN), so
   either implementation is correct — prefer the multiply form.)
   THEN **THE GOBLIN TOWER + THE UNIT STAT PASS.** The owner named this the
   headline: *"look again at the goblin tower that we have thought about but havnt built yet… maybe
   we should work on that and the goblin tower amongst other things first thing next session."*
   ALREADY SETTLED: one tower, six outputs (Q9/R24 — R24 supersedes R15). Feed ONE shape, get ONE
   goblin of that type. Shape→unit map (Q1): Dot=suicide · Line=archer · Triangle=swordsman ·
   Square=shield · Circle=hound · Spiral=bat rider. OPEN: every stat, plus the tower's own recipe
   ("like 4 or 5" shapes).
   The goblin's own stats come OUT of the stat system above — do not tune it first. The owner wants it
   near chewer-fragile (R70), and the reason that is safe under R72 is that the slap-damage derivation
   is gone by then. Reference numbers as of S150: CHEWER_HP 1 · GOBLIN_MELEE_HP 6 ·
   VOLTKIN_HP **8** (R71, shipped) · slap damage 3 (to be DELETED) · CREATURE_HIT_DAMAGE 1 ·
   RAID_CREATURE_DAMAGE 1.
2. **BOTS BUILD TOWERS (CF-S149-f) — now UNBLOCKED.** The last of the owner's five S149 playtest
   complaints. All five open rulings answered: R57 bots get the player's shortcut *including saving
   until affordable* (not travel-then-stamp) · R58/R59 loose-shape building stays, difficulty is a
   PREFERENCE weighting not a whitelist · R60 choosing a tower auto-prioritises its shapes for the
   gatherer, per-shape ordering for high-level bots only · R61 all six recipes count as "towers".
   Full tier. **No protocol bump** (bots are host-only, `BotGoal` has no wire surface).
   ⚠ A bot cannot build a tower today for an arithmetic reason: `GROWTH_STEP` (48) is inside
   `AUTO_BOND_RADIUS` (60), so its shapes merge into one ever-growing blob while every recipe gates
   on an EXACT size. And its own litter blocks stamp clearance — fix littering in the same priority
   or the result reads as the same bug.
3. **R63 — THE BUILD PHASE BECOMES GENUINELY PEACEFUL.** Four rules the owner gave, which together
   dissolve the old "quarry is an open hub" problem with no wall geometry at all: (a) the quarry/spawn
   disc is CLOSED to units during BUILD; (b) towers do not shoot or attack during BUILD; (c) they may
   still PRODUCE units, which stand passive near their tower until the FIGHT edge; (d) ~2–3 s before
   FIGHT ends, every surviving unit rushes back to its tower and waits.
4. **R64 — RAID.** A left-click charge that undoes one connection, earned 1 per 5 hand-made
   connectors OR 1 per 3 blueprint buildings — deliberately asymmetric so hand-building outearns
   click-to-build. ⚠ OPEN: whether this replaces the existing `disruptionCharges`/SEVER economy or
   is a second currency. Look at what ships before designing.
5. **R69 — NONET progression.** ~10 puzzles, a time limit each, then a second tier with its own art,
   styling and possibly music. Builds on S150's `arcadeRun.ts` state machine and the top-25 board.
6. **R68's other half.** The arcade high-score fireworks shipped; the WIN-SCREEN fireworks the owner
   remembers from an older version did NOT. I found no surviving code to "add back" — that is
   archaeology someone still owes.
7. Then CF-S147-e (R45 lobby colour/race picker — the only inherited CF whose every file:line still
   verified) · CF1 (`?worker=1` ignition, needs a runtime probe) · CF3 (seeding-vacuity sweep) ·
   CF-S148-b/d (both now correctly diagnosed, so both cheap) · CF-S150-b/c.

## Blockers

None blocking. R72 needs ONE answer before any code is written — is ATK a THRESHOLD or a DAMAGE
POOL? Everything else in the stat system is specified.

## Traps (still live)

- **⭐ NORMALISING A WRITE PATH CREATES AN OBLIGATION ON EVERY READ PATH.** P3 made `recordRun` store
  `normaliseName(name)` and left the board's highlight matching the RAW initials — both halves in one
  commit, both mine. Found by the audit, not by 2848 tests.
- **⭐ ENUMERATE A CHAIN, DO NOT READ IT.** Repairing two known changelog gaps found FOUR: `8→9`
  (missing since S93) and `20→21` (since S144) had survived multiple sessions whose purpose was
  fixing that drift. A human checks the LAST link; only code checks every link.
- **⭐ INSTRUMENT THE FAILURE BEFORE PROPOSING A CAUSE.** bomb.spec cost two wrong hypotheses (the
  drag; then the phase boundary — I even shipped a guard for it). Making the failure message carry
  state produced the answer in one line: `rainbows=1`.
- **⭐ A PARTIAL FIX LOOKS IDENTICAL TO NO FIX.** Suppressing bombs moved 2/6 → 3/8 — inside the
  noise of n=8. Only per-failure evidence (`bombs=0` on the next failures) showed cause one was gone
  and another remained. Quote denominators, always.
- **⭐ THE PDCA GATE'S BRACE-DEPTH HAZARD IS REAL AND I TRIPPED IT TWICE.** Any verification needle
  with an unbalanced `{` skews the awk counter and silently disables the gate. Strip trailing braces
  from needles; check the depth is 0 before committing.
- **A dev-only optimisation can turn a constant into shared state.** `VOLTKIN_HP` 2→8 owed a protocol
  bump because `serializeCreature` omits `hp` when undamaged, so the peer rebuilds from its own
  constant. Additive-optional-whose-absence-means-your-default = a shared constant. Third instance.
- **A REQUIRED hashed World field is TEN sites, and TWO are tsc-forced** (S150 recount, verified on
  all three shipped fields). The long-quoted "nine / one" was traced on an OPTIONAL field, which needs
  no `makeWorld` initializer — that literal is the tenth site, and it is tsc-forced because it is
  annotated `const w: World`. `netSnapshot` is NOT an eleventh (it derives via `Omit`). An OPTIONAL
  field really is nine. The durable copies of this are `LOCKED_DECISIONS.md` and `state/walls.ts`;
  this file is rewritten every handoff, so never treat it as the source of truth.
- Only 3 of 6 recipes are `kind:'defender'`; pentagram/lightningHub are spawners, voltkin cinematic.
  Owner R61 says all six still count as "towers" (a form with a function).
- `placeOf` can never report worse than 26th — it ranks against stored rows and storage caps at 25.
- Mixed line endings per file (protocol.ts LF, LOCKED_DECISIONS.md CRLF) — respect each.
- Bash heredocs here are unreliable for long content; write a script file and run it.

## Pending Backlog

`SPARK_TD_BLUEPRINT.md` + `SPARK_TD_SESSION_SPECS.md` remain the forward plan. **Castle HP / guns /
elimination / placings** (roadmap S150) is still UNSTARTED and is now the largest remaining roadmap
item — Full tier, a new hashed `castles` family, and per the S150 recount a REQUIRED hashed World
field costs **TEN** sites with **TWO** tsc-forced (not the long-quoted nine/one).
