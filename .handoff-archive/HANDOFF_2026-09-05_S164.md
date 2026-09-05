═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-09-05 | Session: S164
Focus: finish V6-2.4 (castle HP/damage/repair), then W1-C race units
═══════════════════════════════════════════════════════════

## PROJECT
- Working dir: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
- Branch: `master` · Latest: `a8e5e5d` · **PROTOCOL_VERSION 41** (was 40)
- Stack: TypeScript / Vite / Pixi / Trystero WebRTC · live at **spark-online.space**

## CURRENT STATE
- `typecheck` **0** · `vitest` **3679/3679** across 234 files · `e2e:gating` **exit 0**, 62 passed
- `build` **781.7 / 900 KiB** (headroom 118.3) · `probe-relays` **9/9**
- `verify-deploy` **PASS 4/4** at `d16ce2d` — relay shipped
- MCV `verify-session-claims.py` **hard_fail=0 warn=0 → exit 0**
- CI: every S164 deploy concluded **success**; e2e lanes green and not cancelling each other
  (the per-commit concurrency group from S163 is working)

## THIS SESSION'S WORK

**V6-2.4 — FINISHED (P1–P4, all deployed).**

- **P1 `641783c` — the castle regenerates, if you bought it. PROTOCOL 40→41.**
  The spec's repair mechanic was **unimplementable**: both design docs say repair works by
  *"attaching connectors"*, but A.0 proved the castle is not a bondable entity — bond endpoints are
  typed `PrimitiveId` and the castle is one scalar on `Player` with no geometry in `world.primitives`.
  The owner replaced the model (R128): VP buys an HP-regen upgrade, exactly as `constants.ts`'s R88
  note had predicted. New `castleRegen.ts` + `UPGRADE_CASTLE_REGEN` client intent + a castle-panel row.
  ⛔ **Per SECOND, not per tick (R130) — and that was a ruling, not a reading.** Per-tick is 900 HP/s
  against a goblin's 6, out-healing 150 attackers: the castle becomes unkillable at lv1 and the second
  win condition stops existing. The arithmetic went to the owner; per-second was chosen.
  ⭐ The ladder is the shipped 0.2 step (verified against `stats.ts`), and every level lands on **whole
  HP** (15/18/21/24/27) — which is why regen is integer HP on a per-second tick cadence with no float
  accumulator. Field made **required**, so `tsc` flagged all four construction sites including the two
  carry-FSM rebuilds it could not have caught if optional.

- **P2 `0e39f74` — the castle strike preempted the BOND arm.** `creatureAttack` said twice that the
  castle was *"Ordered LAST"*; it was not. S157 F1 fixed the SHAPE arm and stopped, leaving the
  connector family — exactly the family admitted to castle attacks — underneath. A Voltkin (range 180)
  committed to a connector near a keep never severed it. ⚠ The suite was green **before and after** the
  reorder; nothing pinned the documented order, so the regression test is the deliverable.

- **P3 `e54aeab` — `damageEntity` was a working HEAL vector, and only for the castle.** The castle arm
  returned *above* the integer/non-negative guard, so `damageEntity(castle, -300)` added 300 HP,
  unvalidated and unclamped. Combined with `save.ts` emitting `castleHp` only when below max, an
  over-max value would have been a **silent wire divergence** neither hash oracle can see.

- **P4 `a4585a6` — NONET is twelve (R132).** The boss tower's "nine of the race shape" collided with
  the NONET sweep. Separated by **count, not precedence**: 9 = boss, 12 = NONET. The footer-menu half
  of R132 was already true by construction and is now pinned against the live model.

