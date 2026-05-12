# Boot Snapshot (auto-generated at handoff)
Generated: 2026-05-12 (post-Session-16) | Session: 16 of 10+ — Cross-network playtest blockers fixed; live at github.io

## Next Steps
S16 closed: cross-network playtest infrastructure complete. The 2 BLOCKERS
flagged in S15 post-playtest review are gone:
1. ✅ **Lobby JOIN UX FIXED.** Real HTML `<input>` overlay with all the
   native affordances (caret, focus, paste, click-to-focus, mobile-keyboard
   guards, full a11y attrs). Council R1 adopted.
2. ✅ **App publicly accessible.** Deployed at
   **https://daneshto-dotcom.github.io/the-spark/** via GitHub's official
   Pages Actions pipeline (actions/upload-pages-artifact@v3 +
   actions/deploy-pages@v4). HTTP 200, HSTS enforced, ready for cross-
   country friend playtest TODAY.

Plus charter cleanup + BETA badge + LOCKED amendments.

**S17 ready-to-ship priorities** (queued for user-controlled execution):

- **P0 (Micro) — spark-online.space custom-domain swap.** Step 2 of the
  S16 P2 plan, deferred per Amendment #2 because same-session commit
  would break the github.io fallback URL during DNS propagation. User
  flow: (a) Squarespace DNS Custom Records add 4 A records (Host=`@`,
  values=`185.199.108.153` / `.109.153` / `.110.153` / `.111.153`) +
  CNAME (Host=`www`, value=`daneshto-dotcom.github.io.`); (b)
  `dig +short spark-online.space @8.8.8.8` confirms resolution; (c)
  Settings → Pages → Custom domain = `spark-online.space` + Enforce
  HTTPS (Let's Encrypt auto-issues ~15min); (d) push the ~3-line ready-
  to-ship commit (vite.config base='/' + public/CNAME=spark-online.space).
  Optional: Cloudflare DNS migration (nameserver swap to CF) — user
  prefers CF UI; 24-48h propagation so do AFTER first playtest.

- **P1 (Micro, playtest-gated) — NET feel tuning.** After cross-network
  playtest, tune `NET_SNAPSHOT_HZ` (10), `NET_INTERPOLATION_MS` (100),
  `AVATAR_PULSE_HZ` (1.2), `REDUNDANT_BOND_K` (3), `MIN_ANGLE_RAD` (25°)
  to playtest signal. If transient-drop annoyance shows, evaluate Grok R2's
  mandatory host-migration stub.

- **P2 (Standard, playtest-signal-gated) — NET enhancements per S15 carry.**
  Client-side AttractDrag prediction + reconciliation buffer (~150 LOC,
  Grok R1 ask); delta-encoded NetSnapshot for bandwidth (Council R1
  nice-to-have); host-migration stub (Grok R2 ask if needed); live cursor
  sync (~50 LOC, currently avatarPos updates only on commit).

- **P3 (Standard) — Phase-2 Tier-1+ disruption suite.** Per
  `docs/phase-2-design-options.md`, recommended next pair is C
  (Sever-as-disruption) + F (Multi-color rendering), ~220 LOC.

- **P4 (asset-gated) — Audio.** Suno didgeridoo trance track upload still
  pending since S5.

## Blockers
None for cross-network playtest. github.io URL is live. Friend can open
it and enter a 6-char code in the JOIN input. Test path: friend opens
https://daneshto-dotcom.github.io/the-spark/ → click "1v1 (2 Player)" →
JOIN pane → type host's 6-char code into the cyan-border input → Connect →
host (you) clicks "Begin Match" → both see same world → SPACE ends turn →
first to PHASE_1_WIN_SCORE wins.

## Pending Backlog
- [ ] Session 17+ — S16 P2 Step 2 (spark-online.space custom-domain swap,
  ready-to-ship after user does DNS + Pages Custom Domain toggle);
  optional Cloudflare DNS migration; post-playtest NET-feel tuning; NET
  enhancements per playtest signal (prediction / delta / host-migration /
  live cursor); Phase-2 Tier-1+ disruption suite (per
  `docs/phase-2-design-options.md`); Audio (Suno track upload).

## Git
Branch: `master`. Origin: `https://github.com/daneshto-dotcom/the-spark.git`.
All S16 commits pushed.
- (S16 closeout commit at end of P4)
- 9d9d9ee — S16 P3: BETA badge + hide spawner ring/legend in TITLE/LOBBY
  (also re-triggered the deploy after Pages was enabled via gh API)
- 4011862 — S16 P2 Step 1 + 1.5: GitHub Pages deploy + favicon/robots/OG
- 5ff7865 — S16 P1: HTML <input> overlay replaces Pixi+keydown lobby JOIN hack
- b2979fc — S16 P0: extract gameMode dispatch handlers + addScore from world.ts
- ef681a6 — S15 /handoff: WHOIS verification complete (user confirmed)
- e4f512f — S15 /handoff: domain finalized to spark-online.space
- add497f — S15 P2: networked 1v1 multiplayer MVP (Trystero/Nostr WebRTC)
- b9c4b20 — S15 P1: extract pickRedundantBondTargets + angularDistance

## Live URLs
- **Game:** https://daneshto-dotcom.github.io/the-spark/ (HTTP 200, HSTS)
- **Favicon:** https://daneshto-dotcom.github.io/the-spark/favicon.svg
- **Robots:** https://daneshto-dotcom.github.io/the-spark/robots.txt
- **Repo:** https://github.com/daneshto-dotcom/the-spark
- **Pages settings:** https://github.com/daneshto-dotcom/the-spark/settings/pages
  (Source = "GitHub Actions"; build_type=workflow enabled S16 P3)

## § XV LOC charter status (post-S16)
- world.ts: 357 → 290 LOC (S16 P0 — target 280, 3.5% over, accepted)
- gameMode.ts: 169 LOC NEW
- placePrimitive.ts: 492 LOC (unchanged from S14)
- controls.ts: 542 LOC (unchanged; under 600 trip-wire)
- redundantBondTargets.ts: 102 LOC (unchanged from S15)
- lobbyScreen.ts: 289 → ~440 LOC (S16 P1 — under 500 soft charter)
- net layer (transport+protocol+sync+lerp): 347 LOC (unchanged from S15)
- main.ts: +~25 LOC (P3 BETA badge + ring/legend visibility)
- Tests: 291 → 307 (S16 P1 added 16 in lobbyScreen.test.ts)

## Recent Reflexion (last 2 sessions — full log in reflexion_log.md)
## 2026-05-12 — Session 16 of 10+ (Cross-network playtest blockers)
- S16 #council-dual-dissent-overrides-implementation-feasibility-domain: §3.4 authority is a DEFAULT bias not a veto — 2 dissenters in non-primary domains aggregate past authority. Don't ratify your own preference just because the decision sits in your authority lane.
- S16 #prime-audit-catches-deploy-pages-v4-required-workflow-elements: When Council recommends a tool/action switch, PRIME-AUDIT MUST verify the spec of the new tool, not just the swap. ~5 min audit prevents 2-min deploy-fail loop AND keeps the diff clean.
- S16 #scope-amendment-mid-execution-when-original-plan-breaks-product-promise: Scope amendments aren't only triggered by user requests — they're triggered ANY time mid-execution discovery shows the original plan contradicts the user's stated goal. Document the amendment so gate flags + PDR-archive narrative match what shipped.
- S16 #headless-preview-rAF-throttle-blocks-screenshot-not-implementation: When the preview verification path is blocked by environment, switch to alternative proofs (eval, DOM inspection, network response) that don't depend on the blocked path. Implementation correctness and visual-proof-of-life are different claims.
- SESSION #gh-cli-as-pages-enablement-shortcut: Default to checking `gh api` first for any "user must click X in GitHub UI" step before documenting the manual path — keeps the deploy spec self-contained + auditable.

## 2026-05-12 — Session 15 of 10+ (S14 Charter Extraction + Phase-2 1v1 Networked Play)
- S15 #user-amendment-mid-session-as-2nd-council-cycle: User amendments are LEGITIMATE PDR-cycle re-entry points, not paper-over moments. Carry-forward Council findings compose with new findings; resist "just adjust" mid-flight.
- S15 #locked-decision-amendment-via-user-authority: LOCKED_DECISIONS sections are USER-AUTHORITY-amendable not implementation-frozen. Document amendments in the SAME session so future sessions don't act on stale lock.
- S15 #council-r2-converges-disagreements-not-restarts: R2 is a CONVERGENCE round. Frame prompts symmetrically: "defend or concede your R1 stance against the other member's counter; cite concrete data."
- S15 #test-contract-as-implementation-surface: Existing test contracts are PART of the implementation surface. New features must preserve them OR explicitly amend with rationale.
- SESSION #trip-wire-as-judgment-signal-not-hard-gate: Trip-wires from the PDR are SIGNALS for "stop and reconsider," not hard gates. When over-trip is mostly documentation + integration is at a clean stopping point, ship + log carry-forward beats fragmenting.
