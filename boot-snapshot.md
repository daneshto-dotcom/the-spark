# Boot Snapshot (auto-generated at handoff)
Generated: 2026-08-13 | Session: S142 | Commit: `fee81c1` | Branch: master | PROTOCOL_VERSION: **20**

**S142 set out to flip the sim worker default-on — a ruling LOCKED for S129, 13 sessions overdue,
with the owner's playtest already passed. Measuring first proved the flip is UNSAFE, for a reason in
no document. The flip is DEFERRED. What shipped instead: the safety work that has to precede it, and
the deletion of a manual chore the owner has been performing every session for no reason.**

Deploy verified 4/4 (`index-DqNeLZuz.js`). tsc 0 · vitest **2275/2275** (150 files, was 2266/147) ·
e2e:gating **36/36** · bundle 677.7 KiB (72.3 KiB headroom) · **no protocol bump** (still 20).

## ⭐ STOP DOING THE 2-BROWSER CHECK. CI DOES IT NOW.

Every session close has told you: *"⚠ 2-PEER CHECK ON vN — ONLY YOU CAN DO THIS. CI cannot verify a
protocol bump."* **That was false.** In CI run `31707927282`, **both real-WebRTC protocol-mismatch
tests PASSED — 5.6 s each, covering both direction arms** (older peer *and* newer peer). They
produced no signal only because they sit in `smoke.spec.ts` behind `@quarantine-flaky`, which the
gating lane grep-inverts, inside a `continue-on-error` job.

S142 gives them a dedicated **GATING** lane, `e2e-protocol` (~11 s), and it is **runtime-proven**:
run `31712230199` concluded **success**. A bump now verifies its own HELLO lockstep.

*Not* covered: the relay/ICE path under adverse conditions, and whether a genuinely OLD BUNDLE is
rejected — the HELLO is synthesized through the send-side override seam, not an actually-stale build.

## ⭐ THE BUG THAT BLOCKED THE FLIP — again in the space BETWEEN two correct decisions

- `deserializeSpawner` re-seeds spawner cadence and resets `spawnedCount`. Correct for save/load.
- Host-migration TAKEOVER sets `world.isHost = true` **mid-match** on a peer whose
  `simWorkerDriver` is null (clients never adopt).

Together, after a default-on flip that promoted host's **very next frame** adopts the worker **with
live spawners** — and `spawnedCount` is not telemetry: `hostTick` self-destructs a structure spawner
at `STRUCTURE_SELFDESTRUCT_DRONE_COUNT`. So it silently granted the new host a **fresh self-destruct
lifetime**. Invisible to everything: spawners are absent from `NARROW_HASHED_FAMILIES` (the only hash
compared at runtime) and a mismatch merely increments a counter.

## BOTH COUNCIL SEATS PROPOSED A BROKEN FIX. THIRD SESSION RUNNING.

- **Grok:** a `preserveLiveCadence` flag at the call site — a **provable NO-OP**. `serializeSpawner`
  emitted only the four *readonly identity* fields; there was nothing in the payload to preserve.
- **Grok's evidence:** twelve named fields allegedly sharing the defect. All twelve grepped. **None
  exist.** It also asserted "no comment treats these fields as ephemeral" — the comment was in the
  docblock it was reasoning about.
- **Gemini:** "just add them to the serializer" — which ships the **upcoming spawn schedule to
  modified clients** (rngSeed-exclusion precedent, TOWER_DEFENSE_DESIGN §3.3).
- **And my own PDR was wrong:** I claimed "hash-oracle divergence". The runtime oracle cannot see
  spawners at all.

**Shipped:** cadence serialized for the LOCAL consumers (disk save + worker INIT), **stripped from
the wire** by a new `trimMirrorSpawner` — same place and posture as every other host-only field.
Wire stays byte-identical; clients rehydrate through the exact re-seed path they always used.
Mutation-tested both ways.

## The generalised method found a second bug the specific fix would have missed

