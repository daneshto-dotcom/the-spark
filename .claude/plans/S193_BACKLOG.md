# S193 BACKLOG — what S192 leaves owed (written at S192 close, 2026-10-01)

⛔ Read first: `SPARK_CANON.md`, `.claude/plans/S192_DISPATCH_LOG.md` (every report, audit, agent id, carry-forward),
`.claude/plans/S192_OWNER_PLAYTEST_LIST.md`, `.claude/plans/S192_OWNER_RULINGS_teams_magic.md`, `.claude/plans/S192_OWNER_ENDGAME_SPEC.md`.
⛔ Pitch Masters (`src/arcade/**`, `public/pitch-masters/**`) is OFF-LIMITS — a separate project sharing the domain.
⛔ Bumps: use `scratchpad/gates/bump.py`-style six-site edits (protocol.ts checklist ~:1238) — never by hand from memory.

## 0 · LIVE: deploy #16 `10ec442`, PROTOCOL **56**, verify-deploy 4/4, bundle 1034.7 / 1100 KiB
#6 perf · #7 addons (53) · #8 carry (54) · #9 tune (55) · #10 nagas song · #11 lobby4 · #12 owner (56) · #13 voltkin · #14 audio · #15 net · #16 visuals.

## A · BRANCHES CARRIED — each has a worktree + progress file. Land ONE at a time: merge master in → independent audit
## (one at a time, trial-merge against CURRENT master) → fix-only round → merge → bump if earned → gates + e2e → fetch → push → verify-deploy.
| branch · worktree | tip | state | next |
|---|---|---|---|
| `s192/zombies` · s192-zombies | 9e995f3 | T12 feed heals visible, T11 repair number, T2 RISEN kill-credit, T3 blast = split pool (312 AWAITING OWNER) — BUMP | merge master, audit; KillCredit vs endstats `{kind:'seat'}` attacker — pick ONE |
| `s192/units-ai` · s192-units-ai | a710689 | T5 Helga BUILD patrol, T13 liveness predicate (14 sites) + fallen-keep march, T6 smart chase — no bump | merge master, audit |
| `s189/weld` · s189-weld | 5e7e415 | round-5 fixes X1/X2/L1 done — BUMP (ownBondIdLimit → ownPrimitiveIds) | light re-audit of X1/X2/L1, SEAM-C7 vs carry's structureBarHealth, merge; THEN round 6 (R191-B FIX-by-gatherer + castle FIX ALL, owner R192-W1) |
| `s192/magic` · s192-magic | 4a0ccce | MRES substrate (29 sites), castle MRES upgrade, RESIST cue — BUMP | merge master (re-tag owner scorch + tune Ra 'magic', carry hub + zombies blast 'physical'), audit; MRES applies per Ra SHARE (owner flag); stale stink comment chore |
| `s192/endgame` · s192-endgame | a767e84 | waves 27–31 pants monsters, build lock from BUILD 27, last draft wave 26 — BUMP | 9 owner Qs (Desktop/SPARK_Endgame_Spec.html); art regen recommended; audit; lands late |
| `s191/endstats` · s191-endstats | d407dbf | stat board v1 — no bump | BLAST-2 seat attacker (carry + owner now on master), audit, LOOK, merge late |
| `s192/teams` · s192-teams | 5c73209 | teams v1 (69 sites, FFA byte-identical) — BUMP | LAST: isScorchImmune → sameTeam; extend ally exemption to planHubBlast / R2-C / CARRY-1 filter / raColumnTargets; 2-peer lobby test |
| (not started) | — | goblin tower auto-build toggles (T4) | own worktree |
| (not started) | — | visuals-2..5 batches (S192_VISUALS_PLAN.md) | own worktrees |
| (not started) | — | MRES draft card at the wave-26 slot + art (R192-D1) | after magic + endgame |

## B · OWNER QUESTIONS OWED (one plain-words batch, each with a recommendation)
- T3 zombie blast pool (312 rec) / own side hit / 380 px · RISEN reading A (3 racial types) · CORPSE EATER eats buildings?
- Endgame 9 Qs (wave 29/31 counts, end at 32, stats…) · magic Q1 (DEF draft pick vs MRES)
- OWN-5 uncapped chewers double the snapshot (+240 → 67 KiB) — a cap? · Voltkin: welded TV stops re-summoning (S48) OK?
- CF-3 Voltkin own-bond fallback carries through its own tower · net B1 / L3 (35 s retry worst case 36 s) · weld SHEETS-6 / minority-rubble / W-FR7
- teams spec Qs (Desktop/SPARK_Teams_Spec.html) · net FIX-2 second clause (ex-host as a new lower seat = mid-match seating, a bump)

## C · CARRY-FORWARDS (LOW, logged)
carry CF-1 (Voltkin mixed-weld carry), CF-2 (census false-pass in dispatchReducer) · net R-2 (hidden tab never samples host absence)
· audio A3 (iOS 'interrupted' context) · visuals V-3 (GPU cost unmeasured) · lobby4 L2 (dynamic-import tripwire hole), cross-NAT TURN unmeasured
· S191 §C list (structureTargets hotspot, delta encoding, worker spawnedAtTick) · temp dir `C:\Users\onesh\AppData\Local\Temp\m663` (owner OK to delete)
· infra alerts (nightly mirror, MinIO) — OWNER handles in another session.