**P5 — RACE UNIT ART (delivered, NOT wired).** 6 designs + 24 veo clips (idle/walk/attack/**die**) +
6 atlases, every clip seeded image-to-video off its own design PNG. Three owner rejects, all fixed by
measurement rather than eyeballing:
- *"naga not coherent… twice bigger in different states"* → `sampleWindow` 16 (cell 336→246).
  ⚠ Costs motion; 32 and 44 were tried and both still shrank the walk row.
- *"there is white background… spaces between the wings"* → a census found **~21,500** leaked px across
  **all six** (nagas and demons worse than the two spotted). `enclosedWhiteLimitPct` 0.003 → 0.00004.
  Total leak now 1,247 — **94.2% removed**. Brightness was tested as an alternative discriminator and
  rejected (leaks are anti-aliased background, not pure white).
- *"you have removed the white from the orcs eyes"* → for the orc, eyes and leaks are the **same size**;
  the measured curve across five thresholds is monotonic with **no knee**. Given its own 0.0003.
- Vampire attack regenerated: veo had drifted a **scythe** in that the design does not have.

## OPEN ISSUES
- ⛔ **The baked ground shadow must come out of the design prompts.** The renderer already draws a ring
  in the owner's tint (`goblinRenderer`), and a black shadow there is a *measured no-op* on a pure-black
  board. `sharedStyle` still asks for one — my defect, and the reason a vampire frame kept a grey oval.
  Fix = regenerate 6 designs + 24 clips + 6 atlases.
- **Orc matte is a compromise**, not a fix (~55% eye detail, ~31% of leak remains). Upstream fix above.
- **The `die` row exists in all six atlases and nothing plays it** — creatures are removed on death;
  needs a dying window in the sim (serialized state).
- **`GODLY_TRIGGER` is both unfenced and ungated** (filed S163, still open).
- `origin/gh-pages` still exists — left alone deliberately, deleting it is OWNER-GATED.

## BLOCKED ON
- **Owner action:** re-paste the three TURN secrets clean (hygiene — multiplayer works today).
- **Owner rulings:** abandonment/forfeit in 1v1 · whether a WIN is reversible by a higher-epoch claim ·
  the R72 tower targeting matrix · whether to hash the seat-outcome scalars · **the tier-3 unit stat
  numbers** (R135 asks for "varied" but supplies no figures).

## NEXT STEPS (priority order)
1. **Wire the W1-C castle emitter** — both blockers gone (R133 sentinel `SpawnerId`; no `SHELTERED`
   state needed because `recallArmies` already does it). No protocol bump owed.
2. **Regenerate the art without a baked shadow.**
3. **The art-direction brief** — NONET collision cleared; **12 backgrounds not 6** (R137).
4. **Discuss V6-1.6 energy sinks** — parked at owner request. `player.energy` has ONE production read.
5. **Tier-3 race tower units** (R134/R135) — Wave 2.

## CHANGED FILES
19 commits, `b75472f..a8e5e5d`. Code: `castleRegen.ts` (new) · `constants.ts` · `player.ts` ·
`save.ts` · `world.ts` · `hostTick.ts` · `gameMode.ts` · `elimination.ts` · `benchGate.ts` ·
`protocol.ts` · `damage.ts` · `creatureAttack.ts` · `sudokuEvent.ts` · `castlePanel.ts` · `main.ts` ·
`e2e/smoke.spec.ts`. Art: `assets-source/race-units/` (3 specs, 6 PNGs, 24 clips) ·
`public/godly/unit-*/anim/` (6 atlases + manifests).

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: **4/6 complete** (P5 art-only, P6 not started)
- P1 castle regen upgrade — completed — `641783c`
- P2 castle strike vs bond — completed — `0e39f74`
- P3 damageEntity heal vector — completed — `e54aeab`
- P4 NONET 9→12 — completed — `a4585a6`
- P5 W1-C — **art delivered, wiring NOT started** — `d16ce2d`
- P6 art-direction brief — not started

## REFLEXION ENTRIES (this session)
10 entries appended to `.claude/reflexion_log.md`. ⚠ **S163's 10 entries were also appended** — S163
was left open at owner request so its `/handoff` never ran and they had been stranded in session-state.
Log pruned to 49.

## CARRY-FORWARD PRIORITIES
1. **W1-C emitter wiring** — art done, blockers resolved, PDR is
   `.claude/plans-archive/2026-09-02_PDR_RACES_W1_IN-PROGRESS.md`
2. **Art regeneration without baked shadows** — diagnosed, not started
3. **Art-direction brief (#3)** — unblocked, 12 backgrounds
4. **V6-1.6 energy sinks** — PARKED pending owner discussion
5. **Tier-3 race units (R134/R135)** — Wave 2, numbers not ruled
═══════════════════════════════════════════════════════════
