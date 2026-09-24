# PDR — S116: FULL PROJECT AUDIT (Fable 5 Ultracode research session)

**Date:** 2026-07-04 · **Tier:** Standard (research; no code shipped without post-audit owner picks)
**Approval:** USER PRE-APPROVED VERBATIM: "I pre-approve this session batch, run it autonomously."
**Supersedes for this session:** 2026-07-04_PDR_S116_HostMig_D2.md → PARKED (never approved; remains next non-gated build item unless the audit reorders it).

═══════════════════════════════════════════════════════════

OBJECTIVE
  Full-project audit with Fable 5 1M capacity: find bugs, unfinished pathways,
  inconsistencies, incoherence across code/tests/docs/design — PLUS creative,
  technical, structural, architectural ideas that make SPARK better. Deliverable =
  ranked findings + proposed implementation priority order for owner selection.
  NO production code changes this session (research only; fixes ship in follow-up
  batches per owner picks).

CURRENT STATE
  master @ 7d4d5c8 clean/synced · tsc 0 · vitest 1779/1779 · bundle 611/750 KiB ·
  LIVE index-BZSCuCtI.js · 267 TS files: 37,859 prod + 27,222 test lines ·
  10 e2e specs · PROTOCOL_VERSION 14.

SCOPE (audit phases, executed sequentially, all inline — no subagent fan-out)
  A INVENTORY  — module map, size hotspots, dependency shape.
  B SMELL SWEEP — TODO/FIXME/HACK/@ts-ignore/as-any/skip/console leftovers/
    "placeholder"/dead flags; npx ts-prune dead-export pass (if available).
  C CORE DEEP-READ — state/ (save, world, gameMode, placePrimitive, scoring,
    territory, combos), physics/, net/ (protocol, sync, transport, handlers,
    identity), main.ts, input/controls, bots/, game/spawner: hunt real bugs
    (determinism, desync, edge cases, resource leaks, race conditions).
  D CROSS-ARTIFACT CONSISTENCY — BACKLOG/LOCKED_DECISIONS/design docs vs code;
    constants.lock coverage; stale session-comments; PROTOCOL_VERSION coherence;
    package.json/deploy scripts.
  E TEST-SUITE QUALITY — coverage gaps on critical paths, tautological tests,
    e2e lane health.
  F PERF/BUNDLE — hot-loop allocation patterns, lazy-load opportunities, asset
    weight, render-loop cost.
  G COUNCIL PASS — condensed findings → Grok (adversarial: what did I miss) +
    Gemini (quality/creative) + Claude creative synthesis on vision-level ideas.
  H SYNTHESIS — severity×effort-ranked findings table + proposed re-prioritized
    implementation queue (vs current: hostmig D2, gated G1b/G2) → owner picks.

NO CHANGES TO
  All src/ production code, tests, deploy, BACKLOG (until owner picks) — the ONLY
  writes this session: .claude/plans/*, session-state.json, the audit report file
  AUDIT_S116.md, memory files.

RISK ASSESSMENT
  Context burn (38K-line repo): mitigated — targeted deep-reads ~15K lines +
  grep sweeps; budget checkpoint after Phase C; YELLOW → tighten to sweep-only.
  Finding overload: mitigated by severity×effort ranking + hard cap of a top-20
  actionable list (rest logged in report appendix).
  Hazardous findings (INTEGRITY protocol): any CRITICAL lands in the report AND
  a logged carry-forward — never silently dropped.

TESTING PLAN
  N/A for code (research session). Report quality gate: every claimed bug must
  cite file:line + a concrete failure scenario; every "inconsistency" must quote
  both sides. Council PRIME-AUDIT before synthesis.

TOOL TRIAGE
  Visual output?      No — deliverable is a report (widgets optional for summary).
  Research/external?  Yes — Grok + Gemini Council pass (Phase G).
  Artifact delivery?  Yes — AUDIT_S116.md in repo root.

DIFFERENTIAL_TEST_REQUIRED: false — no code changes.
HOT_PATH_REFACTOR: false — no code changes.

ESTIMATED TOKENS: ~300K session total (GREEN budget) | MODEL: claude-fable-5

═══════════════════════════════════════════════════════════
  GATE: USER PRE-APPROVED ("I pre-approve this session batch, run it
  autonomously") — same-turn flag-write + execution per PDR GATE rule.
═══════════════════════════════════════════════════════════
