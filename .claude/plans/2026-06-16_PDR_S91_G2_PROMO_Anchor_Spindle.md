---
STATUS: AWAITING-USER-GO
session: S91
created: 2026-06-16
tier: Full
item: G2-PROMO (Dot->Square Anchor + Line->Circle Spindle)
gate: requires fresh explicit user go (LOCKED_DECISIONS sect.6 + win-score user-locked)
audit_verdict: READY (0 CRITICAL/HIGH; 1 MED + 3 LOW folded into the DELTA below)
recovered_from: workflow wf_723caa8e-f62 journal (session-resume killed the bg run post-completion)
---

# PDR — G2-PROMO: Promote Dot→Square (Anchor) + Line→Circle (Spindle) to Magic Combos

**Tier:** Full (>30K, 2-round Council) — combines combo-table + scoring + silhouette + lock surfaces.
**Gate:** REQUIRES fresh explicit user `go` THIS session — `LOCKED_DECISIONS.md` §6 + win-score are user-locked (Authority line 6: "Blueprint LOCKED rules > this document > session-level tuning"); `.claude/session-state.json:110` records both G2 items as "deferred — need explicit user go." Do NOT write `pdr_approved:true` or touch `src/combos.ts`/`constants.ts`/`LOCKED_DECISIONS.md` until that `go` lands.

---

## 1. OBJECTIVE

Promote the two currently-functional placeholder pairings **Dot→Square (key `0->3`) → "Anchor"** and **Line→Circle (key `1->4`) → "Spindle"** to magic combos, so each (a) fires the existing NEW-COMBO discovery toast, (b) advances the HUD counter to `Combos N/14`, (c) carries a distinct stroke-only silhouette, and (d) earns the structural magic income premium. Match length is held ~constant for combo-leaning builders via a single rebalance lever. **Behaviors (verbs) are explicitly OUT of this ship** — this is a visual + discovery + premium promotion only, deferred to a Phase 2 PDR (see APPROACH §3.5).

This ships the long-deferred backlog item with **zero new runtime code paths in determinism-sensitive loops** (scoring/physics/disruption), which is what keeps desync risk at zero for the first promotion.

---

## 2. SCOPE — every file + symbol to touch

**A. Combo table — `src/combos.ts`**
- `MAGICAL` (const array, `combos.ts:27-124`): append TWO `ComboOutcome` rows — `[SparkType.Dot, SparkType.Square, {resultName:'Anchor', stiffnessTier:'MID', areaMultiplier:1.0, visualEffectId:'fx.anchor', isMagical:true, description:'…'}]` and `[SparkType.Line, SparkType.Circle, {resultName:'Spindle', stiffnessTier:'MID', areaMultiplier:1.0, visualEffectId:'fx.spindle', isMagical:true, description:'…'}]`. Append exactly the two FORWARD keys (`0->3`, `1->4`) — NOT the reversed pairs (Square→Dot `3->0`, Circle→Line `4->1` stay placeholders, per § V.1 order-dependence, `combos.ts:3`).
- Stale header comment (`combos.ts:4`): `// 12 magical (full polish) + 24 functional placeholders = 36 entries.` → `14 magical + 22 functional = 36`.
- NO change to `comboKey`/`lookupCombo` (`combos.ts:22-24, 156-162`), `FUNCTIONAL_DEFAULTS`/fill loop (`combos.ts:126-150` — auto-drops the two promoted pairs via the `if (!TABLE.has(key))` guard), the size-36 invariant (`combos.ts:152` — still passes; promotion moves entries between magical/functional, total unchanged), or `MAGIC_12_KEYS` (`combos.ts:203-205` — auto-grows to 14; keep the symbol NAME to avoid widening the diff into 2 importers, fix its comment only). **No `isAnchorCombo`/`isSpindleCombo` helper** — the `combos.ts:185-199` template is only needed when a behavior keys off it; none does in this ship.

