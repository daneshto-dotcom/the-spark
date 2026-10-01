# S192 — endgame worktree progress (`s192/endgame`)

| step | status | commit |
|---|---|---|
| 1 · spec (md + html, desktop copy) | done | (this commit) |
| 2 · assets (matte, slice, pack, sfx) | done | 55ecfb4 |
| 3 · build (rules, monster, spawner, lock, HUD, tests) | done | (this commit) |

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

## Step 3 — build (done)
- New: `src/state/endgame.ts` (lock policy + predicates + derived retarget), `src/state/endgameMonsters.ts` (spawner,
  targeting arm, end-of-fight sweep), `src/state/endgame.test.ts` (31 tests).
- `'endgameMonster'` CreatureType + `ENDGAME_MONSTER_CONFIG` (pool 100 / strike 40); `Creature.monsterSeat` (four sites:
  `CreatureHashed` + `:ms` + contribution test + save round-trip); `World.monsterWaveSpawned` (FIELD_COVERAGE, `mw`,
  save omitted-at-0, START_GAME reset, every phase edge reset).
- hostTick: spawner before the fan-out; monster arm ahead of the structure-attacker arm; FIGHT→BUILD sweep.
- Lock: third `dispatch` gate (`ENDGAME_LOCK_INTENT_POLICY`, set-equal to CLIENT_INTENT_TYPES) + `canBuildNow`.
- Draft capped at 26 (`isDraftWave`); wave-32 adjudication in `tickGameState` (⚠ MINE).
- Render: ATLASES / GOBLIN_KINDS / neutral tint / 1.25× scale (⚠ MINE) / sheet warmed from wave 26 / pants SFX on
  emergence + swing (throttled 220 ms) / HUD cue in the phase banner. Canon §3f + `canon.test.ts` pins.
- Re-pinned (by design): `voltkin-config.test.ts` type list, `stateHashFull.test.ts` HASHED_NON_FAMILY.
- Mutation tests (each restored): lock gate off → 2 red; latch exemption removed → 7 red; monster arm removed → retarget red.
- Gates: typecheck 0 · vitest 0 (6870 passed / 7 skipped, 425 files) · build 0 — 983.7 KiB (+6.0 vs 977.7) · check:atlas 0.
- Bump verdict: **BUMP 53 → 54** (new serialized CreatureType + rules every peer runs). PROTOCOL_VERSION not edited.
- Merge hazards: `draft.ts` (magic branch, MRES card), `hostTick.ts`, `world.ts` dispatch gates (teams branch),
  `stateHashFull.ts`, `save.ts`, `creatureLifecycle.ts` latch list, `voltkin-config.test.ts` sorted list.
