# S192 PROGRESS — `s192/audio` (T15: "At wave eight, the music and sound stopped for a few seconds.")

Worktree branch `s192/audio`, from master 663c4c9. Merge owner = main session. Never pushed.
Brief: research `S192_RESEARCH_units_ai.md` §T15 (H1 seams, H2 voice overload, H3 suspended ctx, H4 NONET, H5 Helga).

## Step 1 — seam re-measurement (ffmpeg 8.1 `silencedetect`, d=0.3 s) + the loop math

`ffmpeg -version` → 8.1-full_build (present). Then the SAME `computeLoopRegion` that ships was run over
each track's real decoded PCM (ffmpeg → f32le 48 kHz stereo → `musicLoop.ts`), scratch script
`scratchpad/audio/measure.mts`, not committed.

| track | length | ffmpeg −35 dB silence | ffmpeg −50 dB silence | loop region (−40 dBFS, ⚠ MINE) | seam silence/lap <−40 dB before → after | <−35 dB before → after |
|---|---:|---|---|---|---|---|
| `blue-steppe-orbit.ogg` (default) | 384.97 s | 382.34 → end (**2.62 s**) | 382.47 → end (2.49 s) | 0.000 – 382.353 | 2.61 → **0.00** | 2.62 → 0.01 |
| vampires | 279.81 s | 0 → 1.33 + 278.07 → end (**3.07 s across seam**); 164.46–164.96 (0.49 s, inside) | 0 → 0.52 + 278.75 → end | 1.097 – 278.399 | 2.51 → **0.00** | 3.08 → 0.57 |
| nagas | 314.84 s | 0 → 1.50 (**1.50 s**) | 0 → 0.60 | 0.869 – 314.840 | 0.87 → **0.00** | 1.50 → 0.63 |
| mummies | 307.37 s | none at the seam. INSIDE: **39.44–42.40 (2.96 s)**, plus 0.34/0.60/0.73/0.99/0.50/0.93 s dips at 4.2, 5.2, 6.1, 15.0, 23.8, 163.4 s | 40.98–42.39 (1.42 s, inside) | whole (no trim) | 0.06 → 0.06 | 0.27 → 0.27 |
| zombies | 208.77 s | 207.23 → end (**1.54 s**) | 207.43 → end (1.34 s) | 0.000 – 207.273 | 1.50 → **0.00** | 1.54 → 0.04 |
| orcs | 159.96 s | 157.93 → end (**2.03 s**) | 158.98 → end (0.98 s) | 0.000 – 158.499 | 1.46 → **0.00** | 2.03 → 0.57 |
| demons | 261.69 s | 257.96 → end (**3.74 s**) | 259.14–259.63 + 259.63 → end (2.55 s) | 0.000 – 258.548 | 3.15 → **0.00** | 3.74 → 0.59 |
| `nonet-theme.ogg` | 136.93 s | 136.18 → end (0.74 s) | none | 0.000 – 136.208 | 0.71 → **0.00** | 0.74 → 0.03 |
| `helga-theme.ogg` | 4.01 s | none | none | whole (no trim) | 0.03 → 0.03 | 0.04 → 0.04 |

The research table reproduces exactly. The residual 0.57–0.63 s under −35 dB after trimming is the
musical fade between −35 and −40 dBFS (kept on purpose — trimming at −35 would hard-cut the fade).
Scan cost on the real PCM: 0.1–24 ms per track, once per decode (only the silent edges are read).

⚠ **mummies 39.4–42.4 s is IN THE COMPOSITION.** Reported, not edited — the owner's ear decides whether
it is intentional. A loop region cannot reach it and the code does not try.

⚠ **nagas**: coordinator note — `s192/nagas-song` replaces `public/audio/races/nagas.ogg` at the same
path (the old one ends abruptly). This branch does NOT touch that asset. The loop region is DERIVED at
runtime from whatever PCM decodes, so the new track needs no code change; re-measure it after that merge
(`__SPARK__.audio.inspect().musicLoopRegion`, or the scratch ffmpeg method above).

## Step 2–4 — the fixes (one commit: they share `audioManager.ts`)

**H1 seams, fixed in code, assets untouched.** `startMusicLoop(ctx, buffer, dest, offset?)` in
`audioManager.ts` is now the ONLY place a looping music source is built. It sets `loopStart`/`loopEnd`
from `computeLoopRegion(buffer)` (cached per buffer in a WeakMap) and starts at `loopStart`, so a silent
HEAD is skipped on the first lap too. Callers: `playMusic`, `enterNonetRealm`, `startHelgaTheme`, plus
the DEV `seekMusic`. A buffer without PCM (fake / broken decode) loops whole, as before.

