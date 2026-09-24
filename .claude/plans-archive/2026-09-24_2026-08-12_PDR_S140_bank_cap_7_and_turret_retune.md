# PDR — S140 P1: CASTLE_BANK_CAP 5→7, laserTurret 8→7, multi-row bank strip

**Tier:** Standard · **Status:** APPROVED (owner ruled 2026-08-12 via explicit option selection)
**Deliberation:** COMPLETED — Council v2 (8 workflow agents: 3 map probes, 3 lens judges, synthesis,
PRIME-AUDIT) + GROK-ANALYST + GEMINI-AUDITOR external seats. PRIME-AUDIT verdict: ADOPT_WITH_DELTA.

## 1. OBJECTIVE

Raise the castle bank capacity to 7 and retune the laser turret to 7 shapes so that **both tower
recipes are directly holdable**, per the owner's ruling. Land it behind a multi-row bank strip that is
correct for any cap, and close the zero-coverage hole in the castle panel's tests.

## 2. OWNER RULING (the decision this PDR executes)

Owner selected **"Cap 7 + laserTurret 8→7"** and scope **"Cap + regrid + tests only"**, after being
shown that all five Council seats rejected the retune 5–0. Reaffirmed = executed in full.

The Council's objections are recorded here, not suppressed:
- Seven is the recipe's authored identity (Codex punchline "Seven. Not four.", emblem `nodes: 7`, an
  anti-drift test whose stated purpose is to stop this exact drift, the owner's original "1 Line + 7
  Whips" spec, a re-ratified table in `LOCKED_DECISIONS` §7 / Blueprint §VII.4).
- The measured value of the retune is **~4 seconds** of refill wait (S137: 20.2 s fill at cap 5,
  28.6 s at cap 8, at the shipped `SPAWN_RATE_PER_SECOND` of 1.125).
- `BACKLOG.md:561-568` records that effective burst capacity is already `cap + N waiting gatherers`,
  and four loaded gatherers already exceed the 8-piece turret.

These are logged as accepted trade-offs, not as blockers.

## 3. SCOPE

**A. The multi-row bank strip (ships FIRST, provably pixel-identical at cap 5)**
- `castlePanel.ts` — derive `bankSlotsPerRow(cap) = floor((ROW_INNER_W + SLOT_GAP)/(SLOT_W + SLOT_GAP))`
  = 5; rows = `ceil(cap/perRow)`; per-row slot count = `ceil(cap/rows)`; **each row centred on its own
  occupancy** so there is never a dead box (cap 7 → 4@178 + 3@132).
- `BANK_STRIP_H` constant → `bankStripHeight(cap)` function; thread `cap` as a defaulted parameter
  through `slotOrigin`, `panelHeight`, `panelRect`, `panelOrigin` (a cap-swept test cannot exercise a
  module constant).
- Update the three `BANK_STRIP_H` consumers: `:175` panelHeight, `:240` row box position, `:387`
  row-centre probe.

**B. The cap**
- `constants.ts:444` `CASTLE_BANK_CAP` 5 → 7; update the adjacent recipe-size table (B4b requires the
  table stay beside the number) and record the ruling + the accepted trade-offs in the docblock.
- `castleBank.test.ts:100` — replace the hard `toBe(5)` tripwire with **relationship** invariants
  (`cap >= HELGA_SIZE`, `cap >= TURRET_SIZE`), per "pin the relationship, not the value".
- `gathererRenderer.ts:194` keep-face glyph row — wrap so the radius does not degrade to 3.26 px
  against `sparkGlyph.ts`'s constant 2 px stroke.

**C. The turret retune** — `TURRET_SIZE` 8→7, `HUB_DEGREE` 7→6, and **every** "seven" site moved
coherently. This is mandatory, not cosmetic: see RISK R1.

**D. Tests** — new bank-strip block in `castlePanel.test.ts` (currently zero coverage), swept over
caps `[1,2,3,4,5,6,7,8,9,10,12,13,15,20]`; a gating e2e that renders a real two-row panel, landing
**with or before** the cap flip.

