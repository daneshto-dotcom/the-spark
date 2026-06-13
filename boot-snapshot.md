# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-13 | Session: S87

## Next Steps
1. ⭐ **PLAYTEST the new modes** on https://spark-online.space/ (S87 shipped + LIVE):
   (a) **VS Bots** across NOOB/MID/HARD/IMBA — do bots read as *playing* (cruise, collect, haul, build bonded structures, sever, flee the hunter), and is the difficulty curve right? All tuning knobs in `src/bots/botConfig.ts`. (b) **Quick Match** with a friend on two machines — does discovery pair you, does the all-ready gate start when both click READY, does smallest-code convergence avoid split lobbies? (c) Confirm the **Multiplayer** rename + the friends Host/Join lobby still work.
2. **Resume Tier-1 `G1a + G3a`** (the roadmap's recommended next build session, un-changed by S87): wire `isMagical` into scoring (magic bond out-earns functional, +0.75 vs +0.25) + in-match "NEW COMBO!" discovery toast + per-match discovered counter. Small, instantly felt.
3. **Tier-1 `G1b/G2` design round** (Council): 3–5 combo BEHAVIORS (ECONOMY/DEFENSE/MOTION) + placeholder family traits + promote Dot→Square and Line→Circle. All behaviors = pure fns of synced state.
4. Tier-3 only after Tier-1 or explicit ask: host-migration D1 · S73 colour-shift · scoreboard knob.

## Blockers
None. S87 is LIVE (CI E2E + Deploy both GREEN on 4c371c3). Advisory: the global review-tracker card shows a stale "S162" session id (env artifact, cosmetic — this project's MCV passed exit 0; approval bound to the real state hash).

## Pending Backlog
- [ ] Playtest the S87 modes (VS Bots difficulty feel + Quick Match 2-peer flow) — see Next Steps 1
- [ ] TIER 1 (USER-MANDATED): G1a isMagical scoring premium · G1b behavior archetypes · G2 placeholder families + promotions · G3 discovery loop · G4 build-feel juice
- [ ] Playtest round 7 leftovers (S86 fixes + rounds-5/6: yell, flyover, bond patterns, rings, lobby anims, length 210, seat-stable leaderboard)
- [ ] Non-builder-win root mechanism (UNREPRODUCED; S84 scoreboard + WIN console dump live; S87 confirmed bots attribute to own seats / human seat stays 0)
- [ ] TIER 3 (CLAUDE-suggested): host-migration D1–D4 · S73 colour-shift · periodic-scoreboard knob
- [ ] PARKED (needs user sign-off): 10Hz client-mirror pose-stepping smoothing

## Knobs (S87)
- Bot difficulty tuning: `src/bots/botConfig.ts` (cursorSpeed, thinkEveryTicks, buildCooldownTicks, aimJitterPx, feature flags) — the playtest dial.
- Quick Match: discovery room `spark-qm-v8`; jittered promote window + smallest-code convergence in `src/net/quickmatch.ts`; ready gate in `src/net/quickmatchGate.ts`.
- 7th seat (bots-mode only): `PLAYER_COLORS[6]` silver 0xc0c8d0; `MAX_BOTS=6`; networked stays `MAX_PLAYERS=6`.

## Recent Reflexion (last 2 sessions)
**S87** — VS-BOTS + Multiplayer rename + Quick Match, 5/5, 4 commits, CI-GREEN E2E+Deploy, live-preview verified. P1/P2 #bots-are-remote-players: implementing bots as ordinary seated players that may only dispatch CLIENT_INTENT-shaped actions made every S84–S86 exploit gate (bench/poop/reach/territory) bind them on day one — the S86 dispatch choke point's first structural dividend; the one crash class was the opposite direction (reducers that THROW on caller bugs like fsmPickup CarryViolation are lethal to an autonomous actor → controller needs claim-outcome confirmation + self-heal). P3 #reuse-the-human-path-helpers (bot redundancy weaving = componentOf + pickRedundantBondTargets verbatim). P4 #split-the-eager-from-the-lazy (a 4 KiB eager breach recovered by lazy-loading CodexOverlay — eager only via a TINY shared symbol unlockGodly, split to codexStore.ts). P5 #a-version-bump-ripples-into-every-hardcoded-literal (7→8 + 7th color broke 5 unit + e2e tests, all caught by RUNNING the suites; the S63 palette canary fired as designed) · #verify-attribution-in-vivo + clean-room-retest-rules-out-harness-pointer-artifacts.
**S86** — round-6 REGRESSION batch + ROADMAP rewrite, 5/5, CI-green. P1 user-tuned values get a TEST-ENFORCED lock at tuning time. P2 unit-test the DRAWING not just the math (Graphics path connects pen from world origin). P3 enforce at the dispatch choke point, not per-verb; the gesture is a verb too. P4 Pixi owns canvas.style.cursor (durable switch = cursorStyles.default); never pipe a gate. P5 ground roadmaps in code audits + label idea origins USER vs CLAUDE.
