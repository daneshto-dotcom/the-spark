# S194 — T16 THE RAGE WINDOW (branch s194/rage) — PROGRESS

## FINAL REPORT — T16 THE RAGE WINDOW (s194/rage), owner R194-31
- Branch: `s194/rage`. The tip is the commit that adds this report, on top of 735a7051. `git merge master` (b968d940) was already up to date: no conflicts.
- Root cause: `runWarlordRage` and `runBloodFrenzy` are the only writers of `enraged`. Both ran only inside hostTick's FIGHT gate, so nothing lowered the bit after the whistle and everyone stayed red through all of BUILD.
- Fix:
  - `bossSkillsWarlord.ts`: `mayFire = matchPhase === 'FIGHT'` gates only the FIRE branch.
  - `hostTick.ts`: a new `else if (gameState === 'PLAYING')` branch on the FIGHT gate runs `runWarlordRage` and then `runBloodFrenzy`.
  - `ragedFireTick`/`attackCycleRaged` are untouched. The renderer reads only `enraged`, so the visuals follow it.
- Tests:
  - `warlordRageClock.test.ts`: the S191 RAGE-1 block is replaced by an S194 block of 4 tests.
    - REACH: rage at 50 s, whistle at 60 s, calm at 75 s, exactly 1500 raged ticks with 900 of them in BUILD.
    - Negative: a rage inside FIGHT lasts the full window.
    - Negative: no firing in BUILD.
    - The per-FIGHT pattern, derived from the constants.
  - `bloodFrenzy.test.ts` gets 2 more tests: a BUILD REACH test and a source-text guard.
  - 3 mutations (no else branch / no mayFire / no frenzy call outside FIGHT): all three killed.
  - canon.test §3e is re-pinned: the old sentences are pinned ABSENT and the new ones use literals derived from the constants.
- Gates: typecheck 0. vitest 0, with 545 files passed and 4 skipped, and 8366 tests passed and 11 skipped. build 0. Entry is 1150.1 KiB against master's 1150.0 KiB measured in the same tree (+79 B), leaving 99.9 KiB of headroom. e2e was not run.
- BUMP: YES. This changes a shared rule over the serialized, hashed `enraged`: v64 keeps it through BUILD and this build lowers it at 25 s. PROTOCOL_VERSION is not edited.
- MINE:
  - (1) The cooldown also runs through BUILD: built yes, I recommend keeping it. It makes no gameplay difference at today's 60/90/25/25.
  - (2) An orc appearing in BUILD while a window is still open joins the frenzy for the remainder: built yes, I recommend keeping it.
- Seams: the end of hostTick's FIGHT block plus the import; bossSkillsWarlord's fire condition; the constants ~3280 docblock; canon §3e PATTERN; canon.test §3e; warlordRageClock.test lines 250+; the bloodFrenzy.test tail.
- NOT DONE: e2e; the protocol.ts bump docblock (left to the merge owner).

## Plan
- Owner R194-31: rage (Warlord + BLOOD FRENZY units) lasts exactly WARLORD_RAGE_TICKS from rageStartTick in ANY phase.
- Root cause: `runWarlordRage` and `runBloodFrenzy` both run only inside hostTick's FIGHT gate, so the bit
  `enraged` is never lowered in BUILD.
- Fix shape: `runWarlordRage` fires only in FIGHT (mayFire), but runs every PLAYING tick; `runBloodFrenzy`
  runs every PLAYING tick too (non-FIGHT branch in hostTick). Renderer already reads `enraged` only.

## Log
- step 0: worktree from master b968d940; merge master = already up to date; npm install exit 0.
- NEXT: implement in bossSkillsWarlord.ts + hostTick.ts.
- step 1: fix landed in bossSkillsWarlord.ts (mayFire) + hostTick.ts non-FIGHT branch; the two S191 RAGE-1 tests go red as expected. NEXT: rewrite them + new REACH/negative/guard tests.
- step 3: docblocks (constants WARLORD_RAGE_COOLDOWN_TICKS, bloodFrenzy.ts) updated. NEXT: gates.
- step 4: gates green (typecheck 0 / vitest 0 / build 0). DONE — report at top.
