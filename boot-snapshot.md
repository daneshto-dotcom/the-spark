# Boot Snapshot (auto-generated at handoff)
Generated: 2026-06-09 | Session: S77

## ⭐ NEXT-SESSION FIXES (playtest-driven — S77 shipped 3 priorities, all CI-green)
1. **PLAYTEST S77 + tune by feel** — rainbow 8/14 (is it ~2/game now?); the NEW **seagull** (does it look epic/funny? is the income-halt too harsh? does it cross every ~2min?); fog-exemption (do potato/rainbow/hunter/Voltkin show THROUGH the fog to both players?). Tunables in `src/constants.ts`: SEAGULL_SPAWN_MIN/MAX_SPARKS (~2min cadence), SEAGULL_SPEED, POOP_DROP_INTERVAL_TICKS, POOP_SLOW_TICKS (15s), POOP_CLEAN_RADIUS; income-halt SCOPE is 1-line tunable (connected-component → single-prim or whole-player, in scoring.ts/seagullLifecycle.ts). S76 carry: SCORE_INCOME_PER_COMPLEXITY_PER_SEC 0.15, HUNTER_MAX_SPEED 3.5.
2. **Bomb fog-exemption** — EXCLUDED this session (audit: the pickup-bomb severs only the picker's OWN bonds → fails the "visible iff can-affect-all" rule). If you want EVERY hazard visible through fog, it's a 1-line add (route bombRenderer into aboveFogLayer in main.ts).

## Next Steps
3. **Seagull polish (deferred):** screen-shake on a structure-FOUL (not per-poop — too noisy); blast-effect fog-exemption (P2 explicitly deferred transient effects); owner-tint legibility of through-fog entities (ties to backlog #3 CVD).
4. **Pick ONE Standard PDR:** #2 control-message **sender-auth** (now MORE relevant — a spoofed v7 SEAGULL/TRIGGER_* is a grief vector) · #3 **EYES fog** fuzzy-edge + CVD shape-icons (ties to P2's through-fog owner-ID) · #4 **live-play netcode infra** (host-migration/reconnect/6p — multi-session).
5. (Deferred) Re-validate + gate the S69 P2 lobby seat-UX visual refactor.

## Blockers
None. CI ALL GREEN (E2E 2-browser + Deploy on dd05c85/b986831/b9aff10). PROTOCOL_VERSION is now **7** (stale v6 peers hard-rejected at HELLO — everyone must refresh to the seagull build).

## Pending Backlog
Pre-existing: #2 control-message sender-auth · #3 EYES fog fuzzy-edge + CVD shape-icons · #4 live-play netcode infra. Deferred plan: S69 P2 lobby seat-UX visual refactor (`.claude/plans-archive/2026-06-06_PDR_S69_P2_lobby-seat-ux_*.md`).

## Recent Reflexion (last 2 sessions)
**S77** — rainbow 8/14 (P1 dd05c85) + global-reach fog-exempt (P2 b986831) + NEW seagull hazard (P3 b9aff10, FULL, PROTOCOL 6→7). Mirrored the proven hunter/potato pattern end-to-end (map every wiring site first → a 16-file Full feature landed tsc-clean on the 2nd try). Council scoped the income-halt to the hit STRUCTURE (component), not the whole player (both models flagged too-harsh). Avoided the Verlet implicit-velocity decay trap (poopy-slow = one-time impulse + carry-path scale, core untouched). The gating lane caught 3 self-inflicted test-drifts (aboveFogLayer 4→6 children; v6→v7/v7→v8 protocol literals) as routine maintenance.
**S76** — hunter 2.5× faster + rainbow 35/60→15/28 + complexity-INCOME scoring (FULL). Income ∝ standing complexity so destruction slows gain + unifies the player-1 path. Council caught a perverse-incentive bug in the complexity formula pre-code.
