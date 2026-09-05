# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-05 | Session: S164 | Commit: `a8e5e5d` | **PROTOCOL 41**

State at close: `tsc` 0 · **3679/3679** unit tests / 234 files · `e2e:gating` exit 0, 62 passed ·
bundle **781.7 / 900 KiB** (headroom 118.3) · `verify-deploy` **PASS 4/4** at `d16ce2d` ·
MCV `hard_fail=0` · 9/9 relays.

> ⭐ **V6-2.4 IS FINISHED AND DEPLOYED.** The castle now regenerates HP as a VP-purchased upgrade
> (owner R128–R131, PROTOCOL 40→41). Verifying it turned up **two real bugs in already-shipped
> code**, both fixed: the castle strike preempted the bond arm (so a Voltkin near a keep never
> severed connectors), and `damageEntity` was a working, unvalidated HEAL vector for the castle.
>
> ⭐ **THE SIX RACE UNITS ARE DRAWN, ANIMATED AND ATLASED** — 6 designs, 24 veo clips (idle / walk /
> attack / **die**), 6 atlases. ⛔ **NOTHING IN `src/` REFERENCES THEM YET.** The owner chose
> art-first; the emitter is next session's work and both of its old blockers are gone.

## Next Steps

1. ⭐ **W1-C — WIRE THE CASTLE EMITTER.** The art is done and both blockers are resolved:
   · **B1** → owner **R133**: give the castle a **sentinel `SpawnerId`** so race units take the normal
     spawner population path (do NOT widen the voltkin exemption — the gate bounds `SPAWN_CREATURE`
     as a *client intent*). Touches `ownHomePos`, `underGoblinCaps`, `recipeStillSatisfied`.
   · **Blocker 8 DISSOLVED** — creatures need **no `SHELTERED` state**. `recallArmies`
     (`hostTick.ts:395`) already teleports every creature home on the FIGHT→BUILD edge, and the whole
     creature fan-out is FIGHT-gated, so *born at the anchor + existing gate + existing recall* IS the
     shelter/release/recall cycle. Its docblock explicitly forbids adding a state.
   · Cadence on `world.tick` only (~30 s, R120). ⭐ **No protocol bump owed** — it rides P1's 40→41.
   · Then a `RACE_UNIT` table + `creatureRenderer` wiring for the six new atlases.

2. ⛔ **REGENERATE THE ART WITHOUT A BAKED GROUND SHADOW.** Owner: *"the shadow is of the players race
   color"* — and he is right, the code already agrees: `goblinRenderer` draws a ring in the **owner's
   tint** at the creature's real position, and its docblock records that a black shadow there was a
   *measured no-op* because the board is pure black. `sharedStyle` in `design-spec.json` still asks
   for *"a small soft dark oval shadow"*; **that instruction is mine and it is the defect.** Removing
   it also kills a whole class of matte ambiguity (a mid-grey ellipse is neither near-white nor
   near-black, which is why one vampire frame kept a grey oval). Cost: 6 designs + 24 clips + 6
   atlases.

3. **THE ART-DIRECTION BRIEF (#3)** — per-race zone backgrounds + tier-9 boss towers. The NONET
   collision is **cleared** (R132: NONET is now 12, the boss keeps 9). ⭐ **R137: TWELVE backgrounds,
   not six** — one per race *per board*, because a `PITCH_2P` zone is **960×1080 portrait** and a
   `QUADRANTS_4P` zone is **960×540 landscape**, and the castle anchor sits in the goalmouth on one
   and the outer corner on the other. Generate the 4P landscape first and seed the 2P off it.

4. **V6-1.6 ENERGY SINKS — PARKED, OWNER WANTS TO DISCUSS FIRST.** Do not start it. Bring this to the
   conversation: `player.energy` has **exactly ONE production read** (`ui.ts:1104`, the gauge), yet it
   accrues every tick for every player and rides the wire as a **mandatory** serialized field. It is a
   fully-built currency that does nothing.

5. **THE TIER-3 RACE TOWER UNITS (R134/R135)** — piranhas · beetles · the hound (already drawn at
   `assets-source/zombie-castle/`) · bats · orc warband · soul-eaters. ⚠ The owner asked for **varied
   stats**, which **reverses R117**; that is coherent only because R134 splits castle-spawn from
   tower-spawn, dissolving R117's "one tower bypasses the balance" premise. **The numbers are NOT
   ruled** — Wave 2 work, and whatever is written will be mine unless he supplies figures.

## Blockers

- **OWNER ACTION** — re-paste the three TURN secrets clean (bare value, no key name/quotes/comma).
  Multiplayer works today via the runtime repair; this is hygiene. `TURN_SETUP.md`.
- **OWNER RULING** — abandonment/forfeit in 1v1 (inherited, and now sharper: S163's witness guard
  trades a hang for correctness and only a ruling settles it) · whether a WIN should be reversible by
  a verified higher-epoch migration claim · the R72 tower targeting matrix (`defenderCanTarget` has
  zero production callers; wiring it changes gameplay) · whether to hash the seat-outcome scalars.
- **`origin/gh-pages` still exists.** Left alone deliberately — deleting it is OWNER-GATED per
  `CLAUDE.md` and must follow the build_type flip, not precede it.

## Pending Backlog

- [ ] **W1-D — castle upgrades.** The one races slot that is untouched AND unblocked.
- [ ] **V6-1.5 the hero unit** — load-bearing for Phase 1 but the backlog's own audit calls it
      mis-tiered and destructive: deleting carry silently makes bomb/rainbow/potato always-grabbable,
      strips poop's only economic bite, and costs the hunter confiscation until V6-2.2.
- [ ] **`GODLY_TRIGGER` is unfenced AND ungated** — the one host-authored kind that is both (filed
      S163). It dispatches into the world and writes `godlyFiredThisMatch`, a once-per-match record.
- [ ] **A death row exists in every race-unit atlas and NOTHING PLAYS IT.** `goblinRenderer` maps
      three FSM states and creatures are removed the instant they are killed. Needs a dying window in
      the sim — serialized state, its own piece of work.
- [ ] **Orc matte is a compromise, not a fix.** For that character eyes and leaks are the SAME SIZE
      (measured curve has no knee), so 0.0003 keeps ~55% of eye detail and ~31% of the leak. The real
      fix is upstream, with item 2 above.

## Recent Reflexion (last 2 sessions)

See `.claude/reflexion_log.md` — S164 and S163 both at the top (49 entries after prune). The two that
generalise furthest:

- **S164 #owner-number-checked-not-obeyed** — the owner gave a number that would have deleted a win
  condition, and doing the arithmetic before writing code is the only reason it did not ship. A brief
  is an intent; the *unit* is the spec.
- **S163 #the-audit-found-more-in-todays-work** — for the second session running, an adversarial pass
  over the same day's commits found a HIGH bug inside the flagship fix plus fourteen overstated
  claims. Fresh code is not safer code; it is merely less examined, and the author is worst-placed to
  notice.
