---
STATUS: COMPLETED (body status corrected S119 — was firing the pre-flight ACTIVE-PLAN WARN every boot since S53)
SESSION: S51
TIER: Standard
DATE: 2026-05-26
---

# PDR — S51 batch (P1 E2E spawner-rate fix · P2 Audio polish)

## 1. OBJECTIVE

Close the S50-bequeathed CI gate by fixing the E2E failure root cause (spawner rate at λ=0.15 produces a deterministic 25.71s first-spawn delay against the locked seed `0xc0ffee`, so e2e `waitForWorld(... sparks spawned)` predicates time out before any spark exists), then ship the deferred S18 P9 audio-polish trio: OGG/Opus re-encode of the 10 MB music master (target ≤2 MB), `PannerNode` positional audio for SFX, and music auto-duck on Voltkin events. Two priorities, one Standard-tier Council batch.

## 2. SCOPE

### P1 — E2E spawner-rate test-only override seam + CI re-green

**Root cause** (confirmed via empirical state-discovery; the deterministic seed `0xc0ffee` + the LOCKED gameplay rate `SPAWN_RATE_PER_SECOND = 0.15` (LOCKED_DECISIONS §155 + §167 — *intentional* per S5 playtest "strategic-bet feel") yields `mulberry32(0xc0ffee).next() = 0.0214…` → initial `secondsUntilNextSpawn = -ln(0.0214)/0.15 = 25.71 s`. Tests wait 10s–30s for ≥3 / ≥8 sparks; first spark cannot arrive before t≈25.7s, so freeSparks stays `[]` for the entire timeout window. The same code in CI run `26440547587` shows host tick=1604 (≈26.7s) with `freeSparks=[]` across 5 tests × 3 retries — `P(all 15 = 0 sparks | λ=0.15)` ≈ 10⁻²⁶. Systematic, not statistical.

**Files touched (3 source, 1 test):**

1. `src/constants.ts` — add `readTestSpawnRate()` helper + change `SPAWN_RATE_PER_SECOND` from a bare literal to `readTestSpawnRate() ?? 0.15`. Identical pattern to existing `readTestWinScore` / `PHASE_1_WIN_SCORE`. Zero production behavior change (no `window` in SSR/test/non-browser paths; absent override falls through to 0.15).
2. `e2e/smoke.spec.ts` — add `addInitScript` per-context (both host + joiner) for the 5 Sym describes that touch sparks (Sym A, C, D, F, I). Baseline + Sym E unchanged. Pick rate = `1.5` (per Blueprint comment in `spawner.ts:6` — the documented design intent before the S5 playtest amendment; **only the e2e override path uses 1.5**, production stays at 0.15).
3. Optional: micro-doc-comment on the constant explaining the seam (no behavioral cost).

**Out-of-scope:**
- Do NOT change `SPAWN_RATE_PER_SECOND` production literal (would violate LOCKED_DECISIONS Item 3 — explicit S5 playtest decision documented in the Open Items v2 amendment).
- Do NOT change the world seed `0xc0ffee`.
- Do NOT shorten any test `timeoutMs` (would mask future regressions of the same family).
- WebRTC handshake reliability is not in scope (CI logs show peerCount=1 consistently; the e2e baseline test PASSED — handshake is healthy on `ubuntu-latest` ICE).

### P2 — Audio polish (S18 P9 carry — OGG/Opus + PannerNode + auto-duck)

**P2.a OGG/Opus re-encode.** Re-encode `public/audio/blue-steppe-orbit.mp3` (10,008,775 B = 10.0 MB) to `public/audio/blue-steppe-orbit.ogg` via `ffmpeg -i ... -c:a libopus -b:a 96k -application audio`. Update `MUSIC_URL` in `audioManager.ts` from `/audio/blue-steppe-orbit.mp3` → `/audio/blue-steppe-orbit.ogg`. Keep the MP3 on disk as fallback for Safari (which historically lacked Opus decode; Web Audio `decodeAudioData` is best-effort — graceful failure already wired). Target: ≤2 MB. ffmpeg 8.1 with `--enable-libopus` present locally; deterministic encode.

**P2.b PannerNode positional audio.** Add an optional `pos?: Vec2` argument to the four SFX entry points (`playClaveSFX`, `playFartSFX`, `playChargeSFX`, `playOneShot`). When `pos` provided, insert a `PannerNode` between osc/buffer-source and `sfxGainNode`. Mapping: `panner.positionX.value = (pos.x - CANVAS_WIDTH/2) / (CANVAS_WIDTH/2)` (i.e., [-1, +1] L↔R), `positionY = (pos.y - CANVAS_HEIGHT/2)/(CANVAS_HEIGHT/2)` (note: Web Audio's Y is vertical → for 2D-game stereo, only X meaningfully affects panning; Y is informational for future 3D). Listener fixed at origin (no per-frame update — camera is static at canvas center). Distance-model = `linear`, `refDistance = 1`, `maxDistance = 2`, `rolloffFactor = 1`. **Call sites updated:**
  - `drainAudioEffects` — for `BOND_FORMED`, `BOND_SEVERED`, `CREATURE_CHARGE`, lightning-crackle: pass `effect.pos` if the effect carries a position field.
  - SFX calls without a clear source position (UI clicks etc.) call the no-pos overload — preserves current behavior.

**P2.c Music auto-duck on Voltkin events.** New `duckMusic(durationMs, depth=0.25)` in `audioManager.ts`. Implementation: `musicGainNode.gain.cancelScheduledValues(now); musicGainNode.gain.setTargetAtTime(currentMusicGain * depth, now, 0.030); setTimeout(() => musicGainNode.gain.setTargetAtTime(currentMusicGain, ctx.currentTime, 0.150), durationMs)`. Idempotent: if duck already in flight, extend it (don't stack). Wired into `drainAudioEffects` on `CREATURE_CHARGE` (300 ms wind-up duck) and `BOND_SEVERED` with `cause === 'creature'` (700 ms duck during the lightning-crackle).

**Bundle gate:** Δ ≤ 1 KB on JS bundle. Asset delta = +1 OGG ≈ +2 MB, −1 MP3 ≈ −10 MB if we delete the MP3 (NET asset Δ −8 MB) OR keep both (NET asset Δ +2 MB). Keep both initially (asset cache + fallback resilience). 

**Out-of-scope:**
- Stereo widening, reverb, convolver — these are taste calls Daniel should preview first.
- Dynamic music layering (multi-bus crossfades for game-state transitions).
- Pre-buffering / streaming.

## 3. ASSUMPTIONS

1. The CI environment continues to support real Trystero/Nostr WebRTC (the baseline `Both peers reach PLAYING` test PASSED on run `26440547587` — handshake is healthy).
2. `decodeAudioData` in headless Chromium 138 supports Ogg/Opus (verified upstream: Chrome 70+ universal). If decode fails for any reason, the audio path already silently no-ops — game-loop is not blocked.
3. The test override seam pattern is symmetric with `__TEST_WIN_SCORE__` (already shipped S50 P4, in production, no leak into Sym E describe per Δ2 mitigation). Mirror = low-risk.
4. PannerNode wire-up is best-effort: if the optional `pos` is omitted, callers fall back to the existing no-panner code path — zero regression for SFX without position data.
5. Soft-cap `FREE_SPARK_SOFT_CAP=50` correctly clamps the e2e λ=1.5 scenario; at 1.5/sec, steady-state of ~50 sparks is reached in ~33s — well within the 30s test timeout AND e2e isn't reading the cap mechanic.

## 4. APPROACH

### Sequencing

```
P1.0  Write test-override seam in constants.ts          (5 min)
P1.1  Add addInitScript to 5 e2e Sym describes          (10 min)
P1.2  Local repro: npx playwright test --project=chromium e2e/smoke.spec.ts
       — must go from 5 fail → 0 fail                   (20–25 min — full run)
P1.3  npm test (unit) + tsc -b — confirm GREEN          (3 min)
P1.4  Commit + push                                     (1 min)
P1.5  Watch GH Actions CI run; if green, lock P1        (≤15 min)
─────
P2.a  ffmpeg encode .mp3 → .ogg; sanity-check duration  (5 min)
P2.b  Update MUSIC_URL; npm run build; verify decode    (5 min)
P2.c  PannerNode helper + update SFX function signatures (15 min)
P2.d  duckMusic helper + drainAudioEffects hooks         (10 min)
P2.e  Unit tests for clamp01, chargeFreq stay GREEN;
       new tests for panner mapping + duck idempotence   (15 min)
P2.f  npm test + tsc -b + vite build (bundle check)     (5 min)
P2.g  Commit + push                                     (1 min)
P2.h  Watch CI                                          (≤15 min)
─────
CHECK Triumvirate (RALPH + GROK + GEMINI parallel)      (15–25 min)
EOS audit + /handoff + S52 boot prompt                   (15 min)
```

### Test-override seam code shape (P1)

```ts
// constants.ts
function readTestSpawnRate(): number | null {
  if (typeof window === 'undefined') return null;
  const v = (window as { __TEST_SPAWN_RATE_PER_SECOND__?: number })
    .__TEST_SPAWN_RATE_PER_SECOND__;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
export const SPAWN_RATE_PER_SECOND = readTestSpawnRate() ?? 0.15;
```

```ts
// e2e/smoke.spec.ts — helper applied per Sym test (NOT baseline, NOT Sym E)
async function applyTestSpawnRate(ctx: BrowserContext, rate = 1.5): Promise<void> {
  await ctx.addInitScript((r) => {
    (window as { __TEST_SPAWN_RATE_PER_SECOND__?: number })
      .__TEST_SPAWN_RATE_PER_SECOND__ = r;
  }, rate);
}
// Apply in each Sym describe's `beforeEach` or at context creation, mirror Sym I addInitScript shape.
```

### PannerNode mapping (P2.b)

```ts
function createPanner(ctx: AudioContext, pos: Vec2): PannerNode {
  const panner = ctx.createPanner();
  panner.panningModel = 'equalpower';
  panner.distanceModel = 'linear';
  panner.refDistance = 1;
  panner.maxDistance = 2;
  panner.rolloffFactor = 1;
  panner.positionX.value = (pos.x - CANVAS_WIDTH / 2) / (CANVAS_WIDTH / 2);
  panner.positionY.value = 0; // 2D top-down — Y not used for stereo
  panner.positionZ.value = (pos.y - CANVAS_HEIGHT / 2) / (CANVAS_HEIGHT / 2);
  return panner;
}
```

### duckMusic (P2.c)

```ts
let duckTimeout: number | null = null;
export function duckMusic(durationMs: number, depth = 0.25): void {
  if (musicGainNode === null || audioContext === null) return;
  const ctx = audioContext;
  const now = ctx.currentTime;
  const target = clamp01(musicVolume) * depth;
  musicGainNode.gain.cancelScheduledValues(now);
  musicGainNode.gain.setTargetAtTime(musicMuted ? 0 : target, now, 0.030);
  if (duckTimeout !== null) clearTimeout(duckTimeout);
  duckTimeout = window.setTimeout(() => {
    musicGainNode!.gain.setTargetAtTime(
      musicMuted ? 0 : clamp01(musicVolume),
      ctx.currentTime, 0.150,
    );
    duckTimeout = null;
  }, durationMs);
}
```

## 5. CHALLENGES (≥3, tool/quality mandatory)

**C1 (tool — Council R1 Q1):** Should we lower SPAWN_RATE_PER_SECOND production-wide back to 1.5 (Blueprint intent)? **NO** — LOCKED_DECISIONS Item 3 explicitly documents the S5 amendment 1.5→0.15 for "strategic-bet feel". Changing production gameplay to fix a test contract violates the locked decision. Test-only override is the canonical fix shape (precedent: `__TEST_WIN_SCORE__`).

**C2 (tool — Council R1 Q2):** Is the addInitScript per-Sym pattern correct, or should we override globally via playwright `use:` fixture? **PER-SYM** — global override would change Sym E (score-display) and the baseline test, neither of which need sparks. Per-context isolation per the Sym I PRIME-AUDIT Δ2 precedent prevents leak.

**C3 (quality — Council R1 Q3):** Could PannerNode wire-up break existing audio tests? **Risk-mitigated** — the new `pos?` arg is optional. All existing unit tests call SFX without pos; insertion of `pos === undefined` path = current behavior. Tests stay deterministic (PannerNode position is unitlessly per-call).

**C4 (quality):** OGG/Opus vs OGG/Vorbis. Opus has better quality at 96 kbps but slightly newer browser support. Targets: Chrome 70+, Firefox 102+, Safari 17+ (iPadOS); Pixi v8 already requires modern WebGL2 anyway — the audience overlaps. Opus = better compression + quality. **OGG/Opus selected**.

**C5 (tool):** ffmpeg deterministic output? Yes — fixed bitrate + libopus + audio mode + no metadata-changing flags = byte-identical re-encode given the same input. We commit the OGG file (small ~2 MB; live deploy needs it served).

**C6 (quality — auto-duck idempotence):** What if two CREATURE_CHARGE events fire in rapid succession? `setTimeout(restore...)` from event-1 might fire while event-2's duck is still active, prematurely restoring music. **Mitigation**: `clearTimeout(duckTimeout)` at the start of each `duckMusic()` call — only the latest event's timer survives. Standard debounce pattern.

## 6. TESTING

### P1 verification
- **Local Playwright run** (canonical):  `npx playwright test --project=chromium e2e/smoke.spec.ts` → expect 7/7 pass (1 skipped Sym E `test.fixme`), no flakes across 1 run.
- **Unit tests**: `npm test` → 783/783 GREEN (no change — production rate unchanged).
- **TypeScript**: `tsc -b --noEmit` → clean.
- **CI**: GH Actions e2e workflow next push run shows GREEN; baseline + Sym A/C/D/F/I all pass.

### P2 verification
- **Unit tests** (new):
  - `audioManager.test.ts` — test `duckMusic(...)` idempotence (sequential calls with overlapping windows yield single restore at the last timer's deadline).
  - `audioManager.test.ts` — test `createPanner({x:0, y:540})` returns `positionX = -1`, `createPanner({x:1920, y:540})` returns `positionX = +1`, `createPanner({x:960, y:540})` returns `positionX = 0`.
- **Bundle**: `npm run build` → main JS chunk ≤ 500 KB charter (Δ ≤ 1 KB on PannerNode/duck wire-up).
- **Audio file**: `du -h public/audio/blue-steppe-orbit.ogg` shows ≤ 2 MB.
- **Smoke** (when feasible): visual inspection of audio via DEV `inspectAudioChain()` console output — PannerNode appears in the graph; music gain dips during a Voltkin cinematic.
- **Re-run e2e** to ensure audio changes don't break anything game-state-driven.

## 7. EFFORT estimate

- P1: ~3 K tokens code + ~5 K tokens test/verify = **~8 K**
- P2: ~10 K tokens code + ~5 K tokens test/verify = **~15 K**
- Council R1 + PRIME-AUDIT: **~6 K**
- CHECK Triumvirate: **~8 K**
- EOS + /handoff + S52 prompt: **~6 K**

**Total: ~43 K tokens** (Standard tier upper-bound — at the boundary; if scope creeps, demote audio polish to P2.a only and defer P2.b/P2.c to S52).

## 8. ROLLBACK

- **P1**: `git revert <P1-commit-sha>` — single commit touches `src/constants.ts` + `e2e/smoke.spec.ts`. Reverting restores S50 state (broken CI but explicitly known-broken). The override seam itself is opt-in — production paths never read `window.__TEST_SPAWN_RATE_PER_SECOND__`.
- **P2**: `git revert <P2-commit-sha>` reverts audio files + audioManager.ts changes. The .mp3 stays committed so `MUSIC_URL` after revert resolves to a present asset. If only OGG fails to load in some browser, the existing graceful failure path (the music-fetch try/catch in `getMusicBuffer`) keeps the game silent-music but playable.
- **PannerNode**: callers default to no-pos overload → graph is bit-identical with master.
- **duckMusic**: single function, easily neutralized by removing the call site in `drainAudioEffects` without touching the helper itself.

---

**Council deliberation expected next (Standard tier MANDATORY 3-way Council). Battle Ledger to record adoption decisions per challenge. PRIME-AUDIT before user `go` (already given upfront for the autonomous batch).**
