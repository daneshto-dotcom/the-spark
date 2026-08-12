═══════════════════════════════════════════════════════════
SPARK — Handoff Prompt
Generated: 2026-08-11 | Commit: `fd48d3d` | Session: S139 CLOSED
Working dir: `C:\Users\onesh\OneDrive\Desktop\Claude\Founder DNA\Extension Projects\The Spark`
STATUS: READY
═══════════════════════════════════════════════════════════

QUICK SUMMARY

SPARK is a 2D real-time multiplayer browser game (TS + Pixi, host-authoritative sim, optional Web
Worker, WebRTC, deterministic state hash). S139 shipped 3 of 4 priorities and deployed them:
**damage went live, and the first free non-godly unit — the GOBLIN — is in the game.**
`PROTOCOL_VERSION` is now **18** — both peers must reload. Deploy verified 4/4.

The session's defining discovery: **S138's damage substrate had ZERO production call sites.** It was
typed, serialized, hashed, 22-tests-green, documented as "the ONE way anything takes damage" — and
the running game never called it. Its only importer was its own test file. No behavioural test could
catch that, because every one of those 22 tests called it themselves. The previous handoff recorded
the blocker as "GONE"; it was true only in the sense that the function existed.

WHAT TO DO NEXT (priority order)

1. **⚠ 2-PEER CHECK — ONLY YOU CAN DO THIS.** Open two browsers on v18 and confirm the HELLO
   lockstep. The only runtime coverage of the protocol gate lives in the e2e **quarantine lane, which
   is fully red** (the whole multi-peer suite times out) and is `continue-on-error`, so **CI cannot
   verify it and I did not claim it.** This is the one real gate on the bump.
2. **PLAYTEST the goblin.** It walks to your nearest enemy shape and destroys it in 6 strikes
   (~13 s including travel), and fights other units. Two design questions it raises, both unruled:
   (a) every goblin is a permanent roaming ~120 px **vision source** — this materially changes fog of
   war; (b) goblins render **above the fog** (following the shipped chewer precedent), so enemy
   goblins are always visible.
3. **THE STINK TOWER** — the deferred P3, and now correctly ordered rather than merely affordable.
   Every dependency exists: live damage, an attacker that destroys shapes, protocol bumped. All four
   Council rulings are recorded in `session-state.json → carry_forward` — **do not re-derive them.**
   Build it as a **DefenderKind, not a spawner.**
4. **BUILD SPACE** — blocked on two owner decisions that contradict each other (below).

ACTIVE PLAN
→ `.claude/plans/2026-08-11_PDR_S139_starters.md` (P1/P2/P4 COMPLETED, P3 DEFERRED)
→ `.claude/plans-archive/2026-08-10_SCOPE_AMENDMENT_S137_starter_designs_IN-PROGRESS.md` — the
  original starter spec. ⚠ Its §2 "config + art, not new systems" claim was measured FALSE and its
  goblin model was superseded by the owner's S139 redesign.

⛔ TWO BLOCKERS THAT NEED YOU, NOT CODE

- **Two of your own rulings point opposite ways, and nobody had noticed.** `constants.ts:410-414`
  carries B4b verbatim: *"THE PAIRING IS THE POINT — NEVER TUNE THIS NUMBER APART FROM THE TABLE
  BELOW... At 5 slots only the PENTAGRAM is directly assemblable"*, and :429-431 adds *"NOT a licence
  to retune the cap on its own"*. The R2 build-space ruling raises `CASTLE_BANK_CAP` to **12–13**, at
  which **all six recipes become directly assemblable** — deleting the carve-down tactic the v0.6
  pivot exists to protect. Which wins?
- **R7 (the design library) is not implementable as ruled.** The library is per-browser localStorage,
  never serialized/hashed/wired, so in a 2-peer match the peers hold *different* libraries and the
  host cannot validate "I own this design" — which contradicts the design's own §5 *non-negotiable*
  host-validation contract. R8's "free every match regardless of unlocks" cannot be expressed in a
  per-browser unlock set at all.

CARRY-FORWARD
15 entries in `session-state.json → carry_forward`, including: the fully-red e2e quarantine lane; the
migration `SparkId` collision hole; `castleBanks` having no per-element hash guard; `npm test` being
watch-mode (so it reports **cancelled**, not failure); the deferred ranged goblin and producer towers
(with the specific reasons each is blocked); and five stale docblocks found but not all fixed.

TRAPS THAT WILL BITE

* **A subsystem can be perfect, tested, and never called.** "Shipped" means CALLED. A new
  dispatcher's acceptance criterion is a named production caller.
* **Assert the EFFECT, not the actor's state.** I then reproduced the dead-code bug in the same
  session: the goblin reached ATTACKING and never hit anything, because the Voltkin bounce aborts when
  both bond and creature targets are null. A state assertion would have passed. The real-physics test
  (did the victim's hp drop?) caught it.
* **Three hand-synced numbers is not an invariant.** `smoke.spec.ts` asserted `'v15'` against a v17
  host and had silently inverted a "newer-version joiner" test into the older-peer branch — the exact
  defect S133 P2 already fixed once. Now one `LOCAL_PROTO_V` with `NEWER_PEER_V` **derived**.
* **A hidden Browser pane can't screenshot** (rAF paused). Drive `app.ticker.update()` and interrogate
  the scene graph instead — stronger evidence, and it works.
* **Name CONSUMERS to the Council, not mechanisms.** 5 of 8 challenges adopted vs S138's 1 of 8.

FULL HANDOFF DOC
→ `boot-snapshot.md` — **read this FIRST** instead of handoff + backlog + reflexion.
→ `.handoff-archive/HANDOFF_S139.md` (permanent copy)

PRE-FLIGHT

* [ ] Read `boot-snapshot.md`
* [ ] `git rev-list --count origin/master..master` (NOT the inverse — it lies)
* [ ] `npm run verify-deploy` — expect 4/4
* [ ] `npm run e2e:gating` — expect **32 passed / 0 failed**
* [ ] Note `PROTOCOL_VERSION` is **18**; a v17 peer is hard-rejected at HELLO

SESSION RULES

* SESSION PDCA — priorities from BACKLOG.md, PDR gate before any implementation
* PORT PROTOCOL — use `$SESSION_PORT`
* B5 match length is RULED CLOSED — do not re-raise (LOCKED_DECISIONS.md)
* `origin/gh-pages` deletion remains OWNER-GATED
* Pushing `master` = shipping to production. There is ONE deploy path.
═══════════════════════════════════════════════════════════
