# SPARK — PDR Session 19 (batch)

**Date:** 2026-05-12 (post-S18)
**Tier:** Standard (P2 drives; P1+P3 Micro coast)
**Deliberation:** Council R1 once, focused on P2; PRIME-AUDIT covers all 3
**Status:** AWAITING USER APPROVAL

---

## STATE-DISCOVERY GATE A.0 — deltas vs S18 HANDOFF

Empirical probes (`wc -l`, grep on bondHover/colorA, read world.ts SEVER_BOND case):

| # | Claim (handoff) | Actual | Impact |
|---|---|---|---|
| Δ1 | `world.ts 311 LOC (11% over 280)` | **359 LOC (28% over)** | P2 extraction more urgent than reported |
| Δ2 | `audioManager.ts ~220` | 279 LOC | Still under 500 charter, OK |
| Δ3 | "Bond-hover cost preview ~30 LOC" (P7 in handoff slate) | **No `bondHover`/`hoveredBond` symbol in codebase** | P7 needs new hit-test infra, NOT extend existing → **DEFER to S20** |
| Δ4 | `lobbyScreen.ts ~480 (under 500)` | **551 LOC (10% over 500)** | New anti-bloat carry-forward to S20 (extract input pane) |
| Δ5 | `bondVisualRenderer.ts ~430` | 447 LOC | Under 500 charter, OK (minor reporting drift) |
| Δ6 | §13.14 NOT YET CODIFIED | Confirmed — §13.13 is last entry | P1 includes §13.14 LOCK amend |

**No PDR blockers.** Δ1 strengthens P2 case; Δ3 trims P7 from batch; Δ4 logs new S20 carry-forward.

---

## 1 · OBJECTIVE

Three-priority batch closing S18 audio loop + restoring §XV anti-bloat charter on world.ts + completing Phase-2 §VI.4 polish:

- **P1 (Micro)** — Audio controls UI: per-channel mute + volume via HTML overlay, 'M' = global pause, §13.14 LOCK amend
- **P2 (Standard)** — `disruptionManager.ts` extraction: world.ts 359 → ~290 LOC (within 280 target stretch)
- **P3 (Micro)** — Per-silhouette gradient: 12 magic silhouettes use colorA→colorB lerp pattern from `drawDefaultLine`

---

## 2 · SCOPE

### P1 — Audio Controls UI (Micro, ~180 LOC)

**FILES TOUCHED:**
- `src/render/audioManager.ts` — split master gain into `musicGain + sfxGain` children of `masterGain`; add `setMusicMuted/setSfxMuted/setMusicVolume/setSfxVolume/getAudioSettings`; localStorage namespace `audio.musicMuted` / `audio.sfxMuted` / `audio.musicVolume` / `audio.sfxVolume`; keep existing `toggleMute()` as global-pause that flips `masterGain` to 0/1 (preserves per-channel state)
- `src/render/audioManager.test.ts` — +8 tests: gain routing, clamp01, persistence roundtrip, 'M' global preserves per-channel, defaults 1.0/1.0
- `src/render/settingsOverlay.ts` *(NEW)* — pure HTMLDivElement factory: 2 toggle buttons + 2 `<input type=range>` sliders, follows lobbyScreen.ts inputEl pattern (position:fixed, z-index:1000, transparent background, ✕ close button, ESC + outside-click + ✕ close)
- `src/main.ts` — ⚙ Pixi hit-zone next to ♪ glyph (top-right, x=CANVAS_WIDTH-32, y=30, 16px), pointertap → overlay.show(); init audioManager settings on first user gesture
- `LOCKED_DECISIONS.md` — §13.14 NEW: codify audio subsystem (Suno track + 2 SFX + per-channel controls + 'M' global pause + localStorage 5-key schema)

**APPROACH:**
- `audioManager.ts` audio graph: `[music source] → musicGain → masterGain → destination`; SFX synth chains route through their per-sound gain → `sfxGain` → masterGain. Master GainNode unchanged in role (still 'M' target). 4 new public functions + new init reads localStorage for all 4 settings (default 1.0/1.0, both unmuted).
- 'M' key semantics: `toggleMute()` flips masterGain 0↔1 (preserves musicGain + sfxGain values). When unmuted via 'M' or settings panel, per-channel state stays intact.
- Settings overlay: HTML overlay pattern mirrors `lobbyScreen.ts:193-216` (position:fixed, z-index:1000). Created on first user gesture (lazy), shown via `overlay.show()`, hidden via `overlay.hide()`. ESC keydown + click-outside + ✕ button all hide. Music slider live-updates `setMusicVolume`; toggle live-flips `setMusicMuted`. Persists on every change.
- Pixi ⚙ icon: small text glyph "⚙" at (CANVAS_WIDTH-32, 30), alpha 0.55 (matches ♪ at CANVAS_WIDTH-12). Pointertap event opens overlay.

