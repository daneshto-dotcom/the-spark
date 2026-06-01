# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-01 | Session: S66

## Next Steps
1. **(YOU) Live look — S63 fog+reveal (still unverified live):** 2-3 tab match on spark-online.space (or `$SESSION_PORT` dev). Confirm fog is pure black + reveal ~half size. Too-soft reveal -> `VISION_FADE_PX 40->20` (1 line).
2. **(YOU) Lobby VISUAL refactor — fully net-covered** (S64 reducer + S65 colour/guard + e2e). Needs your DESIGN DIRECTION, then build the 548-LOC seat-UX (per-seat swatches / who-is-in roster / room-full / ready).
3. **knip remainder (attended):** deletes (stopMusic/isInitialized) + save/protocol exports (string-literal grep + save.replay FIRST) + 13 unused types + game-design consts. knip 28 exports + 13 types.
4. **CVD shape-icons + first-run visual-regression baselines.**
5. **Pre-existing:** main.ts 942 hypertrophy (characterization pass FIRST); netcode infra (host-migration / reconnect / host-presence — need real multi-peer play).
6. **(minor, optional)** SHA/exact-pin the GitHub Actions (Grok S66 hardening suggestion — project-wide policy, needs dependabot or manual bumps); re-header orphaned S59 reflexion entries; CI webServer :5173 race (quarantine lane only).

## Blockers
None code-side. S66 shipped 1/1 (CI Actions node20->node24 bump, `b643c42`) — all green in real CI (e2e PR + deploy + e2e-master) + live site verified HTTP 200. The S65-logged Node20-deprecation item is now CLOSED ahead of the ~2026-06-16 forced migration. Top next-steps are EYE-DEPENDENT (fog look, lobby design direction) or attended (knip).

## Pending Backlog
BACKLOG.md is a historical session log (no forward `- [ ]` items). Forward work = Next Steps above + session-state `carry_forward`.

## Recent Reflexion (last 2 sessions)
**S66** — CI GitHub Actions node20->node24 major bump (user-directed, Micro):
- P1 — bumped all 5 actions to node24-native majors (checkout v6, setup-node v6, upload-artifact v7, upload-pages-artifact v5, deploy-pages v5) across deploy.yml + e2e.yml. A.0 via `gh release list` beat the stale handoff (it under-counted 3 actions + missed the pages coupled pair). GROK-ANALYST FIX-THEN-SHIP: caught upload-pages-artifact v4+ hidden-file-exclusion -> added include-hidden-files:true (behavior-preserving). Staged verify: PR (e2e, zero prod) -> merge (deploy + curl live site 200, fresh, exact asset hash).
- SESSION — Grok earned its keep a 4th session; PRIME-AUDIT rejected Grok's wrong "Pages-runs-Jekyll" claim + deferred its out-of-scope SHA-pin suggestion (Rule16); reconciled the cosmetic [DELIBERATION GATE] 'ptrue' advisory (non-numeric-id hook quirk, non-blocking). e2e+deploy+e2e-master ALL SUCCESS, build 509.37KB. checkpoint b643c42.

**S65** — lobby colour landmines + JOIN mode-guard + CI flake-harden quarantine: see `.claude/reflexion_log.md`.

## Gotchas (carried)
- **`e2e/` NOT in tsconfig** -> a wire/colour/constant change passes `tsc` but can silently fail Playwright; sweep e2e specs + RUN playwright.
- **CANONICAL reflexion = `.claude/reflexion_log.md`** (root one stale @ S54). S59 entries orphaned headerless at the bottom (pre-existing; re-header in a future pass).
- `session-state.json` = atomic Node read-modify-write, never Edit; PS 5.1 mangles `"`/em-dash -> use Bash + ASCII. NOTE: `package.json` is `type:module`, so Node helper scripts must be `.cjs` (not `.js`).
- **4-peer `nplayer` e2e is `@quarantine-flaky`** (non-gating CI lane) -> gating-CI-red == real regression. Don't remove the tag without flake-hardening.
- **CI Actions now floating-major @v6/@v7/@v5** (node24-native). The cosmetic [DELIBERATION GATE] 'ptrue' advisory fires on `P1`-style (non-numeric) priority ids — NON-BLOCKING (the real write-gate keys on `deliberation_completed`+`unlock_source`). Silence via `.claude/pdr-deliberation-ptrue.json` if noisy.
- `pre-handoff-review.py` = GLOBAL S157 OS card (advisory until 2026-07-15) — don't `--approve`/`--clear` from a project session.
