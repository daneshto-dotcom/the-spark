# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-09 | Session: S135 | Commit: 88ef3b5 (+ session-state chore) | Branch: master

**S135 shipped 3/3 and the economy loop is LIVE.** Gatherers now walk to the spawn zone, take a
shape, carry it home and bank it beside your keep — and the cruiser's grab MOVED to the keep, so the
loop is *gatherer fetches / player builds*. Everything is pushed and verified live 4/4.

## Next Steps
1. **PLAYTEST FIRST — the owner has not yet played the haul build.** Everything below is a guess
   until he does. The three things most likely to feel wrong: (a) the faucet — `SPAWN_RATE_PER_SECOND`
   is still `0.1875`, so a gatherer often has NOTHING to fetch and idles at its keep; the owner's B3
   ruling ("6× more sparks") is the fix and is still OUT of scope; (b) haul speed at base level;
   (c) whether one gatherer + 100 points is the right opening.
2. **B3 — raise the spark rate (the owner already ruled it: 6×).** `SPAWN_RATE_PER_SECOND` 0.1875 →
   ~1.125. ⚠ Re-derive `FREE_SPARK_SOFT_CAP = 50`: S132 proved it unreachable dead code at the old
   rate; at 6× it becomes LIVE. This is the single change most likely to make the loop feel alive.
3. **V6-1.3 — the bank cap (5 slots) + the waiting-gatherer rule.** Shapes currently pile up at the
   keep with NO cap. The owner's B4b ruling pairs 5 slots with the recipe-size table (pentagram 5 ·
   lightningHub 6 · Helga 7 · Voltkin 8 · laserTurret 8) — never tune them apart. Also implement
   "bank full ⇒ a loaded gatherer walks home and WAITS holding its item".
4. **Sim-worker default-on flip — NOW UNBLOCKED.** Its only gate was the S135 P0 hunter residual,
   which is closed. Gatherers already ride the positions buffer + structuralSignature, so the family
   is flip-ready. Flip `?worker` default, drop the flag gate, update the 5 e2e files that hard-code it.
5. **V6-1.4 — the ordered build queue + the full footer bar.** The footer container is already
   reserved and holds two controls; the queue is the RTS click-N-times mechanic (B4), and the
   per-gatherer preference shipped in S135 is its single-type precursor, NOT the queue itself.

## Blockers
None. Nothing waits on the owner except the playtest in step 1.

## Open items carried (logged, not blocking)
- Deposit-slot column can grow past the footer for the two bottom seats at very high gatherer counts.
- `SCORE_TIER` corner-bloom still replays on a re-cross (only the HUD banner is watermarked).
- Carried-potato `onUp` footer branch can strand pointer capture (narrow: potato + footer + release).
- `origin/gh-pages` still exists — deletion is OWNER-GATED (deploy is Actions-artifact only).

## Pending Backlog
- [ ] B3 6× spark rate + re-derive FREE_SPARK_SOFT_CAP
- [ ] V6-1.3 bank cap (5) + deposit + waiting-gatherer rule
- [ ] V6-1.4 ordered build queue + full footer controls
- [ ] Sim-worker default-on flip (unblocked)
- [ ] V6-1.2 remainder: full castle ENTITY + spawner shrink R9/R10 + cadence
- [ ] B5 match length (unruled, V6-4.3) — do NOT retune PHASE_1_WIN_SCORE / SCORE_INCOME before it
- [ ] Two-tab boot-then-smoke for host migration (nothing gates it at runtime today)

## Traps that bit this session
- **My own TEST was wrong, not the code.** Haul tests asserted "HAULING after 420 ticks" and failed
  against WORKING code — pickup is ~154 and delivery completes by ~310. Wait on the EVENT, never a
  tick count, in any test of a timed process.
- **A surviving mutation is not automatically a weak test.** M5 stayed green because `[].every()` is
  vacuously true, so a second guard already covered the case. Distinguish "redundant line" from
  "uncovered line" before strengthening anything.
- **The first `verify-deploy` FAILED on LIVE** because the local `dist` predated the last edits.
  Rebuild from committed source and re-verify — do not assume CDN lag.
- **Forcing functions did the work memory would have missed** (FIELD_COVERAGE, the action Record, the
  protoVersion literal, benchGate set-equality). The two UNFORCED sites — structuralSignature and the
  positions buffer — are exactly what the audit later caught. List forced vs unforced separately.
- CRLF vs LF differs PER FILE here (`save.ts` CRLF, `ui.ts` LF). Detect per file in any edit script.

## Recent Reflexion (last 2 sessions)
See `.claude/reflexion_log.md` — the S135 block (6 entries: mutation-matrix double-detector, the
false-RED hash trap the review caught, my-own-test-was-wrong, surviving-mutation-is-not-weak-test,
forcing-functions-did-the-work, and ship-the-loop-not-the-substrate) sits above the S134 block.
