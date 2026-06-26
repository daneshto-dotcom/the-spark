# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-26 | Session: S107

## Next Steps
1. **PLAYTEST the live S107 build** on https://spark-online.space (deployed: P0-P1 live, P2 finishing).
   Bring corrections — they JUMP THE QUEUE (regression-first). What to look for:
   - **Anti-coast leader-decay (P1):** in a non-solo match get a lead PAST 75% of the win (≈589/786) and STOP building — your own progress bar should turn AMBER and gently recede ("coasting — keep building"). A committed builder (big standing structure) still wins; a coaster/raided leader stalls below the win line. Two tuning dials in constants.ts (LEADER_DECAY_RATE_PER_SEC=0.01, LEADER_DECAY_THRESHOLD_FRACTION=0.75) — dial RATE up if it feels too gentle.
   - **Bot pentagram (P4):** vs-bots — the bot should NO LONGER tear down its own chewer-spawner by building near it (was self-breaking). Enemy chewers keep coming so your turret/HELGA/Voltkin have targets.
   - **Voltkin (P3):** still renders + cinematic plays (dead-asset cleanup was render-neutral).
2. **BATCH B (owner-mandated next session):** Tier-1 CORE GAME —
   - **G1b MOTION** (Wheel/Star structure rotation + Capsule glow-trail; needs a mechanical verb, not pure visual)
   - **G2 family TRAITS** (GATED: needs a LOCKED_DECISIONS §6 lock-amendment — functional combos locked MID/1.0×/generic)
   - **G3b Codex silhouettes** (undiscovered combos render as silhouettes; mark used)
   - **G4 build-feel juice** (in-world LEADER CROWN + enhance BOND_COMMIT flair + pooped-reject cue)
   - Also queued: Ghost build-hint · TD connector visible-damage (Bond.hp) · HELGA full princess spec (memory).
3. **BATCH C (session after B):** host-migration D1-D4 (`HOST_MIGRATION_DESIGN.md`) + Tier-3 infra/PARKED.

## Blockers
None. All S107 work verified (tsc 0, vitest 1684/1684, MCV exit 0 / 14 assertions, build clean, bundle 597.1/750) and LIVE (P1 deploy SUCCESS = anti-coast decay live; P2 deploy finishing — test/doc-only, identical bundle). E2E (2-browser, non-gating) — S107 touches no net/fog contract.

## Owner-gated carry-forwards (DO NOT start without owner go)
- **Anti-coast structure-loss CLAWBACK** (own PDR): severing a connector / killing a spawner DOCKS banked score. Overturns the S76 "banked-safe" invariant → floor-at-0, host-only, serialized, replay tests. The harsher alternative to the leader-decay lever shipped this session — owner picks if/when.
- **Worker-sim cutover remainder** (see `WORKER_SIM_FOUNDATION.md` for the sequenced plan): S107 P2 proved the sim is replay-deterministic at the stepPhysics level (worker-SAFE within a browser) + shipped the hashWorldState cross-check oracle. Next phases (each own PDR): (a) runHostTick extraction — FIRST untangle the `state/godlyOrchestration.ts → render/*` coupling; (b) snapshot pooling/delta-encode — MEASURE ROI first (add the cost probe); (c) collision grid 64→8; (d) `?worker=1` flag-gated cutover.

## Pending Backlog
(BACKLOG.md is TIER-structured — no `- [ ]` checkboxes. Batches A/B/C above are the organized plan. Tier-1 = Batch B; Tier-3 = Batch C.)

## Recent Reflexion (last 2 sessions)
See .claude/reflexion_log.md top 2 blocks (S107 + S106). S107: a flaky perf gate must be HARDENED (p95+canary) not tolerated · dead-asset cleanup must trace the WHOLE import graph (the module was test-only, kept for a wire-determinism test) · fix the MECHANISM not the distance + derive protective state from existing state (no new wire field) · proportional rubber-band beats flat AND the existing win tests pin the rate (solo-exempt by default saved most of them) · the honest milestone increment is the verifiable foundation (lock + audit + plan), not a risky half-cutover. META: don't use `agentType:'Explore'` for deliberation — it downgrades to Haiku (ALWAYS-OPUS); PRIME-AUDIT the scope.
