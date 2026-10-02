# S194 — T16 THE RAGE WINDOW (branch s194/rage) — PROGRESS

## FINAL REPORT
(pending)

## Plan
- Owner R194-31: rage (Warlord + BLOOD FRENZY units) lasts exactly WARLORD_RAGE_TICKS from rageStartTick in ANY phase.
- Root cause: `runWarlordRage` and `runBloodFrenzy` both run only inside hostTick's FIGHT gate, so the bit
  `enraged` is never lowered in BUILD.
- Fix shape: `runWarlordRage` fires only in FIGHT (mayFire), but runs every PLAYING tick; `runBloodFrenzy`
  runs every PLAYING tick too (non-FIGHT branch in hostTick). Renderer already reads `enraged` only.

## Log
- step 0: worktree from master b968d940; merge master = already up to date; npm install exit 0.
- NEXT: implement in bossSkillsWarlord.ts + hostTick.ts.