**B. Silhouettes — `src/render/effects/silhouettes/axisAligned.ts`**
- Add `drawAnchor(g, p)` and `drawSpindle(g, p)`: both stroke-only, both `if (len<1) { drawDefaultLine(g,p); return; }` per the universal skeleton (`axisAligned.ts:24`), both NON-ANIMATED (no `p.tick` reference) → both join `STATIC_SILHOUETTES`. Anchor = axis stroke via `strokeAxisLerp` + a stroke-only square footing at the Square (B) endpoint (`p.colorA` axis, `p.colorB` footing per the capsule/bracket endpoint convention, `shared.ts:86`). Spindle = a tapered lens/spindle (two arcs bowing out from the A→B axis, meeting at both endpoints), `p.colorA` strokes, `midColor(p)` optional bulge (`shared.ts` helpers).

**C. Barrel — `src/render/effects/silhouettes/index.ts:9`**
- Add `drawAnchor, drawSpindle` to the `axisAligned.ts` re-export line.

**D. Dispatch — `src/render/bondVisualRenderer.ts`**
- Import block (`bondVisualRenderer.ts:35-48`): add `drawAnchor, drawSpindle`.
- Switch (`bondVisualRenderer.ts:58-72`): add `case 'fx.anchor': drawAnchor(g,p); break;` and `case 'fx.spindle': drawSpindle(g,p); break;` BEFORE `default:` (`bondVisualRenderer.ts:71`).

**E. Locks — `LOCKED_DECISIONS.md` §6 (`:237-269`)** — see LOCK-AMENDMENT §5.

**F. Tests** — see TESTING §6.

**NO-CHANGE (verified auto-following):** `src/render/ui.ts:162` (`total = MAGIC_12_KEYS.length` → auto `/14`); `src/state/comboDiscovery.ts:36-48` (gates on `combo.isMagical`, `:37`, auto-toasts); `src/render/comboToastRenderer.ts:108-110` (renders `lastDiscoveredComboNames` verbatim); `src/state/scoring.ts:111-119` (magic term applies the premium structurally via `isMagical`, no code edit); `HUNTER_TRIGGER_SCORE` (`constants.ts:523-524`, auto-scales off `PHASE_1_WIN_SCORE`); `constants.lock.test.ts` (locks only `MEMORY_FOG_COLOR`, untouched). **Codex is NOT touched** — the title-screen Codex (`main.ts:430-433`, `codexStore.ts`) is a GODLY-RECIPE codex keyed to `localStorage 'spark:codex:unlocked:v1'`, NOT a magic-combo codex; promoted combos get no Codex tile and need none (per-combo Codex = backlog G3b, `BACKLOG.md:39`, out of scope).

---

## 3. APPROACH — chosen design + why

### 3.1 Chosen path: MINIMAL-RISK (Proposal 1) as the spine, with grafts

The first ship promotes both pairs to magic by flipping `isMagical:true` + adding a real `resultName` + a fresh `visualEffectId` silhouette, accepting the structural 8× magic premium as the magic identity, and rebalancing match length via the file's own documented #1 lever (`PHASE_1_WIN_SCORE` + `SCORE_TIER_STEP` in lockstep — Option A). This is chosen over the feel-first (Proposal 2) and damped-income (Proposal 3) paths because:

