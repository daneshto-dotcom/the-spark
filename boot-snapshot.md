# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-01 | Session: S65

## Next Steps
1. **(YOU) Live look — S63 fog+reveal (still unverified live):** 2-3 tab match on spark-online.space (or `$SESSION_PORT` dev). Confirm fog is pure black + reveal ~half size. Too-soft reveal → `VISION_FADE_PX 40→20` (1 line).
2. **(YOU) Lobby VISUAL refactor — NOW fully net-covered** (P1 reducer + P2 e2e + S65 colour/guard fixes). Build the 548-LOC seat-UX (per-seat swatches / who-is-in roster / room-full / ready) under the complete net.
3. **knip remainder (attended):** deletes (stopMusic/isInitialized dead) + save/protocol exports (string-literal grep + save.replay FIRST) + 13 unused types + game-design consts. knip 28 exports + 13 types.
4. **CI Actions Node20 deprecation:** bump actions/checkout@v4 + setup-node@v4 + upload-artifact@v4 to current majors (forced to Node24 ~2026-06-16) in deploy.yml + e2e.yml.
5. **Pre-existing:** main.ts 942 hypertrophy (characterization pass FIRST); CVD shape-icons; first-run visual-regression baselines.
6. **(minor)** CI webServer :5173 race — only the non-gating quarantine lane (gating runs first/fresh); distinct port if it manifests. Also re-header the orphaned S59 entries at the bottom of `.claude/reflexion_log.md`.

## Blockers
None code-side. S65 shipped 3/3, all pushed + GREEN in real CI (the new gating/quarantine split proved itself — 4-peer flaked in the non-gating lane, JOB stayed green). Top next-steps are EYE-DEPENDENT (live look, visual refactor) or attended (knip / Actions bump).

## Pending Backlog
BACKLOG.md is a historical session log (no forward `- [ ]` items). Forward work = Next Steps above + session-state `carry_forward`.

## Recent Reflexion (last 2 sessions)
**S65** — lobby colour landmines + JOIN mode-guard + CI flake-harden quarantine (user-directed batch):
- P1 — fixed the 2 S64 colour landmines (invalid→red; HOST/valid-JOIN reset ALL session state). Grok CHECK caught beginVisible/hostConnected left stale-true → fixed + witness.
- P2 — mode-guarded JOIN_ATTEMPT (reducer no-op + shell early-return) closing the P1 residual (dimmed joinButton was click-reachable while hosting). Grok CHECK clean.
- P3 — quarantined the flaky 4-peer e2e to a non-gating CI lane (`@quarantine-flaky`). Grok caught report-collision + fail-unsafe grep → fixed (separate `--output` + `--reporter=list` + explicit tag). PROVEN in real CI.
- SESSION — Grok adversarial CHECK earned its keep ×2; boot-then-smoke the CI change (ran exact commands + watched the real run); fail-safe defaults. tsc clean · 992 unit · Playwright 24/1 · build 509.37 KB.

**S64** — LobbyStateMachine extract + lobby behavioral net + knip de-export (autonomous): see `.claude/reflexion_log.md`.

## Gotchas (carried)
- **`e2e/` NOT in tsconfig** → a wire/colour/constant change passes `tsc` but can silently fail Playwright; sweep e2e specs + RUN playwright.
- **CANONICAL reflexion = `.claude/reflexion_log.md`** (root one stale @ S54). NOTE: S59 entries are orphaned headerless at the bottom (pre-existing; re-header in a future pass).
- `session-state.json` = atomic Node read-modify-write, never Edit; PS 5.1 mangles `"`/em-dash → use Bash + ASCII.
- **4-peer `nplayer` e2e is now `@quarantine-flaky`** (non-gating CI lane) → gating-CI-red == real regression. Don't remove the tag without flake-hardening.
- `pre-handoff-review.py` = GLOBAL S157 OS card (advisory until 2026-07-15) — don't `--approve`/`--clear` from a project session.