Compare each entity's **mutable** fields against what its serializer emits.
`Creature.poopyUntilTick` was read every physics tick (`creatureVerlet` halves a poop-slowed
creature's accel) but `SerializedCreature` never declared it — while `SerializedSpark` has
round-tripped the **same field** since S77 P3. **65 sessions of disagreement.** Method recorded as
`src/state/serializerCompletenessSweep.test.ts`.

## WHAT TO DO NEXT

1. **PLAYTEST — that is the only thing genuinely waiting on you.** The Stink Tower (recipe shapes are
   still a *Claude* ruling — retune freely, it is one edit), the order queue, and the S139 goblin
   (permanent roaming ~120 px vision source, renders above fog — still unruled).
2. **The worker flip is now a SMALL, well-understood change** — but three things gate it: the
   intermittent `worker-bots` CI failure, the differential harness seeding **none** of the families
   shipped since S135, and the shared-predicate/`?worker=0` work (see below).
3. **`?worker=0` DOES NOT EXIST.** Every read is `=== '1'`. There is no escape hatch today.

## ⚠ TRAPS

- **The BACKLOG described the `probeHarness` guard BACKWARDS** (now corrected in place). It said the
  harness "becomes refuse-by-default" — benign. The truth: with worker-on-by-default the param is
  **ABSENT**, the guard is **FALSE**, and the harness **ARMS WHILE THE WORKER IS ACTIVE**. Root
  cause: the flag is parsed **twice, independently**. Fix = ONE shared predicate.
- **"Fully red" was HALF GREEN in both environments.** The quarantine lane: local 9/9, CI 8 failed /
  9 passed / 1 never ran. Peers **do** connect. The real defect was `retries: 2` blowing the budget
  (fixed, `PW_RETRIES: 0`). A remembered failure string had become settled fact nobody re-measured.
- **The gating lane fails INTERMITTENTLY in CI and nothing reports it** — `e2e.yml` has no push
  trigger. Dispatch it at boot. Green-on-your-last-PR is not evidence master is green.
- **A reviewer will assert it searched when it did not.** Grep-verify every cited symbol.
- **Unanimity on a FINDING still does not transfer to the FIX.** Third session running.
- **Cap the fan-out.** 7 agents died on the spend limit with **zero** recoverable results; 3 tight
  probes landed 3/3. **Third consecutive session.** Read the highest-risk area by hand FIRST.
- **Rebuild before `verify-deploy`.**
- ⛔ **RUN THE `/handoff` SKILL — DO NOT HAND-AUTHOR THE HANDOFF DOCS.** Found at S142 close:
  `.claude/reflexion_log.md` contained **no S140 and no S141 block at all**. Both sessions wrote
  their entries to `session-state.json` and neither ever reached the log, because both (and S142,
  until caught) hand-wrote the handoff documents instead of invoking the skill — which skips STEP
  2.8.A. Both were recovered verbatim from git and restored. The docs looking right is not evidence
  the procedure ran.

## Pending Backlog

15 entries in `session-state.json → carry_forward` (4 struck, 4 added this session). Live: the
intermittent gating failure, the deferred P1 remainder (shared predicate + `?worker=0` + differential
harness seeding), ~8 genuinely failing joiner tests, the deferred ranged goblin / producer towers.

## Recent Reflexion (last 2 sessions)

### S142 (2026-08-13)
`#a0-killed-the-headline-priority-and-that-was-the-win` ·
`#both-seats-proposed-a-broken-fix-again-third-session-running` ·
`#a-reviewer-asserted-it-had-searched-and-had-not` · `#i-had-to-refute-my-own-pdr` ·
`#the-owner-was-doing-a-chore-ci-already-performed` ·
`#fully-red-was-half-green-in-both-environments` ·
`#the-instrument-was-hiding-its-own-diagnosis` ·
`#the-gating-lane-was-red-on-clean-master-and-nothing-reported-it` ·
`#the-generalised-method-found-a-second-bug-the-specific-fix-would-have-missed` ·
`#cap-the-fan-out-third-consecutive-session`

### S141 (2026-08-13)
`#two-seats-rejected-the-same-thing-and-both-fixes-were-wrong` ·
`#the-severe-bug-lived-in-the-interaction-neither-seat-was-shown` ·
`#a-tsc-forcing-function-can-be-satisfied-without-doing-anything` ·
`#a-stale-comment-can-be-an-instruction-to-break-production`

## Process deviations (S142)

- **The 7-agent A.0 fan-out died on the individual spend limit with ZERO recoverable results** —
  journal.jsonl held only `started` lines. **Third consecutive session** losing work this way. Re-run
  as **3 tight probes**, which landed 3/3 for 274K. The highest-risk area was read by hand first, so
  the loss cost nothing but time.
- **Council R2 ran with both seats** (unlike S141's single round), but Grok's R1 evidence was so
  unreliable — a no-op fix plus 12 fabricated symbols — that its R2 was scoped to two questions.
