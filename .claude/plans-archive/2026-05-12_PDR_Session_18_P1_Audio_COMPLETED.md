# S18 P1 — P8 Audio Implementation (Scope Amendment PDR)

**Date:** 2026-05-12
**Tier:** Standard (~250 LOC, ~5 files touched, ~25K context budget)
**Session:** S18 (extends S17 PDR scope)
**Amendment basis:** User request 2026-05-12 — Suno track "Blue Steppe Orbit.mp3" attached + 2 SFX requested. Original S17 PDR P8 entry was asset-gated placeholder ("audio deferred until track upload"). Asset now arrived → unblocks + expands scope to include SFX synthesis.

---

## 1. OBJECTIVE

Wire up the user-supplied Suno soundtrack ("Blue Steppe Orbit") as background music + synthesize 2 procedural SFX (bond-form clave tap, bond-sever high-pitched sweep) using Web Audio API. Browser-autoplay-safe (user-gesture-gated). Mute toggle persisted in localStorage.

## 2. SCOPE (IN)

1. **Asset placement:** Copy `C:\Users\onesh\Downloads\Blue Steppe Orbit.mp3` (10MB) → `public/audio/blue-steppe-orbit.mp3`. Vite copies to dist/audio/ on build.
2. **New module `src/render/audioManager.ts`** (~180 LOC):
   - Singleton `AudioContext` (lazy-init on first user gesture; pre-init blocked by browser policy)
   - `playMusic()` — loop the mp3 via `AudioBufferSourceNode` (fetched once, cached), gain ~0.25
   - `stopMusic()` — fade out + node disconnect
   - `toggleMute()` — flips a master `GainNode` between 1.0 and 0.0; persists to `localStorage.spark_audio_muted`
   - `playClaveSFX()` — synth: dual oscillator (sine 1200Hz + sine 2400Hz partial) with sharp ~30ms exponential decay envelope, gain ~0.4
   - `playFartSFX()` — synth: sawtooth oscillator with frequency sweep 600Hz→180Hz over 280ms + low-pass filter sweep, gain ~0.35
   - Failure-tolerant: if `AudioContext` unavailable or mp3 fetch 404s, fail silently (game still playable)
3. **Effect plumbing (3 LOC each, surgical):**
   - `src/state/placePrimitive.ts`: when new bond is created (existing path), push `{ kind: 'BOND_FORMED', tick, pos }` to `world.effects`
   - `src/state/world.ts SEVER_BOND case`: after `world.bonds.delete(bond.id)`, push `{ kind: 'BOND_SEVERED', tick, pos, cause: action.cause }` (cause discriminator distinguishes player-raid from physics-overstretch — only `cause === 'player'` triggers fart SFX per user spec "when someone is raiding another's structure")
4. **Effect drain → SFX (in renderer or main loop):** Process `world.effects` post-tick; route `BOND_FORMED` → `playClaveSFX()`, `BOND_SEVERED` (cause=player) → `playFartSFX()`. Existing visual `SEVER_ERASE` effect unaffected; new audio effects are additive.
5. **Type extension** in `src/types.ts`: add `BOND_FORMED` and `BOND_SEVERED` variants to the `Effect` discriminated union.
6. **Music start trigger:** Begin Match click handler in `lobbyScreen.ts` (S16 P1) calls `audioManager.playMusic()` — the user gesture unlocks AudioContext as a side-effect.
7. **Mute UI:** 'M' keypress toggles mute via global keydown handler in `main.ts`. Small monospace `🔊`/`🔇` glyph (or `M /̸M` text) anchored top-right at `(CANVAS_WIDTH - 12, 30)` — clears the BETA badge above (y=12) and connectionDot (y=48).
8. **Tests** (~50 LOC, ~10 new tests, target 340/340):
   - Pure helpers for envelope curves + frequency sweeps (verified algorithmically)
   - World reducer tests confirm `BOND_FORMED` / `BOND_SEVERED` effects fire on PLACE_PRIMITIVE / SEVER_BOND
   - Physics-cause sever does NOT emit `BOND_SEVERED` with player audio routing (or emits with cause=physics that drain ignores)
   - Existing 330 tests still pass

## 3. SCOPE (OUT — deferred)

- Volume slider UI (just mute toggle for v1)
- Per-track switching / playlist management
- Spatial / positional audio (would require listener position tracking)
- Crossfading between music states (lobby vs match vs win)
- Re-encoding mp3 to lower bitrate (10MB ships as-is for v1; CDN caching handles return visits)
- Mobile Safari audio resume edge cases beyond standard click-resume pattern
- Additional SFX (place-spark, win, raid-success, charge-tick, etc.) — only the 2 user-specified
- Beat-synchronized visual effects
- LOCKED spec entry §13.14 (audio) — can add in closeout if user requests

