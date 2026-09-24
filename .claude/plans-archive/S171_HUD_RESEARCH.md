# S171 — RESEARCH: the four playtest items (R171-E/F/G/H)

Dispatched the moment the owner described them, 4 lanes + an adversarial pressure-test on each.
**8/8 agents returned, 0 errors** (`wf_cc3b099c-54e`). Every claim below carries file:line in the raw
output; the pressure-test verdict is recorded per lane because two of the four designs were wrong in
ways that would have cost a session.

> Full raw output (≈181 KB):
> `~/AppData/Local/Temp/claude/…/739c07de…/tasks/wmhujv7gy.output`
> Per-agent results: `…/subagents/workflows/wf_cc3b099c-54e/journal.jsonl`

---

## 1 · HEALTH BARS (R171-E) — verdict **SOUND_WITH_FIXES**. Small, and the diagnosis is exact.

⭐⭐ **THERE IS ALREADY A PARTIAL IMPLEMENTATION, AND ITS THREE DEFECTS ARE *LITERALLY* THE BROTHER'S
COMPLAINT.** `goblinRenderer.ts:943` `drawHpPips`, called once at `:781`:

| defect | evidence | how it reads in play |
|---|---|---|
| **Hides while undamaged** | `goblinRenderer.ts:955` `if (remaining >= hpPoints) return; // undamaged: no clutter` | a full-health Kraken shows **nothing**, so there is no pool to compare — *"how the fuck do I know if your Kraken has so much more health"* |
| **Covers 20 of 23 types** | gated on `GOBLIN_KINDS` (`:198-233`) | `chewer`, `voltkin`, `lightningDrone` have **no readout at all** |
| **Unscaled** | `w=1.6`, `gap=0.9`, at `y − BODY_R*2.5`, `BODY_R = 7.5` | a boss draws ≈152 px tall, so **its pips sit inside its chest** — the same class as the S170 stun-star lift bug |

`git log -S"healthBar" --all` returns **zero commits**: no bar was ever written or deleted. The castle
has one (`gathererRenderer.ts:485-500`) and it carries the *same* hide-when-full defect.

⭐ **ZERO NEW WIRE FIELDS, ZERO PROTOCOL BUMP — independently verified twice.** `ehp` is serialized
emit-when-damaged (`save.ts:1956`) and **rehydrated from config when omitted** (`:2322-2324`), so a
client's `c.ehp` is always populated and correct; `trimMirrorCreature` strips only `targetCreatureId`;
`applySnapshotCore` does a full `clear()`+rebuild (`save.ts:1359`), so no stale value can survive a
heal. MAX pool is a pure function of the wire-carried `CreatureType` over a total 23-entry record, and
the only writer above baseline (Vlad's sap) is clamped to that same pool.

⛔ **NOT the one-shot problem.** A bar is a continuous readout of synced, hashed state — the
`stunStars.ts` pattern, and strictly easier since it needs no deadline stamp.

**Fixes the pressure-test proved, all cheap:**
- ⛔ *blocking* — the sketch said "insert after line 620"; **620 is the tail of a comment** and 621 is
  the `syncCreatureProjectiles(...)` statement. Followed literally it ships a no-op.
- Deleting `drawHpPips` orphans `import { multiplierFifths }` at `goblinRenderer.ts:46` — the project
  compiles with `noUnusedLocals`, so that is a **tsc failure**, not a lint nit.
- ⚠ **The proposed encoding inverts the owner's own comparison.** Width-encodes-max plus
  fill-encodes-own-fraction means a Kraken at 10 % draws a *shorter* fill than a healthy goblin. Draw
  the fill in **absolute** terms against an absolute track so two bars are comparable in the same units.
- Perf was priced off `GOBLIN_MAX_GLOBAL = 200` while `CHEWER_MAX_GLOBAL = 10_000` sat in the same
  bullet. Collapse the per-type lookups into one map.
- **HELGA is the one named character with a pool and no readout** — a defender, not a creature, so a
  `CREATURE_CONFIGS` coverage test cannot see her. Extend to `world.defenders` (guard `ehp !== null`).

**Layer:** `arrowLayer` is `fogHiddenLayer` index 12 and draws above the sprites; adding nothing new
keeps `tower-art.spec.ts`'s hardcoded `[6]` and `[11]` untouched.

---

## 2 · FLOATING DAMAGE NUMBERS (R171-F) — verdict **NEEDS_REWORK**

⭐ This is why the owner's *"we'll do it together"* was the right call. The shape is right — derive
numbers from observed `ehp` deltas rather than pushing events — but the pressure-test proved the
design's **model of the joiner's tick stream is factually wrong**, and its rewind guard turns that
error into *total silent loss of damage numbers on the joiner*. Fix: drive the coalescing off a
renderer-local frame counter, not `world.tick`.

Three more that survive:
- The headline "host and joiner emit byte-identical sums" is **false whenever a heal lands inside a
  sampling window** — `ehp` is not monotone, and the design lists heals in its own risks without
  noticing they break its central proof.
- **Phantom kill numbers** from non-damage removals: the "gone and not despawning ⇒ pop last-seen ehp"
  rule uses a discriminator that only creatures have. Default must be SILENT, per-kind.
- It covers 3 of `damageEntity`'s 5 arms — **bonds and primitives are skipped**, and bonds invert the
  delta sign (`damageFifths` RISES with damage), so they need their own arm and test.

---

## 3 · WHOPPER DEATH BLAST (R171-G) — verdict **SOUND_WITH_FIXES**. The mechanic survives.

Fixed total budget, distance-banded, split with an order-independent integer remainder — no
`Math.random`, no float accumulator, no `Map`-order dependency, no new field, **no protocol bump**.
Arithmetic re-derived independently and found correct.

- ⭐ **It would have turned my brand-new acquisition census RED** — the proposed signature carried a
  dead `sparePlayerId` param whose `ownerPlayerId` comparison makes the file read as an enemy scan.
  The guard shipped in P2A earning its keep within the hour. Fix: drop the dead param.
- **Extend `applyRadialDamage`, do not rebuild it** — the existing bridge already does
  collect→sort→two-scales→defenders/towers correctly.
- Its "fog is not a constraint, bosses fight in FIGHT" dismissal is **false** — a boss death during
  BUILD is reachable. The cull is reachable *and correct*, but the claim had to go.
- `BlastVictim` needs a `kind` discriminant: its comparator is not a total order across the merged
  creature+defender list without one.

---

## 4 · TOWER REQUIREMENT LABELS (R171-H) — verdict **SOUND_WITH_FIXES**

Pure render-local formatting, no wire, no sim, no new display object.

- ⛔ *blocking* — **the width budget is wrong**: the formula yields **128 px, not the 162 px** the
  whole "it fits" argument rests on, and 128 < 137 means the degradation branch fires on the only
  3-shape recipe in the registry. Derive the budget from the label centre, not the card centre.
- The design never states **whether it renders `need` or `need − have`**. Shipped semantics are the
  **deficit**; every worked example used an empty bank, where the two coincide — so the ambiguity was
  invisible in its own pricing.
- **Do not sort into `ALL_SPARK_TYPES` order** — it contradicts the fetch order shown 40 px away on
  the same band. Render in bill order.
- Anchor the run from the **computed** centre, never Pixi's measured `subLabel.width`, or the guard
  test can be green while the shipped run is off-centre.
