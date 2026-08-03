# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-02 | Session: S129 (V6-0.2 learnability I, 1/1 shipped)

## ⛔ TWO OWNER ACTIONS GATE EVERYTHING
**1. NOTHING IS PUSHED — 13 commits local.** `gh auth status` → *"The token in default is invalid."*
`git push` **hangs** on Git Credential Manager (timeout, not an error). Owner must run
`gh auth login -h github.com`, then `git push origin master && git push origin v0.5.2-pre-pivot`.
⚠ That push **fires a production deploy** (src/ touched). It also blocks the Pages `build_type` flip
and any CI dispatch, so **the e2e lane has not run since S127** — unit suite + build stand in.

**2. THE PROBE PLAYTEST GATES ALL OF PHASE 1.** `npm run dev -- --port <SESSION_PORT>` →
`/?probe=1&regime=new&slots=8`. Keys `[` regime · `]` slots 4/8/12/∞ · `1`-`6` stock · `Q` draw ·
`\` reset · `&spawn=N`. **Do not open V6-1.3/V6-1.4 before B3/B4 are ruled.** Falsification (still
carving at 8 slots) is STRONG; confirmation is WEAK and authorises a second probe, not a redesign.

## STATE
tsc 0 · vitest **1932/1932** (127 files) · bundle **642.3/750 KiB** entry (+117.3 KiB simWorker =
759.6 KiB real download) · PROTOCOL_VERSION 15 · HEAD `b9c4f61` · master · gitleaks clean ·
MODEL DRIFT **resolved** (was a stale allowlist rejecting an upgrade, not an override).
Live site unchanged — no deploy has fired since S127.

## Next Steps
1. **OWNER:** `gh auth login` + push (unblocks everything, incl. the Pages `build_type=workflow` flip
   → verify live asset hash → *then* optionally delete `origin/gh-pages`, IN THAT ORDER).
2. **OWNER:** playtest the probe → rules B3 (faucet rate) + B4 (directive semantics, bank cap).
3. **V6-0.3 Learnability II — A.0 SCOPING IS ALREADY DONE**, banked in the BACKLOG row. Do not
   re-derive: `BOND_SEVERED` already rides the wire (1 of only 3 net-relevant kinds) *and* already
   carries a `cause` discriminator; **no effect carries an actor identity** — that is the entire gap.
   One emit site (`severBond.ts:82`), the sever path already has `action.playerId`
   (`disruptionManager.ts:92`), and `render/comboToastRenderer.ts` (S88) is the reusable surface.
   **Open question that decides the tier:** does additive-optional avoid a `PROTOCOL_VERSION` bump?
   If not → Full, and it inherits the R15 17-site checklist. **Do NOT widen the effects wire filter**
   (Council CONVERGENT BLOCKER: unfiltered effects balloon the snapshot <1 KB → >3 KB).
4. **OWNER:** B6 reversibility ruling — (A) branch off `v0.5.2-pre-pivot`, or (B) additive-only
   keeping `CarryingPlayer` live. Hard precondition on V6-1.1.
5. **OWNER:** `worker`→`gatherer` rename. Not applied — it's your word, and no code entity exists
   yet. Constraint: the code identifier **cannot** be `Worker` (the Web Worker owns the World).

## Blockers
- Push + playtest (above). No technical blockers in the code.
- **V6-2.1 cannot ship as written (R6):** 3 of 5 targeting priorities have no damageable target —
  `DEFENDER_HP` is a 1e9 sentinel, `CreatureSpawner` has no hp field, the only damage fn is
  `damageCreature`. Insert a structure-HP slot before it, or move it after V6-2.4. **Owner decision.**
- **V6-1.5 is mis-tiered Standard→Full (R7):** deleting `CarryingPlayer` silently changes shipped
  hazard rules (LMB chain gated on Idle → bomb/rainbow/potato become always-grabbable; poop loses 3
  of 4 surfaces; hunter loses confiscation until V6-2.2).

## Pending Backlog
- **PARKED CI ×4**, each with its blocker: soak window/threshold shape — needs the **Mon 2026-08-03
  07:00 UTC** cron sample, do NOT decide on n=3-4 · worker-isolate ceiling 10MB→~3MB — BLOCKED on
  `readWorkerFloorMB()` being a single read at `worker-heap.spec.ts:182`, outside the stabilization
  loop at `:174-181` · Playwright `deviceScaleFactor` lever · `e2e/**` outside tsconfig coverage.
- **23 risks R1–R23** bound to their V6 slots in the BACKLOG ledger. Earliest-biting: **R1**
  `stateHash.ts:45-48` omits every entity family (desync oracle blind to gatherers in the slot that
  flips worker default-on) · **R5** `WIN_TRIGGER` destroys 7 entity families at t=0 → castle survival
  is a V6-1.2 decision · **R10** the r=188 shrink hard-fails `collision.pile.test.ts` (2.89 px vs 1.5)
  · **R12** the host sends the full payload once per active transport strategy and 10 Hz is a cap
  measured collapsing to 2.2 Hz ⇒ delta encoding is Phase-1-adjacent, not V6-4.2 cleanup.

## CRITICAL TRAPS
- **Backticks in a bash-embedded payload get command-substituted.** Hit 3× now (S128 `python -c`
  doc edits; S129 a `git commit -m` string). Use a script FILE or a quoted heredoc. A success count
  from your own script is NOT verification of content — grep the result.
- **A pipeline's exit status tests the LAST command.** `if grep … | head; then` always passes;
  `cmd | tail; echo $?` reports `tail`. Hit 2× (S128 bundle check, S129 review gate). Emit a NUMBER.
- **A hidden Browser pane pauses `requestAnimationFrame`** → the Pixi ticker never advances, so the
  sim cannot be driven and canvas clicks silently do nothing. DOM/global reads still work. Drop to
  the reducer level when a frame is required.
- **`/handoff` STEP 2.8.A is load-bearing.** S126/S127/S128 reflexion was written to session-state
  but NEVER reached `reflexion_log.md`, because those closes were done by hand. Recovered at S129
  (log now runs 129→119). If you close a session manually, append reflexion manually.
- **When an artifact's job is to MEASURE, audit the measurement path.** "Does it run?" and "can it
  tell the difference?" are different questions.
- **Reviewers are directionally right and mechanically wrong** — 3 sessions running. Grep-verify the
  cited MECHANISM, not just the conclusion; in S129 the stated cause was false and the real one was
  in a different file, so fixing the stated cause would have left the bug live.
- `git push` on master IS a production deploy for `src/ public/ index.html vite.config.ts
  tsconfig.json package*.json deploy.yml` · never trust `gh api .../pages` (stale legacy/gh-pages) —
  trust the deployments API + live asset hash · `npm run deploy` / `scripts/deploy-pages.sh` are
  DELETED, do not recreate · `e2e/**` is NOT type-checked → `npx playwright test <spec> --list` ·
  MCV needs an ABSOLUTE-path `verification[]` binding on a **completed** priority for `BACKLOG.md`.

## Recent Reflexion (S129 + S128)
- **S129 #probe-the-slot-before-believing-the-roadmap-s-estimate-of-it** — V6-0.2 was planned
  Standard; ~80% already shipped, so it dropped to Micro. A slot's SIZE is a claim about external
  state like any other; Rule 21 applies to it. Let scope shrink rather than padding to fit the plan.
- **S129 #verify-the-reviewer-s-MECHANISM-not-just-its-conclusion** — GROK correctly found the tier
  watermark broken but blamed "world.tick resets on a new match" (false). The real path was
  `applySnapshotCore`'s `world.tick = snap.tick`. Fixing the stated cause would have left it broken.
- **S129 #read-why-a-prior-decision-was-made-before-reversing-it** — the obvious fix was moving the
  tier pulse back to a HUD corner; a docblock showed S13 P4 moved it OFF on purpose. Added a
  complementary banner instead. One grep separated building-on from undoing.
- **S129 #an-early-return-in-a-draw-method-can-skip-unconditional-cleanup** — my solo block's early
  `return` would have skipped an unconditional `connectionDot.clear()`, stranding a stale dot.
- **S128 #the-same-blocker-was-nearly-missed-twice-at-two-different-layers** — B4 escaped at design
  AND at implementation; both catches came from adversarial review, not from me.