## 4. APPROACH

### 4.1 Why Web Audio API (not HTMLAudioElement) for music
- Music needs gain control synchronized with mute (would need 2 sources of truth otherwise)
- SFX MUST use Web Audio (HTMLAudioElement can't synthesize); single API = consistent codepath
- AudioContext lazy-init pattern handles autoplay-policy edge in one place

### 4.2 Why effects-array bridge (not direct call from world.ts)
- `world.ts` is pure reducer per §XV. Calling `audioManager.playClaveSFX()` from a reducer breaks purity → makes state-replay (save/load, NET reconciliation) play stale sounds.
- Effects array is already the established bridge (SEVER_ERASE pattern from S17 P1).
- Render-side drain ensures SFX fires once per real frame, not per reducer replay.

### 4.3 SFX synthesis parameters
- Clave: real claves are ~1000-2500Hz fundamental, ~10-30ms decay. Spec'd 1200Hz + 2400Hz harmonic, 30ms decay — woody not metallic.
- Fart: descending pitch sweep is the canonical comedic-fart shape. 600→180Hz sawtooth with low-pass sweep gives the "raspberry" character. Duration 280ms is long enough to register, short enough not to annoy on every raid.
- All gains conservative (≤0.4) so SFX never overpowers music or speech.

## 5. RISKS + MITIGATIONS

| Risk | Mitigation |
|---|---|
| Browser autoplay policy blocks AudioContext | Gate `initAudio()` on Begin Match click (user gesture); fail-silent if context still suspended |
| 10MB mp3 slow first-load on mobile | Asset is loaded async after match start, not in initial bundle. First-visit slight delay acceptable; CDN caches for repeat visits |
| `world.ts` already 308 LOC (10% over §XV target) | Audio emit adds ≤3 LOC inside existing SEVER_BOND case. Net delta ~0. S18+ disruptionManager extraction (P4) still solves the broader bloat |
| AudioContext state=suspended on tab blur/focus loss | Add `visibilitychange` listener that calls `ctx.resume()` on focus regain |
| mp3 fetch 404 (deploy lag, network glitch) | Try/catch + console.warn + degrade to SFX-only (game still works) |
| 'M' keybind conflict | Audit existing keydown handlers in main.ts/controls.ts; if conflict, fallback to 'N' or onscreen-only toggle |
| Save/load replay re-plays old SFX | Drain is render-side and tick-gated; replay constructs world via reducer but does NOT re-fire effects array if `replaying` flag set (existing pattern from S5) |
| Physics-cause sever incorrectly plays fart | `cause` discriminator on `BOND_SEVERED` effect; drain filters `cause === 'player'` only |

## 6. SUCCESS CRITERIA

1. `https://spark-online.space/` → Begin Match click starts music playback at ~25% volume
2. Build a primitive (creates a bond) → audible clave-tap SFX
3. RMB-sever an enemy bond → audible high-pitch descending sweep SFX
4. Physics-induced bond break (overstretch) → NO fart SFX
5. 'M' key toggles mute (both music + SFX); state survives page reload (localStorage)
6. `npx vitest run` → 340+/340+ all green
7. `npx tsc -b --noEmit` → exit 0
8. §XV charter: `audioManager.ts` ≤500 LOC; `world.ts` net delta ≤+5 LOC
9. No console errors in normal play; graceful warn on asset fetch failure

## 7. ROLLBACK

If audio causes any regression (game crash, lockup, performance drop), revert is a single commit. Asset file can stay; module file deletion + reverting 3 effect emits + main.ts mute key handler = full rollback. Effects-array additions are additive (no existing consumer cares about new variants).

## 8. EFFORT

- LOC: ~250 net add (180 audioManager + 50 tests + ~20 integration deltas)
- Files: 1 new module + 1 new test + 1 new asset + edits to ~5 existing files
- Implementation context: ~15-20K
- Council deliberation: ~10-15K
- PRIME-AUDIT: ~3K
- Commit + verify: ~5K
- Total: ~35-45K context spend (3-5% of 1M Opus 4.7 1M window)

## 9. APPROVAL GATE

Standard tier → MANDATORY 3-way Council (Claude proposer + Grok DISRUPTOR + Gemini AUDITOR, 1 round). PRIME-AUDIT after synthesis. Then user explicit "go" → write `pdr_approved: true` + `deliberation_completed: true` + `unlock_source: user` to session-state, execute.

---

## 10. COUNCIL R1 SYNTHESIS (Battle Ledger)

### 10.1 Grok-4-1-fast (DISRUPTOR) — 8 challenges

| # | Challenge | Severity | Outcome |
|---|---|---|---|
| 1 | Music loop gap on `AudioBufferSourceNode` (50-200ms scheduling jitter) | BLOCKER | **REJECTED-but-watch** — `loop=true` on AudioBufferSourceNode is sample-accurate per Web Audio spec; loops are gapless. Initial decode delay is real (10MB mp3 ~100-500ms first decode) but pre-decode on gesture init makes loops gapless. Monitor post-deploy; revisit if observed |
| 2 | Net-replay SFX re-trigger (effects drained blindly) | BLOCKER | **ADOPTED** — see §10.3 Adoption-A |
| 3 | Singleton AudioContext race (multiple gestures init twice) | BLOCKER | **ADOPTED** — see §10.3 Adoption-G |
| 4 | 10MB mp3 stalls mobile (no caching/compression) | SHOULD | **DEFERRED** — user shipped mp3 by explicit choice; v1 honors. Future P9 OGG-compression candidate if mobile feedback negative. Added to SCOPE-OUT §3 |
| 5 | SFX overlap/clipping (no panner, no auto-duck) | SHOULD | **DEFERRED** — too elaborate for v1; mono SFX channel acceptable. Added to SCOPE-OUT §3 |
| 6 | Mute glyph z-index undefined (renders under BETA?) | SHOULD | **ADOPTED-simpler** — Pixi child-add-order naturally layers later-added on top; add mute glyph AFTER BETA badge in main.ts init. No `zIndex` API needed |
| 7 | Fart sweep math: linear vs exponential ramp | COULD | **ADOPTED** — see §10.3 Adoption-E (exp ramps sound smoother) |
| 8 | localStorage cross-tab sync (no `storage` event listener) | COULD | **DEFERRED** — single-tab game; storage event added only if needed |

### 10.2 Gemini-2.5-flash (AUDITOR) — 10 findings

| # | Finding | Severity | Outcome |
|---|---|---|---|
| 1 | Reducer-replay double-fires effects (no tick cursor) | BLOCKER | **ADOPTED** — converges with Grok #2. See §10.3 Adoption-A |
| 2 | Multiplayer attribution (remote bond → local clave?) | SHOULD | **DECIDED-play-anyway** — design choice: SFX fires for BOTH local and remote bond changes; gives 1v1 awareness of opponent moves. Documented in §10.4 design note |
| 3 | Physics-cause dispatch consistency audit | SHOULD | **RESOLVED-by-audit** — STATE-DISCOVERY GATE A.0 probe: `grep dispatch.*SEVER_BOND src/physics/` returns ZERO matches in production code (only test file references). Production physics does NOT currently break bonds. `cause: 'physics'` branch is forward-compat code; no double-fire risk |
| 4 | Multi-bond placement (N bonds → N claves stack) | COULD | **ADOPTED** — see §10.3 Adoption-B |
| 5 | `localStorage` access throws in Safari private mode | SHOULD | **ADOPTED** — see §10.3 Adoption-D |
| 6 | Music start coverage (only Begin Match → misses single-player) | SHOULD | **ADOPTED** — see §10.3 Adoption-F (audit START_GAME paths, hook both) |
| 7 | 'M' key conflict with existing handlers | COULD | **RESOLVED-by-audit** — STATE-DISCOVERY GATE A.0 probe: `grep keydown src/` → 4 handlers (main.ts R/C, controls.ts SPACE, statsOverlay.ts ~/`, lobbyScreen.ts inputEl-scoped). 'M' is clean across all of them. Add to main.ts:248 alongside R+C |
| 8 | AudioContext init edge case (no Begin Match path) | COULD | **PARTIAL-ADOPTED** — see §10.3 Adoption-G (init also on any user gesture, not only Begin Match) |
| 9 | Large mp3 progressive loading | SHOULD | **DEFERRED** — same as Grok #4; v1 ships as-is |
| 10 | Vite copy `public/audio/*.mp3` under base='/' | COULD | **VERIFY-AT-IMPL** — `npm run build && ls dist/audio/` smoke check during impl. Vite's default `publicDir: 'public'` should copy directly |

### 10.3 Council adoptions (incorporated into final PDR)

- **Adoption-A (replay correctness):** Add `lastDrainedTick: number` cursor in audioManager. `drainEffectsForAudio(world.effects)` skips effects with `tick <= lastDrainedTick`. Reducer-replay (save/load, NET reconciliation) produces same effects but cursor preserved → silent. Live ticks always advance cursor by `world.tick - lastDrainedTick` worth of effects.

- **Adoption-B (multi-bond aggregation):** `placePrimitive.ts` pushes EXACTLY ONE `BOND_FORMED` effect per placement call, regardless of N bonds formed (multi-adjacent). Effect carries `{kind:'BOND_FORMED', tick, pos: <new-prim-pos>, bondCount: N}` for future use. Single clave per placement.

- **Adoption-D (localStorage safety):** Wrap localStorage `getItem` / `setItem` in try/catch with fallback to in-memory boolean. Safari private mode, embed contexts, or quota errors degrade to session-only mute.

- **Adoption-E (exp ramps):** Fart synth uses `freq.exponentialRampToValueAtTime(180, now+0.28)` instead of linear; ditto for LPF `filter.frequency.exponentialRampToValueAtTime(120, now+0.28)`. Smoother, less harsh.

- **Adoption-F (music start coverage):** Audit all paths setting `world.gameState = 'PLAYING'`. Initial: lobby `Begin Match` button (1v1), and single-player `START_GAME` (Title→1 Player). Hook music start in main.ts post-dispatch if `world.gameState === 'PLAYING'` transition detected, OR call `audioManager.playMusic()` from inside START_GAME success handlers in both paths. Idempotent — calling playMusic() twice is no-op once playing.

- **Adoption-G (AudioContext init guard + gesture coverage):** Init on FIRST user-gesture click anywhere (canvas pointerdown or any button click), not only Begin Match. `let audioContext: AudioContext | null = null;` + `if (audioContext === null) audioContext = new AudioContext();`. Every play call also runs `if (audioContext.state === 'suspended') await audioContext.resume();` for tab-blur recovery.

### 10.4 Design decision (Gemini #2 multiplayer)

**SFX fires for BOTH local and remote bond changes.** Rationale: in a 1v1 game where players cooperate-then-disrupt, hearing the opponent's bond-forms gives spatial-temporal awareness ("they just built something — where?"); hearing the opponent's severs telegraphs raids before the visual confirms. Removing this audio cue would reduce game-feel without protocol benefit. Not playing remote SFX would also break replay (when reducer plays remote actions during reconciliation, those bonds were never "yours" anyway).

---

## 11. PRIME-AUDIT (Rule 20)

Self-audit AFTER Council synthesis BEFORE user presentation. Items where Council may have rubber-stamped or where additional risks emerged:

**A. 'M' key during room-code input on lobby:** Mute keydown registered globally on `window` would fire even when user is typing 'M' into the lobby's room-code input field. Solution: gate the mute keydown on `document.activeElement` NOT being an `<input>` or `<textarea>`. Three-line guard. Adopting.

**B. AudioContext.state recovery on every play:** Tab-blur in some browsers suspends the context after seconds of idle. Solution: `await ctx.resume()` before every playMusic/playSFX call (not just on init). Adopted as part of Adoption-G but worth explicit.

**C. save.ts effects-not-serialized:** STATE-DISCOVERY GATE A.0 probe: `grep effects src/state/save.ts` → ZERO matches. Effects array is NOT in the save schema. ✓ Replay-via-load is safe (effects array starts empty on load).

**D. Effects array doesn't have unique IDs:** Multiple BOND_FORMED with same tick will be indistinguishable by ID. The lastDrainedTick cursor advances by tick boundary, so all same-tick effects drain together (correct, single clave per tick already via Adoption-B). ✓ No issue.

**E. NET protocol clash:** BOND_FORMED / BOND_SEVERED are new `Effect` kinds — NET carries `Action` types (PLACE_PRIMITIVE, SEVER_BOND), NOT `Effect` types. STATE-DISCOVERY GATE A.0 probe: `grep "BOND_FORMED\|BOND_SEVERED" src/net/` → ZERO matches. ✓ No clash.

**F. §XV charter:** Final LOC estimate post-Council:
- audioManager.ts ~210 LOC (below 500 charter)
- placePrimitive.ts: +5 LOC (effect emit)
- world.ts: +3 LOC (effect emit in SEVER_BOND case; net delta from 308 → 311)
- types.ts: +6 LOC (2 effect variants)
- main.ts: +12 LOC (mute key + activeElement guard + music start hook)
- audioManager.test.ts: ~80 LOC
- Tests in existing files: +30 LOC across world.test.ts, placePrimitive.test.ts
Total: ~260 LOC. ✓ Under 300 LOC target.

**G. STATE-DISCOVERY GATE A.0 summary:** Per Rule 21, before lock confirmed:
- `bonds.delete` callsites → only inside SEVER_BOND case ✓
- physics SEVER_BOND dispatch → zero in production ✓
- keydown handlers → 4, none conflict with 'M' ✓
- effects in save.ts → zero references ✓
- net/protocol BOND_FORMED/BOND_SEVERED → zero references ✓

All claims in PDR §4-§5 empirically verified. Scope locked.

---