**E. Protocol** — `PROTOCOL_VERSION` 18 → 19 plus the stale version-history JSDoc at `protocol.ts:178`.

**F. Doc integrity** — correct `LOCKED_DECISIONS` §7's "cap ≥ 5 deletes carve-down", which contradicts
`BACKLOG` B4b and `constants.ts:409-411` (both say "≥ the biggest recipe"); fix `defender.ts:8`, which
calls both defender kinds "STATIONARY" 50 lines above Helga's `WALK` state.

## 4. OUT OF SCOPE
The Stink Tower (next priority) · the 2D build space · R7 design library · bot build logic ·
gatherer/economy retuning · `origin/gh-pages` deletion.

## 5. RISKS

| # | risk | mitigation |
|---|---|---|
| **R1** | ⭐ **"Builds at six, dies at seven."** The predicate uses strict `!==` with no upper tolerance. A player who adds a 7th Spiral — as the Codex currently instructs — pushes degree to 7 and size to 8, `stillValid` returns false, and `REMOVE_DEFENDER` fires within 0.5 s (`REVALIDATE_INTERVAL_TICKS = 30`). | Every "seven" site must move to six in the same commit. Enumerated exhaustively in §6. A test asserts a 7-leaf star is now **rejected**. |
| R2 | Signature compression: after the retune, Helga and laserTurret share size 7 *and* hub degree 6, separated only by hub type + leaf multiset. `findDefenderMatches` returns ALL matches and dedups only on `anchorPrimitiveId`. | Verified pairwise non-colliding (hub types Line vs Triangle are disjoint, leaves Spiral×6 vs Spiral×3+Circle×3). Add an explicit no-collision test. |
| R3 | The regrid overflows the plate with every test green (zero coverage today; the existing seat sweep asserts `r.y >= 0` but never `r.y + r.h <= CANVAS_HEIGHT`). | 11 swept invariants incl. the missing height assertion. I1 must go RED against today's code at cap 7 (`x = -24`) before the fix. |
| R4 | A mid-deploy joiner on cap 5 receiving a 7-entry bank can never pull indices 5–6, while its title reads "CASTLE BANK 7/5". | `PROTOCOL_VERSION` 18→19 hard-rejects the stale peer at HELLO. |
| R5 | Codex power-line budget is **34** chars (enforced by test), not the 44 the source comment claims. | Rewrite within 34; fix the comment. |

**Not a risk — measured:** desync. The cap is enforced at exactly one host-only site (`bankPush`,
reached only via `GATHERER_TICK` ← `runHostTick`); `grep src/net/` for the cap returns nothing;
`bankIsFull` is dead code with zero production callers.

## 6. THE COMPLETE "SEVEN" INVENTORY (R1 — all must move together)
`laserTurret.ts` :31 `TURRET_SIZE` · :32 `HUB_DEGREE` · :4-6 docblock · :8-12 ASCII star · :16-17
pigeonhole para · :19 "degree-7 node" · :42 "= 7 'Whip' combos" ·
`laserTurret.test.ts` :2-6 docblock · :67 accept-case name+arg · :73-78 the 6/8-leaf inversion · :80-86
wrong-type build (6+1 → 5+1) · :88-95 extra-shape · :97-106 tolerance + :101 comment · :118 · :141 ·
`codexPresentation.ts` :17-18 docblock · :75 power line · :76-78 recipe copy · :78 `nodes: 7` ·
`codexPresentation.test.ts` :86-95 anti-drift · `defender.ts` :10 · `main.ts` :180 · `constants.ts` :1171, :420.

## 7. TESTING
`tsc` 0 · full vitest (2172 baseline, expect growth) · `npm run e2e:gating` · new swept panel
invariants · new gating two-row e2e · `verify-deploy` 4/4 after push.

## 8. VERIFICATION BINDINGS
Authored at priority close against absolute paths, per MCV.
