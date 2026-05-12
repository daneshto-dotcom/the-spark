# SPARK — Session 17 PDR
**Date:** 2026-05-12
**Tier:** Standard (estimate ~25-28K post-Council adoptions)
**Council:** R1 completed (Grok DISRUPTOR + Gemini AUDITOR, 1 round, Battle Ledger, PRIME-AUDIT applied)
**Branch:** master
**S16 baseline:** commit `e2f7d16` + autocommit churn `58b3fcf` (origin/master + 1 local)
**Live URL:** https://daneshto-dotcom.github.io/the-spark/ (HTTP 200)

---

## 1. OBJECTIVE

Advance SPARK from Phase-1 charter-complete into **Phase-2 Tier-1** by shipping (a) the deferred custom-domain swap (S16 Scope Amendment #2 carry-forward) and (b) the cheapest member of the disruption suite — **Sever-as-disruption (§VIII.3 row 1)** — paired with its enabling rendering layer **Multi-color bond rendering (§VI.4 / §X.2)**. Close the visual gap where current Phase-1 inter-player bonding produces mixed-ownership structures rendered monochrome.

---

## 2. SCOPE — 4 Priorities

### **P0 — Custom-domain ready-to-ship commit prep (Micro, ~5 LOC)**

**Files:** `vite.config.ts`, `public/CNAME` (NEW), and (post-push only) `LOCKED_DECISIONS.md` §13.9 row.

**Changes:**
- `vite.config.ts` line 11: `base: '/the-spark/'` → `base: '/'`
- `public/CNAME` NEW (UTF-8, LF-only, single line): `spark-online.space\n`
- LOCKED §13.9 row: deferred to **after-push step** within P0 (avoids breaking state if push delayed).

**Sequence:**
1. Make file changes locally.
2. `npm run build` — verify `dist/index.html` references `/assets/...` (not `/the-spark/assets/`) AND `dist/CNAME` exists with correct content.
3. Commit locally.
4. **GATED:** Wait for user explicit "go push" after they confirm:
   - Squarespace DNS: 4 A records (Host=`@`, values=`185.199.108-111.153`) + CNAME (Host=`www`, value=`daneshto-dotcom.github.io.`)
   - `dig +short spark-online.space @8.8.8.8` returns the 4 GitHub Pages IPs
   - GitHub Settings → Pages → Custom domain = `spark-online.space` → Saved + Enforce HTTPS toggled
5. On user "go push": push to origin; monitor GH Actions run; verify HTTP 200 on `https://spark-online.space/`.
6. Apply LOCKED §13.9 amendment locally (primary URL flip), commit, push.

**If user defers DNS:** P0 commit remains uncommitted/un-pushed; carries to S18.

**Definition of Done:** EITHER (a) `https://spark-online.space/` returns HTTP 200 AND LOCKED §13.9 amended on origin, OR (b) commit prepared locally + clearly carried-forward to S18 in HANDOFF.

---

### **P1 — Phase-2 C: Sever-as-disruption (Standard, ~120 LOC)**

**Files:** `src/state/world.ts`, `src/input/controls.ts`, `src/render/ui.ts`, `src/state/save.ts`, `src/game/sever.test.ts` (new tests), `src/state/world.test.ts` (migrate existing 17+ SEVER_BOND dispatches), `src/net/protocol.ts` (audit + migrate if intent envelope schema affected).

**Changes:**

**`world.ts` SEVER_BOND action:**
```ts
| { readonly type: 'SEVER_BOND'; readonly bondId: BondId; readonly playerId: PlayerId }
```

**`world.ts` SEVER_BOND case (replaces lines 221-254):**
```ts
case 'SEVER_BOND': {
  // S17 P1 — Phase-2 §VIII.3 row 1: cross-player Sever costs 1 charge.
  // §VIII.4 self-sever (own-structure editing) preserved at zero cost.
  // 1v1 input gate: only the active player can dispatch.
  if (world.gameMode === '1v1' && action.playerId !== world.currentPlayerId) return world;
  const bond = world.bonds.get(action.bondId);
  if (bond === undefined) return world;

  const player = requirePlayer(world, action.playerId);
  const primA = world.primitives.get(bond.aId);
  const primB = world.primitives.get(bond.bId);
  if (primA === undefined || primB === undefined) return world;

  // Auth rule (Gemini #3): hostile if EITHER endpoint placerColor ≠ acting player's color.
  const isHostile = primA.placerColor !== player.color || primB.placerColor !== player.color;

  if (isHostile) {
    if (player.disruptionCharges < 1) return world;  // §VIII.2 silent reject
  }

  // Compute sever — if cycle (§VIII.4 no-op), do NOT consume charge (PRIME-AUDIT delta B).
  const split = severSplit(bond, world.primitives, world.bonds);
  if (split.del.size === 0) return world;  // cycle bond — bond survives, no charge consumed

  // Consume charge AFTER destructive-sever confirmed.
  if (isHostile) player.disruptionCharges -= 1;

  // ... existing effects emission + delete logic (unchanged from current lines 228-253)
}
```

**`controls.ts` (line 209):**
```ts
this.dispatchFn({ type: 'SEVER_BOND', bondId, playerId: this.playerId });
```

**`ui.ts` HUD:**
- Add `chargeDots: Graphics` (per-player) — visible only in 1v1 PLAYING.
- Position: directly below per-player score readout at `(12, 56)` for P1 and `(12, 78)` for P2.
- Render: 2 dots horizontally spaced 12px apart. Filled circles in player.color when `disruptionCharges` ≥ position+1, hollow ring when below. Dot radius 4px.

**`save.ts` (LOCKED §11 schema bump):**
- Add `disruptionCharges` + `buildActions` to serialized `PlayerCommon` fields.
- Save schema version bump (current → next) — only if format actually changes (additive may not require).

**`net/protocol.ts`:** audit `SEVER_BOND` intent envelope. If `playerId` was implicit (action.playerId not serialized for sever), add it explicitly. Backward compat: drop intents missing playerId on host (defensive).

**LOCKED §VIII.3 row 1 amendment (P3 will codify):** "Sever (cross-player disruption) costs 1 charge per §VIII.1-2 accumulator. Bond is hostile if either endpoint's `placerColor` differs from acting player's color. Self-sever (both endpoints owned by actor) preserves Phase-1 §VIII.4 mechanic at zero cost. Charge consumed only on destructive sever (cycle-bond no-op does NOT consume — PRIME-AUDIT B)."

**Tests** (~50 LOC across world.test.ts + sever.test.ts):
1. Cross-player sever consumes 1 charge (P2 severs P1-only bond with charge=1 → charge=0, prims deleted)
2. Cross-player sever with 0 charges = silent no-op (no state change)
3. Self-sever consumes 0 charges (player severs own-bond, charges unchanged)
4. Wrong-turn reject in 1v1 (P1 dispatches SEVER_BOND during P2's turn → no-op)
5. Charge cap respected (P2 builds 15 prims → charges max at 2, not 3)
6. Mixed-ownership bond auth (bond connecting P1's prim ↔ P2's prim — either player attempting it is "self-on-one-end" but per Gemini #3 rule "hostile if EITHER endpoint differs" → it's hostile for BOTH players — first-to-charge wins; verify both can attempt it with charge)
7. Cycle-bond sever does NOT consume charge (PRIME-AUDIT B): build triangle, charge=1, sever middle bond of cycle → bond survives, charge=1
8. Sever-root-bond splits structure correctly (§VIII.4 size + tiebreaker) — extends existing topology tests
9. Both players' charges accumulate independently (P1 builds 5 → P1.charges=1, P2.charges=0)
10. Save/load roundtrips disruptionCharges (save → reload → assert charge count restored)

**Migration of existing tests:** 17+ `SEVER_BOND` dispatch sites grep'd — add `playerId: asPlayerId(0)` (or whichever was active). Mechanical sed-style replace; verify with full vitest run.

**LOC budget:**
- `world.ts`: +18 LOC (auth check + charge logic + cycle-guard) — pushes to ~308 LOC (~10% over 280 target, S18 extract candidate)
- `controls.ts`: +1 LOC (playerId arg) — no change to ~542 LOC budget
- `ui.ts`: +25 LOC (charge dots renderer) — pushes to ~245 LOC (within budget)
- `save.ts`: +10 LOC (schema fields)
- `protocol.ts`: +5 LOC (if needed)
- Tests: ~50 LOC across 2-3 files
- **Total P1: ~110 LOC**

---

### **P2 — Phase-2 F: Multi-color bond rendering (Standard, ~80 LOC)**

**Files:** `src/render/bondVisualRenderer.ts`, `src/render/structureRenderer.ts` (caller), `src/render/bondVisualRenderer.test.ts`.

**Changes:**

**`bondVisualRenderer.ts` BondVisualParams:**
```ts
export interface BondVisualParams {
  readonly ax: number; readonly ay: number;
  readonly bx: number; readonly by: number;
  readonly visualEffectId: string;
  readonly colorA: number;   // NEW — endpoint A's placerColor (Gemini #1 BLOCKER fix)
  readonly colorB: number;   // NEW — endpoint B's placerColor
  readonly alpha: number;
  readonly width: number;
  readonly tick: number;
}
```

**`drawDefaultLine` (stroke decomposition, Grok #6 + Gemini #5):**
```ts
function drawDefaultLine(g: Graphics, p: BondVisualParams): void {
  if (p.colorA === p.colorB) {
    // Back-compat fast path: same-color bond, single solid stroke.
    g.moveTo(p.ax, p.ay).lineTo(p.bx, p.by).stroke({ width: p.width, color: p.colorA, alpha: p.alpha });
    return;
  }
  // Multi-color: 4 sub-segments, color lerped at t=0.125, 0.375, 0.625, 0.875.
  const segments = 4;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments;
    const t1 = (i + 1) / segments;
    const tMid = (t0 + t1) / 2;
    const x0 = p.ax + (p.bx - p.ax) * t0;
    const y0 = p.ay + (p.by - p.ay) * t0;
    const x1 = p.ax + (p.bx - p.ax) * t1;
    const y1 = p.ay + (p.by - p.ay) * t1;
    const color = lerpColor(p.colorA, p.colorB, tMid);
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: p.width, color, alpha: p.alpha });
  }
}
```

**`lerpColor` helper** (pure, testable, S10 #test-via-pure-helper-export pattern):
```ts
export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
```

**Magic-12 silhouettes:** each uses `p.colorA` for their primary stroke (anchor side) and `p.colorB` for accent strokes (rays/starburst/orbital/etc). Cheapest spec-compliant adaptation; defers per-silhouette gradient to S18 polish. Filament, Star, Orbital have natural "two-color" structure (main + accent) that maps cleanly.

**`structureRenderer.ts` caller** (audit + update bondVisualRenderer invocation site):
```ts
const primA = world.primitives.get(bond.aId);
const primB = world.primitives.get(bond.bId);
const colorA = primA?.placerColor ?? 0xffffff;  // §X.2 "reveal contributions" — IMMUTABLE placerColor (Gemini #1 BLOCKER)
const colorB = primB?.placerColor ?? 0xffffff;
drawBondVisual(g, { ax, ay, bx, by, visualEffectId, colorA, colorB, alpha, width, tick });
```

**LOCKED §VI.4 amendment (P3):** "Bond rendering uses primitive endpoint `placerColor` (immutable; §VI.4 LOCKED contribution record). Cross-color bonds render 4-segment lerped stroke. Same-color bonds render solid (back-compat). Per §X.2 'multi-color structures reveal contributions.' Stroke decomposition adopted per Council R1 — Pixi v8 has no native A→B endpoint gradient stroke API."

**Tests** (~25 LOC):
1. `lerpColor(0xff0000, 0x0000ff, 0.0) === 0xff0000` (endpoint A exact)
2. `lerpColor(0xff0000, 0x0000ff, 1.0) === 0x0000ff` (endpoint B exact)
3. `lerpColor(0xff0000, 0x0000ff, 0.5) === 0x7f007f` (midpoint exact lerp)
4. Same-color bond renders single stroke (assert `g.stroke()` call count === 1 for cable etc, depends on silhouette)
5. Different-color bond renders 4 sub-segments (assert call count === 4 for default; per-silhouette accent count for magic-12)
6. Anti-regression: existing 22 bondVisualRenderer.test.ts cases pass with colorA===colorB (back-compat)

**LOC budget:**
- `bondVisualRenderer.ts`: +60 LOC (BondVisualParams change + drawDefaultLine decompose + 12 silhouettes accent update + lerpColor) — pushes to ~570 LOC (already over 500 soft charter; carry-forward to S18 split per Phase-2 doc anchor)
- `structureRenderer.ts`: +5 LOC (caller update)
- Tests: ~25 LOC
- **Total P2: ~90 LOC**

---

### **P3 — Closeout (Micro, minor)**

**Files:** `LOCKED_DECISIONS.md`, `BACKLOG.md`, `reflexion_log.md`, `boot-snapshot.md`, `src/main.ts` (BETA badge update), `.claude/plans/` → `.claude/plans-archive/`, `HANDOFF_2026-05-12.md`, `.handoff-archive/`.

**Changes:**

1. **LOCKED amendments:**
   - §13.9 (if P0 pushed): primary URL flip to `https://spark-online.space/`; fallback URL → `github.io/the-spark/` (preserved for ~30 days then archive).
   - §VIII.3 row 1: NEW codification (cross-player Sever costs 1 charge, self-sever §VIII.4 free, cycle-bond no-charge-consume, mixed-ownership hostile-if-either-endpoint-differs rule).
   - §VI.4: rendering codification (placerColor-sourced, stroke-decomposition into 4 sub-segments, Pixi v8 native gradient API limitation noted, S18 shader-upgrade carry-forward).

2. **BACKLOG.md S17 entry** above S16: full P0/P1/P2 narrative + Council R1 outcome + PRIME-AUDIT delta + carry-forward (S18 anti-bloat extraction, S18 polish: bond-hover cost preview + per-silhouette gradient, A Fog as next Phase-2 mechanic).

3. **reflexion_log.md** (prepend ≤5 new S17 entries, prune to cap 50):
   - `#a0-state-discovery-found-charge-accumulator-already-wired` (saves ~30 LOC vs design-doc estimate)
   - `#council-flagged-pixi-v8-gradient-api-myth-stroke-decomp-correct`
   - `#spec-faithful-rendering-sources-placerColor-not-ownerColor-per-VI.4-X.2`
   - `#hostile-if-either-endpoint-differs-mixed-ownership-edge-resolved`
   - `#charge-not-consumed-on-cycle-bond-prime-audit-self-discovery`

4. **boot-snapshot.md** regen: S17 commit list, post-S17 state, Phase-2 Tier-1 live, live URL (spark-online.space or github.io fallback).

5. **`src/main.ts` BETA badge:** text `BETA` → `BETA · S17 PHASE-2`. Verify fit at top-right anchor (no overlap with connectionDot which is at `(CANVAS_WIDTH - 24, 24)`).

6. **PDR archive:** `.claude/plans/2026-05-12_PDR_Session_17.md` → `.claude/plans-archive/2026-05-12_PDR_Session_17_COMPLETED.md` via `git mv`.

7. **HANDOFF rotate:** root `HANDOFF_2026-05-12.md` (S16) → `.handoff-archive/HANDOFF_2026-05-12_S16_postS17.md`; write new S17 HANDOFF at root with: state of play, S18 priorities, S18 P0 candidate (A Fog or Phase-2 D/E or audio if Suno track ready).

**Definition of Done:**
- 307 + ~12 new tests pass (target ~319+)
- Typecheck exit 0
- npm run build green
- LOCKED amendments live on master
- HANDOFF rotated
- Final commit pushed to origin/master

---

## 3. TIER + SIZE ESTIMATE

**Tier:** Standard (10-30K)
**Size estimate:** ~25-28K (Council R1 ~3K + execution ~22K + closeout ~3K)
**Council:** R1 completed (this PDR). No R2 (Standard = 1 round).
**Token tracking source:** `python ~/.claude/scripts/real-context-tokens.py` per S77 protocol.
**Thresholds (1M Opus 4.7):** GREEN <500K / YELLOW 500K-750K / ORANGE 750K-900K / RED ≥900K.

---

## 4. DELIBERATION RECORD

### Council R1 Battle Ledger (synthesized from Grok DISRUPTOR + Gemini AUDITOR)

| # | Source | Severity | Decision | Rationale |
|---|---|---|---|---|
| 1 | Gemini #1 | **BLOCKER** | **ADOPT** | F sources `placerColor` not `ownerColor` per §X.2 "reveal contributions." Contributions = immutable record of who-placed. |
| 2 | Grok #2 | HIGH | **REJECT** | Inter-player bonding is spec-intended (§V, §VI.4, §X.2, §XIII Phase-2 multi-color row). It is the mechanism by which §VI.4 multi-toned structures form. Council misread it as a bug. |
| 3 | Gemini #3 | HIGH | **ADOPT** | Auth rule: hostile if EITHER endpoint placerColor ≠ actor's color. |
| 4 | Grok #3 + Gemini #4 | HIGH/MED | **ADOPT** | §VIII.3 P3 amendment disambiguates row-1 (cross-player, 1 charge) vs §VIII.4 (self-sever, 0 charge). |
| 5 | Grok #6 + Gemini #5 | HIGH | **ADOPT** | Pixi v8 has no native A→B stroke gradient. Stroke-decomposition into 4 sub-segments adopted. |
| 6 | Grok #5 | HIGH | **PARTIAL ADOPT** | P0 commit-only by default. Push gated on user explicit confirmation. LOCKED §13.9 amend after push success. |
| 7 | Grok #7 | HIGH | **PARTIAL** | Adopt: 5 additional tests (cycle, sever-root, mixed-auth, charge-cap, no-charge-on-cycle). Reject: mid-animation interrupt + network desync (out of Phase-2-C scope). |
| 8 | Gemini #2 | HIGH | **ADOPT** | (a) Surviving prims retain placerColor (immutable, no recompute). (b) `save.ts` schema bump for disruptionCharges + buildActions. |
| 9 | Gemini #6 | LOW | **ADOPT** | Migrate 17+ existing `SEVER_BOND` test dispatches + audit `net/protocol.ts` intent envelope. |
| 10 | Grok #4 | MED | **PARTIAL** | Keep HUD charge dots (per-player score row, player-colored). Defer bond-hover cost preview to S18. |
| 11 | Grok #8 | MED | **DEFER** | `world.ts` will hit ~308 LOC (~10% over 280). S18 `disruptionManager.ts` extraction carry-forward. |
| 12 | Grok #9 | MED | **REJECT** | No range-gate; visibility is A (Fog)'s mechanic per design doc. |
| 13 | Grok #10 | LOW | **ADOPT** | BETA badge text `BETA` → `BETA · S17 PHASE-2`. |
| 14 | Gemini #7 | LOW | **REJECT** | P0 stays in batch (5 LOC); extraction overhead > savings. |

### PRIME-AUDIT delta (post-Council self-audit)

| Item | Description | Resolution |
|---|---|---|
| A | Net protocol intent envelope for SEVER_BOND must be audited | P1 first step verifies `src/net/protocol.ts` |
| B | Charge consumption only on destructive sever (cycle = no consume) | Added to P1 SEVER_BOND case + test #7 |
| C | Charge dot color = player's color (red/cyan) | Specified in P1 ui.ts |
| D | §VIII.3 amendment text precise wording | Specified in P3 LOCKED amendments |
| E | BETA badge length fit | P3 verifies no overlap with connectionDot at top-right |

---

## 5. TESTING

**Baseline:** 307/307 passing as of S16 close (commit `e2f7d16`).

**P1 new tests:** ~10 (charge consume, 0-reject, self-free, wrong-turn, charge-cap, mixed-auth, cycle-no-consume, sever-root, both-players-independent, save-roundtrip).
**P1 test migrations:** 17+ existing `SEVER_BOND` dispatches add `playerId` arg.
**P2 new tests:** ~6 (lerpColor at 0/0.5/1, same-color back-compat, cross-color 4-segment, anti-regression sweep).

**Target after S17:** 307 + ~16 = **~323 tests**, all green.

**Browser smoke (preview):**
- `npm run dev` → verify charge dots appear in 1v1 PLAYING, fill in player color after 5 builds.
- Cross-player sever: P1 builds prim, P2 RMB-clicks P1's bond, prim deletes, charge -1, dot empty.
- Multi-color render: P1 builds red prim, P2 RMB-drag-bonds cyan prim onto it → bond renders red→cyan gradient (4 sub-segments visible).
- Self-sever: own-structure sever, no charge consumed, charge dot count unchanged.

**Build smoke (P0):** `npm run build` → `dist/index.html` references `/assets/...`, `dist/CNAME` contains `spark-online.space`.

---

## 6. CHARTER STATUS (LOC budgets, §XV)

| Module | Pre-S17 | Δ | Post-S17 | Target | Status |
|---|---|---|---|---|---|
| `world.ts` | 290 | +18 | ~308 | 280 | 10% over — S18 extract `disruptionManager.ts` |
| `controls.ts` | 542 | +1 | ~543 | 600 trip | OK |
| `ui.ts` | ~220 | +25 | ~245 | 500 soft | OK |
| `bondVisualRenderer.ts` | ~400 | +60 | ~460-480 | 500 soft | OK (close — S18 split candidate per Phase-2 doc) |
| `placePrimitive.ts` | 492 | 0 | 492 | 500 soft | OK |
| `save.ts` | ~? | +10 | tbd | 500 soft | OK |
| Tests | 307 | +16 | ~323 | n/a | growth healthy |

**Carry-forward:** `world.ts` and `bondVisualRenderer.ts` both flagged for S18 anti-bloat work.

---

## 7. RISKS + MITIGATIONS

| # | Risk | Mitigation |
|---|---|---|
| R1 | User defers DNS step → P0 commit unpushed | Commit only locally; carry-forward to S18; LOCKED §13.9 amend gated on push success |
| R2 | Pixi v8 stroke-decomposition perf at high bond count | Test on 50+ bonds; if FPS drops below 50, fall back to midpoint-lerp single color (Grok #6 alt) |
| R3 | Net protocol intent envelope breaks 1v1 | P1 first step audits `protocol.ts`; add playerId to envelope; existing 307 tests verify no regression |
| R4 | Save schema bump breaks reload of S16 saves | Defensive read: missing fields default to 0 (disruptionCharges) / 0 (buildActions). No version bump needed if purely additive. |
| R5 | Mixed-ownership bond auth surprises user (P1 builds prim on P2's structure, then P2 severs THEIR OWN side, charge consumed unexpectedly) | Gemini #3 rule logged in §VIII.3 amend; UX-test in browser smoke; if confusing, add bond-hover cost preview (deferred to S18) |
| R6 | BETA badge text overflow at top-right | P3 verifies width fit; if overflow, anchor.set(1,0) at right edge — auto-justifies; or trim to `BETA · S17` |
| R7 | F gradient renders in solo (where no inter-player bonds exist) | Same-color fast-path in `drawDefaultLine` (colorA===colorB) preserves solo render fidelity — verified by test #4 |
| R8 | Council R1 missed something the user catches | Present full PDR for review; user can revise before "go" |

---

## 8. ROLLBACK + EXIT CRITERIA

### Rollback (per priority):
- **P0:** revert vite.config.ts + delete public/CNAME; redeploy gives github.io URL back.
- **P1:** revert world.ts SEVER_BOND case + controls.ts arg + ui.ts dots + save.ts fields; existing tests passed pre-S17 so revert is clean.
- **P2:** revert bondVisualRenderer.ts + structureRenderer.ts; same-color render restored.
- **P3:** docs-only; revert LOCKED amendments; HANDOFF restore from `.handoff-archive/`.

### Session exit criteria (all required):
- [ ] 307 + ~16 = ~323 tests pass
- [ ] Typecheck exit 0
- [ ] `npm run build` green
- [ ] LOCKED amendments live on master (§13.9 if P0 pushed, §VIII.3, §VI.4)
- [ ] BACKLOG S17 entry merged
- [ ] reflexion_log entries appended (≤50 cap)
- [ ] boot-snapshot regenerated
- [ ] PDR archived to `.claude/plans-archive/`
- [ ] HANDOFF rotated (root has S17, archive has S16)
- [ ] All commits on origin/master
- [ ] Live URL HTTP 200 (spark-online.space if P0 pushed, else github.io/the-spark/ remains primary)

### Out-of-scope (S18+ carry-forward):
- Cloudflare DNS migration (user preference, S18 optional)
- Phase-2 D (Inject Spiral) — spec-ambiguous propagation
- Phase-2 E (Steal) + F per-silhouette gradient upgrade
- Phase-2 A (Fog of war) — foundation for visibility-gated raiding
- NET feel tuning (snapshot Hz, interp ms) — playtest-gated
- world.ts disruptionManager.ts extraction
- bondVisualRenderer.ts per-effect split
- Audio (Suno track upload pending since S5)
- Bond-hover cost preview (S18 polish)

---

## 9. SCOPE AMENDMENT #1 (2026-05-12, post-approval, user-flagged BLOCKER)

**Trigger:** User approval ("priority batch APPROVED. HOWEVER, I can't join room when playing with friend... it lets you put the code in that my friend generated (or vice versa) and then cant click enter").

**Root cause (A.0 verified):** `src/render/lobbyScreen.ts` adds Connect button + Host button + host code-text to relative-positioned Container panes (hostPane at (460, 360); joinPane at (980, 360)) but sets their child positions using **absolute canvas coords**. Result: positions are doubly-offset.

| Element | Local pos (set) | Pane offset | Effective stage pos | Canvas 1920×1080 in-bounds? |
|---|---|---|---|---|
| Connect button (joinButton) | (1110, 580) | (980, 360) | **(2090, 940)** | ❌ x=2090 off right edge |
| Host button (hostBtn) | (590, 580) | (460, 360) | (1050, 940) | ✅ visible but mispositioned below pane (pane bottom at y=720) |
| Host code text (codeText) | (700, 490) | (460, 360) | (1160, 850) | ✅ visible but mispositioned |

Plus: NO Enter-key handler on `inputEl` — user pressing Enter after typing code does nothing.

S16 P1 tests are pure-helper unit tests (`sanitizeRoomCodeValue`, `isValidRoomCode`, `mapCanvasRectToPage`) — none exercise Pixi Container child-positioning math, so the bug was invisible to vitest.

**NEW P0' — Lobby Connect bug fix (Micro BLOCKER, ~20 LOC).**

**Files:** `src/render/lobbyScreen.ts`, `src/render/lobbyScreen.test.ts`.

**Changes:**
1. Line 185 (hostBtn): `hostBtn.position.set(hostPaneX + PANE_WIDTH/2 - BUTTON_WIDTH/2, paneY + 220)` → `hostBtn.position.set(PANE_WIDTH/2 - BUTTON_WIDTH/2, 220)` (pane-relative).
2. Line 193 (codeText): `this.codeText.position.set(hostPaneX + PANE_WIDTH/2, paneY + 130)` → `this.codeText.position.set(PANE_WIDTH/2, 130)`.
3. Line 255 (joinButton): `this.joinButton.position.set(joinPaneX + PANE_WIDTH/2 - BUTTON_WIDTH/2, paneY + 220)` → `this.joinButton.position.set(PANE_WIDTH/2 - BUTTON_WIDTH/2, 220)`.
4. Extract Connect-attempt into private method `attemptJoin(callbacks)` — invoked from `joinButton.on('pointertap', ...)` AND from new `keydown` listener on `inputEl` (Enter key).
5. Hint text alignment check (line 222) — already uses pane-relative coords (PANE_WIDTH/2, 180) so no change.

**Tests (~25 LOC, new in lobbyScreen.test.ts):**
1. NEW `S17 P0' — button positioning regression` describe block.
2. Pure-helper export: `getConnectButtonCanvasBounds(joinPaneX, paneY)` — exported pure fn returning the expected canvas-space bounding box for the Connect button given pane origin. Asserts the result fits inside 0..CANVAS_WIDTH × 0..CANVAS_HEIGHT.
3. Same for `getHostButtonCanvasBounds(hostPaneX, paneY)`.
4. Same for `getHostCodeTextCanvasPos(hostPaneX, paneY)`.
5. Manual smoke: `npm run dev` → enter code, see Connect button visible, click it, see "Connecting..." status; ALSO press Enter mid-typing → fires onJoinAttempt.

**LOC:** ~20 code + ~25 tests = ~45 LOC. Micro tier.

**REVISED PRIORITY ORDER (after Amendment):**
- **P0' (NEW BLOCKER)** — Lobby Connect bug fix
- **P0** — Custom-domain ready-to-ship
- **P1** — Phase-2 C Sever-as-disruption
- **P2** — Phase-2 F Multi-color bond rendering
- **P3** — Closeout (now also amends §13.10 if BETA-badge needs lobby-fix call-out; reflexion adds #lobby-double-offset-double-found-via-position-math; HANDOFF rotate)

**Total post-amend estimate:** ~27-30K (still within Standard tier upper bound, no re-Council triggered).

**Council re-deliberation needed?** NO. Amendment is a defect-fix in a S16 module untouched by Council R1 scope (which focused on Phase-2 C/F + custom-domain). No new architectural surface introduced. Council R1 verdict (REVISE → ADOPT-with-revisions) stands for P0/P1/P2/P3.

---

## 10. APPROVAL GATE — APPROVED (2026-05-12)

- User approval recorded: "priority batch APPROVED. Run current priority batch as presented as well as what i just said. be thorough."
- `pdr_approved: true` + `deliberation_completed: true` + `unlock_source: user` to be written to `.claude/session-state.json` next step
- Per-priority gate fields at BOTH top-level AND each priority entry (P0', P0, P1, P2, P3) per CLAUDE.md PDR GATE protocol
- Beginning P0' execution immediately (BLOCKER takes precedence)
