# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-10 | Session: S137 | Commit: 37f90a6 | Branch: master

**S137 shipped 4 (+1 carried) and the GATING LANE IS GREEN for the first time in two sessions (29/2 -> 32/0).**
Both S136 failures were fixed at the ROOT, neither quarantined. The owner's two pending playtest
questions are both answered - the rainbow castle party with screenshots, the bank bottleneck with
measurements. P1 was deliberately NOT implemented on a verified protocol blocker; its design shipped.

Deploy verified 4/4 live (index-D7oQlyv1.js). git 0 ahead / 0 behind. Context at close 33.0% GREEN.

## What shipped
- **P0 (2a3cd55)** - fog contract is now an ordered constructor-name ROLL CALL, not a count; the 14th
  child is gathererRenderer (main.ts:506, went stale in S135). hunter.spec's premise was stale:
  STARTING_VICTORY_POINTS=100 made scoreProgress 100 from tick 0, so a forced trigger of 1 spawned the
  hunter ~90s early, benched the player, and controls.ts:345 swallowed the keep click. Seam -> 200.
  Found by INSTRUMENTING the throw with all three isInputLocked clauses, not by reasoning.
- **P2 (5eac4e4)** - rainbow castle party VISUALLY verified from real composited pixels, and the
  images were actually looked at: resting crimson -> magenta -> orange with the wash in step.
- **P3 (98c2b72)** - bank measured, NOTHING tuned. Cap does not reduce stall (88.7/94.1/90.8% at
  5/6/8); output over a run == the cap. The constraint is CONSUMPTION, not capacity.
- **P1 (37f90a6)** - DESIGNED only: CASTLE_BUILD_SPACE_DESIGN.md.
- **P4 (37f90a6)** - BACKLOG.md:411 worker-flag facts corrected (6 literals / 4 files, not "5 files").

## THE BLOCKER on P1 (verified, not caution)
PULL_STRUCTURE_FROM_BANK is a new CLIENT INTENT. protocol.ts:101-106 records that V6-1.1 bumped
PROTOCOL_VERSION 15->16 for exactly one new intent because stale peers are HARD-REJECTED AT HELLO.
This forces 16->17 and breaks multiplayer against every deployed client until both sides reload.
Take it at the START of a session, with a deploy + 2-peer check in the same session.

## NEW PRODUCT FINDING - verified, NOT fixed (B5, owner-unruled)
scoreProgress INCLUDES the 100-point opening balance, and both WIN (gameState.ts:62, 1500) and
HUNTER (hostTick.ts:498, 1125) gate on it. So a match ends after 1,400 EARNED points and the hunter
fires at 1,025 earned. Phase 1 is silently ~6.7% shorter than every comment claims.

## Next steps
1. P1 - OWNER RULED all 4 questions (design doc section 1, verbatim): both pull paths coexist, drop
   anywhere, capacity NOT capped by the bank (Voltkin 8 / NONET 9), 2D freeform grid, arbitrary
   non-combo structures, UX is an acceptance criterion. ONE thing left to decide first (section 7):
   BLUEPRINT (grid = a plan, shapes stay banked, zero serialization -- RECOMMENDED) vs REAL STORAGE
   (shapes move in, forces new serialized World state). Then implement FIRST in the session, together
   with the PROTOCOL_VERSION 16->17 bump + deploy + 2-peer check. CASTLE_BANK_CAP still UNRULED.
2. B5 match length - now has real input (the 6.7% discount + the x6 faucet). Owner-unruled.
3. Bank cap ruling - BANK_CAP_MEASUREMENT_S137.md; decide together with P1 section 8.3.
4. Sim-worker flip - 6 literals / 4 files (BACKLOG corrected); probeHarness.ts:339-345 becomes
   refuse-by-default after the flip.
5. H3 - does periodic consumption remove the stall? Needs a dispatch seam __SPARK__ lacks.

## Traps from S137
- **verification[] must be TYPED.** The MCV close-gate hard-failed 13x because I wrote
  {file, assertion:"free text"}; verify-session-claims dispatches on a `type` field and scored every
  priority WEAK. Use file_contains / file_lacks / grep_count / json_field with ABSOLUTE paths. A
  watch-root file modified with no binding assertion is also a hard fail.
- **file_lacks needles match COMMENTS too.** My first fix asserted file_lacks "toBe(13)" - it failed
  because that string survives in the comment explaining what the contract used to be.
- **An under-powered window reads as a null result.** The bank measurement at 22s reported
  "0.0% WAITING at every cap" = "no bottleneck". False. The bank did not saturate until 20.2s. At 60s
  it is 88.7-94.1%. A window shorter than the phenomenon returns a CONFIDENT FALSE NEGATIVE.
- **A passing visual test that produced no image.** testInfo.attach lives in the HTML report bundle
  and is DISCARDED under --reporter=list on a passing test. Green does not mean the artifact exists.
- **Instrument before you infer.** The hunter root cause was settled in ONE run by making the throw
  print all three isInputLocked clauses. ~30 lines replaced an open-ended hunt.
- **A count is a contract without a name.** If a test pins a NUMBER that stands for a LIST, pin the list.
- **Do not parse TypeScript with a regex.** A comma-split of PLAYER_COLORS returned 9 (comment commas);
  it is 7. Nearly shipped a confident, wrong "helpers.ts geometry is broken".
- **page.screenshot clip is CSS pixels**, not canvas coords - the canvas is letterboxed and scaled.
- **Do NOT launch large agent fleets on this account** - a 6-agent fleet died on the spend cap after
  ~454K tokens with zero output, the same failure that killed two S136 fleets.

## Process deviations
- Rule 17 Council ran 2-WAY: gemini-3.1-pro-preview returned HTTP 429, prepayment credits depleted.
  Gemini billing needs topping up before the next Council-tier session.
- Priority order changed: P2/P3 ahead of P1 (cheap + directly serving the imminent playtest).

## Open items carried
- e2e-quarantine lane red (known @quarantine-flaky host-migration D3), non-gating by design.
- No 2-peer/joiner exercise of the castle bank; no host-migration round-trip for it.
- S135 untouched: SCORE_TIER corner-bloom replay, carried-potato onUp pointer capture, deposit-slot
  column overflow.
- origin/gh-pages deletion - OWNER-GATED.
