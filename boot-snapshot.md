# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-10 | Session: S136 | Commit: a08c4e3 | Branch: master

**S136 shipped 4 of 6 and the v0.6 economy loop now works END TO END.** The owner playtested the
S135 haul build mid-session, reported six items, and approved a full autonomous batch. The
automation controls moved off the permanent footer into a panel that opens when you click your
castle; hauled shapes are now stored INSIDE the castle (which structurally deleted the stacking and
fling bugs rather than patching them); the spark faucet is 6× and the soft cap was re-derived from
measurement; and the rainbow now makes the castle party. Everything pushed, deploy verified 4/4.

## Next Steps
1. **PLAYTEST — two specific judgements are wanted.** (a) The bottleneck MOVED by design: the ×6
   faucet drove gatherer idling from chronic to 1.2%, but with one gatherer and nobody spending the
   5-slot bank fills in ~10 s and the hauler then sits WAITING (247 of 338 samples). That is the
   B4b pressure working — amber double-ring = stalled — but bank capacity, not spark supply, now
   gates throughput. (b) The rainbow castle party is UNVERIFIED VISUALLY (the harness cannot trigger
   a real rainbow pickup); logic is pinned by pure tests, the look is not.
2. **P2 — the in-bubble build space** (owner item 5's ambitious half): prebuild a structure inside
   the castle popup's own space, then pull the whole assembly out. The one-by-one pull already
   shipped, so this is purely additive. Largest remaining owner item; take it first.
3. **Bank tuning informed by (1a)** — is cap 5 right now that it is the binding constraint? ⭐ NEVER
   tune the cap apart from the recipe-size table; both live together at `CASTLE_BANK_CAP` in
   constants.ts, and the table now carries the NONET-9 row every prior copy omitted.
4. **P5 — sim-worker default-on flip.** Unblocked but deliberately not started unattended. Verified:
   6 `?worker=1` literals across **4** files (the BACKLOG says 5 — wrong), `probeHarness.ts:340`
   refuses to arm when the flag is set so it becomes refuse-by-default after a flip, and 6
   non-worker-only main-thread paths become dead or universal.
5. **B5 / match length** — still UNRULED, owned by V6-4.3. The ×6 faucet SHORTENS matches and this
   session deliberately did not compensate; PHASE_1_WIN_SCORE and
   SCORE_INCOME_PER_COMPLEXITY_PER_SEC are untouched and no slot owns them.

## Blockers
None. Nothing waits on the owner except the two playtest judgements in step 1.

## Open items carried
- ⚠ `e2e-quarantine` lane RED **and already red before this session** — the known
  `@quarantine-flaky` host-migration D3 test (`hostmigration.spec.ts:34`), non-gating by design.
- No 2-peer/joiner run of the castle bank (it rides the wire but was never exercised across a real
  transport); no host-migration round-trip test.
- From S135, untouched: deposit-slot column overflow, `SCORE_TIER` corner-bloom replay,
  carried-potato `onUp` pointer capture, `origin/gh-pages` deletion (OWNER-GATED).

## Pending Backlog
- [ ] P2 / V6-1.3 remainder: in-bubble prebuild + pull-the-whole-structure
- [ ] Sim-worker default-on flip (unblocked; risk surface enumerated above)
- [ ] V6-1.4 ordered build queue + full footer controls
- [ ] V6-1.2 remainder: full castle ENTITY + spawner shrink R9/R10 + cadence
- [ ] B5 match length (unruled, V6-4.3)
- [ ] Two-tab boot-then-smoke for host migration

## Traps that bit this session
- **Never reproduce a bug under `?debug=1`.** Its DOM overlay (fixed, z-index 1001, 425×972) covers
  the right-hand column including the old footer controls, so `elementFromPoint` returns its `<pre>`
  and the canvas never sees pointerdown. Every e2e spec boots `?debug=1`, so the harness could not
  have caught a control regression — and it gave me a FALSE "reproduced" on the owner's report.
  Reproduce in the configuration the PLAYER ran. (Fixed: body is now pointer-events:none.)
- **Runtime finds what unit tests structurally cannot.** 18 unit tests + an 8/8 mutation matrix all
  passed on a PULL that was broken: clearing `escrow` let `enforceSpawnerBounds` rim-snap the shape
  off the porch back into the quarry (194 px teleport — a worse fling than the one being fixed). NO
  TEST IN THE SUITE RUNS THE PHYSICS LOOP. If a change places an entity at a position, the
  acceptance test must run real physics for several frames and assert it is still there.
- **Look at the render.** 28/28 runtime assertions passed while a disabled label visibly overflowed
  its box. State assertions cannot see layout.
- **A comment claiming "covers every site" needs a grep first.** Five sites clear `world.gatherers`;
  three do it inline. Caught only because the test dispatched the real `RETURN_TO_TITLE` instead of
  calling the helper.
- **When a deletion breaks nothing, that IS the finding** — removing an exported fn + a whole render
  method left the suite at exactly 2069/2069: the measurement of zero coverage.
- **A surviving mutation may be a redundant line, not a weak test** (`Math.floor` on an
  integer-priced comparison cannot change the verdict).
- **CRLF vs LF differs PER FILE** (`save.ts` CRLF, most others LF) — bit an edit script again.

## Process deviations (S136)
- Rule 17's 3-way Council was NOT run: two A.0 subagent fleets died on a spend cap after ~1.7 M
  tokens returning zero output. Budget redirected into direct empirical A.0 (recorded in
  session-state `a0_state_discovery`) + a written per-priority audit. Stated, not presented as
  compliance.
- Priority order changed mid-session (P4/P3 taken ahead of P2 at YELLOW context); carry-forward
  reasons recorded in session-state.

## Recent Reflexion (last 2 sessions)
See `.claude/reflexion_log.md` — the S136 block (9 entries: false-repro-from-harness-flag,
look-at-the-render, zero-coverage-is-a-finding, runtime-finds-what-units-cannot,
comments-claiming-completeness-need-a-grep, delete-the-surface-not-the-symptom, measure-then-set,
fixing-a-bottleneck-moves-it, verify-the-bug-exists-before-fixing-it) sits above the S135 block.
