# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-05 | Session: S67

## Next Steps
1. **(ATTENDED) P2 deferred by Council** — extract the duplicated pure `strategySummary` builder from `main.ts` (~810-819 ≡ ~839-848, joiner + host lobby-diagnostic blocks) into `src/net/strategySummary.ts` `formatStrategySummary(strategies)` + unit test, replace both call sites. DEV/lobby diagnostic string only (non-gameplay, non-wire). Trivial + safe but edits the 948-LOC live entry point → do it ATTENDED so you can boot-smoke after (preview_start).
2. **(DECISION) Product finding** — the game SAVES a snapshot (`saveToLocalStorage` wired at main.ts POSTGAME) but never RESTORES it (`loadFromLocalStorage` was dead, removed in S67). Decide deliberately: wire a load-on-boot/continue path, OR drop `saveToLocalStorage` too.
3. **(EYES) fog fuzzy-edge + memory-shade** live look — 2-3 tab match; too-soft reveal → `VISION_FADE_PX 40->20` (1 line).
4. **(DESIGN DIRECTION) lobby VISUAL refactor** — net layer done (S64 reducer + S65 colour/guard + e2e); needs your design direction, then build the 548-LOC seat-UX (per-seat swatches / who-is-in roster / room-full / ready).
5. **(EYES/design) CVD shape-icons + first-run visual-regression baselines.**
6. **(LIVE-PLAY) netcode infra (S62)** — host-presence / host-migration / reconnect-to-seat / 6p snapshot delta + 3+-player client host-loss detection (main.ts connectionLost gap). Needs real multi-peer play to verify.
7. **(PRE-EXISTING) main.ts 948 hypertrophy** — the PURE logic is already extracted (S50); the remainder is the Pixi/DOM ticker shell, whose extraction needs live-play to verify. Not autonomous-safe.
8. **(OPTIONAL)** SHA/exact-pin GitHub Actions (project-wide supply-chain policy, needs dependabot); re-header orphaned S59 reflexion entries; CI webServer :5173 race (non-gating quarantine lane only).

## Blockers
None code-side. **S67 shipped P1 (knip dead-code cleanup, `7ba5758`) — knip 41→0, tsc PASS, vitest 992/992, vite build 509.35KB; prod deploy SUCCESS + live-site exact-hash smoke + gating e2e SUCCESS.** The S65/S66 "KNIP REMAINDER (attended)" item is CLOSED. Every top next-step is EYE-dependent, DESIGN-direction-dependent, LIVE-PLAY-dependent, or ATTENDED (P2) — none autonomous-safe.

## Pending Backlog
BACKLOG.md is a historical session log (no forward `- [ ]` items). Forward work = Next Steps above + session-state `carry_forward`.

## Recent Reflexion (last 2 sessions)
**S67** — knip dead-code cleanup to zero (autonomous, Standard, P1-only after Council defer):
- P1 — knip 41→0 (28 exports + 13 types) across 21 files (+43/-131). Pedantic A.0 prevented ~13 mistakes: `src_hits==1` ≠ delete-safe (10 symbols were used-in-file → UNEXPORT not DELETE; reading defs flipped 3 more — rngInt/COMMIT/ERASE_DURATION_TICKS); `v2` was a Vec2 ctor not a save-brand; `PhysicsBody` a knip false-positive (inline `import()`-type in territory.test.ts → converted to top-level `import type`). Per-batch tsc tripwire caught 2 cascades + 1 of my own misclassifications (over-eager ZERO_ACCEL unexport). noEmit ⇒ unexporting union arms is safe (vite build confirmed). Bundle flat (Rollup already tree-shakes) — win is source clarity + knip=0 baseline, not bytes. checkpoint `7ba5758`.
- SESSION — full autonomous PDCA pipeline. Council CONVERGENT ADOPT-WITH-CHANGES x2: DEFER P2 (unattended entry-point edit, bad risk/reward) + ADD vite build gate. Honored the defer (discipline over busywork). Triumvirate CHECK unanimous SHIP. Rule22 audit clean.

**S66** — CI GitHub Actions node20→node24 major bump (Micro): all 5 actions to node24 majors across deploy.yml + e2e.yml + include-hidden-files fix; runtime-verified. See `.claude/reflexion_log.md`.

## Gotchas (carried)
- **`e2e/` NOT in tsconfig** → a wire/colour/constant change passes `tsc` but can silently fail Playwright; sweep e2e specs + RUN playwright. (knip also can't see e2e imports — but S67 confirmed zero e2e refs to any cleaned symbol.)
- **knip false-positives on inline `import('...').Type` casts** — knip can't see types referenced only via inline import-type in a test; if knip flags a type you KNOW a test uses, convert the test to a top-level `import type` (makes it knip-visible) rather than unexporting.
- **`src_hits==1` from a repo-wide grep ≠ safe to DELETE** — it may be used WITHIN its own file (→ remove `export` keyword only). Always check intra-file occurrence count + read the def before deleting.
- **CANONICAL reflexion = `.claude/reflexion_log.md`** (48 entries). S59 entries orphaned headerless at bottom (pre-existing; re-header in a future pass).
- `session-state.json` = atomic Node read-modify-write, never Edit; PS 5.1 mangles `"`/em-dash → use Bash + ASCII. `package.json` is `type:module` → Node helper scripts must be `.cjs`.
- **Bash tool routes to git-bash** (not PowerShell) despite the env banner — use POSIX syntax.
- `tsc -b --noEmit` exit code is masked if piped to `tail` — use `npx tsc -b --noEmit && echo PASS || echo FAIL`.
- `pre-handoff-review.py` = GLOBAL S157 OS card (advisory until 2026-07-15) — don't `--approve`/`--clear` from a project session.
