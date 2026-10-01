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

## Log
- step 1 — `src/render/musicLoop.ts` (pure loop-region math) + `musicLoop.test.ts` (14 cases) + this table.
