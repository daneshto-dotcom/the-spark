═══════════════════════════════════════════════════════════
HANDOFF SUMMARY — SPARK
Generated: 2026-07-20
Session: S125 — host-migration v2 (zombie auto-rejoin) + F9 INTENT token-bucket (2/2 shipped + live)
═══════════════════════════════════════════════════════════

## PROJECT
- Name: SPARK (geometric builder duel) · Working dir: …/Founder DNA/Extension Projects/The Spark
- Git branch: master · Latest: 433793a (S125 close) · Feature: 51d8b2f
- Tech: TypeScript / Vite / Pixi 8.19 / Trystero (WebRTC P2P) · host-authoritative deterministic sim

## CURRENT STATE
- Build: tsc 0 · vitest 1914/1914 (+13) · bundle 640.8/750 KiB (109 headroom)
- e2e: both hostmigration @quarantine-flaky GREEN over real WebRTC — v2 freeze-thaw rejoin (25.5s) + D3 kill-host takeover (20.2s)
- Deployment: LIVE on https://spark-online.space — Deploy-to-Pages run 29699637227 SUCCESS (auto on master push)
- PROTOCOL_VERSION 15 (UNCHANGED — both priorities host-local, no forced client refresh)

## THIS SESSION'S WORK
- **P1 — Host-migration v2 (zombie auto-rejoin), LOCKED §13.21 v1→v2, HOST_MIGRATION_DESIGN §12:**
  a deposed ORIGINAL host now auto-rejoins as a client instead of the terminal overlay. `demoteToClient`
  unified with `{reestablishTransport}`: nulls the ClientSync + `disconnect()` + `connectAsClient` (the
  shipped S82 reconnect path) to follow the successor; fresh-sync `setEpoch` fences the zombie's own
  residual epoch-0 frames. `onDeposed` passes the successor; terminal overlay is now the no-room-code
  fail-safe only. Seat-0 warrant exclusion ⇒ follows a cascade, never re-claims. +hostmigV2.test.ts (3).
- **P2 — F9 INTENT token-bucket (AUDIT_S116 F9 CLOSED):** new `net/intentRateLimiter.ts` (per-peer bucket,
  90/40) wired at the TOP of BOTH host INTENT choke points before allowlist/stamp; empty bucket drops +
  `world.diagnostics.intentThrottled++` (logs type). Prune on peer-leave, reset per fresh room. Wall-clock
  host-only guard (determinism-neutral). +intentRateLimiter.test.ts (10).
- Full-tier Council R1+R2 + PRIME-AUDIT + CHECK (2-way, Gemini timed out): zero residual HIGH/CRITICAL;
  15th instance of external high-sev findings dissolving under exact-mechanics triage.

## OPEN ISSUES
- None. MCV green (exit 0, 11 assertions). Close-note: the MCV initially hard-failed on omitted
  verification[] bindings (all claims were TRUE — a binding-authoring miss, not fabrication); reconciled +
  captured as reflexion S125-CLOSE #bind-completion-claims-with-verification-not-just-prose.

## BLOCKED ON (all OWNER)
- Weak-device `?worker=1` playtest · BOT_INTELLIGENCE_DESIGN.md §7 answers · deploy-path pick.

## NEXT STEPS (priority order)
1. OWNER: `?worker=1` weak-device playtest → flips worker default-on.
2. OWNER: answer BOT_INTELLIGENCE_DESIGN.md §7 (Q1–Q7) → unlocks bot-intelligence Phase A.
3. OWNER: pick ONE deploy path (Actions auto — acting default — vs manual `npm run deploy`); kill the other.
4. Worker default-on flip (post-playtest) · Bot-intelligence Phase A (post-§7).
5. Gated/optional: G1b MOTION · G2 traits · F9 QoS split (telemetry-gated) · bit-exact bot serialization (YAGNI).

## CHANGED FILES (session, 642e200..433793a)
 e2e/hostmigration.spec.ts 93+ · src/main.ts 106± · src/net/hostHandlers.ts 25± · src/net/intentRateLimiter.ts 66+
 src/net/intentRateLimiter.test.ts 110+ · src/net/hostmigV2.test.ts 71+ · src/constants.ts 15+ · src/state/{world,worldTypes,gameMode}.ts
 + docs: LOCKED_DECISIONS.md, HOST_MIGRATION_DESIGN.md, BACKLOG.md, AUDIT_S116.md

## SESSION PIPELINE REPORT
Pipeline: Session PDCA v2 | Priorities: 2/2 complete | Full tier | GREEN (312K/1M)
P1 host-migration v2 — completed — 51d8b2f · P2 F9 INTENT token-bucket — completed — 51d8b2f

## REFLEXION ENTRIES (this session)
- S125-P1 #reuse-a-shipped-proven-path-beats-new-migration-machinery
- S125-P2 #size-the-guard-to-the-measured-legit-ceiling
- S125-CLOSE #bind-completion-claims-with-verification-not-just-prose

## CARRY-FORWARD PRIORITIES
1. Worker default-on flip — owner playtest gate — PDR: not started
2. Bot-intelligence Phase A — owner §7 answers — PDR: not started
3. Deploy-path decision — owner — N/A
4. G1b MOTION · G2 traits · F9 QoS split · bit-exact serialization — gated/YAGNI
═══════════════════════════════════════════════════════════
