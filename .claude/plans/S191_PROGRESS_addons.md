# S191 PROGRESS — `s191/addons` (worktree `s191-addons`)

Brief: `.claude/plans/S191_BRIEFS/addons.md` (main checkout). Rules: S191 PDR §4 + S189 PDR §4.
Merge owner = the main session. This branch never merges, never pushes.

## Status

| step | what | state | commit |
|---|---|---|---|
| 0 | `npm ci` (NPM_CI_EXIT=0) + this skeleton | DONE | 3fb5733 |
| A-1 | Warlord rage 25 s + cooldown | DONE | (this commit) |
| A-2 | Alt toggles the footer while a tower is armed | next | — |
| A-3 | R190-G opaque panels swallow right-clicks | — | — |
| A-4 | A1 CI e2e lane | — | — |
| A-5 | magic-attack DESIGN doc | — | — |

## Decisions / owner answers received mid-task

- **A-1 open gate ANSWERED by the owner (via the merge owner, S191):** when the 25 s rage ends and the
  Warlord is still under half, it is **"COOLDOWN FIRST"**, not an immediate re-trigger. No length given →
  `WARLORD_RAGE_COOLDOWN_TICKS` = 25 × 60, flagged `⚠ MINE` (length only). One field carries both windows.
- **Council items (S191 ledger, accepted), applied to A-1:** the stamp is written ONLY by `runWarlordRage`;
  `isFrenzySource` = "his own 25 s window is open" and nothing else (the bare-bit check was dropped); the
  25-on/25-off consequence is stated at `WARLORD_RAGE_COOLDOWN_TICKS`.
- Council items for A-2 / A-4 recorded for those steps: Alt calls the EXISTING `toggleCollapsed()`; raise
  on disarm/place only if Alt lowered it; ignore `e.repeat`, focused text fields, Ctrl+Alt;
  `preventDefault` on keyup too. `worker-bots` job gets `PW_GLOBAL_TIMEOUT_MIN` < `timeout-minutes` via
  `env:`. The footer fill guard pins NINE opaque fills today.

## A-1 — what landed

- `constants.ts`: `WARLORD_RAGE_SECONDS` 25, `WARLORD_RAGE_TICKS` = 25 × `PHYSICS_HZ` (1500, derived, his),
  `WARLORD_RAGE_COOLDOWN_TICKS` = 25 × `PHYSICS_HZ` (1500, ⚠ MINE length). `WARLORD_RAGE_CLEAR_PCT`
  retired in place (kept exported, unread by the sim).
- `creatures/creature.ts`: `Creature.rageStartTick?` + `isOwnRageActive` / `isRageCoolingDown`.
- `bossSkillsWarlord.ts` `runWarlordRage`: in window → raging; else not cooling and strictly below 50 % →
  stamp + rage; else lower the bit (the frenzy re-sets a frenzied Warlord the same tick).
- `racial/bloodFrenzy.ts` `isFrenzySource(c, tick)`: alive Warlord with his own window open.
- Tests: new `src/state/warlordRageClock.test.ts` (13): window arithmetic; REACH via `runHostTick` —
  healed above half still rages exactly 1500 ticks; still under half → exactly 1500 calm → re-fires with a
  fresh stamp; healed in the cooldown → no re-fire until he drops; dropped inside the cooldown → waits it
  out; BLOOD FRENZY race unit + tier-3 follow his clock every tick of the full cycle, goblin never; a
  Kraken is never stamped; hash contribution; save + netSnapshot round-trip; restore validation; host vs
  `?worker=1` INIT mid-rage byte-identical (wire + narrow + wide) across end → cooldown → re-fire, with a
  NEGATIVE: a stamp-less save diverges exactly at the host's rage end.
- Re-pinned (not relaxed): `bossSkillsLate.test.ts` (R151 heal exit → the clock; S179 trigger kept),
  `bloodFrenzy.test.ts` (source = clock; the "frenzy never calms a Warlord" case re-pinned at
  `runBloodFrenzy` because the clock makes the host-tick version unconstructible).
- Mutations (each red, each restored): M1 `since <= WARLORD_RAGE_TICKS` → 5 red; M2 cooldown check removed →
  5 red; M3 frenzy source back to the health read → 5 red.
- Gates at A-1: typecheck 0; full vitest 0 (6478 passed / 2 skipped / 0 failed, 397 files) before a
  fixture-only follow-up; the clock file re-run 13/13 after it.
- **Protocol verdict: BUMP** (rule change + new field) — see `S191_CANON_NOTES_addons.md` §6.

## Hotspot hunks (save.ts / stateHashFull.ts / worldTypes.ts / main.ts)

- `save.ts` — 3 self-contained lines/blocks: `SerializedCreature.rageStartTick?` (after
  `attackCycleRaged`), the serialize spread (after `attackCycleRaged`), the validated restore spread
  (after `attackCycleRaged`).
- `stateHashFull.ts` — `| 'rageStartTick'` in the creature union (after `'attackCycleRaged'`) and the
  `:rs${o(c.rageStartTick)}` projection element (after `:ak`).

## footerBand.ts / controls.ts hunks (s191/owner edits the same files)

_none yet_

## Numbers that are MINE

- `WARLORD_RAGE_COOLDOWN_TICKS` = 1500 (25 s) — the LENGTH only; "cooldown first" is his.

## What I suspect / questions (not built)

- The rage latch is FIGHT-gated (S168 post-audit), so a Warlord raging at the whistle keeps the red bit
  through BUILD and is re-judged on the first FIGHT tick (both windows long over by then). Pre-existing
  shape (before S191 he stayed red forever); flagging because "25 seconds" is now visible as a length.
