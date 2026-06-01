# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-01 | Session: S64

## Next Steps
1. **(USER eye) Live look — S63 P1 fog + reveal (STILL unverified live):** open a 2-3 tab match on spark-online.space (or `$SESSION_PORT` dev). Confirm the fog is **pure black** (no blue tint) in unexplored AND explored areas + the spark reveal is **~half size**. Tune: too-soft reveal → `VISION_FADE_PX 40→20` (1 line); miss the dim explored tier → raise `MEMORY_FOG_COLOR` off black (1 line).
2. **(USER eye) Lobby VISUAL refactor — NOW FULLY NET-COVERED** by S64: the pure `LobbyStateMachine` (P1) + the full behavioral e2e net (P2: visibility / focus / Enter / destroy). Safe to do the 548-LOC visual UX (per-seat colour swatches / who-is-in roster / room-full / ready) under the complete net.
3. **2 UX landmines (S64 P1, 1-line reducer fixes when wanted):** JOIN_INVALID status renders neutral grey not error-red; a stale error-red bleeds onto the next neutral status (HOST/valid-JOIN after an error) until reset().
4. **CI flake-harden (recurring):** the 4-peer real-WebRTC `nplayer.spec.ts:57` test times out under CI (S63 P3 + S64 P1) — timeout bump / deterministic-transport / non-gating quarantine so CI-red == real-regression.
5. **knip remainder (attended session):** deletes (stopMusic/isInitialized are dead) + save/protocol/serialization exports (dynamic-usage traps — string-literal grep + save.replay FIRST) + 13 unused types + game-design constants (keep + annotate). knip now 28 exports + 13 types.
6. **Pre-existing:** main.ts 942 hypertrophy (needs a characterization pass first, like the lobby net before its refactor); CVD shape-icons; first-run visual-regression baselines. (vite/vitest CVE = RETIRED — npm audit clean.)

## Blockers
None code-side. S64 shipped 3/3 + 1 CHECK-fix, all pushed. tsc clean, full unit 985, full Playwright 24 pass/1 skip, build 509.16 KB <550, knip 33→28. Top next-steps are EYE-DEPENDENT (user live look) or attended-session (knip deletes / CI flake / main.ts).

## Pending Backlog
BACKLOG.md is a historical session log (no forward `- [ ]` items). Forward work = Next Steps above + session-state `carry_forward`.

## Recent Reflexion (last 2 sessions)
**S64** — LobbyStateMachine extract + lobby behavioral net + knip de-export (autonomous, user-AFK):
- P1 — pure reducer (initialLobbyState/lobbyReduce/lobbyView) extracted under the S63 net; same-ref-on-no-op churn guard; adversarial CHECK (Grok break-it lens) caught a statusColor-reset divergence RALPH+Gemini missed → fixed behavior-exact + witness tests.
- P2 — 3+1 e2e closing the S63 net-extension carry-forward; pane-visibility is gameState-driven (main.ts:746 re-asserts setVisible EVERY frame) → test via RETURN_TO_TITLE, not a manual setVisible.
- P3 — de-export 5 module-internal fns; `tsc noUnusedLocals` = the de-export safety oracle; Council deferred the risky save/protocol deletes (dynamic-usage traps).
- SESSION — A.0 retired 3 stale carry-forwards (CVE/countdown/audio-bug); diverse-lens CHECK; Rule 22 CI audit caught + proved-transient the 4-peer nplayer flake.

**S63** — fog→black + N-player 4/5/6 verify + lobby-construction net (autonomous): see `.claude/reflexion_log.md`.

## Gotchas (carried)
- **`e2e/` is NOT in tsconfig** → a wire/colour/constant change passes `tsc` but silently fails Playwright; sweep e2e specs + RUN playwright. (e2e literal-sweep before commit.)
- **CANONICAL reflexion log = `.claude/reflexion_log.md`** (NOT the root `reflexion_log.md`, which is a STALE ORPHAN frozen at S54 — pre-existing, low-pri cleanup).
- `session-state.json` = atomic Node read-modify-write, never Edit; PS 5.1 mangles `"`/em-dash → use the Bash tool + ASCII.
- `pre-handoff-review.py` reads the GLOBAL/OS session-state (advisory S157 card until 2026-07-15), NOT project-local — don't `--approve`/`--clear` it from a project session.
- **4-peer real-WebRTC `nplayer.spec.ts:57` is a recurring CI timeout flake** (90s); prove transient via cross-commit same-code E2E success, not a regression.
- The Pixi/DOM shell is e2e-tested (jsdom can't WebGL); pane-alpha derivation is unit-covered, its 2-line application is trivial/visual.