- **It touches zero determinism-sensitive code.** A new per-combo BEHAVIOR (Proposal 2's `applyAnchorStiffen`/Spindle-pull) or a new scoring branch (Proposal 3's `PROMOTED_COMBO_INCOME_PREMIUM` in `scoring.ts:94-119`) is the ONLY change that edits the host-authoritative complexity/physics loops — exactly where desync can be introduced. Deferring behavior keeps desync risk at zero for the first promotion (the brief's explicit "favor minimal-risk for the FIRST ship" instruction). Proposals 2 and 3 both estimate 42K tokens vs Proposal 1's 22K, and both add new files (`anchorStiffen.test.ts`, `spindle.test.ts`, or a scoring premium) that widen blast radius without being required to deliver the perceived "this is magic" trio: (1) the NEW-COMBO toast, (2) the distinct silhouette, (3) faster income — all three land from `isMagical`+`resultName`+`visualEffectId`+the existing premium alone.

- **Feel-first's verbs are genuinely high-value but NOT low-risk.** Proposal 2's Anchor (anti-drift `stiffnessMultiplier` lift + anti-sabotage `isDefensiveCombo` extension) and Spindle (tangential `applyVortexPull` clone) are well-designed and clone shipped patterns — but they add per-tick physics passes with ordering constraints (Anchor must run AFTER `computeTerritorialInfluence`, `physicsLoop.ts:124`) and a stacked-pull cap interaction (Vortex+Spindle summing on one spark). The brief's gate is "favor minimal-risk UNLESS feel-first's verb is clearly high-value AND low-risk." It is high-value, not low-risk → defer, but adopt its design wholesale as the Phase 2 spec (§3.5).

### 3.2 Grafts taken from Proposals 2 & 3

- **From Proposal 2 (silhouette read):** Anchor uses `p.colorB` for the endpoint-anchored square footing (matching the capsule/bracket endpoint-color convention), not just `p.colorA` everywhere — a sharper "planted at the Square end" read.
- **From Proposal 3 (purity rationale):** lock `stiffnessTier:'MID'` for BOTH (not HIGH). HIGH would stack a `STIFFNESS_BY_TIER=0.8` + `STRAIN_BREAK=1.25` structural premium ON TOP of the income premium (`constants.ts:172-183`), double-buffing and making the promotion impure. MID = the placeholders' current tier, so bond physics via `STIFFNESS_BY_TIER` is **byte-unchanged** — only scoring premium + visual + toast change.
- **From Proposal 3 (damped alternative kept on the shelf):** the income-neutral damped-premium path is documented as the named fallback (§4 alternative) if playtest finds non-combo matches too long — but as a SEPARATE behavior-scoped PDR, never silently in this ship.

### 3.3 Anchor (Dot→Square, key `0->3`)
- **Name:** Anchor. **resultName:** `'Anchor'` — verified unique: only the LABEL `'Warped Anchor'` (`combos.ts:117`) and the description substring `'anchor pull'` (`combos.ts:106`) exist; helpers/scoring/discovery match on `=== 'Anchor'` (equality, not substring), so no collision.
- **visualEffectId:** `'fx.anchor'` (fresh — collision would mis-dispatch the silhouette, `bondVisualRenderer.ts:58-72`).
- **Silhouette:** stroke-only square footing at the Square (B) endpoint + axis stroke; reads as "anchored/grounded." STATIC.
- **stiffnessTier:** `'MID'` (unchanged from placeholder). **areaMultiplier:** `1.0` (DEAD field — zero production consumers, `combos.ts:16`; set 1.0 to match neighbors, wires nothing).
- **Behavior:** NONE this ship.

### 3.4 Spindle (Line→Circle, key `1->4`)
- **Name:** Spindle. **resultName:** `'Spindle'` — brand-new, no collision.
- **visualEffectId:** `'fx.spindle'` (fresh).
- **Silhouette:** tapered lens/spindle around the bond axis; reads as a spun spindle. STATIC.
- **stiffnessTier:** `'MID'`. **areaMultiplier:** `1.0` (DEAD).
- **Behavior:** NONE this ship. Order-dependent: only `1->4` promotes; Circle→Line (`4->1`) stays a placeholder.

### 3.5 Phasing — behaviors in Phase 2 (separate PDR)
Behaviors are OUT of this ship. The strongest behavior designs from Proposal 2 are recorded as the Phase 2 spec to execute after Phase 1 ships and is playtested:
- **Anchor verb:** per-tick `applyAnchorStiffen(world)` raising `bond.stiffnessMultiplier` to `ANCHOR_STIFFEN_MULT (~1.5)` on live Anchor bonds (the ephemeral, recomputed-every-tick, non-canonical field `territory.ts:183/230` already writes; consumed `bonds.ts:75`; clamped by `POSITION_CORRECTION_CLAMP_RATIO=0.5`, `bonds.ts:77-81`), ordered AFTER `computeTerritorialInfluence` (`physicsLoop.ts:124`); PLUS extending `isDefensiveCombo` (`combos.ts:196`) to recognize `'Anchor'` for the `DEFENSIVE_SEVER_CHARGE_COST` sever premium (`disruptionManager.ts:124`).
- **Spindle verb:** per-tick tangential `applyVortexPull` clone anchored at the Circle endpoint, weaker + shorter-range (`SPINDLE_PULL_ACCEL ~= 0.4× VORTEX_PULL_ACCEL`), tangential `(dx,dy)->(-dy,dx)` impulse, all of Vortex's determinism guards (canonical bond-id sort, fouled/deleted/attracted-dragged skips, per-tick cap, `vortex.ts:43-93`); silhouette would then move to `parametricPaths.ts` and become animated (and leave `STATIC_SILHOUETTES`).

Phase 2 carries its own State-Discovery + Council + lock-amendment gates and is NOT covered by this PDR's `go`.

---

## 4. WIN-SCORE REBALANCE — exact arithmetic + new constants

**Lever:** Option A — raise `PHASE_1_WIN_SCORE` + `SCORE_TIER_STEP` in lockstep. No new scoring branch, no new constant in the complexity loop.

**Constraint (the tripwire):** `scoring.test.ts:330-331` requires `PHASE_1_WIN_SCORE % SCORE_TIER_STEP === 0` AND `PHASE_1_WIN_SCORE / SCORE_TIER_STEP === 3` (exact). Current: `WIN=210` (`constants.ts:287`), `STEP=70` (`constants.ts:359`), ratio 3.

**Model (verified `scoring.ts:111-143` + `constants.ts:243-259`):** time-to-WIN ∝ `PHASE_1_WIN_SCORE / (0.05 × steady-state complexity)`. Promoted bonds move from the floor-capped `+0.25` functional term to the uncapped `+2.0` magic term (`MAGIC_BONUS = SCORE_MAGIC_BOND − SCORE_FUNCTIONAL_BOND = 3 − 1 = 2`, derived `scoring.ts:50`; per-bond ratio `2.0/0.25 = 8×`).

**Canonical combo-leaning build** P=20 prims / B=30 promoted bonds (B within `floor(1.5×20)=30` cap, so all previously counted):
- `C_old = 20 + 0.25×30 = 27.5`
- `C_new = 20 + 2.0×30 = 80`
- Scale = `80/27.5 = 2.909` → required `WIN = 210 × 2.909 = 610.9`.

**Chosen values:** `PHASE_1_WIN_SCORE = 630`, `SCORE_TIER_STEP = 210` (`630/210 = 3` exact, `630%210 = 0` — both assertions pass; tier pulses at 210/420, WIN at 630). +3.1% over the 610.9 ideal — within playtest tolerance, round-number hygiene, matches the map's own pick.

> Tightest-fit alternative considered and rejected for hygiene: `STEP=204 → WIN=612` (612/204=3, +0.2% error). Either is invariant-green; 630/210 chosen for round numbers + version-history convention.

**Verification at 630/210:** combo builder `C=80` → `630/(0.05×80) = 157.5s` vs old `210/(0.05×27.5) = 152.7s` (held ~constant, +3.1%). `HUNTER_TRIGGER_SCORE` auto-scales `floor(630×0.75) = 472` (`constants.ts:523-524`, no separate test lock). HUD denominator (`ui.ts` reads the constant) auto-follows.

**Accepted, documented downside (v1):** a pure-functional / non-combo builder at `C=20` goes `210s → 630s` (3× longer) because their complexity is unchanged. This is a balance-FEEL issue, NOT a correctness/desync risk — the file already documents pure-blob builders running long by design (`constants.ts:282-286`).

**Named fallback (NOT in this ship):** if the next playtest finds non-combo matches too long, the surgical fix is the damped per-combo income weight (Proposal 3): keep `WIN/STEP` at 210/70, count promoted bonds INSIDE the `floor(1.5×prims)` cap (with `functionalBonds`) AND add a tiny uncapped `PROMOTED_COMBO_INCOME_PREMIUM = 0.05` term mirroring the Filament line (`scoring.ts:119`). Verified: P=20/B=30 → `C_new = 20 + min(30,30)×0.25 + 30×0.05 = 29.0` (ratio 1.055, −5.2%); P=20/B=40 → `C_new = 20 + min(40,30)×0.25 + 40×0.05 = 29.5` (ratio 1.073, −6.8%); both inside ±10%, non-combo builders see zero change. **Critical correction to the map's Option B:** do NOT exclude promoted bonds from the functional cap — that un-caps them and reopens the S84 bond-spam dominance the `floor(1.5×prims)` cap closed (`constants.ts:221-230`). This fallback is a SEPARATE behavior-scoped PDR (it adds a scoring branch), surfaced here only so the path is logged, never silently shipped.

---

## 5. LOCK-AMENDMENT — exact `LOCKED_DECISIONS.md` §6 wording + `constants.lock.test.ts` edits

**`LOCKED_DECISIONS.md` §6 "Combo Table — Schema & Magic-12 Seed" (`:237-269`):**

(a) Retitle the section concept **Magic-12 → Magic-14** (`:237` heading `## 6 · Combo Table — Schema & Magic-14 Seed`; `:254` `**The Magic-14 seed**`).

(b) ADD after the numbered list (after `:267`):
```
13. Dot → Square: **Anchor** (MID, 1.0×) — promoted S91, fx.anchor, no behavior (visual + discovery + magic premium only).
14. Line → Circle: **Spindle** (MID, 1.0×) — promoted S91, fx.spindle, no behavior (visual + discovery + magic premium only).
```

(c) Change `:269` `Remaining **24 functional combos** ship as one-liners…` → `Remaining **22 functional combos** ship as one-liners…`.

(d) Add a version-history note recording the win-score rebalance:
```
- Win-score rebalance (S91, G2-PROMO): PHASE_1_WIN_SCORE 210 → 630, SCORE_TIER_STEP 70 → 210 (ratio 3 preserved, scoring.test.ts:330-331 green) — offsets the structural 8× magic-income premium the two promotions add to combo-leaning builds; holds the canonical P=20/B=30 build's match length ~constant (152.7s → 157.5s). Behaviors deferred to a Phase 2 PDR. User-approved <session> <commit SHA>.
```

**`constants.lock.test.ts`:** **NO EDIT.** Verified it locks ONLY `MEMORY_FOG_COLOR === 0x000000` (`constants.lock.test.ts:22`, LOCKED §14). There is NO `PHASE_1_WIN_SCORE`/`SCORE_TIER_STEP`/`MAGIC_BONUS` tripwire in this file — the win-score change passes it silently. **Do NOT assume the lock file protects the win score**; the ONLY guard is `scoring.test.ts:330-331`.

**`MAGIC_12_KEYS` symbol:** keep the name (a misnomer at 14) — renaming touches 2 importers (`ui.ts`, `combos.test.ts:12`) for zero behavior gain. Fix its comment only; optional rename to `MAGIC_COMBO_KEYS` is a logged follow-up.

---

## 6. TESTING — every test to add/update with expected values

**Required edits (mechanical, no logic risk):**

1. **`src/combos.test.ts` — `it('has exactly 12 magical entries')` block (`:23-27`):** match by CONTENT not line number (prior edits shift them). Change BOTH `12 → 14`: `:24` `expect(MAGIC_12_KEYS.length).toBe(14)` and `:26` `expect(magicalCount).toBe(14)`. Optionally retitle the `it` to `'has exactly 14 magical entries'`.

2. **`src/combos.test.ts` — `it('functional placeholders default to MID/1.0×')` (`:71-77`):** `:73` `lookupCombo(SparkType.Dot, SparkType.Square)` now returns MAGIC → REPOINT to a pair that stays functional: `lookupCombo(SparkType.Dot, SparkType.Dot)` (Dot→Dot is the canonical placeholder per `comboDiscovery.test.ts`); fix the `:72` comment. Verified `combos.test.ts:73` is the ONLY test asserting Dot→Square functional; **Line→Circle has NO existing functional-assertion test** (its promotion is unguarded — won't fail loudly, but is still added to MAGICAL + §6). Before ship, grep `src/**/*.test.ts` for `SparkType.Line` + `Circle` and any `areaMultiplier`-by-name assertion on the generic 1.0× to catch implicit stand-ins.

3. **`src/render/bondVisualRenderer.test.ts`:** append `'fx.anchor','fx.spindle'` to `ALL_VISUAL_EFFECT_IDS` (`:61-75`) — auto-drives the ≥1-stroke smoke test + degenerate-bond all-finite test. Append BOTH to `STATIC_SILHOUETTES` (`:229-236`) since non-animated (tick=0===tick=999 lock).

**Required additions (new tests):**

4. **`src/render/bondVisualRenderer.test.ts` — per-silhouette geometry tests** for `fx.anchor` and `fx.spindle`, authored with `toBeGreaterThanOrEqual` (the Filament pattern, `:125`), NEVER tight `toHaveLength`. e.g. Anchor emits ≥3 strokes (axis + footing sides); Spindle emits ≥2 strokes (the two bowing arcs). **DO NOT touch `drawDiamond`/`drawLattice`/`drawCable`/`drawCapsule` or their exact-count locks — the S90 reverted-change trap (`reflexion_log.md:10`).**

5. **`src/combos.test.ts` — promotion assertions:** add `expect(lookupCombo(SparkType.Dot, SparkType.Square).isMagical).toBe(true)` + `resultName === 'Anchor'` + `visualEffectId === 'fx.anchor'`; same for `lookupCombo(SparkType.Line, SparkType.Circle)` → `'Spindle'` / `'fx.spindle'`. Locks the promotion against a future "revert."

6. **`src/state/comboDiscovery.test.ts` — discovery-toast coverage:** add a case forming an Anchor and a Spindle bond, asserting each pushes its `resultName` into `lastDiscoveredComboNames` and stamps `comboToastTick`. Not broken by promotion (no magic-count assertion there), but in-scope for the discovery-toast deliverable.

**Must stay GREEN (NOT edited):**

7. **`src/state/scoring.test.ts:330-331`** (pacing invariant) — `630/210=3` and `630%210=0` satisfy BOTH assertions. This is the tripwire; verify, do not edit. Also `scoring.test.ts:39` `MAGIC_PREMIUM=2` (derived) — do NOT touch `SCORE_MAGIC_BOND`/`SCORE_FUNCTIONAL_BOND` (wide blast radius); use the win-score lever only.

8. **`src/combos.test.ts:20`** (36-entry total), per-pair coverage, unique-key, order-dependence — UNAFFECTED (size stays 36).

9. **`constants.lock.test.ts`** — UNAFFECTED (only `MEMORY_FOG_COLOR`).

**Net combos.test.ts count: 12 → 14 magical entries.** Ship gate: `tsc` 0 errors + full vitest green + bundle < 550 KiB (current 547.0 KiB per S90 header).

---

## 7. RISKS & MITIGATIONS

| # | Risk | Mitigation |
|---|------|------------|
| 1 | **LOCK-AMENDMENT GATE (process, BLOCKING):** §6 + win-score are user-locked (Authority line 6); shipping without fresh explicit `go` THIS session violates the gate (`session-state.json:110` marks both deferred). | Do NOT write `pdr_approved:true` or edit `combos.ts`/`constants.ts`/`LOCKED_DECISIONS.md` until user types `go`. Record approval session + SHA in the §6(d) version note. |
| 2 | **Non-combo match inflation (accepted Option A downside):** WIN 210→630 triples match length for pure-functional builders (`C` unchanged), 210s→630s. | Balance-feel, not correctness/desync. Documented as accepted for v1 (`constants.ts:282-286` already documents long blob matches). Named fallback = Proposal 3 damped weight as a SEPARATE PDR if playtest flags it. |
| 3 | **Desync / determinism:** any new per-combo physics/scoring branch is the only place desync enters. | ELIMINATED by scope: behaviors deferred. The promotion edits NO host loop — `isMagical` premium is structural (`scoring.ts:111-118`), silhouettes are client-render-only. Zero new code in scoring/physics/disruption. |
| 4 | **Geometry-lock churn (the S90 trap):** editing existing `drawDiamond`/`drawLattice` exact-count `toHaveLength` locks breaks them (`reflexion_log.md:10`). | Add ONLY new `drawAnchor`/`drawSpindle` with their OWN new tests authored `toBeGreaterThanOrEqual`. Touch no existing silhouette. New fns fight nothing. |
| 5 | **Territorial / structural stacking:** HIGH tier would stack rigidity + harder-break ON TOP of the income premium (`constants.ts:172-183`), double-buffing. | Lock `stiffnessTier:'MID'` for both (= current placeholder tier) → physics byte-unchanged via `STIFFNESS_BY_TIER`; promotion is a pure income+visual change. Tier is a SEPARATE knob if ever wanted. |
| 6 | **resultName / visualEffectId collision:** `resultName` is a cross-module magic string (`=== 'Anchor'`); a dup `fx.*` mis-dispatches the silhouette (`bondVisualRenderer.ts:58-72`). | Verified `'Anchor'`/`'Spindle'` resultNames unique (only `'Warped Anchor'` label + `'anchor pull'` description substring exist; equality match, no collision). `'fx.anchor'`/`'fx.spindle'` are fresh ids. |
| 7 | **Order-dependence (V.1 LOCKED, `combos.ts:3`):** a careless "add both directions" creates 4 magic entries, breaks the 14-count + table semantics. | Append EXACTLY the two forward keys (`0->3`, `1->4`). Reversed pairs (`3->0`, `4->1`) stay placeholders by construction. |
| 8 | **areaMultiplier is DEAD (`combos.ts:16`):** setting it wires nothing; a future author may assume it scales the combo. | Set `1.0` to match neighbors; document in §6 + code comment that it is unwired. |
| 9 | **8× understates income at the margin:** promoted bonds escape the `floor(1.5×prims)` cap, so very bond-heavy builds (B>cap) gain more than 8× (P=20/B=40 → 3.6× speed-up). 630 is tuned to the at-cap B=30 build. | First-ship-acceptable residual (very bond-heavy builds finish slightly faster than 157s); re-checkable on playtest. Damped-weight fallback (risk #2) keeps bond-heavy builds in band if needed. |
| 10 | **Bundle budget:** 547.0 KiB vs <550 ceiling (S90 header). | Two small draw fns + two switch cases are tiny; VERIFY `tsc` 0 + bundle <550 + full vitest green before ship (project ship gate). |

---

## 8. OPEN QUESTIONS FOR THE USER (decisions only Daniel can make)

1. **Behaviors now or later?** This PDR ships visual + discovery + magic-premium ONLY, deferring the Anchor anti-drift/anti-sabotage verb and the Spindle tangential-pull verb to a Phase 2 PDR (the minimal-risk first-ship per the brief). **Confirm:** ship Phase 1 visual-only now, OR fold the feel-first behaviors (Proposal 2) into THIS ship (accepting the per-tick physics passes + determinism review that pushes this from ~22K to ~42K tokens and adds `anchorStiffen.test.ts`/`spindle.test.ts`)?

2. **Is the Option A rebalance acceptable** — `PHASE_1_WIN_SCORE 210→630`, `SCORE_TIER_STEP 70→210`, knowing it holds combo-builder match length ~constant (152.7s→157.5s) but **triples non-combo/blob match length (210s→630s)**? Or do you prefer the damped-income alternative (WIN stays 210, add a `+0.05` per-promoted-bond premium, both build types within ±10%) — which adds a scoring branch and would be its own PDR?

3. **Naming:** confirm **Anchor** (Dot→Square) and **Spindle** (Line→Circle). Note `'Warped Anchor'` already exists as a separate label (`combos.ts:117`) — "Anchor" is technically unique but visually adjacent; OK to keep, or pick a different word for Dot→Square (e.g. "Footing", "Plinth")?

4. **Win-score numbers:** `630/210` (round-number, +3.1% over ideal) vs the tighter `612/204` (+0.2% over ideal). Both keep the exact-3× invariant green. Preference?

5. **`MAGIC_12_KEYS` rename:** keep the name (minimal diff, becomes a 14-element misnomer) or rename to `MAGIC_COMBO_KEYS` now (touches `ui.ts` + `combos.test.ts:12`)? Recommendation: keep + fix comment; rename as a logged follow-up.

---

# PRIME-AUDIT DELTA  (verdict READY — fold these 4 fixes in AT EXECUTION, do not skip)

**1. [MED] Re-cite the geometry-lock lesson to REAL evidence.** DROP every `reflexion_log.md:10` citation (Scope §F, TESTING #4, RISKS #4): verified that line is an S54 HELLO-timing entry and NO S90 geometry-trap entry exists in that file. The engineering caution is still correct; re-anchor it to the real exact-count locks: `bondVisualRenderer.test.ts:101-110` (diamond 1-moveTo/4-lineTo), `:112-119` (capsule 4 strokes), `:140-144` (lattice exactly 3 strokes), `:93-99` (cable), `:305-315` (diamond single 1-stroke); SAFE pattern at `:121-126` (filament `toBeGreaterThanOrEqual(7)`). State the lesson as fact, no false attribution.

**2. [LOW] Add the save/wire NO-CHANGE line to Scope §2.** `src/state/save.ts:525-528` / `:722-724` — `discoveredCombos` (sorted `ComboKey[]`) + `lastDiscoveredComboNames` are ALREADY wire+save-serialized (S88 G3a, additive-optional). Promoted combos add same-shape string data; `schemaVersion` stays 1, `PROTOCOL_VERSION` stays 8 (matches S88/S90 no-bump precedent). Add explicit ship-gate assertion: "PROTOCOL_VERSION 8 + schemaVersion 1 unchanged (verified no save.ts edit)."

**3. [LOW] Record the verified-clean stand-in grep (close the TODO).** VERIFIED: grep `src/**/*.test.ts` for `SparkType.Line`+`Circle` / `Bond_1_4` returns ZERO functional-assertion stand-ins; `combos.test.ts:73` (Dot→Square) is the ONLY existing functional pin and is repointed to Dot→Dot; per-pair coverage `combos.test.ts:29-38` asserts `areaMultiplier>0` generically (passes at 1.0). No hidden stand-in.

**4. [LOW] Naming is a HARD pre-write gate.** Do NOT author the `LOCKED_DECISIONS §6` amendment with a hard-coded name until the user confirms Anchor/Spindle (or picks alternatives). Strict-`===` dispatch (`combos.ts:176/186/197` — no includes/startsWith) means any chosen name is collision-safe, so this is purely a process-consistency gate, not a code risk.