**TESTS:**
- `audioManager.setMusicVolume(0.5)` → after init, `getAudioSettings().musicVolume === 0.5`
- `clamp01(-1) === 0`, `clamp01(2) === 1`, `clamp01(NaN) === 0`
- localStorage roundtrip: set all 4 values → reset audioManager state → re-init → values restored
- 'M' global mute: `toggleMute()` while musicVolume=0.5 → `getAudioSettings().musicVolume === 0.5` (preserved)
- `setMusicMuted(true)` then `setMusicVolume(0.8)` → mute stays true (mute independent of volume slider)
- localStorage failure (Safari private mode mock): no throw, defaults applied

**EDGES:**
- Pre-gesture overlay: HTML overlay can show before AudioContext exists (writes settings to module-level state, audioManager applies on init)
- Slider while muted: stores value but channel stays muted until toggle off (matches consumer expectation)

### P2 — disruptionManager.ts extraction (Standard, ~70 LOC moved)

**FILES TOUCHED:**
- `src/state/disruptionManager.ts` *(NEW)* — pure helpers extracted from world.ts SEVER_BOND case:
  - `checkSeverAuth(world, action, bond): { allowed: boolean; charges: number }` — 1v1 input gate + hostile auth + charge check
  - `computeSeverEffects(world, bond, split): SeverEffect[]` — SEVER_ERASE per deleted prim + BOND_SEVERED with cause
  - `applySeverMutation(world, bond, split, chargeToConsume): World` — primitives + bonds map mutations + snapPrevPosForUnbonded
- `src/state/world.ts` — SEVER_BOND case becomes ~10 LOC orchestrator: capture severPos, call disruptionManager helpers, dispatch effects. world.ts 359 → ~295 LOC (close to 280 target; remaining 15 LOC overage queued for S20 worldFsm extraction).
- `src/state/disruptionManager.test.ts` *(NEW)* — 6 pure-helper unit tests covering hostile/self/cycle/0-charge/physics-cause/1v1-wrong-turn
- existing 346 tests must pass unchanged (regression gate)