**H2 voice cap.** `sfxVoices.ts` — a pure ledger of voice end-times in `AudioContext.currentTime`.
Every node-building SFX function (11 of them) calls `admitVoice(kind, durationS)` first and returns
when refused. ⚠ MINE: global **32** voices; per kind clave 4 · fart 4 · charge 4 · boom 4 · gnaw 3
(= chewerRenderer's MAX_GNAW_VOICES) · splat 4 · zap 4 · laser 4 · oneShot 6 · ui 3. Refused = skipped,
never queued. Every oscillator/buffer source is also counted live (start → `onended`).
Measured on the fake bus: 200 each of BOND_FORMED + BOND_SEVERED(raid) + BOMB_EXPLODE + CREATURE_CHARGE
in ONE tick built **1 000 source nodes** with the cap off and **20** with it on (16 voices).
NONET's own juice synth (`nonetJuice.ts`) is the one pinned uncapped exception (the board is frozen).

**H3** — `contextStateChanges` counts every AudioContext `statechange` (always on; DEV also timestamps).

**Debug seams (DEV only, `import.meta.env.DEV`)** — `__SPARK__.audio`:
`rmsLog()` (100 ms master-bus dBFS + ctx state + `ctxRatio` = ctx-clock advance ÷ wall-clock advance,
60 s ring), `silentWindows(db=-50)`, `events()` (state changes, loop starts + region, seeks),
`seekMusic(s)`, `stress(n, kind)`, `setVoiceCap(on)`, `inspect()`. The `?debug=1` overlay gains four
lines: music loop region (trimmed/started), sfx voices live/peak/dropped, source nodes live/peak, ctx changes.

**Determinism / protocol.** Client-only. `audioSimBoundary.test.ts` walks the runtime import graph from
`state/world.ts`, `state/hostTick.ts`, `state/workerSim.ts`, `simWorker.ts` and fails if any of
audioManager / musicLoop / sfxVoices / raceMusic is reachable (positive control: `main.ts` reaches it).
No wire, hash, effect or action change → **NO PROTOCOL BUMP** (PROTOCOL_VERSION untouched).

Tests: `musicLoop.test.ts` (14), `sfxVoices.test.ts` (8), `audioSeamlessAndCap.test.ts` (8, REACH
through the real entry points on `audioFakeContext.fixtures.ts`), `audioLoopSites.test.ts` (9, the
MECHANICAL guard — counts every `createBufferSource()` by enclosing function, pins `startMusicLoop`'s
callers, every `loop = true`, the 11 SFX functions and their admit-before-node order, and one
`trackSourceNode` per creation line), `audioSimBoundary.test.ts` (5). Mutation-checked: dropping the
`loopEnd` line and the clave admit turned 4 cases red.

## Step 5 — H2 measured on a REAL fight (opt-in `audioWaveStress.measure.test.ts`)

`SPARK_AUDIO_STRESS=1 npx vitest run src/render/audioWaveStress.measure.test.ts` — the c5 four-seat bots
match on the real host tick, every FIGHT from wave 5 held at 120 creatures, every tick's effects fed to the
real `drainAudioEffects` on the fake bus, plus the four render watchers modelled (turret/Helga FIRE edge,
chewer/Voltkin/drone death; fog ignored = upper bound). Cap OFF and cap ON on two identical worlds.

⚠ **This fixed-seed match ends in a WIN at tick 61 753 (wave 7). It never reaches wave 8**, so waves 5–7
are the stand-in. (First attempt targeted wave 8 and measured nothing — recorded, not hidden.)

| | cap OFF | cap ON |
|---|---:|---|
| ticks measured (wave 5 BUILD → match end) | 25 754 | 25 754 |
| worst single tick, audible SFX requested | **3** | 3 |
| peak source nodes in a 0.45 s window | **6** | 6 |
| peak live voices (ledger) | — | 2 |
| voices dropped | 0 | 0 |
| render-watcher SFX events | 0 | 0 |
| final `hashWorldState` | 3255040322 | 3255040322 (identical: the sim never reads audio) |

Kinds on that board: goblinArcher, goblinHound, goblinMelee, goblinShield, raceUnit — **no defenders, no
Voltkin, no chewer, no drone**, so the render-watcher SFX (laser/slap/splat/zap) are NOT exercised by it.

**Verdict on H2: NOT supported on this board.** A 120-creature bots fight asks for ≤ 3 SFX per tick — four
orders of magnitude from overload. The cap stays as a cheap safeguard (a blueprint stamp, a Voltkin
chain, or a turret wall can still burst; the one-tick synthetic burst above is 1 000 → 20 nodes), but
**H1 (the measured seam gaps) is the fix for T15**. A board with towers/Helga/Voltkins was not measured
here; the DEV `__SPARK__.audio` probe is how the merge owner or the owner's next playtest settles it.

## Log
- step 1 (7178461) — `src/render/musicLoop.ts` (pure loop-region math) + `musicLoop.test.ts` (14 cases) + this table.
- steps 2–4 (8f58406) — loop wiring + voice cap + DEV probe + guards.
- step 5 — real-fight H2 measurement (opt-in test) + verdict (this commit).

## RESUME STATE (usage-limit save, owner order)
- DONE: step 1 7178461 · steps 2–4 8f58406 · step 5 25bbd48. Tree clean.
- Gates already run on 8f58406's tree: `npm run typecheck` 0 · `npx vitest run --maxWorkers=3` 0
  (424 files passed / 3 skipped, 6778 tests) · `npm run build` 0 — bundle **978.3 KiB**, headroom 121.7.
- IN FLIGHT: nothing running.
- EXACT NEXT STEP: measure master 663c4c9's bundle KiB for the ≤ 10 KiB delta (build a clean checkout of
  663c4c9 — do NOT build in the main checkout), re-run the three gates on the tip, write the final report.
