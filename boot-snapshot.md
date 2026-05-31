# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-31 | Session: S63

## Next Steps
1. **(USER eye) Live look — P1 fog + reveal:** refresh a 2–3 tab match on spark-online.space (or `$SESSION_PORT` dev). Confirm the fog is now **pure black** (no blue tint) in both unexplored AND explored areas, and the spark reveal is **~half the size**. Tune if needed: smaller reveal too soft → `VISION_FADE_PX 40→20` (1 line); miss the dim "explored" tier → raise `MEMORY_FOG_COLOR` off black (1 line). *(P1 shipped from the pre-AFK look but not yet eyeballed live.)*
2. **(USER eye) Lobby VISUAL refactor — now UNBLOCKED** by the S63 P3 e2e net: full N-seat UX (per-seat colour swatches / who's-in roster / room-full / ready). Autonomous-safe alternative to start: extract the **pure LobbyStateMachine** (~80 LOC mode/Begin-gating logic, unit-testable) under the net — distinct from the visual work.
3. **CVD shape-icon identity** (green/orange collide under deuteranopia — shape disambiguation) + **first-run visual-regression baselines** (`toHaveScreenshot`, user-approve once).
4. **Net-extension (refactor session):** lobby pane-visibility-switching + joining/error/countdown modes + input focus/paste lifecycle + reset-detaches-listeners coverage.
5. **Netcode infra (S62 logged):** connection-lost client-side host-presence detection · host-migration · reconnect-to-same-seat · 6p snapshot delta bandwidth · real-latency race/reconnect hardening.
6. **Pre-existing:** main.ts 942 hypertrophy · vite/vitest CVE bump · knip 42 unused-exports.

## Blockers
None code-side. S63 shipped 3/3 + runtime-verified (tsc clean, 956 unit, build 508.28 KB < 550, full e2e 20 pass/1 skip incl new 4-peer FFA + 6-player render + 2 lobby-construction). The top next-steps are EYE-DEPENDENT — they need the user's live look (deferred this autonomous session per scope-discipline).

## Pending Backlog
BACKLOG.md is a historical session log (no forward `- [ ]` items). Forward work = Next Steps above + the handoff CARRY-FORWARD / session-state `carry_forward`.

## Recent Reflexion (last 2 sessions)
**S63** — fog→black + N-player 4/5/6 verify + lobby net (autonomous):
- P1 #fog-feel-tuning-live-user-eye #e2e-literal-sync-on-render-constant — fog blue→pure-black + R_PERSONAL halved; the standing "e2e-not-in-tsconfig" gotcha bit (fog.spec hardcodes the colour literal) → synced + RUN playwright; the spec's pixel-extract self-proves the new (0,0,0).
- P2 #nplayer-verify-two-layer #extract-pixels-render-arbiter #adversarial-check-extracts-real-flaw — verified FFA to 6 = deterministic unit (applyStartGame N=4/5/6 + palette guard) + runtime e2e (4-peer real-WebRTC + N=6 deterministic render). Adversarial CHECK caught the N=6 render as a FALSE PASS (no-pageerror ≠ renderer drew) → FIXED with an `extract.pixels` colour-presence arbiter (the CI-grade Pixi render proof; a human screenshot is not CI).
- P3 #lobby-construction-net #behavior-net-over-internals #cover-before-refactor — built the Playwright net the S61 Council required BEFORE the 548-LOC lobby refactor; a BEHAVIOR net (public-accessor assertions) is the correct refactor guard; uncovered modes logged for the refactor session.
- SESSION #method — autonomy-pivot (defer eye-dependent, execute verification-safe; absent-user Council as the adversarial eye); pixel-arbiter-not-screenshot; council-cadence (lighter lane for test-only batches). Grok ANALYZE 8.7/10.

**S62** — 2→N-player FFA (1v1v1 shipped + verified): seat identity (ordered roster + selfId + anti-spoof), un-hardcoded ~22 '1v1' gates, radial spawns, yellow/green/orange/magenta palette, N-player leaderboard HUD. See reflexion_log.md.

## Gotchas (carried)
- **`e2e/` is NOT in tsconfig** → a wire/colour/constant change passes `tsc` but silently fails Playwright; sweep `e2e/*.spec` for hardcoded literals of what you changed + RUN playwright. (Bit again in S63 P1.)
- **For un-unit-testable Pixi render, the CI-grade arbiter = `app.renderer.extract.pixels()` colour-presence assertion**, NOT a human-only screenshot (S63 adversarial CHECK caught a screenshot-only proof as a false pass). e2e colour literals (e2e can't import src) need a src-pinning unit canary.
- `session-state.json` = atomic Node read-modify-write, never Edit. PS 5.1 mangles embedded `"`/em-dash; use the Bash tool + ASCII for git/Node.
- `pre-handoff-review.py` reads the GLOBAL/OS session-state (was a stale S157), not project-local — don't `--approve`/`--clear` it from a project session.
- Real-WebRTC e2e: 4-peer is stable (3/3 local + retries:2 CI); 6-peer real was DROPPED for flake — N=6 is covered deterministically (unit + single-page render).