**APPROACH:**
- Pure-helper extraction pattern (S10 #test-via-pure-helper-export). NO behavior change — semantics preserved bit-for-bit per S17 P1 LOCKED §13.11. Tests prove this via existing 16 SEVER_BOND regression tests passing unchanged.
- New helpers take `world` + `action` + `bond` + `split` as args, return either decision object (`checkSeverAuth`) or mutate `world` and return it (`applySeverMutation`). Effects appended via the existing `world.effects.push` mechanism.
- Cycle-no-consume PRIME-AUDIT B rule preserved: `applySeverMutation` accepts `chargeToConsume=0` for cycle case.

**TESTS:**
- 346 existing must pass (especially the 10 SEVER_BOND tests from S17 P1)
- 6 new disruptionManager pure-helper tests: hostile-cross-player consumes 1, self-sever 0, cycle 0, 0-charge silent reject, physics-cause bypass, 1v1 wrong-turn silent reject

**EDGES:**
- save.ts disruptionCharges + buildActions schema unchanged (Phase-2 already serialized)
- Net protocol IntentMsg.action.SEVER_BOND unchanged (TS structural typing)
- 16 pre-existing SEVER_BOND dispatch sites unchanged (action shape preserved)

### P3 — Per-silhouette gradient (Micro, ~80 LOC)

**FILES TOUCHED:**
- `src/render/bondVisualRenderer.ts` — extend `drawMagicXxx` helpers (12 of them, one per Phase-2 magic combo) to lerp colorA→colorB along the silhouette path instead of using `colorA` solo
- `src/render/bondVisualRenderer.test.ts` — +4 tests: 2 sample magic silhouettes asserting multi-segment lerp count + endpoint colors; back-compat single-color path when colorA===colorB
- (No new files. Extends existing functions.)

**APPROACH:**
- Reuse `drawDefaultLine` 4-segment decomposition pattern (already implemented S17 P2). For each magic silhouette, identify its stroke segments and emit them with `lerpTint(colorA, colorB, t)` where `t` is the segment's normalized position along the silhouette length.
- Single-color fast path (colorA===colorB) keeps Phase-1 monochrome performance.

**TESTS:**
- Sample magic silhouette (e.g. drawMagicTrident): colorA=red, colorB=blue → segment[0] tint ≈ red, segment[mid] ≈ purple-ish, segment[end] ≈ blue
- Back-compat: colorA===colorB=green → all segments green (single-color path)

**EDGES:**
- Performance: 12 silhouettes × ≤32 stroke ops × ~4 segments each = ≤1.5K Graphics ops worst-case. With <100 bonds in Phase-1, well under Pixi v8 budget. Profile via build modules count (must stay 777 ±5).
- 12 magic silhouettes vary in geometry (straight line, curve, branching). Helpers extract a `normalizedT(x, y)` function per silhouette — Council R1 will weigh whether to do this manually per-helper vs. add a shared utility.

---

## 3 · TESTING (batch gate)

- `npx vitest run` → 346 → ~364 (+18: P1 +8, P2 +6, P3 +4) all passing
- `npx tsc -b --noEmit` → exit 0
- `npm run build` → 777 modules ±5, bundle delta +6 KB max (P1 ~+3KB, P2 net ~0 (extraction), P3 ~+2KB)
- Live verification post-push: `curl -sI https://spark-online.space/` HTTP 200, gh run success in <60s
- Manual playtest (user gate): ⚙ icon → click → overlay → slide music to 50% → music quieter ✓ → toggle SFX off → claves silent, music continues ✓ → close → reload → all 4 settings persist ✓; 'M' → both channels mute ✓ → 'M' again → both restore with per-channel state preserved ✓; place primitive → magic silhouette shows gradient if cross-player ✓; sever cross-player bond → 1 charge consumed (existing test coverage); sever self-bond → free (existing)

---

## 4 · COUNCIL R1 (Standard tier mandatory)

Run focused on **P2 disruptionManager extraction** (only architectural piece). Brief overview of P1 + P3 for cross-check.

**Prompts:**
- Grok DISRUPTOR: "world.ts has 359 LOC SEVER_BOND case being extracted into disruptionManager.ts pure helpers. What architectural risk does this hide? Multi-cause discriminator edges? Effect ordering? Test coverage gaps?"
- Gemini AUDITOR: "Audit the proposed extraction split (checkSeverAuth / computeSeverEffects / applySeverMutation). Is the boundary correct? Does it preserve S17 §13.11 LOCKED semantics? Find concerns Grok missed."

**Tools/quality mandatory.** Battle Ledger logged inline.

---

## 5 · PRIME-AUDIT (post-Council, pre-user-go)

Adversarial self-audit for all 3 priorities. Min 5 items, focus on:
- P1: AudioContext + GainNode lifecycle on tab-blur, master vs per-channel ordering
- P2: cycle-no-consume PRIME-AUDIT B preservation, NET protocol shape stability
- P3: gradient rendering perf at 50+ magic bonds, helper duplication vs shared util

---

## 6 · TIER + DELIBERATION

- Batch tier: **Standard** (highest of priorities — P2 drives)
- Council R1: MANDATORY (mandatory per §Rule 17 for Standard)
- PRIME-AUDIT: MANDATORY (all tiers, Rule 20)
- Quality gate: tests + tsc + build all green before per-priority commit

---

## 7 · ROLLBACK

- Per-priority git commit. If regression gate fails post-commit, `git revert <SHA>` and re-plan that priority. P1+P3 are independently revertable; P2 is independently revertable BUT requires re-running 16 SEVER_BOND tests.

---

## 8 · OUT OF SCOPE (this batch)

- **P7 bond-hover cost preview** — A.0 Δ3: no hover hit-test infra exists, scope balloons → S20
- **OGG audio compression** + PannerNode + auto-duck → S20 (P9 polish)
- **lobbyScreen.ts extraction** — A.0 Δ4: NEW S20 carry-forward (551 LOC vs 500 charter)
- **Phase-2 next mechanic** (D/E/A/G) — design-gated, user picks for S20+
- **NET feel tuning + NET enhancements** — playtest-gated (needs friend)

---

## SESSION-STATE GATE FIELDS (write on user approval)

```json
{
  "pdr_approved": true,
  "deliberation_completed": true,
  "unlock_source": "user",
  "tier": "Standard",
  "council_waived": false,
  "active_pdr": ".claude/plans/2026-05-12_PDR_Session_19.md"
}
```

Per-priority gate fields placed at each entry in `priorities[]` array.

---

## APPROVAL REQUEST

Slate: **P1 (audio controls UI) → P2 (disruptionManager extract) → P3 (silhouette gradient)**. Estimated context: ~80–100K (well within GREEN at 500K threshold).

User says **`go`** → I write gate flags, invoke Council R1 on P2, run PRIME-AUDIT, execute sequentially.

User can redirect: drop P3 (skip polish), swap P3 for a Phase-2 mechanic pick, defer P2 to S20 if you want a one-priority audio-only sprint, etc.
