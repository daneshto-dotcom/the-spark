# S192 — endgame worktree progress (`s192/endgame`)

| step | status | commit |
|---|---|---|
| 1 · spec (md + html, desktop copy) | done | (this commit) |
| 2 · assets (matte, slice, pack, sfx) | pending | |
| 3 · build (rules, monster, spawner, lock, HUD, tests) | pending | |

Spec: `.claude/plans/S192_ENDGAME_SPEC.md` · `.claude/plans/S192_ENDGAME_SPEC.html` · `C:\Users\onesh\OneDrive\Desktop\SPARK_Endgame_Spec.html`

## Step 2 — assets (done)
- ⚠ The brief's file labels are SWAPPED: `kp9k…png` (2048²) is the SINGLE POSE, `5noft…png` (1024²) is the WALK SHEET.
- Sheet is 5×4 = **20** frames (not 18). Frame 20 carries the Gemini sparkle ON the cloth → dropped; 19-frame loop.
- Checker keyed (border-connected neutral ≥70, incl. the painted drop shadow), rim alpha + un-blend, α≤24→0 / α≥244→255,
  largest component per frame. Per-frame median-height fit (frame 5 is drawn smaller in the source) — ⚠ MINE.
- `npm run check:atlas` exit 0 (registered `public/art/endgame-monster`); 5/5 clean, 7 px largest near-white pocket (teeth).
- SFX: mp3 → `public/audio/endgame/pants-attack.ogg` (vorbis mono 44.1k, 2.35 s). ffmpeg reported ONE corrupt mp3 frame
  ("Header missing") — benign: ~20 ms of a 2.37 s file, exit 0.
- Gates: build exit 0, 977.7 KiB / 1100 (no code yet). Baseline: typecheck 0, vitest 0 (6837 passed / 7 skipped).
