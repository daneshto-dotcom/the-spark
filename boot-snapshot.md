# Boot Snapshot (auto-generated at handoff)
Generated: 2026-09-25 | Session: S190 | deploy #4 LIVE (7404a49, PROTOCOL 51, verify-deploy 4/4) · deploy #3 5934d3b before it

## ⛔ READ FIRST
- **The owner has a NEW list of things to implement** (written after his morning playtest) — take it first, then
  `.claude/plans/S191_BACKLOG.md` (deploy #5 = weld + net is its top section).
- **Never re-ask an answered question**: `.claude/plans/S190_OWNER_RULINGS.md` (R190-A..M) and `SPARK_CANON.md`.
- `PROTOCOL_VERSION` is **51**. Weld owes 52 (new saved fields + a rule every peer computes).
- ⚠ Verify `session-state.json`'s `session_id` in a SEPARATE call before trusting it (memory `session-state-write-race`;
  the hook-side race itself is FIXED in ~/.claude 0fa4ed1).

## Next Steps
1. Owner's new list (ask him for it if not pasted) — plan it after reading the canon and the rulings file.
2. Deploy #5: `s189/weld` (round 4 at 18769b4 — one-lens re-audit, then merge; bump 51→52 with the reason list in
   S191_BACKLOG) and `s189/net` (NOT shippable: NETFR-1 HIGH send-to-title in a live match, NETFR-2, NETFR-3 — fix
   shapes in S191_BACKLOG §FIRST; then e2e reconnect-hard-blip, reconnect, exit-match, hostmigration).
3. C4 retry tuning (S191_BACKLOG §E — Trystero answeringTtlMs 23 333 ms; 6/7 recoveries, 4 after the grace).
4. Owner questions §A (C3 Voltkin raiders, ATK on summons, castle hit/heal numbers, Ra above buildings, overlay over
   draft, spawner-weld lock) — one plain-words batch, each with a recommendation.
5. Add-ons §B (orc rage 25 s, Alt footer toggle, magic-attack class, A1 CI fix) and carry-forwards §C.

## Blockers
- None technical. Owner-only: his new list; the §A questions (none block work); C6 needs a two-machine check.

## Pending Backlog
Everything owed is in `.claude/plans/S191_BACKLOG.md` (§FIRST, §A-§E). Older forward lists (S182/S180 backlogs) — verify
any line before it reaches him.

## Recent Reflexion (last 2 sessions)
`.claude/reflexion_log.md`: S190 at the top (8 entries: a guard can break the gesture under it · render state that
outlives the sim needs the sim's proof · a merge resolution that compiles can drop an argument · a red-by-design
tripwire is a chain · two independent confirmations before a wide change · a test at rest hides a velocity bug ·
removing a zIndex changes who gets the click · commit-every-step makes a spend limit cheap), then S189 (3 entries).
50 total, at the cap.

## Muscle memory (auto) [Vigil]
- Traces: `C:\Users\onesh\.claude\traces\2026-09-25\The-Spark.jsonl`
- Last decisions:
  - Nothing merges without an auditor that did not write it — every S190 fix round audited, and audits found real
    defects in green branches again (weld spare rule, net send-to-title, the sonar velocity bug).
  - Unapproved spec changes are REVERTED, not debated (the owner's standing S190 order).
  - Near the context limit, delegate merge MECHANICS to an integrator reading an on-disk notes file; keep triage,
    e2e, push and the live look.
  - Hold an audited-red branch rather than ship it; one protocol bump per deploy.
  - Commit after every step — three spend-limit wipeouts cost one step per branch each.
- CLAUDE_LOOP: **closed**
- Shared bundle checklist:
  - [x] boot-snapshot.md (this file)
  - [x] latest HANDOFF: `HANDOFF_S190_2026-09-25.md`
  - [x] LOCKED_DECISIONS.md (unchanged S190)
  - [x] traces jsonl path above
